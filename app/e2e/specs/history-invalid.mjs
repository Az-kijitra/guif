// SPEC-0300-0013 第6版 AC-256 / AC-257 (and R-238-4, R-246-1, R-242-3): a navigation.toml that holds paths that are not
// absolute (`C:src`, `src`). navigation.toml is read once at startup, so each scenario is its own app start whose
// navigation.toml is written by the harness into the throw-away config folder BEFORE the spawn (launchApp's
// `navigationToml: (fx) => string | null`, SHOULD-190; fx is the per-start test folder, so the content is a function).
// Design: SPEC-0200-0001 §3.12.9 / §3.12.10, MINOR-8: the front end does NOT check these paths, so these tests
// show the BACKEND's rejection itself (without it the list would be the process's current folder app\src-tauri).
//
// Safety: a relative path is only ever SHOWN (a list read) and refused; no file operation is aimed at it. The
// values `C:src` / `src` are not rewritten by the loader's normalisation (a bare `C:` would become `C:\`).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sleep } from "../lib/cdp.mjs";

const MSG_INVALID = "パスが正しくありません。";
// Names that exist only in the process's current folder (dev: app\src-tauri), never in the test folder / home.
const CWD_ONLY = ["Cargo.toml", "tauri.conf.json"];

const toml = (name, values) => `${name} = [${values.map((v) => JSON.stringify(v)).join(", ")}]\n`;
const norm = (p) => path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();

