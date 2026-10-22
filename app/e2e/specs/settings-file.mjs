// SPEC-0300-0022 第1版 (設定ファイルを開く・設定ファイルのチェック) -- the [CDP] acceptance criteria, plus the linked ones of SPEC-0300-0018 第6版 (AC-1084),
// SPEC-0300-0020 第3版 (AC-1354) and SPEC-0300-0010 第18版 (AC-23). Design: SPEC-0200-0001 §3.17.11 (E2E) / §3.17.12 (test plan: the scenarios F0..F6 are
// F0 = AC-1645, F1 = AC-1601 / 1608 / 1610 / 1612, F2 = AC-1600, F3 = AC-1650 / 1653 / 1654, F4 = AC-1661 / 1664, F5 = AC-1640 / 1642, F6 = AC-1620..1622;
// this file splits them a little further because every distinct config.toml / seed is its own app start).
//
// Safety (SPEC-0400-0001 R-08-1 / R-10 / R-10-5, SPEC-0300-0021 R-1585 2 / AC-1506, SPEC-0300-0022 R-1681 / R-1682):
//   * Every scenario starts with a `config.toml` that declares `external_apps` (`[]`, or the test executable only), EXCEPT F0 (AC-1645: a start WITHOUT a
//     config.toml; the harness lists F0 and theme.mjs S8 as the only exceptions, lib/launch.mjs UNDECLARED_EXTERNAL_APPS_SCENARIOS and the static test
//     src/e2e-external-apps-static.test.ts). F0 presses no key and uses no menu (nothing could start a program of the default four).
//   * What the tests write into `config.toml` AFTER the start (delete / break / rewrite) also declares `external_apps = []`, before any broken line (R-1682).
//   * "設定ファイルを開く" is the only command that can start VS Code / the associated app. `settings_file_open` is in BLOCKED_COMMANDS and is passed to the
//     backend only inside ctx.withSettingsFileOpen, around the one operation that runs it. While the E2E scope is active the backend refuses (W-A7) and prints
//     `[e2e] settings-file launch: refused` to its standard error; every test that opens reads that record (ctx.readLaunchLog): only `refused` may appear,
//     never `vscode` / `association`.
//   * Nothing is written into the real settings folder (R-08 check of run.mjs).
//   * The files written below are all inside the throw-away config folder (ctx.handle.cfgDir) of the app that is running.

import fs from "node:fs";
import path from "node:path";
import { listTargets, MOD, sleep } from "../lib/cdp.mjs";
import { describeAgainst } from "../lib/settings-template.mjs";
import { buildProbe, placeProbe } from "../lib/probe.mjs";
import {
  MENU_TABLE, barState, closeBar, closeDialog, dialogInfo, dropdown, focusRowByName, itemById, openByKeys, outline, prepMenu, row, runByKeys, selectRows,
  statusFocus, waitDialog, waitInactive,
} from "./_menu.mjs";

// ------------------------------------------------------------------------------------------- wording (SPEC-0300-0019 第5版 §4.9, SPEC-0300-0022 §8.1)

const W_A4 = "config.toml を作成しました。";
const W_A7 = "config.toml を開けませんでした。テスト用の範囲の外です。";
const W_A9 = "設定ファイルのチェック(次の起動での扱い): ";
const W_AA = "問題はありません。変更は再起動で反映されます";
const W_AB = "config.toml がないため、既定の設定を使います。";
const W_A8_HEAD = "config.sample.toml を書き出せませんでした。 詳細: ";
const THEME_VALUES = '(使える値: "light"、"dark"、"system")';
const wTheme = (line) => `config.toml の ${line} 行目の ui_theme を解釈できないため、OS のテーマ設定に従います${THEME_VALUES}。`;

// ------------------------------------------------------------------------------------------- helpers

const cfgDir = (ctx) => ctx.handle.cfgDir;
const configPath = (ctx) => path.join(cfgDir(ctx), "config.toml");
const samplePath = (ctx) => path.join(cfgDir(ctx), "config.sample.toml");
const statusText = (ctx) => ctx.ev(`document.querySelector('.status-message')?.textContent ?? ''`);

/** Polls the status message until `pred(text)`; returns the last text (the caller judges it when the time ran out). */
async function waitText(ctx, pred, timeout = 8000) {
  const end = Date.now() + timeout;
  for (;;) {
    const text = await statusText(ctx);
    if (pred(text) || Date.now() > end) return text;
    await sleep(40);
  }
}
const waitEmpty = (ctx, timeout = 20000) => waitText(ctx, (s) => s === "", timeout);

/** Waits until the launch record has at least `count` lines; returns the record. */
async function waitLog(ctx, count, timeout = 8000) {
  const end = Date.now() + timeout;
  for (;;) {
    const log = ctx.readLaunchLog();
    if (log.length >= count || Date.now() > end) return log;
    await sleep(60);
  }
}

/** { hex, mtimeMs, readOnly } of a file, or null when it does not exist. */
function fileState(file) {
  if (!fs.existsSync(file)) return null;
  const st = fs.statSync(file);
  return { hex: fs.readFileSync(file).toString("hex"), mtimeMs: st.mtimeMs, readOnly: (st.mode & 0o200) === 0 };
}
/** Files whose name starts with `config.toml` but is not `config.toml` (a backup / temporary file next to it, R-1614), and any `*.tmp`. */
const strayFiles = (ctx) => fs.readdirSync(cfgDir(ctx)).filter((n) => (n.startsWith("config.toml") && n !== "config.toml") || n.endsWith(".tmp"));
const readText = (file) => fs.readFileSync(file, "utf8");

/**
 * Runs "設定ファイルを開く" (`how` = "menu": F10 -> ファイル -> the item; "ctrl-comma"; or a function) inside withSettingsFileOpen and returns the
 * status message and the NEW lines of the launch record. Waits for an older message to go first, so the text read is the one of this run.
 */
async function openSettings(ctx, how = "menu") {
  await waitEmpty(ctx);
  const before = ctx.readLaunchLog().length;
  const text = await ctx.withSettingsFileOpen(async () => {
    if (how === "menu") await runByKeys(ctx, 0, "設定ファイルを開く");
    else if (how === "ctrl-comma") await ctx.key(",", MOD.Ctrl, "Comma");
    else await how();
    await waitLog(ctx, before + 1);
    return await waitText(ctx, (s) => s.includes("config.toml"));
  });
  return { text, launched: ctx.readLaunchLog().slice(before) };
}

/** Runs "設定ファイルのチェック" from the menu; returns the status message (starting with W-A9). settings_file_check is not blocked: it only reads. */
async function checkSettings(ctx, { wait = true } = {}) {
  if (wait) await waitEmpty(ctx);
  await runByKeys(ctx, 0, "設定ファイルのチェック");
  return await waitText(ctx, (s) => s.startsWith(W_A9));
}

/** The record holds only `refused` lines (no VS Code, no association): the E2E never started a program. */
function expectOnlyRefused(t, ctx, label) {
  const log = ctx.readLaunchLog();
  t.eq(log.filter((e) => e !== "refused"), [], `${label}: the launch record has no vscode / association line (nothing was started)`);
}

/** The "file" menu entries as names with "---" for separators, read through the keyboard. */
async function fileMenu(ctx) {
  await openByKeys(ctx, 0);
  const dd = await dropdown(ctx);
  await closeBar(ctx);
  return dd;
}

