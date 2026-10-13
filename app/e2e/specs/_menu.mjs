// Helpers shared by the menu bar specs (SPEC-0300-0020; not a spec file itself: it exports no `tests`).
//
// DOM contract with the app (SPEC-0200-0001 §3.14.1-1, features/menu-bar/MenuBar.svelte + MenuDropdown.svelte):
//   .menubar[role=menubar] > .slot > button.heading[role=menuitem] (+ .current when active, .keyfocus when only the heading is lit)
//   .dropdown[role=menu][aria-activedescendant] > .item[role=menuitem|menuitemcheckbox][id=menubar-item-<id>] (.highlighted)
//     with .check / .name > .label + .reason / .shortcut, and .sep[role=separator].

import { MOD, sleep } from "../lib/cdp.mjs";

export const HEADINGS = ["ファイル(F)", "編集(E)", "表示(V)", "移動(G)"];
export const MENU_NAMES = ["ファイル", "編集", "表示", "移動"];

/** R-1310: item names and the shortcut shown at the default key map ("" = nothing). "---" = a separator. */
export const MENU_TABLE = [
  [
    ["開く", "Enter"], ["OSの関連付けで開く", "Shift+Enter"], "---", ["新規作成…", "Ctrl+N"], ["新しいフォルダー…", "Ctrl+Shift+N"], "---",
    ["名前の変更", "F2"], ["削除", "Delete"], "---", ["ZIPに圧縮", "Ctrl+Alt+Z"], ["ZIPを展開", "Ctrl+Alt+X"], "---", ["終了", "Ctrl+Q"],
  ],
  [["切り取り", "Ctrl+X"], ["コピー", "Ctrl+C"], ["貼り付け", "Ctrl+V"], ["パスのコピー", ""], "---", ["すべて選択", "Ctrl+A"], ["選択の解除", "Esc"], "---", ["検索", "/"]],
  [["ツリー", "Ctrl+Shift+B"], ["隠しファイル", "Ctrl+H"], ["サイズの列", "Ctrl+Shift+S"], ["更新日時の列", "Ctrl+Shift+T"], "---", ["並び替え…", "S"]],
  [["親フォルダーへ", "Backspace"], ["パス欄へ移動", "Ctrl+L"], "---", ["履歴", "Ctrl+Y"], ["ジャンプリスト", "Ctrl+J"], ["ジャンプリストに追加", "Ctrl+Shift+J"]],
];

export const SHARED = {
  noTarget: "対象がありません",
  noSelection: "選択がありません",
  notZip: "ZIPファイルではありません",
  extractOne: "展開は1件ずつ指定してください",
  renameOne: "名前の変更は1件ずつ行えます",
  noPaste: "貼り付ける項目がありません",
  folderNotAllowed: "フォルダーには使えません",
};

export const row = (name) => `.app-shell .file-list-row[aria-label=${JSON.stringify(name)}]`;

/** Fixture folder `name` with a.txt, b.txt, c.zip and the folder d; shown with the list focused. */
export async function prepMenu(ctx, name = "mb", { tree = true, empty = false } = {}) {
  if (!ctx.fx.exists(name)) {
    if (empty) ctx.fx.mkdir(name);
    else {
      ctx.fx.file(name, "a.txt");
      ctx.fx.file(name, "b.txt");
      ctx.fx.file(name, "c.zip");
      ctx.fx.folder(name, "d");
    }
  }
  const dir = ctx.fx.at(name);
  await ctx.reload();
  await ctx.nav(dir);
  await ctx.ensureView({ size: true, time: false, hidden: false, tree });
  await ctx.focusList();
  await ctx.settle(150);
  return dir;
}

export const rowOrder = (ctx) => ctx.ev(`[...document.querySelectorAll('.app-shell .file-list-row')].map((e) => e.getAttribute('aria-label'))`);
export const selectedNames = (ctx) => ctx.ev(`[...document.querySelectorAll('.app-shell .file-list-row[aria-selected=true]')].map((e) => e.getAttribute('aria-label'))`);
export const focusedName = (ctx) => ctx.ev(`document.querySelector('.app-shell .file-list-row.focused')?.getAttribute('aria-label') ?? null`);
export const statusFocus = async (ctx) => (await ctx.m.statusItems())[0];
export const statusText = (ctx) => ctx.ev(`document.querySelector('.status-bar')?.textContent ?? ''`);

