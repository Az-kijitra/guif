// SPEC-0300-0020 scenario with its own app start and its own config.toml (config.toml is read once at startup):
//   input_keymap_custom = { copy = "Ctrl+Shift+C,Ctrl+C", rename = "", search = "Ctrl+F", exit = "Q" }
// AC-1321 (the shortcut text follows the key map; a binding-less item still runs) and AC-1343 (second half: while a
// dropdown is shown `Q` does not exit although it is bound to `exit`; Ctrl+Q does, priority 1).
// The Ctrl+Q test MUST be last: it ends the app (ctx.appClosed tells run.mjs not to verify the stubs afterwards).

import { MOD, sleep } from "../lib/cdp.mjs";
import {
  barState, clickItem, closeBar, closeDialog, dialogInfo, dropdown, focusRowByName, itemById, openByClick, openByKeys, prepMenu, waitDialog, waitDropdown,
} from "./_menu.mjs";

const CONFIG = `ui_theme = "light"\nexternal_apps = []\ninput_keymap_custom = { copy = "Ctrl+Shift+C,Ctrl+C", rename = "", search = "Ctrl+F", exit = "Q" }\n`;

const scenarioTests = [
  {
    id: "AC-1321",
    title: "custom key map: コピー shows Ctrl+Shift+C, 検索 shows Ctrl+F, 名前の変更 shows nothing yet is enabled and opens the rename dialog",
    async run(t, ctx) {
      await prepMenu(ctx, "mbk");
      await focusRowByName(ctx, "a.txt");
      await openByClick(ctx, 1);
      const edit = await dropdown(ctx);
      t.eq(itemById(edit, "copy").shortcut, "Ctrl+Shift+C", "コピー: the first binding only");
      t.eq(itemById(edit, "search").shortcut, "Ctrl+F", "検索: Ctrl+F");
      await closeBar(ctx);
      await openByClick(ctx, 0);
      const file = await dropdown(ctx);
      const rename = itemById(file, "rename");
      t.eq([rename.shortcut, rename.enabled], ["", true], "名前の変更: no shortcut text, enabled");
      await clickItem(ctx, "rename");
      await waitDialog(ctx, "the rename dialog");
      t.ok((await dialogInfo(ctx)).inputs.includes("a.txt"), "the rename dialog is for a.txt");
      await closeDialog(ctx);
    },
  },
  {
    id: "AC-1343-q",
    title: "exit = \"Q\": with a dropdown shown Q does not end the app and does not move the menu",
    async run(t, ctx) {
      await prepMenu(ctx, "mbk");
      await openByKeys(ctx, 0);
      const before = await barState(ctx);
      await ctx.key("q", 0, "KeyQ");
      await ctx.key("Q", MOD.Shift, "KeyQ");
      await sleep(1500);
      const alive = await ctx.ev(`!!document.querySelector('.menubar')`).catch(() => false);
      t.eq(alive, true, "the app is still running");
      const after = await barState(ctx);
      t.eq([after.hasDropdown, after.highlight], [true, before.highlight], "the dropdown is still open and the lit item did not move");
      await closeBar(ctx);
    },
  },
  {
    // MUST be last: it ends the app.
    id: "AC-1343-ctrlq",
    title: "Ctrl+Q ends the app even while a dropdown is shown (priority 1)",
    async run(t, ctx) {
      await prepMenu(ctx, "mbk");
      await openByKeys(ctx, 0);
      await waitDropdown(ctx);
      ctx.appClosed = true; // run.mjs: the page is gone after this, do not verify the stubs again
      await ctx.key("q", MOD.Ctrl, "KeyQ");
      const exited = await ctx.waitForAppExit(30000);
      t.ok(exited, "the app process ended after Ctrl+Q");
    },
  },
];

export const scenarios = [
  {
    id: "menubar-keymap",
    title: "custom input_keymap_custom (copy / rename / search / exit)",
    configToml: CONFIG,
    tests: scenarioTests,
  },
];