/** The file menu is exactly the fixed items of R-1310 (+ R-1310-2): no registration item for an external app. */
async function expectFixedFileMenu(t, ctx, label) {
  const dd = await fileMenu(ctx);
  t.eq(outline(dd), MENU_TABLE[0].map((e) => (e === "---" ? "---" : e[0])), `${label}: the 「ファイル」 menu is unchanged (no external app item)`);
  return dd;
}

const pageNow = (ctx) => ctx.ev(`performance.now()`);

// ------------------------------------------------------------------------------------------- F0: no config.toml at all (AC-1645, the one exception)

const f0Tests = [
  {
    id: "AC-1645",
    title: "no config.toml at the start: no notice, config.toml is NOT created, config.sample.toml is (the only new file); no key or menu is used",
    async run(t, ctx) {
      t.eq(fs.existsSync(configPath(ctx)), false, "the scenario started without a config.toml");
      await ctx.reload(); // the startup notice is shown again from the (snapshot) DTO
      t.eq(await statusText(ctx), "", "no startup notice (R-1644: a missing config.toml is not reported)");
      const dto = await ctx.configDto();
      t.eq([dto.present, dto.parseError, dto.uiTheme, dto.uiThemeInvalid, dto.entries.length, dto.unknownSettings.length], [false, null, "system", false, 0, 0], "the DTO is the no-file result");
      const end = Date.now() + 15000;
      while (!fs.existsSync(samplePath(ctx)) && Date.now() < end) await sleep(100);
      t.ok(fs.existsSync(samplePath(ctx)), "config.sample.toml was written after the start (R-1621)");
      await sleep(500);
      t.eq(fs.existsSync(configPath(ctx)), false, "config.toml was NOT created by the start (R-1644 / R-1645)");
      const names = fs.readdirSync(cfgDir(ctx)).filter((n) => n.startsWith("config"));
      t.eq(names, ["config.sample.toml"], "the only config file in the settings folder is config.sample.toml");
      t.eq(strayFiles(ctx), [], "no temporary / backup file (R-1622)");
      // the default four registrations are active in this scenario (that is the point of the exception): read them, press nothing
      t.eq((await ctx.externalAppsDto()).apps.length, 4, "the default four registrations are active (read only; no key or menu of them is used in this scenario)");
      t.eq(ctx.readLaunchLog(), [], "no settings-file launch was decided (nothing opened)");
    },
  },
  {
    id: "AC-1620",
    title: "config.sample.toml is written at the start (no sample existed): UTF-8, no BOM, CRLF, equal to the sample made of the original",
    async run(t, ctx) {
      const end = Date.now() + 15000;
      while (!fs.existsSync(samplePath(ctx)) && Date.now() < end) await sleep(100);
      const d = describeAgainst(fs.readFileSync(samplePath(ctx)), "sample");
      t.ok(d.equal, "config.sample.toml equals the sample rendered from templates/config.sample.toml (UTF-8, CRLF, version)", JSON.stringify(d));
      t.eq([d.bom, d.bareLf, d.bareCr], [false, false, false], "no BOM, only CRLF line breaks");
      t.eq(strayFiles(ctx), [], "AC-1622: no temporary file is left next to config.toml / config.sample.toml after the write");
    },
  },
];

// ------------------------------------------------------------------------------------------- F1: default config (external_apps = [])