async function clickWith(ctx, selector, modifiers = 0) {
  const c = await ctx.m.center(selector);
  if (c === null) throw new Error(`not found: ${selector}`);
  await ctx.click(c.x, c.y, { modifiers });
}
export { clickWith };

/** Click the first name, Ctrl+click the others. */
export async function selectRows(ctx, names) {
  await clickWith(ctx, row(names[0]));
  for (const n of names.slice(1)) await clickWith(ctx, row(n), MOD.Ctrl);
  await ctx.settle(100);
}

/** Moves the focus row to `name` with the arrow keys only (no selection). */
export async function focusRowByName(ctx, name) {
  await ctx.focusList();
  for (let i = 0; i < 12; i++) {
    if ((await focusedName(ctx)) === name) return;
    await ctx.press.down();
    await ctx.settle(30);
  }
  for (let i = 0; i < 12; i++) {
    if ((await focusedName(ctx)) === name) return;
    await ctx.press.up();
    await ctx.settle(30);
  }
  throw new Error(`could not focus the row ${name}`);
}

/** The menu bar as the user sees it. current/keyfocus/open are heading indexes (-1 = none). */
export const barState = (ctx) =>
  ctx.ev(`(() => {
    const heads = [...document.querySelectorAll('.menubar .heading')];
    const a = document.activeElement;
    return {
      current: heads.findIndex((h) => h.classList.contains('current')),
      keyfocus: heads.findIndex((h) => h.classList.contains('keyfocus')),
      open: heads.findIndex((h) => h.getAttribute('aria-expanded') === 'true'),
      activeIsHeading: !!a && a.classList.contains('heading'),
      hasDropdown: !!document.querySelector('.menubar .dropdown'),
      highlight: document.querySelector('.menubar .item.highlighted .label')?.textContent ?? null,
      focus: document.querySelector('.status-bar .status-item')?.textContent ?? null,
    };
  })()`);

/** The open dropdown: label, activedescendant and every entry (separators as { sep: true }). null when none is open. */
export const dropdown = (ctx) =>
  ctx.ev(`(() => {
    const dd = document.querySelector('.menubar .dropdown');
    if (!dd) return null;
    return {
      label: dd.getAttribute('aria-label'), role: dd.getAttribute('role'), activedescendant: dd.getAttribute('aria-activedescendant'),
      entries: [...dd.children].map((e) => e.classList.contains('sep') ? { sep: true, role: e.getAttribute('role') } : {
        id: e.id.replace('menubar-item-', ''), role: e.getAttribute('role'),
        label: e.querySelector('.label').textContent, enabled: e.getAttribute('aria-disabled') !== 'true', ariaDisabled: e.getAttribute('aria-disabled'),
        reason: e.querySelector('.reason')?.textContent ?? null, reasonId: e.querySelector('.reason')?.id ?? null, describedby: e.getAttribute('aria-describedby'),
        shortcut: e.querySelector('.shortcut').textContent, ariaKeyshortcuts: e.getAttribute('aria-keyshortcuts'),
        check: e.querySelector('.check').textContent, ariaChecked: e.getAttribute('aria-checked'), highlighted: e.classList.contains('highlighted'),
      }),
    };
  })()`);

export const items = (dd) => dd.entries.filter((e) => !e.sep);
export const itemById = (dd, id) => dd.entries.find((e) => e.id === id);
/** Entries as names with "---" for separators. */
export const outline = (dd) => dd.entries.map((e) => (e.sep ? "---" : e.label));

export async function waitDropdown(ctx) {
  await ctx.waitFor(`!!document.querySelector('.menubar .dropdown')`, { label: "a menu dropdown" });
  await ctx.settle(60);
}
export async function waitNoDropdown(ctx) {
  await ctx.waitFor(`!document.querySelector('.menubar .dropdown')`, { label: "the dropdown to close" });
  await ctx.settle(60);
}
export async function waitActive(ctx) {
  await ctx.waitFor(`!!document.querySelector('.menubar .heading.current')`, { label: "the menu bar to become active" });
  await ctx.settle(60);
}
export async function waitInactive(ctx) {
  await ctx.waitFor(`!document.querySelector('.menubar .heading.current') && !document.querySelector('.menubar .dropdown')`, { label: "the menu bar to become inactive" });
  await ctx.settle(60);
}

