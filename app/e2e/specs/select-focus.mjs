// SPEC-0300-0017 §16.7: selection and focus looks (AC-928 ... AC-930; AC-931 is a unit test).
import { FRAME_FOCUS, openFiles, RGB } from "./_util.mjs";

const focusState = (ctx, index) => ctx.m.outline(".file-list-row", index);
const flat = (o) => [o.width, o.style, o.color, o.offset];

/** Row 2 = selected + focus row, row 3 = selected only, list focused. */
async function prepareSelection(ctx) {
  await openFiles(ctx, "many100", 100, { size: true, time: false });
  await ctx.focusList();
  await ctx.press.down(); // focus on the 2nd entry
  await ctx.key(" ", 0, "Space"); // select_toggle selects it and moves the focus down
  await ctx.key(" ", 0, "Space"); // ... selects the 3rd entry too, focus now on the 4th
  await ctx.press.up();
  await ctx.press.up(); // focus back on the 2nd entry (selected)
  await ctx.settle();
  const state = await ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r, i) => ({ i, sel: r.getAttribute('aria-selected'), focus: r.classList.contains('focused') })).filter((r) => r.sel === 'true' || r.focus)`);
  return state;
}

export const tests = [
  {
    id: "AC-928",
    title: "list focused: selected rows #dbe9ff, focus row 1px #7aa7ff outline, list body outline",
    async run(t, ctx) {
      const state = await prepareSelection(ctx);
      t.eq(state, [{ i: 1, sel: "true", focus: true }, { i: 2, sel: "true", focus: false }], "2nd = selected + focus row, 3rd = selected only");
      t.eq((await ctx.m.cs(".file-list-row", ["background-color"], 1))["background-color"], RGB.selected, "2nd background");
      t.eq((await ctx.m.cs(".file-list-row", ["background-color"], 2))["background-color"], RGB.selected, "3rd background");
      t.eq(flat(await focusState(ctx, 1)), flat({ ...FRAME_FOCUS }), "focus row outline (width, style, colour, offset)");
      t.eq((await focusState(ctx, 2)).style, "none", "selected-only row has no outline");
      t.eq(flat(await ctx.m.outline(".file-list")), flat({ ...FRAME_FOCUS }), "list body outline");
    },
  },
  {
    id: "AC-929",
    title: "focus moves to the tree: list outline off, focus row keeps a muted 1px outline; back on the list it is blue again",
    async run(t, ctx) {
      await prepareSelection(ctx);
      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.tree-panel')`, { label: "the tree to take focus" });
      await ctx.settle();
      t.eq((await ctx.m.outline(".file-list")).style, "none", "list body outline-style");
      const o = await focusState(ctx, 1);
      t.eq([o.width, o.style, o.color], ["1px", "solid", RGB.muted], "focus row outline while the list is not focused");
      await ctx.press.tab();
      await ctx.waitFor(`document.activeElement === document.querySelector('.file-list')`, { label: "the list to take focus back" });
      await ctx.settle();
      t.eq((await focusState(ctx, 1)).color, RGB.focused, "focus row outline colour back to the focus colour");
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
      throw new Skip("[単体] verified by app/src/contrast.test.ts (vitest)", false);
    },
  },
];