const f1Tests = [
  {
    id: "AC-1660",
    title: "menu 「ファイル」: ZIPを展開, ---, 設定ファイルを開く(Ctrl+,), 設定ファイルのチェック(no key), ---, 終了; both items enabled",
    async run(t, ctx) {
      await prepMenu(ctx, "f1");
      const dd = await expectFixedFileMenu(t, ctx, "AC-1660");
      const names = outline(dd);
      const at = names.indexOf("設定ファイルを開く");
      t.eq(names.slice(at - 2, at + 4), ["ZIPを展開", "---", "設定ファイルを開く", "設定ファイルのチェック", "---", "終了"], "ZIPを展開, a separator, the two items, a separator, 終了");
      const open = itemById(dd, "config_open");
      const check = itemById(dd, "config_check");
      t.eq([open.shortcut, open.enabled, open.reason], ["Ctrl+,", true, null], "設定ファイルを開く: Ctrl+, shown, enabled, no reason");
      t.eq([check.shortcut, check.enabled, check.reason], ["", true, null], "設定ファイルのチェック: no shortcut, enabled, no reason");
      t.eq(itemById(dd, "exit").shortcut, "Ctrl+Q", "終了 keeps Ctrl+Q");
    },
  },
  {
    id: "AC-1620-start",
    title: "config.sample.toml exists after the start and equals the sample of the original (the start writes it, R-1621)",
    async run(t, ctx) {
      const end = Date.now() + 15000;
      while (!fs.existsSync(samplePath(ctx)) && Date.now() < end) await sleep(100);
      const d = describeAgainst(fs.readFileSync(samplePath(ctx)), "sample");
      t.ok(d.equal, "config.sample.toml equals the rendered sample", JSON.stringify(d));
    },
  },
  {
    id: "AC-1601",
    title: "config.toml deleted after the start, then 「設定ファイルを開く」 (menu): the scaffold is created (bytes = the original's scaffold, UTF-8 / no BOM / CRLF); W-A4 first; the check says W-A9 + W-AA; external apps stay 0",
    async run(t, ctx) {
      await prepMenu(ctx, "f1");
      fs.rmSync(configPath(ctx), { force: true }); // by the test (R-1682: the app was started with external_apps = [])
      const { text, launched } = await openSettings(ctx, "menu");
      t.ok(text.startsWith(W_A4), "the status message starts with W-A4", JSON.stringify(text));
      t.ok(fs.existsSync(configPath(ctx)), "config.toml was created");
      const d = describeAgainst(fs.readFileSync(configPath(ctx)), "template");
      t.ok(d.equal, "config.toml equals the scaffold rendered from the original (R-1611)", JSON.stringify(d));
      t.eq([d.bom, d.bareLf, d.bareCr], [false, false, false], "UTF-8 without BOM, CRLF only");
      t.eq(launched, ["refused"], "the launch record: the scope refused the launch (once)");
      t.eq(strayFiles(ctx), [], "no backup / temporary file next to config.toml");
      const message = await checkSettings(ctx);
      t.eq(message, W_A9 + W_AA, "the check of the fresh scaffold: W-A9 + W-AA (every setting line is a comment, R-1612)");
      t.eq((await ctx.externalAppsDto()).apps.length, 0, "the external app items are still 0 (the start-up registrations)");
      await expectFixedFileMenu(t, ctx, "after the scaffold");
      expectOnlyRefused(t, ctx, "AC-1601");
    },
  },
  {
    id: "AC-1608",
    title: "E2E scope: config.toml deleted, 「設定ファイルを開く」 -> W-A4 + W-A7 exactly; scaffold + sample exist; then Ctrl+, -> W-A7 only; the record has only `refused`",
    async run(t, ctx) {
      await prepMenu(ctx, "f1");
      fs.rmSync(configPath(ctx), { force: true });
      fs.rmSync(samplePath(ctx), { force: true });
      const first = await openSettings(ctx, "menu");
      t.eq(first.text, W_A4 + W_A7, "menu: the message is W-A4 + W-A7 (the example of R-1665)");
      t.eq(first.launched, ["refused"], "menu: exactly one `refused` line in the launch record");
      t.ok(describeAgainst(fs.readFileSync(configPath(ctx)), "template").equal, "the scaffold config.toml exists and is right");
      t.ok(fs.existsSync(samplePath(ctx)) && describeAgainst(fs.readFileSync(samplePath(ctx)), "sample").equal, "config.sample.toml was written again (R-1621: the open writes it when it is missing)");
      await ctx.focusList();
      const second = await openSettings(ctx, "ctrl-comma");
      t.eq(second.text, W_A7, "Ctrl+,: W-A7 only (the file exists now, nothing is created)");
      t.eq(second.launched, ["refused"], "Ctrl+,: one more `refused` line");
      expectOnlyRefused(t, ctx, "AC-1608");
    },
  },
  {
    id: "AC-1610",
    title: "after opening, ui_theme = dark and an input_keymap_custom override are written by the test: theme, keys, menu shortcuts and external app items stay as started (also after a page reload)",
    async run(t, ctx) {
      await prepMenu(ctx, "f1");
      const { launched } = await openSettings(ctx, "menu");
      t.eq(launched, ["refused"], "opened (refused by the scope)");
      fs.writeFileSync(configPath(ctx), 'ui_theme = "dark"\nexternal_apps = []\n\n[input_keymap_custom]\ncopy = "F9"\n', "utf8");
      await sleep(1500);
      await ctx.reload(); // the DTO is a snapshot (SHOULD-184): a reload does not read config.toml again
      t.eq((await ctx.configDto()).uiTheme, "light", "the DTO still says light (the start's ui_theme)");
      t.eq(await ctx.m.cssVar("--ui-bg"), "#f5f5f5", "the screen is still light");
      t.eq(await ctx.ev(`matchMedia("(prefers-color-scheme: dark)").matches`), false, "prefers-color-scheme: dark is not set (the theme was not pinned to dark)");
      await prepMenu(ctx, "f1");
      await openByKeys(ctx, 1);
      const edit = await dropdown(ctx);
      t.eq(itemById(edit, "copy").shortcut, "Ctrl+C", "コピー still shows Ctrl+C (the F9 override was not applied)");
      await closeBar(ctx);
      const file = await expectFixedFileMenu(t, ctx, "after the rewrite");
      t.eq(itemById(file, "config_open").shortcut, "Ctrl+,", "設定ファイルを開く still shows Ctrl+,");
      t.eq((await ctx.externalAppsDto()).apps.length, 0, "the external app items are still 0");
      t.eq(await statusText(ctx), "", "no startup notice appears after the reload");
      // the check reads the new file and says what the NEXT start would do, without applying it
      const message = await checkSettings(ctx);
      t.eq(message, W_A9 + W_AA, "the check of the rewritten (valid) file: W-A9 + W-AA");
      t.eq(await ctx.m.cssVar("--ui-bg"), "#f5f5f5", "the check did not change the theme");
    },
  },
  {
    id: "AC-1612",
    title: "Ctrl+, held down (auto-repeat keydowns) runs 「設定ファイルを開く」 once; the list keys still work",
    async run(t, ctx) {
      await prepMenu(ctx, "f1");
      await waitEmpty(ctx);
      const before = ctx.readLaunchLog().length;
      await ctx.withSettingsFileOpen(async () => {
        await ctx.keyHold(",", MOD.Ctrl, "Comma", 4); // 1 keydown + 4 with autoRepeat + keyup
        await waitLog(ctx, before + 1);
        await sleep(800); // an extra call from a repeat would show up by now
      });
      const log = ctx.readLaunchLog();
      t.eq(log.length - before, 1, "exactly one launch decision for the held key (repeats do nothing, R-1606)");
      expectOnlyRefused(t, ctx, "AC-1612");
      await ctx.focusList();
      const rows = await ctx.rowCount();
      t.ok(rows > 0, "the list is still there");
      await ctx.press.down();
      await ctx.settle(100);
      t.ok((await ctx.ev(`document.querySelector('.app-shell .file-list-row.focused')?.getAttribute('aria-label') ?? ''`)) !== "", "a list key (Down) still works afterwards");
    },
  },
  {
    id: "AC-1620-open",
    title: "「設定ファイルを開く」: an unchanged config.sample.toml is not rewritten (mtime kept); a changed one is written back to the sample",
    async run(t, ctx) {
      await prepMenu(ctx, "f1");
      const sample = samplePath(ctx);
      if (!fs.existsSync(sample) || !describeAgainst(fs.readFileSync(sample), "sample").equal) {
        t.note("the sample was not in its normal state at the start of this test; it is first put back by an open");
        await openSettings(ctx, "menu");
      }
      const same = fileState(sample);
      await sleep(1200); // so that a rewrite could not hide behind the clock resolution
      const r1 = await openSettings(ctx, "menu");
      t.eq(r1.launched, ["refused"], "(ii) opened once");
      t.eq(fileState(sample), same, "(ii) the same content: content and modification time are unchanged");
      fs.writeFileSync(sample, "# edited by the user\n", "utf8");
      const r2 = await openSettings(ctx, "menu");
      t.eq(r2.launched, ["refused"], "(iii) opened once more");
      t.ok(describeAgainst(fs.readFileSync(sample), "sample").equal, "(iii) a different content is written back to the sample of the original");
      t.eq(strayFiles(ctx), [], "AC-1622: no temporary file is left after the writes");
      expectOnlyRefused(t, ctx, "AC-1620");
    },
  },
  {
    id: "AC-1624",
    title: "the sample exists after the start; 「設定ファイルのチェック」 does not touch it (content and modification time) nor config.toml",
    async run(t, ctx) {
      await prepMenu(ctx, "f1");
      const before = { config: fileState(configPath(ctx)), sample: fileState(samplePath(ctx)) };
      t.ok(before.sample !== null, "config.sample.toml exists");
      await sleep(1200);
      const message = await checkSettings(ctx);
      t.ok(message.startsWith(W_A9), "the check ran", message);
      t.eq({ config: fileState(configPath(ctx)), sample: fileState(samplePath(ctx)) }, before, "config.toml and config.sample.toml: content and modification time unchanged by the check (R-1653)");
      t.note("[単体] half of AC-1624 (the first list is shown without waiting for the sample) is not reproducible here: the harness cannot delay the write");
    },
  },
  {
    id: "AC-1608-guard",
    title: "harness guard (SPEC-0200-0001 §3.17.11 S-2): outside withSettingsFileOpen the page refuses settings_file_open; the backend is never reached (no new record line)",
    async run(t, ctx) {
      await prepMenu(ctx, "f1");
      await waitEmpty(ctx);
      const before = ctx.readLaunchLog().length;
      await ctx.focusList();
      await ctx.key(",", MOD.Ctrl, "Comma"); // NOT inside withSettingsFileOpen
      const text = await waitText(ctx, (s) => s.includes("config.toml"));
      t.eq(text, "config.toml を開けませんでした。 詳細: E2E: blocked command", "the page-side stub answered: blocked command (shown as W-A5)");
      await sleep(600);
      t.eq(ctx.readLaunchLog().length, before, "the backend did not decide anything (no new line in the launch record)");
    },
  },
  {
    // MUST be last in F1: looks at the folder after every write of the scenario.
    id: "AC-1622",
    title: "the settings folder after all the writes of this scenario: no file starting with config.toml except config.toml itself, no *.tmp (theme.mjs checkConfigUntouched's rule, R-1614 / R-1622)",
    async run(t, ctx) {
      t.eq(strayFiles(ctx), [], "no backup / temporary file");
      const names = fs.readdirSync(cfgDir(ctx)).sort();
      t.ok(names.includes("config.toml") && names.includes("config.sample.toml"), "config.toml and config.sample.toml are there", JSON.stringify(names));
    },
  },
];