/** Opens menu `index` with the mouse (a real click on the heading). */
export async function openByClick(ctx, index) {
  const c = await ctx.m.center(".menubar .heading", index);
  await ctx.click(c.x, c.y);
  await waitDropdown(ctx);
}

/** F10 (heading `ファイル` lit), Right x index, Down (open): the keyboard way to open menu `index`. */
export async function openByKeys(ctx, index) {
  await ctx.press.f10();
  await waitActive(ctx);
  for (let i = 0; i < index; i++) await ctx.press.right();
  await ctx.press.down();
  await waitDropdown(ctx);
}

/** Escape closes the bar (one press) and waits until it is inactive. */
export async function closeBar(ctx) {
  await ctx.press.escape();
  await waitInactive(ctx);
}

/** Moves the highlight with Down until the item `label` is highlighted, then Enter. The dropdown must be open. */
export async function runHighlighted(ctx, label, { shift = false } = {}) {
  for (let i = 0; i < 16; i++) {
    if ((await barState(ctx)).highlight === label) break;
    await ctx.press.down();
  }
  const state = await barState(ctx);
  if (state.highlight !== label) throw new Error(`could not highlight ${label} (highlight is ${state.highlight})`);
  await ctx.key("Enter", shift ? MOD.Shift : 0);
}

/** F10 -> menu `menuIndex` -> item `label` -> Enter, all by keys. */
export async function runByKeys(ctx, menuIndex, label) {
  await openByKeys(ctx, menuIndex);
  await runHighlighted(ctx, label);
}

export async function clickItem(ctx, id, modifiers = 0) {
  await clickWith(ctx, `#menubar-item-${id}`, modifiers);
}

export const dialogInfo = (ctx) =>
  ctx.ev(`(() => { const d = document.querySelector('[role=dialog]'); if (!d) return null;
    return { title: d.querySelector('h2')?.textContent ?? '', text: d.textContent, lines: [...d.querySelectorAll('.body p')].map((p) => p.textContent),
             inputs: [...d.querySelectorAll('input[type=text]')].map((i) => i.value), selects: [...d.querySelectorAll('select')].map((s) => s.value) }; })()`);
export const waitDialog = (ctx, label = "a dialog") => ctx.waitFor(`!!document.querySelector('[role=dialog]')`, { label });
export async function closeDialog(ctx) {
  await ctx.press.escape();
  await ctx.waitFor(`!document.querySelector('[role=dialog]')`, { label: "the dialog to close" });
  await ctx.settle(100);
}

/** Computed style of the menu bar and the open dropdown (AC-1360 / AC-1361): one object, comparable. */
export const MENU_STYLE_PROBE = `(() => {
  const cs = (sel, i = 0) => { const e = document.querySelectorAll(sel)[i]; return e ? getComputedStyle(e) : null; };
  const pick = (s, props) => (s ? Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)])) : null);
  const bar = cs('.menubar');
  const head = cs('.menubar .heading');
  const dd = cs('.menubar .dropdown');
  const item = cs('.menubar .item');
  const shortcut = cs('.menubar .item .shortcut');
  const disabledLabel = document.querySelector('.menubar .item[aria-disabled="true"] .label');
  const disabledReason = document.querySelector('.menubar .item[aria-disabled="true"] .reason');
  const hi = cs('.menubar .item.highlighted');
  const sides = ['top', 'right', 'bottom', 'left'];
  const border = (s, color) => s && sides.every((x) => s.getPropertyValue('border-' + x + '-width') === '1px' && s.getPropertyValue('border-' + x + '-style') === 'solid' && (color === undefined || s.getPropertyValue('border-' + x + '-color') === color));
  return {
    bar: pick(bar, ['padding', 'background-color', 'border-top-color', 'border-left-color']), barBorder1px: border(bar),
    head: pick(head, ['font-size', 'font-family']),
    dropdown: pick(dd, ['min-width', 'background-color', 'border-top-color']), ddBorder1px: border(dd),
    item: pick(item, ['padding', 'font-size']),
    shortcut: pick(shortcut, ['color']),
    disabledLabel: disabledLabel ? getComputedStyle(disabledLabel).color : null,
    disabledReason: disabledReason ? pick(getComputedStyle(disabledReason), ['color', 'font-size']) : null,
    highlighted: pick(hi, ['background-color']),
  };
})()`;

export { MOD, sleep };
