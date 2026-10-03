// SPEC-0300-0011 R-15 ~ R-19 / CB-06 / CB-13 and SPEC-0300-0018 R-1040-1: the OS clipboard (copy / cut write a
// file list + Preferred DropEffect, paste reads the OS first). [CDP] acceptance criteria AC-04 ~ AC-06-13,
// AC-1024-1, AC-1052-1. Design: SPEC-0200-0001 §3.10.13.
//
// Safety (SPEC-0400-0001 R-08 / R-09 / R-10, SPEC-0200-0001 §3.10.17):
//   * the whole test runs inside ctx.withClipboardGuard (the user's clipboard is saved, emptied, restored);
//   * file lists written to the OS by the TEST are only paths inside the test folder (writeFileDropForTest enforces it);
//   * fs_ops_copy / fs_ops_move are let through only inside ctx.withScopedFileOps (items and destination inside the
//     test folder), and the backend independently refuses anything outside it (REFLEXFILES_E2E_FS_SCOPE);
//   * every file touched here lives under one folder `cb-<id>` of the test folder, no junctions are created.
// Not driven here: the [目視] checks (round trips with Explorer, `\\?\` acceptance by Explorer, apps that write no
// Preferred DropEffect) and AC-06-12 / AC-09 (static / self tests).

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MOD, sleep } from "../lib/cdp.mjs";
import { Skip } from "../lib/report.mjs";
import { clearClipboard, clipboardOwnerProcessName, explorerPasteForTest, readFileDropForTest, writeClipboardTextForTest, writeFileDropForTest } from "../lib/clipboard.mjs";

const row = (name) => `.app-shell .file-list-row[aria-label=${JSON.stringify(name)}]`;
const MENU = ".ctx-menu";
const CB13_CHANGED = "(切り取りの後にクリップボードが変わったため、コピーしました)";

// ------------------------------------------------------------------ helpers

/** Creates `cb-<id>/src` (a.txt, b.txt, folder d with one file) once and shows it, with an empty app clipboard (reload). */
async function setup(ctx, id) {
  const base = `cb-${id}`;
  if (!ctx.fx.exists(base)) {
    ctx.fx.file(`${base}/src`, "a.txt");
    ctx.fx.file(`${base}/src`, "b.txt");
    ctx.fx.file(`${base}/src/d`, "in.txt");
    ctx.fx.mkdir(base, "dst");
  }
  const src = ctx.fx.at(base, "src");
  await ctx.reload();
  await ctx.nav(src);
  await ctx.ensureView({ size: true, time: false, hidden: false, tree: false });
  await ctx.focusList();
  await ctx.settle(150);
  return { base, src, at: (...rel) => ctx.fx.at(base, ...rel) };
}

async function selectRows(ctx, names) {
  const c0 = await ctx.m.center(row(names[0]));
  if (c0 === null) throw new Error(`row not found: ${names[0]}`);
  await ctx.click(c0.x, c0.y);
  for (const name of names.slice(1)) {
    const c = await ctx.m.center(row(name));
    if (c === null) throw new Error(`row not found: ${name}`);
    await ctx.click(c.x, c.y, { modifiers: MOD.Ctrl });
  }
  await ctx.settle(100);
}

const rowOrder = (ctx) => ctx.ev(`[...document.querySelectorAll('.app-shell .file-list-row')].map((e) => e.getAttribute('aria-label'))`);
const statusText = (ctx) => ctx.ev(`document.querySelector('.status-bar')?.textContent ?? ''`);
const keyCopy = (ctx) => ctx.key("c", MOD.Ctrl, "KeyC");
const keyCut = (ctx) => ctx.key("x", MOD.Ctrl, "KeyX");
const keyPaste = (ctx) => ctx.key("v", MOD.Ctrl, "KeyV");

/** Waits (polling the real file system) until `predicate()` is true. */
async function waitUntil(predicate, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
    await sleep(100);
  }
}

/** The OS file list as written by the app (polling: the write is an IPC round trip). */
async function waitForOsFiles(label = "the file list on the OS clipboard") {
  const deadline = Date.now() + 10000;
  for (;;) {
    const now = readFileDropForTest();
    if (now !== null) return now;
    if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
    await sleep(150);
  }
}