// ------------------------------------------------------------------------------------------- F2: existing config.toml is never changed (AC-1600)

/** Writes `content` (Buffer or string) as config.toml, opens through the menu, and asserts that nothing about the file changed. */
async function expectUntouchedByOpen(t, ctx, label, content, { readOnly = false } = {}) {
  await prepMenu(ctx, "f2");
  const file = configPath(ctx);
  fs.writeFileSync(file, content);
  if (readOnly) fs.chmodSync(file, 0o444);
  try {
    await sleep(1100); // a rewrite must show in the modification time
    const before = fileState(file);
    t.eq(before.readOnly, readOnly, `${label}: the file is ${readOnly ? "" : "not "}read-only before`);
    const { text, launched } = await openSettings(ctx, "menu");
    t.eq(text, W_A7, `${label}: the result is W-A7 only (no scaffold: the file exists)`);
    t.eq(launched, ["refused"], `${label}: the scope refused the launch (once)`);
    t.eq(fileState(file), before, `${label}: content, modification time and the read-only attribute are unchanged (R-1601)`);
    t.eq(strayFiles(ctx), [], `${label}: no other file starting with config.toml`);
  } finally {
    if (readOnly) fs.chmodSync(file, 0o666);
  }
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const f2Tests = [
  {
    id: "AC-1600-i",
    title: "existing config.toml with comments and valid settings: unchanged by 「設定ファイルを開く」",
    run: (t, ctx) =>
      expectUntouchedByOpen(t, ctx, "(i)", '# user comment\nui_theme = "light"   # trailing comment\nexternal_apps = []\n\n[input_keymap_custom]\n# copy = "Ctrl+C"\n'),
  },
  {
    id: "AC-1600-ii",
    title: "existing config.toml with a syntax error (external_apps = [] before the broken line): unchanged by 「設定ファイルを開く」",
    run: (t, ctx) => expectUntouchedByOpen(t, ctx, "(ii)", 'external_apps = []\nui_theme = "dark"\nthis is = = not toml\n'),
  },
  {
    id: "AC-1600-iv",
    title: "existing config.toml with a BOM: unchanged by 「設定ファイルを開く」",
    run: (t, ctx) => expectUntouchedByOpen(t, ctx, "(iv)", Buffer.concat([BOM, Buffer.from('external_apps = []\nui_theme = "light"\n', "utf8")])),
  },
  {
    id: "AC-1600-v",
    title: "existing read-only config.toml: unchanged (content, time, attribute) by 「設定ファイルを開く」",
    run: (t, ctx) => expectUntouchedByOpen(t, ctx, "(v)", 'external_apps = []\nui_theme = "light"\n', { readOnly: true }),
  },
  {
    id: "AC-1600-end",
    title: "after the four opens: the launch record only holds `refused`; the settings folder has no stray file",
    async run(t, ctx) {
      const log = ctx.readLaunchLog();
      t.eq(log, ["refused", "refused", "refused", "refused"], "four opens, four refusals, nothing started");
      t.eq(strayFiles(ctx), [], "no stray file");
      t.note("AC-1600 (iii) (0 bytes) is [単体] only: external_apps cannot be written into an empty file (R-1682)");
    },
  },
];

// ------------------------------------------------------------------------------------------- F3: the check (AC-1650 / 1653 / 1654 / 1655 / 1656 / 1665)

const ERROR_CONFIG = 'external_apps = []\nui_theme = "Dark"\nui_them = "dark"\n\n[input_keymap_custom]\ncopy = "Ctrl+"\ntoggle_time = "Ctrl+Alt+T"\n';
// Lines: 1 external_apps, 2 ui_theme, 3 ui_them (unknown), 4 blank, 5 header, 6 copy (wrong), 7 toggle_time (right).
const ERROR_NOTICE =
  "config.toml の不正なキー割り当て 1 件を無視しました: copy(6 行目)。 " +
  wTheme(2) +
  " config.toml の不明な設定 1 件を無視しました: ui_them(3 行目)。";

/** Writes `content` (or deletes the file for null), checks through the menu and returns { message, same: config and sample were not changed by the check }. */
async function writeAndCheck(ctx, content) {
  if (content === null) fs.rmSync(configPath(ctx), { force: true });
  else fs.writeFileSync(configPath(ctx), content, "utf8");
  await sleep(1100);
  const before = { config: fileState(configPath(ctx)), sample: fileState(samplePath(ctx)) };
  const message = await checkSettings(ctx);
  const after = { config: fileState(configPath(ctx)), sample: fileState(samplePath(ctx)) };
  return { message, before, after };
}

const f3Tests = [
  {
    id: "AC-1650",
    title: "config.toml rewritten (external_apps = [] + wrong key / theme / unknown key) after the start: the check says W-A9 + the same sentences as a start would; nothing is applied",
    async run(t, ctx) {
      await prepMenu(ctx, "f3");
      const dto0 = await ctx.configDto();
      const { message, before, after } = await writeAndCheck(ctx, ERROR_CONFIG);
      t.eq(message, W_A9 + ERROR_NOTICE, "W-A9 + W-32 (copy, line 6) + W-33 (line 2) + W-AC (ui_them, line 3), in that order");
      t.eq(after, before, "AC-1654: config.toml and config.sample.toml are unchanged by the check (content and modification time)");
      t.eq(strayFiles(ctx), [], "no stray file");
      t.eq(await ctx.configDto(), dto0, "the start-up snapshot (keymap entries, theme) did not change");
      await expectFixedFileMenu(t, ctx, "after the check");
      t.eq((await ctx.externalAppsDto()).apps.length, 0, "the external app items are still 0");
      t.eq(await ctx.m.cssVar("--ui-bg"), "#f5f5f5", "the theme did not change");
    },
  },
  {
    id: "AC-1653-i",
    title: "check of a problem-free config.toml: W-A9 + W-AA, external apps stay 0",
    async run(t, ctx) {
      await prepMenu(ctx, "f3");
      const { message, before, after } = await writeAndCheck(ctx, '# nothing to report\nui_theme = "light"\nexternal_apps = []\n');
      t.eq(message, W_A9 + W_AA, "W-A9 + W-AA");
      t.eq(after, before, "AC-1654: nothing was written");
      t.eq((await ctx.externalAppsDto()).apps.length, 0, "the external app items are still 0");
    },
  },
  {
    id: "AC-1653-ii",
    title: "check with no config.toml (deleted by the test): W-A9 + W-AB, config.toml is not created",
    async run(t, ctx) {
      await prepMenu(ctx, "f3");
      const { message, before, after } = await writeAndCheck(ctx, null);
      t.eq(message, W_A9 + W_AB, "W-A9 + W-AB");
      t.eq(fs.existsSync(configPath(ctx)), false, "config.toml was NOT created by the check (R-1653)");
      t.eq(after, before, "AC-1654: config.sample.toml is unchanged (the check writes no sample)");
      t.eq((await ctx.externalAppsDto()).apps.length, 0, "the external app items are still 0");
    },
  },
  {
    id: "AC-1653-iii",
    title: "check of a config.toml with a syntax error on line 3 (external_apps = [] before it): W-A9 + W-31 with the line; external apps stay 0",
    async run(t, ctx) {
      await prepMenu(ctx, "f3");
      const { message, before, after } = await writeAndCheck(ctx, 'external_apps = []\nui_theme = "dark"\nthis is = = not toml\n');
      t.ok(
        message.startsWith(W_A9 + "config.toml の 3 行目を読み込めなかったため、既定のキー割り当て、テーマ(OS の設定に従う)、外部アプリの既定の登録を使います。 詳細: "),
        "W-A9 + W-31 naming line 3",
        JSON.stringify(message),
      );
      t.eq(after, before, "AC-1654: nothing was written");
      t.eq((await ctx.externalAppsDto()).apps.length, 0, "the external app items are still 0 (the default four are NOT activated by the check)");
      await expectFixedFileMenu(t, ctx, "after the check of a broken file");
    },
  },
  {
    id: "AC-1655",
    title: "a new check result replaces the one on screen (error result, then a problem-free one: only the latter is shown)",
    async run(t, ctx) {
      await prepMenu(ctx, "f3");
      const first = await writeAndCheck(ctx, ERROR_CONFIG);
      t.eq(first.message, W_A9 + ERROR_NOTICE, "the error result is shown");
      // no waiting for it to go: the next check comes while the 15 s display is running
      fs.writeFileSync(configPath(ctx), 'external_apps = []\nui_theme = "light"\n', "utf8");
      await runByKeys(ctx, 0, "設定ファイルのチェック");
      const second = await waitText(ctx, (s) => s === W_A9 + W_AA);
      t.eq(second, W_A9 + W_AA, "only the new result is on screen (replaced, not appended with ' / ')");
    },
  },
  {
    id: "AC-1656",
    title: "display time of a check result: 2.5 s for a problem-free file, 15 s for one with a problem",
    async run(t, ctx) {
      await prepMenu(ctx, "f3");
      const measure = async (content, expected) => {
        fs.writeFileSync(configPath(ctx), content, "utf8");
        await waitEmpty(ctx, 25000);
        await runByKeys(ctx, 0, "設定ファイルのチェック");
        await waitText(ctx, (s) => s === expected, 5000);
        const started = Date.now();
        await waitText(ctx, (s) => s === "", 25000);
        return Date.now() - started;
      };
      const quiet = await measure('external_apps = []\nui_theme = "light"\n', W_A9 + W_AA);
      t.ok(quiet >= 1500 && quiet <= 4500, "a problem-free result disappears after about 2.5 s", `${quiet} ms`);
      const problem = await measure(ERROR_CONFIG, W_A9 + ERROR_NOTICE);
      t.ok(problem >= 13500 && problem <= 17500, "a result with a problem disappears after about 15 s", `${problem} ms`);
    },
  },
  {
    id: "AC-1665",
    title: "focus on the tree, F10 -> ファイル -> 設定ファイルのチェック: the menu closes, the focus is back on the tree, then the result appears",
    async run(t, ctx) {
      await prepMenu(ctx, "f3");
      fs.writeFileSync(configPath(ctx), 'external_apps = []\nui_theme = "light"\n', "utf8");
      await ctx.press.tab();
      await ctx.settle(150);
      t.eq(await statusFocus(ctx), "フォーカス: ツリー", "the tree has the focus");
      await waitEmpty(ctx);
      await runByKeys(ctx, 0, "設定ファイルのチェック");
      await waitInactive(ctx);
      const message = await waitText(ctx, (s) => s.startsWith(W_A9));
      t.eq(message, W_A9 + W_AA, "the result is shown");
      t.eq(await statusFocus(ctx), "フォーカス: ツリー", "the focus is back on the tree");
      t.eq((await barState(ctx)).hasDropdown, false, "the menu is closed");
    },
  },
];

// ------------------------------------------------------------------------------------------- F4: Ctrl+, in every place (AC-1661 / 1664 / 1084 / 1354 / 1662)

/** The scene's Ctrl+, : pressed inside withSettingsFileOpen; returns { text, launched } like openSettings. */
let ctrlCommaScenes = 0; // how many scenes of F4 pressed Ctrl+, (a filtered run may skip some)
const pressCtrlComma = (ctx) => {
  ctrlCommaScenes++;
  return openSettings(ctx, "ctrl-comma");
};

const activeIsList = (ctx) => ctx.ev(`document.activeElement === document.querySelector('.app-shell [role=listbox]')`);
const viewerTargets = async (ctx) => (await listTargets(ctx.port)).filter((x) => x.type === "page" && x.url.includes("/viewer")).length;

const f4Tests = [
  {
    id: "AC-1661-list",
    title: "Ctrl+, with the list focused: 「設定ファイルを開く」 runs (W-A7)",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await ctx.focusList();
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal in the record");
    },
  },
  {
    id: "AC-1661-search",
    title: "Ctrl+, while typing in the search input: runs, the search bar and its text stay",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await ctx.focusList();
      await ctx.press.search();
      await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
      await ctx.ev(`document.querySelector('.search-bar input').focus(); true`);
      await ctx.type("ab");
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal");
      t.eq(await ctx.ev(`document.querySelector('.search-bar input')?.value ?? null`), "ab", "the search bar is still open and holds ab");
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });
    },
  },
  {
    id: "AC-1661-pathbar",
    title: "Ctrl+, while editing the path bar: runs, the editing and its text stay",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await ctx.press.ctrlL();
      await sleep(150);
      await ctx.type("zz-edit");
      const before = await ctx.pathBarState();
      t.eq(before.focused, true, "the path bar is being edited");
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal");
      const after = await ctx.pathBarState();
      t.eq(after, before, "the path bar is still being edited with the same text");
      await ctx.press.escape();
      await ctx.settle(150);
    },
  },
  {
    id: "AC-1661-delete-dialog",
    title: "Ctrl+, with the delete confirmation dialog shown: runs, the dialog stays",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await selectRows(ctx, ["a.txt"]);
      await ctx.press.del();
      await waitDialog(ctx, "the delete confirmation");
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal");
      t.ok(await ctx.ev(`!!document.querySelector('[role=dialog]')`), "the dialog is still shown");
      await closeDialog(ctx); // Escape = cancel: nothing is deleted (and fs_ops_delete_trash is blocked by the harness anyway)
    },
  },
  {
    id: "AC-1661-rename-dialog",
    title: "Ctrl+, with the rename dialog open and abc typed: runs, the dialog stays, the input is still abc, nothing is confirmed or cancelled",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await focusRowByName(ctx, "a.txt");
      await ctx.key("F2");
      await waitDialog(ctx, "the rename dialog");
      await ctx.key("a", MOD.Ctrl, "KeyA");
      await ctx.type("abc");
      const before = await dialogInfo(ctx);
      t.eq(before.inputs, ["abc"], "the input holds abc");
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal");
      const after = await dialogInfo(ctx);
      t.ok(after !== null, "the dialog is still open");
      t.eq(after?.inputs, ["abc"], "the input is still abc");
      await closeDialog(ctx);
    },
  },
  {
    id: "AC-1661-new-dialog",
    title: "Ctrl+, with the new-file dialog open and abc typed: runs, the dialog stays, the input is still abc",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await ctx.focusList();
      await ctx.key("n", MOD.Ctrl, "KeyN");
      await waitDialog(ctx, "the new-entry dialog");
      await ctx.key("a", MOD.Ctrl, "KeyA");
      await ctx.type("abc");
      const before = await dialogInfo(ctx);
      t.ok(before.inputs.includes("abc"), "the input holds abc", JSON.stringify(before.inputs));
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal");
      const after = await dialogInfo(ctx);
      t.ok(after !== null, "the dialog is still open");
      t.eq(after?.inputs, before.inputs, "the input is unchanged");
      await closeDialog(ctx);
    },
  },
  {
    id: "AC-1084",
    title: "row context menu open + Ctrl+,: the menu closes, the focus is back on the list, no item is run, 「設定ファイルを開く」 runs (W-A7)",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await ctx.rightClickSel(row("a.txt"));
      await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the row menu" });
      await ctx.settle(100);
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal");
      t.eq(await ctx.ev(`!!document.querySelector('.ctx-menu')`), false, "the menu is closed");
      t.eq(await activeIsList(ctx), true, "the focus is on the file list");
      t.eq(await viewerTargets(ctx), 0, "no item (e.g. 開く) was run: no viewer window");
    },
  },
  {
    id: "AC-1664-bar",
    title: "F10 then 「編集」 dropdown open + Ctrl+,: the menu bar becomes inactive, the focus is back on the list, 「設定ファイルを開く」 runs (W-A7)",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await openByKeys(ctx, 1);
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal");
      await waitInactive(ctx);
      t.eq(await activeIsList(ctx), true, "the focus is on the file list");
    },
  },
  {
    id: "AC-1354",
    title: "ファイル dropdown open with 開く lit + Ctrl+,: the menu bar is inactive, the focus is on the list, 開く is not run, 「設定ファイルを開く」 runs (W-A7)",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      await focusRowByName(ctx, "a.txt");
      await openByKeys(ctx, 0);
      t.eq((await barState(ctx)).highlight, "開く", "開く is lit");
      const r = await pressCtrlComma(ctx);
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "W-A7, one refusal");
      await waitInactive(ctx);
      t.eq(await activeIsList(ctx), true, "the focus is on the file list");
      t.eq(await viewerTargets(ctx), 0, "開く was not run: no viewer window");
    },
  },
  {
    id: "AC-1662",
    title: "the row menu and the blank-area menu of the right click have no settings-file item",
    async run(t, ctx) {
      await prepMenu(ctx, "f4");
      const labels = () => ctx.ev(`[...document.querySelectorAll('.ctx-menu .ctx-label')].map((e) => e.textContent)`);
      await ctx.rightClickSel(row("a.txt"));
      await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the row menu" });
      const rowLabels = await labels();
      t.ok(rowLabels.length > 0 && !rowLabels.some((l) => l.includes("設定")), "the row menu has no 設定… item", JSON.stringify(rowLabels));
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ctx-menu')`, { label: "the row menu to close" });
      const frame = await ctx.m.rect(".file-list-frame");
      await ctx.rightClickAt(frame.left + 40, frame.bottom - 25);
      await ctx.waitFor(`!!document.querySelector('.ctx-menu')`, { label: "the blank-area menu" });
      const blankLabels = await labels();
      t.ok(blankLabels.length > 0 && !blankLabels.some((l) => l.includes("設定")), "the blank-area menu has no 設定… item", JSON.stringify(blankLabels));
      await ctx.press.escape();
      await ctx.waitFor(`!document.querySelector('.ctx-menu')`, { label: "the blank menu to close" });
      t.note("the viewer window has no menu and no key for it: [静的] (settings-file-static.test.ts); here only the two right-click menus are looked at");
    },
  },
  {
    id: "AC-1661-end",
    title: "after all the Ctrl+, scenes: only `refused` lines in the launch record, one per scene",
    async run(t, ctx) {
      const log = ctx.readLaunchLog();
      t.eq(log.filter((e) => e !== "refused"), [], "no vscode / association line");
      t.eq(log.length, ctrlCommaScenes, "one refusal per scene (list, search, path bar, delete dialog, rename dialog, new dialog, row menu, menu bar, ファイル dropdown)");
    },
  },
];