const shown = async (ctx) => (await ctx.pathBarState())?.value ?? "";
const listedNames = (ctx) => ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r) => r.querySelector('.name').title)`);
const statusMessage = (ctx) => ctx.ev(`document.querySelector('.status-message')?.textContent ?? ""`);
const overlayPaths = (ctx) => ctx.ev(`[...document.querySelectorAll('.nav-history-row .path')].map((e) => e.textContent)`);

async function openOverlay(ctx, which) {
  await ctx.focusList();
  await (which === "jump" ? ctx.press.jump() : ctx.press.history());
  await ctx.waitFor(`!!document.querySelector('.nav-history-list .path')`, { label: `the ${which} list` });
  await ctx.settle(150);
}

async function closeOverlayIfOpen(ctx) {
  if (await ctx.ev(`!!document.querySelector('.nav-history-list')`)) {
    await ctx.press.escape();
    await ctx.waitFor(`!document.querySelector('.nav-history-list')`, { label: "the list to close" });
  }
}

/** Confirms the row for `target` by a click, then returns the status message seen right after. */
async function confirmRow(t, ctx, target) {
  const rows = await overlayPaths(ctx);
  const index = rows.indexOf(target);
  t.ok(index >= 0, `"${target}" is in the list`, JSON.stringify(rows));
  if (index < 0) return "";
  await ctx.clickSel(".nav-history-row", index);
  try {
    await ctx.waitFor(`(document.querySelector('.status-message')?.textContent ?? '').includes(${JSON.stringify(MSG_INVALID)})`, { timeout: 5000, label: "the invalid path message" });
  } catch {
    /* judged by the caller through the returned text */
  }
  return await statusMessage(ctx);
}

// ------------------------------------------------ AC-256: the initial path is `C:src`

const h1Tests = [
  {
    id: "AC-256",
    title: "navigation.toml visit_history = [C:src, folder]: start falls back to the home folder (not the process's folder); C:src stays in the history and in navigation.toml",
    async run(t, ctx) {
      const home = os.homedir();
      const now = await shown(ctx);
      t.ok(norm(now) === norm(home), "the fallback folder (the OS home folder) is shown, as for a missing initial path", now);
      t.ok(!/^C:src$/i.test(now), "the path bar does not hold the relative path");
      const names = await listedNames(ctx);
      const leaked = CWD_ONLY.filter((n) => names.includes(n) && !fs.existsSync(path.join(home, n)));
      t.eq(leaked, [], "the list is not the process's current folder (the backend refused C:src)");
      t.note(`status message at the start: "${await statusMessage(ctx)}" (R-246-1: the same as for a missing initial path)`);

      // From here keys need a folder inside the test folder (assertSafeToSend): go to one (the history keeps C:src).
      await ctx.nav(ctx.fx.mkdir("ac256-b"));
      await openOverlay(ctx, "history");
      const rows = await overlayPaths(ctx);
      t.ok(rows.includes("C:src"), "the visit history list still holds C:src", JSON.stringify(rows));
      await closeOverlayIfOpen(ctx);

      // The window close request lets the app save navigation.toml (the harness's kill would skip it, SHOULD-186 (3)).
      // MUST be last in this scenario: the page is gone afterwards.
      await ctx.settle(500);
      await ctx.requestMainWindowClose();
      const exited = await ctx.waitForAppExit(30000);
      t.ok(exited, "the app process ended after the close request");
      if (!exited) return;
      await sleep(500);
      const file = path.join(ctx.handle.cfgDir, "navigation.toml"); // read before shutdown() removes the folder
      if (!fs.existsSync(file)) {
        t.fail("navigation.toml does not exist after the close");
        return;
      }
      const text = fs.readFileSync(file, "utf8");
      t.ok(/["']C:src["']/.test(text), "navigation.toml after the exit still holds C:src (not removed, not rewritten)", text.slice(0, 300));
    },
  },
];

// ------------------------------------------------ AC-257: confirming `C:src` / `src`

const h2Tests = [
  {
    id: "AC-257",
    title: "confirming C:src (history) and src (jump list): message 'パスが正しくありません。', the current folder stays, items stay, history order unchanged",
    async run(t, ctx) {
      const a = ctx.fx.at("ac257-a");
      t.ok(norm(await shown(ctx)) === norm(a), "the app started in the existing folder A", await shown(ctx));

      for (const [which, target] of [["history", "C:src"], ["jump", "src"]]) {
        await openOverlay(ctx, which);
        const before = await overlayPaths(ctx);
        const message = await confirmRow(t, ctx, target);
        t.ok(message.includes(MSG_INVALID), `${which}: confirming "${target}" shows "${MSG_INVALID}"`, message);
        await ctx.settle(300);
        t.ok(norm(await shown(ctx)) === norm(a), `${which}: the current path is still A`, await shown(ctx));
        const names = await listedNames(ctx);
        t.eq(CWD_ONLY.filter((n) => names.includes(n)), [], `${which}: the list is not the process's current folder`);
        // the items stay (R-238-1); reopen the same list when the confirm closed it
        await closeOverlayIfOpen(ctx);
        await openOverlay(ctx, which);
        const after = await overlayPaths(ctx);
        t.eq(after, before, `${which}: the list is unchanged (the item stays, nothing moved to the top)`);
        await closeOverlayIfOpen(ctx);
      }
      // the visit history order after both attempts: A first (the failed C:src did not move to the top)
      await openOverlay(ctx, "history");
      const history = await overlayPaths(ctx);
      t.eq(history.map(norm).slice(0, 1), [norm(a)], "history: A is still first", JSON.stringify(history));
      t.ok(history.includes("C:src"), "history: C:src is still listed");
      await closeOverlayIfOpen(ctx);
    },
  },
];

export const scenarios = [
  {
    id: "H1",
    title: "navigation.toml: visit_history = [C:src, folder] (AC-256)",
    navigationToml: (fx) => toml("visit_history", ["C:src", fx.mkdir("ac256-a")]),
    tests: h1Tests,
  },
  {
    id: "H2",
    title: "navigation.toml: visit_history = [folder A, C:src], jump_list = [src] (AC-257)",
    navigationToml: (fx) => toml("visit_history", [fx.mkdir("ac257-a"), "C:src"]) + toml("jump_list", ["src"]),
    tests: h2Tests,
  },
];
