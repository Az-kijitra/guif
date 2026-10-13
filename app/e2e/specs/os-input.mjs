// [E2E・OS 入力] scenario (SPEC-0400-0001 5th edition R-12, SPEC-0200-0001 §3.14.6 / §3.14.12-5):
//   SPEC-0300-0020 AC-1348 (F10 / Alt+F reach the menu bar through the OS input path, without the system menu) and the
//   OS half of SPEC-0300-0015 AC-520 (the viewer is in front by itself and Down scrolls it).
//
// It uses the user's real screen and keyboard, so it is OPT-IN: it runs only with REFLEXFILES_E2E_OS_INPUT=1 (R-12-5);
// otherwise the scenario is SKIPPED without even starting the app (run.mjs asks skipReason()). The helper
// (lib/os-input.mjs) sends only allow-listed names, only while the window of THIS run's app is in front, and never
// brings a window to the front: if the app did not get the foreground by itself the test FAILS (R-12-4), it is not skipped.
//
// Not driven here:
//   * Alt pressed and released alone (AC-1348 (i)): the assignment is on hold (SPEC-0300-0020 R-1350-3 3).
//   * That the system menu really opens for Alt+Space, and the AC-520 "main window in front, then the viewer is reused"
//     half: both need a window the test may not bring to the front -> [目視] (listed in the report notes).

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { sleep } from "../lib/cdp.mjs";
import { AbortRun, diffSnapshots, REAL_CONFIG_DIR, snapshotDir } from "../lib/launch.mjs";
import { openSession, osInputSkipReason, sendKeys } from "../lib/os-input.mjs";
import { openViewerWindow, waitViewerShows } from "./_util.mjs";
import { barState, dropdown, items, prepMenu, statusFocus, waitDropdown } from "./_menu.mjs";
import { bodyState, closeViewerWindow } from "./_viewer.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let session; // one PowerShell helper for the whole scenario, closed by the last test

/** R-08 / R-10-4: the stubs are in force and the real settings folder is untouched BEFORE anything goes to the OS. */
async function guard(ctx) {
  await ctx.verifyStubs();
  const problems = diffSnapshots(ctx.handle.realBefore, snapshotDir(REAL_CONFIG_DIR));
  if (problems.length > 0) throw new AbortRun(`the real settings folder changed (${problems.join("; ")}); no OS input is sent`);
}

async function ensureSession(ctx) {
  if (session === undefined) session = await openSession({ rootPid: ctx.handle.pid, appDir, profile: "debug" });
  return session;
}

/** A result of the helper must be a complete send: not aborted (the app was in front) and no modifier left held. */
function sent(t, label, result, expected) {
  t.ok(!result.aborted, `${label}: the keys were sent`, result.reason ?? "");
  t.eq(result.sent, expected, `${label}: entries sent`);
  t.eq(result.stuckModifiers, [], `${label}: no modifier key is left pressed`);
  return !result.aborted;
}

const windowRect = (ctx) => ctx.ev(`({ x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight })`);