// ------------------------------------------------------------------------------------------- F5: start-up notice with lines (AC-1640 / 1650 / 1651 [CDP])

// The probe is the only program this scenario registers (the usable one); it is never started: no key is bound to it and no launch is made.
const F5_NOTICE =
  "config.toml の不正なキー割り当て 1 件を無視しました: copy(13 行目)。 " +
  wTheme(2) +
  " config.toml の外部アプリの登録 1 件を使いません: 2(壊れたB、10 行目)。";

const f5Tests = [
  {
    id: "AC-1640",
    title: "start with errors on known lines (copy = Ctrl+ on 13, ui_theme = Dark on 2, a relative program on 10): W-32 -> W-33 -> W-9A with their lines, in that order; the right items are still used",
    async run(t, ctx) {
      const before = fileState(configPath(ctx));
      await ctx.reload();
      t.eq(await statusText(ctx), F5_NOTICE, "the start-up notice is exactly the three sentences with their lines");
      const dto = await ctx.configDto();
      t.eq([dto.uiThemeInvalid, dto.uiThemeLine], [true, 2], "DTO: ui_theme invalid, on line 2");
      t.eq((await ctx.externalAppsDto()).apps.map((a) => a.name), ["使えるA"], "the first registration is used, the broken second one is not");
      // toggle_time = Ctrl+Alt+T works (only the wrong entry falls back to its default)
      const dir = ctx.fx.files("f5-keys", 6);
      await ctx.nav(dir);
      await ctx.ensureView({ size: true, time: false, hidden: false, tree: false });
      await ctx.focusList();
      await ctx.key("t", MOD.Ctrl | MOD.Alt, "KeyT");
      await ctx.settle(200);
      t.eq((await ctx.viewState()).time, true, "Ctrl+Alt+T fired toggle_time (the correct entry is used)");
      await openByKeys(ctx, 0);
      const file = await dropdown(ctx);
      t.ok(outline(file).includes("使えるA"), "the menu 「ファイル」 lists the usable registration", JSON.stringify(outline(file)));
      await closeBar(ctx);
      t.eq(fileState(configPath(ctx)), before, "AC-1641 / R-1645: config.toml is unchanged by the start");
    },
  },
  {
    id: "AC-1650-same",
    title: "「設定ファイルのチェック」 of the same file: W-A9 + exactly the sentences the start showed (same functions); the start-up state does not change",
    async run(t, ctx) {
      await prepMenu(ctx, "f5-check");
      const before = fileState(configPath(ctx));
      const dto0 = await ctx.configDto();
      const apps0 = (await ctx.externalAppsDto()).apps.map((a) => a.name);
      const message = await checkSettings(ctx, { wait: false }); // the check replaces the start-up notice still on screen (R-1663-1)
      t.eq(message, W_A9 + F5_NOTICE, "W-A9 + the start-up sentences");
      t.eq(fileState(configPath(ctx)), before, "config.toml is unchanged");
      t.eq([await ctx.configDto(), (await ctx.externalAppsDto()).apps.map((a) => a.name)], [dto0, apps0], "the start-up snapshots are unchanged");
    },
  },
];