/** Show `dir`, then paste with Ctrl+V while copy / move are allowed inside the test folder only; `done()` ends the wait. */
async function pasteInto(ctx, dir, done, label) {
  await ctx.nav(dir);
  await ctx.focusList();
  await ctx.withScopedFileOps(async () => {
    await keyPaste(ctx);
    await waitUntil(done, label);
    await ctx.waitFor(`!document.querySelector('[role=dialog]')`, { label: "the progress dialog to close", timeout: 20000 });
    await ctx.settle(300);
  });
}

async function openBlankMenu(ctx) {
  const r = await ctx.m.rect(".file-list-frame");
  await ctx.rightClickAt(r.left + 40, r.bottom - 25);
  await ctx.waitFor(`!!document.querySelector('${MENU}')`, { label: "the context menu (blank)" });
  await ctx.settle(100);
}

async function openRowMenu(ctx, name) {
  await ctx.rightClickSel(row(name));
  await ctx.waitFor(`!!document.querySelector('${MENU}')`, { label: "the context menu" });
  await ctx.settle(100);
}

async function clickItem(ctx, id) {
  const c = await ctx.m.center(`#ctx-item-${id}`);
  if (c === null) throw new Error(`menu item not found: ${id}`);
  await ctx.click(c.x, c.y);
}

const pasteDisabled = (ctx) => ctx.ev(`document.querySelector('#ctx-item-paste')?.getAttribute('aria-disabled') === 'true'`);

async function closeMenu(ctx) {
  await ctx.press.escape();
  await ctx.waitFor(`!document.querySelector('${MENU}')`, { label: "the menu to close" });
}