const scenarioTests = [
  {
    id: "AC-1348",
    title: "[OS input] right after the start: F10 then Right, Down opens 編集; Alt+F opens ファイル with the first enabled item lit; no system menu, the window does not move; Esc returns to the list (Alt alone: on hold)",
    async run(t, ctx) {
      // the page is NOT reloaded and nothing is brought to the front: the app has to be in front by itself
      await prepMenu(ctx, "osk"); // shows a fixture folder (the same safety rule as every spec); no OS input yet
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "the file list has the focus (the start default)");
      const s = await ensureSession(ctx);
      const rect0 = await windowRect(ctx);
      await guard(ctx);

      // (ii) F10, Right, Down
      let ok = sent(t, "(ii) F10", await sendKeys(s.target, ["F10"], s.deps), ["F10"]);
      if (!ok) return; // the foreground was not the app: stop here (FAIL, never SKIP)
      await sleep(250);
      t.eq((await barState(ctx)).current, 0, "(ii) F10 lit ファイル (the OS did not take the key)");
      await guard(ctx);
      ok = sent(t, "(ii) Right, Down", await sendKeys(s.target, ["ArrowRight", "ArrowDown"], s.deps), ["ArrowRight", "ArrowDown"]);
      if (!ok) return;
      await waitDropdown(ctx);
      let state = await barState(ctx);
      t.eq(state.open, 1, "(ii) the 編集 dropdown is open");
      await guard(ctx);
      ok = sent(t, "Esc", await sendKeys(s.target, ["Escape"], s.deps), ["Escape"]);
      if (!ok) return;
      await sleep(250);
      state = await barState(ctx);
      t.eq([state.current, await statusFocus(ctx)], [-1, "フォーカス: 一覧"], "Esc: the bar is closed and the focus is on the list");

      // (iii) Alt+F
      await guard(ctx);
      ok = sent(t, "(iii) Alt+F", await sendKeys(s.target, ["Alt+F"], s.deps), ["Alt+F"]);
      if (!ok) return;
      await waitDropdown(ctx);
      state = await barState(ctx);
      const dd = await dropdown(ctx);
      const firstEnabled = items(dd).find((e) => e.enabled)?.label ?? null;
      t.eq([state.open, state.highlight], [0, firstEnabled], "(iii) the ファイル dropdown is open with the first enabled item lit");
      await guard(ctx);
      ok = sent(t, "Esc", await sendKeys(s.target, ["Escape"], s.deps), ["Escape"]);
      if (!ok) return;
      await sleep(250);
      t.eq(await statusFocus(ctx), "フォーカス: 一覧", "Esc: the focus is back on the list");

      // Alt+Space opens the OS system menu (not stopped by the app); the helper closes it with the Escape that follows
      await guard(ctx);
      ok = sent(t, "Alt+Space", await sendKeys(s.target, ["Alt+Space"], s.deps), ["Alt+Space", "Escape"]);
      if (!ok) return;
      await sleep(400);
      state = await barState(ctx);
      t.eq(state.current, -1, "Alt+Space did not activate the menu bar (the OS standard behaviour is not hindered)");
      t.eq(await ctx.ev(`document.hasFocus()`), true, "the page still has the focus after the system menu was closed");

      const rect1 = await windowRect(ctx);
      t.eq(rect1, rect0, "the window position and size did not change");
      t.note("(i) Alt 単独 → ↓ は保留(R-1350-3 3)のため送らない。Alt+Space でシステムメニューが開くことの確認は [目視]");
    },
  },
  {
    id: "AC-520-os",
    title: "[OS input] the viewer opened with Enter (sent by CDP) is in front by itself and Down from the OS scrolls its body 72 px (the 'main window in front, reuse' half is [目視])",
    async run(t, ctx) {
      const s = await ensureSession(ctx);
      try {
        const long = Array.from({ length: 300 }, (_, i) => `line ${i + 1} ` + "x".repeat(120)).join("\n") + "\n";
        ctx.fx.mkdir("osv");
        fs.writeFileSync(ctx.fx.at("osv", "a.txt"), long);
        await ctx.nav(ctx.fx.at("osv"));
        const before = new Set(await s.windows());
        const viewer = await openViewerWindow(t, ctx, { downs: 0 }); // Enter goes to the page by CDP, not through the OS
        if (viewer === undefined) return;
        try {
          if (!(await waitViewerShows(t, viewer, "a.txt", "text", { contains: "line 1" }))) return;
          await sleep(1200);
          const now = (await s.windows()).filter((h) => !before.has(h));
          t.eq(now.length, 1, "exactly one new top-level window of the app appeared (the viewer)");
          if (now.length !== 1) return;
          const v = s.forWindow(now[0]);
          const top0 = (await bodyState(viewer)).top;
          await guard(ctx);
          const ok = sent(t, "Down", await sendKeys(v.target, ["ArrowDown"], v.deps), ["ArrowDown"]);
          if (!ok) return;
          await sleep(300);
          t.eq((await bodyState(viewer)).top - top0, 72, "the body scrolled 72 px");
          t.note("メインウィンドウを前面にしてからビューアを再利用する側は、テストが前面にできないため [目視]");
        } finally {
          await closeViewerWindow(ctx, viewer);
        }
      } finally {
        s.close();
        session = undefined;
      }
    },
  },
];

export const scenarios = [
  {
    id: "os-input",
    title: "OS key input (SPEC-0400-0001 R-12; opt-in with REFLEXFILES_E2E_OS_INPUT=1)",
    skipReason: () => osInputSkipReason(),
    tests: scenarioTests,
  },
];