// ------------------------------------------------------------------------------------------- F5b: unknown settings (AC-1642)

// Lines: 1 comment, 2 ui_them, 3 input_keymap_profile, 4 blank, 5 [[external_apps]] (1st, usable), 6 name, 7 program, 8 blank, 9 [[external_apps]] (2nd), 10 name,
// 11 program, 12 agrs (unknown field of the 2nd element).
const F5B_NOTICE = "config.toml の不明な設定 3 件を無視しました: ui_them(2 行目), input_keymap_profile(3 行目), external_apps の 2 番目の agrs(12 行目)。";

const f5bTests = [
  {
    id: "AC-1642",
    title: "unknown settings (ui_them, input_keymap_profile, an unknown field of the 2nd registration): W-AC in the order of the lines; theme follows the OS, keys default, both registrations are used",
    async run(t, ctx) {
      await ctx.reload();
      t.eq(await statusText(ctx), F5B_NOTICE, "the start-up notice is exactly W-AC with the three items in line order");
      const dto = await ctx.configDto();
      t.eq([dto.uiTheme, dto.uiThemeInvalid, dto.entries.length], ["system", false, 0], "theme follows the OS (ui_them is not ui_theme), no key override");
      const apps = (await ctx.externalAppsDto()).apps;
      t.eq(apps.map((a) => a.name), ["使えるA", "使えるB"], "both registrations are used (the unknown field is ignored)");
      t.eq(apps.map((a) => a.index), [0, 1], "the two registrations are used in file order (the DTO does not carry args: the unknown field was only reported)");
    },
  },
];

