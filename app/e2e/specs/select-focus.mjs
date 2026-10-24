// SPEC-0300-0023 AC-1722 / AC-1723 (selection, cursor and focus looks of the tuif look; replaces SPEC-0300-0017 §16.7 AC-928 / AC-929, see the table
// "置き換えた受入基準" of SPEC-0300-0017 第11版). AC-930 (hover changes nothing) is kept; AC-931 is a Rust unit test (AC-1745 / AC-1746).
import { openFiles, RGB } from "./_util.mjs";

const NONE = "rgba(0, 0, 0, 0)";
const bold = (w) => Number(w) >= 600 || w === "bold";
const look = (ctx, index) =>
  ctx.ev(`(() => { const r = document.querySelectorAll('.file-list-row')[${index}]; const s = getComputedStyle(r); return { bg: s.backgroundColor, color: s.color, bold: Number(s.fontWeight) >= 600, outline: [s.outlineWidth, s.outlineStyle, s.outlineColor], mark: r.querySelector('.mark').textContent, cls: r.className }; })()`);

/** Row 2 = selected + cursor row, row 3 = selected only, list focused. */
async function prepareSelection(ctx) {
  await openFiles(ctx, "many100", 100, { size: true, time: false });
  await ctx.focusList();
  await ctx.press.down(); // cursor on the 2nd entry
  await ctx.key(" ", 0, "Space"); // select_toggle selects it and moves the cursor down
  await ctx.key(" ", 0, "Space"); // ... selects the 3rd entry too, cursor now on the 4th
  await ctx.press.up();
  await ctx.press.up(); // cursor back on the 2nd entry (selected)
  await ctx.settle();
  return ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r, i) => ({ i, sel: r.getAttribute('aria-selected'), cursor: r.classList.contains('cursor') })).filter((r) => r.sel === 'true' || r.cursor)`);
}

export const tests = [
  {
    id: "AC-928",
    title: "list focused (AC-1722): cursor row = cursor_bg / cursor_fg / bold with * kept; selected row = selected colour, bold, * mark, no background; no outline anywhere",
    async run(t, ctx) {
      const state = await prepareSelection(ctx);
      t.eq(state, [{ i: 1, sel: "true", cursor: true }, { i: 2, sel: "true", cursor: false }], "2nd = selected + cursor row, 3rd = selected only");
      const cursor = await look(ctx, 1);
      const selected = await look(ctx, 2);
      t.eq([cursor.bg, cursor.color, cursor.bold, cursor.mark], [RGB.cursorBg, RGB.cursorFg, true, "* "], "cursor row (also selected): cursor_bg, cursor_fg, bold, mark '* '");
      t.eq([selected.bg, selected.color, selected.bold, selected.mark], [NONE, RGB.selectedFg, true, "* "], "selected-only row: selected colour, bold, no background, mark '* '");
      t.eq(cursor.outline[1], "none", "the cursor row has no outline while the list has the focus");
      t.eq(selected.outline[1], "none", "the selected-only row has no outline");
      t.eq((await ctx.m.outline(".file-list")).style, "none", "list body has no outline (the frame colour carries the focus)");
    },
  },
  {
    id: "AC-929",
    title: "focus moves to the tree (AC-1723): the cursor row has no background and keeps a 1px --ui-border-active outline; back on the list it is the cursor colours again",
    async run(t, ctx) {
      await prepareSelection(ctx);
      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.tree-panel')`, { label: "the tree to take focus" });
      await ctx.settle();
      t.eq((await ctx.m.outline(".file-list")).style, "none", "list body outline-style");
      const idle = await look(ctx, 1);
      t.eq(idle.bg, NONE, "cursor row without list focus: no background");
      t.eq(idle.outline, ["1px", "solid", RGB.borderActive], "cursor row without list focus: 1px solid --ui-border-active");
      t.eq(idle.color, RGB.selectedFg, "its text colour stays the selected colour (priority selected over normal)");
      const frame = (sel) => ctx.ev(`getComputedStyle(document.querySelector(${JSON.stringify(sel)}), '::before').borderTopColor`);
      t.eq(await frame(".file-list-frame"), RGB.border, "list frame colour while the tree has the focus = border_inactive");
      t.eq(await frame(".tree-pane"), RGB.borderActive, "tree frame colour while the tree has the focus = border");
      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.file-list')`, { label: "the list to take focus back" });
      await ctx.settle();
      const back = await look(ctx, 1);
      t.eq([back.bg, back.color, back.outline[1]], [RGB.cursorBg, RGB.cursorFg, "none"], "cursor row back on the list: cursor_bg / cursor_fg, no outline");
    },
  },
  {
    id: "AC-930",
    title: "hovering a row or a tree node changes neither background, outline nor text colour",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100, { size: true, time: false });
      const props = ["background-color", "color", "outline-width", "outline-style", "outline-color", "outline-offset"];
      for (const [label, selector, index] of [["list row", ".file-list-row", 5], ["tree node", ".tree-node", 1]]) {
        const before = await ctx.m.cs(selector, props, index);
        const c = await ctx.m.center(selector, index);
        await ctx.hover(c.x, c.y);
        await ctx.settle(150);
        const after = await ctx.m.cs(selector, props, index);
        t.eq(after, before, `${label}: computed style unchanged while hovered`);
        await ctx.hover(1, 1);
      }
    },
  },
  {
    id: "AC-931",
    title: "--ui-muted vs --ui-surface contrast >= 4.5:1",
    async run() {
      const { Skip } = await import("../lib/report.mjs");
      throw new Skip("[単体] verified by the Rust appearance/contrast_tests.rs (AC-1745 / AC-1746)", false);
    },
  },
];