/** A real .lnk shortcut (WScript.Shell) at `link` pointing at `target`; paths go through Base64 JSON. */
function createShortcut(link, target) {
  const payload = Buffer.from(JSON.stringify({ link, target }), "utf8").toString("base64");
  const script = [
    `$j = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')))`,
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut($j.link)`,
    `$s.TargetPath = $j.target`,
    `$s.Save()`,
  ].join("; ");
  const r = spawnSync("powershell.exe", ["-NoProfile", "-STA", "-NonInteractive", "-Command", script], { encoding: "utf8", timeout: 30000 });
  if (r.error || r.status !== 0) throw new Error(`could not create the shortcut: ${r.error?.message ?? r.stderr}`);
}

const exists = (...p) => fs.existsSync(path.join(...p));

export const tests = [
  {
    id: "AC-04",
    title: "copy writes the selection to the OS clipboard as a file list (display order, strings as shown) with Preferred DropEffect = copy",
    async run(t, ctx) {
      const s = await setup(ctx, "04");
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt", "d"]);
        const order = await rowOrder(ctx);
        const expected = ["a.txt", "d"].sort((x, y) => order.indexOf(x) - order.indexOf(y)).map((n) => path.join(s.src, n));
        await keyCopy(ctx);
        const os = await waitForOsFiles();
        t.eq(os.paths, expected, "the OS file list (same order, same strings)");
        t.eq(os.effect, 1, "Preferred DropEffect = 1 (copy)");
        // real-device check (SPEC-0200-0001 §3.10.4 / §3.10.14 #2): the app's MAIN WINDOW owns what it wrote
        t.eq(clipboardOwnerProcessName(), "reflexfiles-successor", "the clipboard owner is the app's own window");
        t.ok((await statusText(ctx)).includes("2件をコピーしました"), "status shows 2件をコピーしました");
        t.ok(!(await statusText(ctx)).includes("OSのクリップボードには書き込めませんでした"), "no OS-write-failed note");
        // real device: the Windows shell (Explorer's own paste path) accepts it and copies, the source stays
        ctx.fx.mkdir(s.base, "explorer");
        explorerPasteForTest(s.at("explorer"), { root: ctx.fx.root });
        await waitUntil(() => exists(s.at("explorer"), "a.txt") && exists(s.at("explorer"), "d", "in.txt"), "the shell's paste of the app's copy", 30000);
        t.ok(exists(s.src, "a.txt") && exists(s.src, "d"), "Explorer copied (the source stays)");
      });
    },
  },
  {
    id: "AC-05",
    title: "cut writes the selection with Preferred DropEffect = move; nothing is removed from the source",
    async run(t, ctx) {
      const s = await setup(ctx, "05");
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt", "d"]);
        const order = await rowOrder(ctx);
        const expected = ["a.txt", "d"].sort((x, y) => order.indexOf(x) - order.indexOf(y)).map((n) => path.join(s.src, n));
        await keyCut(ctx);
        const os = await waitForOsFiles();
        t.eq(os.paths, expected, "the OS file list");
        t.eq(os.effect, 2, "Preferred DropEffect = 2 (move)");
        t.ok((await statusText(ctx)).includes("2件を切り取りました"), "status shows 2件を切り取りました");
        t.ok(exists(s.src, "a.txt") && exists(s.src, "d"), "the source items are untouched until a paste");
        // real device: the Windows shell reads Preferred DropEffect = move and MOVES the items
        ctx.fx.mkdir(s.base, "explorer");
        explorerPasteForTest(s.at("explorer"), { root: ctx.fx.root });
        await waitUntil(() => exists(s.at("explorer"), "a.txt") && !exists(s.src, "a.txt"), "the shell's paste of the app's cut", 30000);
        t.ok(exists(s.at("explorer"), "a.txt") && !exists(s.src, "a.txt"), "Explorer moved the items (cut semantics)");
      });
    },
  },
  {
    id: "AC-06",
    title: "files copied by another app (a file list on the OS clipboard) are pasted into the shown folder as a copy; the source stays",
    async run(t, ctx) {
      const s = await setup(ctx, "06");
      await ctx.withClipboardGuard(async () => {
        writeFileDropForTest([path.join(s.src, "a.txt"), path.join(s.src, "d")], 1, { root: ctx.fx.root });
        await pasteInto(ctx, s.at("dst"), () => exists(s.at("dst"), "a.txt") && exists(s.at("dst"), "d", "in.txt"), "the pasted items in dst");
        t.ok(exists(s.at("dst"), "a.txt"), "dst\\a.txt exists");
        t.ok(exists(s.at("dst"), "d", "in.txt"), "dst\\d\\in.txt exists (folder copied with its content)");
        t.ok(exists(s.src, "a.txt") && exists(s.src, "d", "in.txt"), "the originals are still in the source");
      });
    },
  },
  {
    id: "AC-06-1",
    title: "the other app's own DropEffect (move / copy / link / none) is ignored: always a copy, the source stays, no .lnk",
    async run(t, ctx) {
      const s = await setup(ctx, "061");
      for (const [label, effect] of [["move (2)", 2], ["copy (1)", 1], ["link (4)", 4], ["no effect", null]]) {
        await ctx.withClipboardGuard(async () => {
          const dstName = `dst-${effect ?? "none"}`;
          ctx.fx.mkdir(s.base, dstName);
          writeFileDropForTest([path.join(s.src, "a.txt")], effect, { root: ctx.fx.root });
          await pasteInto(ctx, s.at(dstName), () => exists(s.at(dstName), "a.txt"), `the paste with ${label}`);
          t.ok(exists(s.at(dstName), "a.txt"), `${label}: copied`);
          t.ok(exists(s.src, "a.txt"), `${label}: the source stays`);
          t.ok(!fs.readdirSync(s.at(dstName)).some((n) => n.toLowerCase().endsWith(".lnk")), `${label}: no .lnk is created`);
        });
      }
    },
  },
  {
    id: "AC-06-3",
    title: "cut, then the OS clipboard is overwritten by TEXT: the paste is a copy (the text is not interpreted) with the notice",
    async run(t, ctx) {
      const s = await setup(ctx, "063");
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt"]);
        await keyCut(ctx);
        await waitForOsFiles();
        writeClipboardTextForTest(path.join(s.src, "b.txt"));
        await pasteInto(ctx, s.at("dst"), () => exists(s.at("dst"), "a.txt"), "the paste of the app's cut");
        t.ok(exists(s.at("dst"), "a.txt"), "the app's own selection was pasted");
        t.ok(!exists(s.at("dst"), "b.txt"), "the path in the text clipboard is not interpreted as a file");
        t.ok(exists(s.src, "a.txt"), "the source stays (a copy, not a move)");
        t.ok((await statusText(ctx)).endsWith(CB13_CHANGED), "the status carries the CB-13 notice", await statusText(ctx));
      });
    },
  },
  {
    id: "AC-06-4",
    title: "cut, then the OS clipboard holds ANOTHER file list: that list is pasted as a copy, the app's cut is not moved",
    async run(t, ctx) {
      const s = await setup(ctx, "064");
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt"]);
        await keyCut(ctx);
        await waitForOsFiles();
        writeFileDropForTest([path.join(s.src, "b.txt")], 1, { root: ctx.fx.root });
        await pasteInto(ctx, s.at("dst"), () => exists(s.at("dst"), "b.txt"), "the paste of the other app's list");
        t.ok(exists(s.at("dst"), "b.txt") && !exists(s.at("dst"), "a.txt"), "only the OS list was pasted");
        t.ok(exists(s.src, "a.txt") && exists(s.src, "b.txt"), "no source was moved");
        t.ok((await statusText(ctx)).endsWith(CB13_CHANGED), "the status carries the CB-13 notice", await statusText(ctx));
      });
    },
  },
  {
    id: "AC-06-13",
    title: "cut, then the OS clipboard is rewritten with the SAME file list + effect copy: it counts as changed, the paste is a copy",
    async run(t, ctx) {
      const s = await setup(ctx, "0613");
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt"]);
        await keyCut(ctx);
        await waitForOsFiles();
        writeFileDropForTest([path.join(s.src, "a.txt")], 1, { root: ctx.fx.root });
        await pasteInto(ctx, s.at("dst"), () => exists(s.at("dst"), "a.txt"), "the paste after the rewrite");
        t.ok(exists(s.at("dst"), "a.txt"), "pasted");
        t.ok(exists(s.src, "a.txt"), "the source stays: the rewrite made it a copy");
        t.ok((await statusText(ctx)).endsWith(CB13_CHANGED), "the status carries the CB-13 notice", await statusText(ctx));
      });
    },
  },
  {
    id: "AC-06-5",
    title: "cut + paste moves the item and empties the OS clipboard (menu paste disabled); copy + paste leaves the OS file list as it was",
    async run(t, ctx) {
      const s = await setup(ctx, "065");
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt"]);
        await keyCut(ctx);
        await waitForOsFiles();
        await pasteInto(ctx, s.at("dst"), () => exists(s.at("dst"), "a.txt") && !exists(s.src, "a.txt"), "the move");
        t.ok(exists(s.at("dst"), "a.txt") && !exists(s.src, "a.txt"), "a.txt moved to dst");
        await waitUntil(() => readFileDropForTest() === null, "the OS clipboard to be emptied after the move", 8000).catch(() => {});
        t.eq(readFileDropForTest(), null, "the OS clipboard holds no file list any more");
        await openBlankMenu(ctx);
        t.eq(await pasteDisabled(ctx), true, "ペースト is disabled (app and OS both empty)");
        await closeMenu(ctx);

        // copy -> paste: the OS list stays
        await ctx.nav(s.src);
        await ctx.focusList();
        await selectRows(ctx, ["b.txt"]);
        await keyCopy(ctx);
        await waitForOsFiles();
        ctx.fx.mkdir(s.base, "dst2");
        await pasteInto(ctx, s.at("dst2"), () => exists(s.at("dst2"), "b.txt"), "the copy paste");
        t.ok(exists(s.src, "b.txt"), "b.txt is still in the source");
        t.eq(readFileDropForTest()?.paths, [path.join(s.src, "b.txt")], "the OS file list is unchanged by a copy paste");
      });
    },
  },
  {
    id: "AC-06-8",
    title: "a path that no longer exists fails by itself: the rest is pasted and the failure list names it",
    async run() {
      // Under an E2E run the backend scope (SPEC-0400-0001 R-10-6) refuses a source it cannot resolve, and
      // a vanished path cannot be resolved: the WHOLE batch would be refused as e2e_scope_violation instead of
      // failing item by item. The per-item `not_found` behaviour (the rest is processed) is therefore covered by
      // the backend unit tests (fs_ops/data_safety_tests.rs ac06_8_*) and, for the front end, by
      // file-ops-controller.test.ts; it cannot be driven end to end while the scope is active.
      throw new Skip("not drivable under the E2E file scope (R-10-6 refuses unresolvable sources); covered by data_safety_tests::ac06_8_*");
    },
  },
  {
    id: "AC-06-9",
    title: "a .lnk shortcut is copied as a file (identical bytes); its target is not copied",
    async run(t, ctx) {
      const s = await setup(ctx, "069");
      createShortcut(path.join(s.src, "link.lnk"), path.join(s.src, "b.txt"));
      await ctx.reload();
      await ctx.nav(s.src);
      await ctx.focusList();
      await ctx.waitFor(`!!document.querySelector(${JSON.stringify(row("link.lnk"))})`, { label: "the shortcut row" });
      await ctx.withClipboardGuard(async () => {
        writeFileDropForTest([path.join(s.src, "link.lnk")], 1, { root: ctx.fx.root });
        await pasteInto(ctx, s.at("dst"), () => exists(s.at("dst"), "link.lnk"), "the shortcut copy");
        t.ok(Buffer.compare(fs.readFileSync(path.join(s.at("dst"), "link.lnk")), fs.readFileSync(path.join(s.src, "link.lnk"))) === 0, "the .lnk bytes are identical");
        t.ok(!exists(s.at("dst"), "b.txt"), "the link target was not copied");
      });
    },
  },
  {
    id: "AC-1024-1",
    title: "the menu's ペースト reflects the OS clipboard every time it opens: text / empty -> disabled, a file list -> enabled",
    async run(t, ctx) {
      const s = await setup(ctx, "1024");
      await ctx.withClipboardGuard(async () => {
        writeClipboardTextForTest("just text");
        await openBlankMenu(ctx);
        t.eq(await pasteDisabled(ctx), true, "OS text only: disabled");
        await closeMenu(ctx);
        clearClipboard();
        await openBlankMenu(ctx);
        t.eq(await pasteDisabled(ctx), true, "OS empty: disabled");
        await closeMenu(ctx);
        writeFileDropForTest([path.join(s.src, "a.txt")], 1, { root: ctx.fx.root });
        await openBlankMenu(ctx);
        t.eq(await pasteDisabled(ctx), false, "OS file list: enabled");
        await closeMenu(ctx);
        clearClipboard();
        await openBlankMenu(ctx);
        t.eq(await pasteDisabled(ctx), true, "emptied again: disabled again (asked on every open)");
        await closeMenu(ctx);
      });
    },
  },
  {
    id: "AC-1052-1",
    title: "cut, then パスのコピー (changes the OS clipboard), then ペースト from the menu: a copy with the CB-13 notice",
    async run(t, ctx) {
      const s = await setup(ctx, "10521");
      await ctx.cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      if (!(await ctx.ev(`document.hasFocus()`))) throw new Skip("the document does not have the focus (navigator.clipboard.writeText needs it)");
      await ctx.withClipboardGuard(async () => {
        await selectRows(ctx, ["a.txt"]);
        await keyCut(ctx);
        await waitForOsFiles();
        await openRowMenu(ctx, "b.txt");
        await clickItem(ctx, "copy_path");
        await ctx.waitFor(`document.querySelector('.status-bar')?.textContent.includes('パスをコピーしました')`, { label: "the copy-path status" });
        await ctx.nav(s.at("dst"));
        await ctx.focusList();
        await openBlankMenu(ctx);
        t.eq(await pasteDisabled(ctx), false, "ペースト is enabled (the app clipboard still holds the cut)");
        await ctx.withScopedFileOps(async () => {
          await clickItem(ctx, "paste");
          await waitUntil(() => exists(s.at("dst"), "a.txt"), "the paste from the menu");
          await ctx.waitFor(`!document.querySelector('[role=dialog]')`, { label: "the progress dialog to close", timeout: 20000 });
          await ctx.settle(300);
        });
        t.ok(exists(s.at("dst"), "a.txt") && exists(s.src, "a.txt"), "pasted as a COPY: the source stays");
        t.ok((await statusText(ctx)).endsWith(CB13_CHANGED), "the status carries the CB-13 notice", await statusText(ctx));
      });
    },
  },
];