// ------------------------------------------------------------------------------------------- F6: eight wrong keys (AC-1643, AC-1644 15 s)

// Lines: 1 ui_theme, 2 external_apps, 3 blank, 4 header, 5..12 bad_a .. bad_h (unknown operation IDs).
const F6_NOTICE = "config.toml の不正なキー割り当て 8 件を無視しました: bad_a(5 行目), bad_b(6 行目), bad_c(7 行目), bad_d(8 行目), bad_e(9 行目), ほか 3 件。";

const f6Tests = [
  {
    id: "AC-1643",
    title: "8 wrong keys: W-32 lists the first 5 with their lines and `ほか 3 件`; the status element's title holds the whole message",
    async run(t, ctx) {
      await ctx.reload();
      t.eq(await statusText(ctx), F6_NOTICE, "5 items and ほか 3 件");
      t.eq(await ctx.ev(`document.querySelector('.status-message')?.title ?? ''`), F6_NOTICE, "title holds the whole message");
    },
  },
  {
    id: "AC-1644",
    title: "a start-up notice with a problem stays 15 s (not 6 s) and a later notice is appended after ' / ' instead of replacing it",
    async run(t, ctx) {
      await ctx.reload();
      const seen = await statusText(ctx);
      t.eq(seen, F6_NOTICE, "the notice is shown after the reload");
      await ctx.nav(ctx.fx.files("f6-keys", 4)); // keys need a folder inside the test folder
      await ctx.focusList();
      const r = await ctx.withSettingsFileOpen(async () => {
        await ctx.key(",", MOD.Ctrl, "Comma");
        await waitLog(ctx, 1);
        return await waitText(ctx, (s) => s.includes(W_A7));
      });
      t.eq(r, `${F6_NOTICE} / ${W_A7}`, "the later notice is appended after ' / '");
      // The notice started at the page load (the reload above). Wait for it to go: the in-page clock tells how long it lasted.
      let gone = await statusText(ctx);
      const end = Date.now() + 25000;
      while (gone !== "" && Date.now() < end) {
        await sleep(150);
        gone = await statusText(ctx);
      }
      const at = await pageNow(ctx);
      t.eq(gone, "", "the message went away");
      t.ok(at >= 14000 && at <= 20500, "it went away about 15 s after the page was loaded (not at 6 s)", `${Math.round(at)} ms after the page load`);
    },
  },
];

// ------------------------------------------------------------------------------------------- F7: no config problem, a broken navigation.toml -> 6 s (AC-1644 second half)

const f7Tests = [
  {
    id: "AC-1644-6s",
    title: "a start-up notice without a config.toml problem (a broken navigation.toml) stays 6 s",
    async run(t, ctx) {
      // no reload: the corrupt navigation.toml is moved aside by the first load (R-242 item 3), so only the notice of the START shows it
      const seen = await statusText(ctx);
      const first = await pageNow(ctx);
      t.ok(seen.startsWith("navigation.toml を読み込めなかったため"), "a start-up notice about navigation.toml is shown", JSON.stringify(seen));
      t.ok(!seen.includes("config.toml"), "and nothing about config.toml");
      const end = Date.now() + 20000;
      let gone = seen;
      while (gone !== "" && Date.now() < end) {
        await sleep(150);
        gone = await statusText(ctx);
      }
      const at = await pageNow(ctx);
      t.eq(gone, "", "the message went away");
      t.ok(at >= 5500 && at <= 10000, "it went away about 6 s after the page was loaded (not 15 s)", `${Math.round(at)} ms after the page load (first seen at ${Math.round(first)} ms)`);
    },
  },
];

// ------------------------------------------------------------------------------------------- F8 / F11: a seeded config.sample.toml (AC-1620 / 1621 / 1623)

const f8Tests = [
  {
    id: "AC-1623",
    title: "config.sample.toml holds ui_theme = dark and a wrong keymap before the start: not read (theme follows the OS, keys default, no notice) and rewritten to the sample",
    async run(t, ctx) {
      await ctx.reload();
      t.eq(await statusText(ctx), "", "no start-up notice (the sample is not read)");
      const dto = await ctx.configDto();
      t.eq([dto.uiTheme, dto.uiThemeInvalid, dto.entries.length, dto.parseError], ["system", false, 0, null], "theme and keys are the defaults");
      const end = Date.now() + 15000;
      while (!describeAgainst(fs.readFileSync(samplePath(ctx)), "sample").equal && Date.now() < end) await sleep(150);
      const d = describeAgainst(fs.readFileSync(samplePath(ctx)), "sample");
      t.ok(d.equal, "AC-1620 (iii): after the start config.sample.toml is the sample of the original again", JSON.stringify(d));
      t.eq(strayFiles(ctx), [], "AC-1622: no temporary file left");
    },
  },
];

const f11Tests = [
  {
    id: "AC-1621",
    title: "a FOLDER named config.sample.toml: the start goes on without a notice; 「設定ファイルを開く」 still runs and appends W-A8 after one space",
    async run(t, ctx) {
      await ctx.reload();
      t.eq(await statusText(ctx), "", "no start-up notice about the sample (R-1623)");
      t.eq(fs.statSync(samplePath(ctx)).isDirectory(), true, "the folder is still there");
      await prepMenu(ctx, "f11");
      const { text, launched } = await openSettings(ctx, "menu");
      t.eq(launched, ["refused"], "the opening was decided (refused by the scope)");
      t.ok(text.startsWith(W_A7 + " " + W_A8_HEAD), "W-A7, one half-width space, W-A8 with the OS text", JSON.stringify(text));
      t.ok(text.length > (W_A7 + " " + W_A8_HEAD).length, "the detail (OS text) is not empty");
      t.eq(fs.statSync(samplePath(ctx)).isDirectory(), true, "the folder was not touched");
      t.eq(strayFiles(ctx), [], "no temporary file left (AC-1622)");
    },
  },
];

// ------------------------------------------------------------------------------------------- F9 / F10: the key of the item (AC-1661 ii, AC-1660, AC-23)

const f9Tests = [
  {
    id: "AC-1661-custom",
    title: "settings = Ctrl+Shift+O: the item shows Ctrl+Shift+O, that key runs 「設定ファイルを開く」 (W-A7), and Ctrl+, still does (pre-empted)",
    async run(t, ctx) {
      await prepMenu(ctx, "f9");
      const dd = await fileMenu(ctx);
      t.eq(itemById(dd, "config_open").shortcut, "Ctrl+Shift+O", "the item shows Ctrl+Shift+O");
      await ctx.focusList();
      const a = await openSettings(ctx, () => ctx.key("O", MOD.Ctrl | MOD.Shift, "KeyO"));
      t.eq([a.text, a.launched], [W_A7, ["refused"]], "Ctrl+Shift+O: W-A7, one refusal");
      const b = await openSettings(ctx, "ctrl-comma");
      t.eq([b.text, b.launched], [W_A7, ["refused"]], "Ctrl+, still runs it (the pre-empted key, T-25 案 A)");
    },
  },
];

const f10Tests = [
  {
    id: "AC-1660-empty",
    title: "settings = \"\": the item still shows Ctrl+, (T-28) and Ctrl+, still runs it; 設定ファイルのチェック shows nothing",
    async run(t, ctx) {
      await prepMenu(ctx, "f10");
      const dd = await fileMenu(ctx);
      t.eq([itemById(dd, "config_open").shortcut, itemById(dd, "config_check").shortcut], ["Ctrl+,", ""], "Ctrl+, shown for the open item; nothing for the check");
      await ctx.focusList();
      const r = await openSettings(ctx, "ctrl-comma");
      t.eq([r.text, r.launched], [W_A7, ["refused"]], "AC-23 (iii): Ctrl+, runs it although settings is empty");
    },
  },
];

// ------------------------------------------------------------------------------------------- scenarios

const DEFAULT_CONFIG = 'ui_theme = "light"\nexternal_apps = []\n';
const SAMPLE_SEED_OLD = 'ui_theme = "dark"\n[input_keymap_custom]\ncopy = 1\nthis is = = not toml\n';

export const scenarios = [
  {
    // AC-1645: the ONE new exception (R-1682): no config.toml at all. No key, no menu (the default four registrations are active here).
    id: "F0",
    title: "no config.toml at the start (AC-1645; the only config-less start besides theme.mjs S8's broken file)",
    configToml: null,
    allowUndeclaredExternalApps: true,
    tests: f0Tests,
  },
  { id: "F1", title: "default config: scaffold, E2E scope refusal, Ctrl+, repeat, sample, menu", configToml: DEFAULT_CONFIG, tests: f1Tests },
  { id: "F2", title: "existing config.toml (comments / syntax error / BOM / read-only) is never changed by the open", configToml: DEFAULT_CONFIG, tests: f2Tests },
  { id: "F3", title: "the check: errors, problem-free, no file, syntax error, replacement, times, focus", configToml: DEFAULT_CONFIG, tests: f3Tests },
  { id: "F4", title: "Ctrl+, in every place (list, search, path bar, dialogs, row menu, menu bar)", configToml: DEFAULT_CONFIG, tests: f4Tests },
  {
    id: "F5",
    title: "start-up notice with lines: wrong key, wrong theme, wrong registration (the probe is the only registered program)",
    // 1 comment, 2 ui_theme (wrong), 4..6 the usable registration, 8..10 the wrong one (relative program on 10), 12 header, 13 copy (wrong), 14 toggle_time
    configToml: (fx) => `# F5: errors on known lines (SPEC-0300-0022 AC-1640)
ui_theme = "Dark"

[[external_apps]]
name = "使えるA"
program = '${placeProbe(fx, "f5")}'

[[external_apps]]
name = "壊れたB"
program = 'bin\\x.exe'

[input_keymap_custom]
copy = "Ctrl+"
toggle_time = "Ctrl+Alt+T"
`,
    prepare: async () => {
      buildProbe();
    },
    tests: f5Tests,
  },
  {
    id: "F5b",
    title: "start-up notice: unknown settings (W-AC) in the order of the lines",
    configToml: (fx) => `# F5b: unknown settings (SPEC-0300-0022 AC-1642)
ui_them = "dark"
input_keymap_profile = "vim"

[[external_apps]]
name = "使えるA"
program = '${placeProbe(fx, "f5b")}'

[[external_apps]]
name = "使えるB"
program = '${placeProbe(fx, "f5b")}'
agrs = ["{dir}"]
`,
    prepare: async () => {
      buildProbe();
    },
    tests: f5bTests,
  },
  {
    id: "F6",
    title: "eight wrong keys: the first five and ほか 3 件; the notice stays 15 s",
    configToml: `ui_theme = "light"
external_apps = []

[input_keymap_custom]
bad_a = "Ctrl+Alt+Z"
bad_b = "Ctrl+Alt+Z"
bad_c = "Ctrl+Alt+Z"
bad_d = "Ctrl+Alt+Z"
bad_e = "Ctrl+Alt+Z"
bad_f = "Ctrl+Alt+Z"
bad_g = "Ctrl+Alt+Z"
bad_h = "Ctrl+Alt+Z"
`,
    tests: f6Tests,
  },
  { id: "F7", title: "a start-up notice without a config.toml problem (broken navigation.toml): 6 s", configToml: DEFAULT_CONFIG, navigationToml: () => "this is = = not toml\n", tests: f7Tests },
  {
    id: "F8",
    title: "a stale config.sample.toml (dark theme, wrong keys) before the start: not read, rewritten",
    configToml: "external_apps = []\n",
    seedConfigDir: () => [{ name: "config.sample.toml", content: SAMPLE_SEED_OLD, mtime: new Date("2020-01-01T00:00:00Z") }],
    tests: f8Tests,
  },
  {
    id: "F11",
    title: "a folder named config.sample.toml before the start",
    configToml: DEFAULT_CONFIG,
    seedConfigDir: () => [{ name: "config.sample.toml", dir: true }],
    tests: f11Tests,
  },
  {
    id: "F9",
    title: "settings = Ctrl+Shift+O",
    configToml: 'ui_theme = "light"\nexternal_apps = []\ninput_keymap_custom = { settings = "Ctrl+Shift+O" }\n',
    tests: f9Tests,
  },
  {
    id: "F10",
    title: 'settings = ""',
    configToml: 'ui_theme = "light"\nexternal_apps = []\ninput_keymap_custom = { settings = "" }\n',
    tests: f10Tests,
  },
];
