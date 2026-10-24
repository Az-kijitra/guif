// SPEC-0300-0017 §16.3: the path bar (AC-909, AC-910).
import { FRAME_FOCUS, openFiles, RGB } from "./_util.mjs";

export const tests = [
  {
    id: "AC-909",
    title: "path bar: PATH label, input geometry, padding, gap, border, radius, background",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      const first = await ctx.ev(`(() => { const b = document.querySelector('.path-bar-row'); return { text: b.children[0].textContent.trim(), tag: b.children[0].tagName }; })()`);
      t.eq(first.text, "PATH", "the first child is the PATH label");
      const label = await ctx.m.cs(".path-bar-row > :first-child", ["font-weight", "font-size"]);
      t.eq(label["font-weight"], "700", "label font-weight (bold, AC-1810)");
      t.eq((await ctx.m.cs(".path-bar-row > :first-child", ["color"])).color, RGB.treeCurrent, "label colour = tree_current");
      t.eq(label["font-size"], "12px", "label font-size");
      const bar = await ctx.m.rect(".path-bar-row");
      const input = await ctx.m.rect(".path-bar-row input");
      const labelRect = await ctx.m.rect(".path-bar-row > :first-child");
      t.ok(input.left > labelRect.right, "input is to the right of the label");
      t.approx(input.right, bar.right - 6, "input right = path bar right - 6 (the bar padding)");
      const barStyle = await ctx.m.cs(".path-bar-row", ["padding", "column-gap"]);
      t.eq(barStyle.padding, "4px 6px", "path bar padding");
      t.eq(barStyle["column-gap"], "8px", "path bar column-gap");
      const s = await ctx.m.cs(".path-bar-row input", [
        "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
        "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
        "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
        "border-radius", "background-color", "padding", "text-overflow",
      ]);
      for (const side of ["top", "right", "bottom", "left"]) {
        t.eq(s[`border-${side}-width`], "1px", `input border-${side}-width`);
        t.eq(s[`border-${side}-style`], "solid", `input border-${side}-style`);
        t.eq(s[`border-${side}-color`], RGB.borderStrong, `input border-${side}-color`);
      }
      t.eq(s["border-radius"], "4px", "input border-radius");
      t.eq(s["background-color"], RGB.surface2, "input background (not editing)");
      t.eq(s.padding, "4px 6px", "input padding");
      t.eq(s["text-overflow"], "ellipsis", "input text-overflow");
    },
  },
  {
    id: "AC-910",
    title: "editing look: white background + 1px focus-colour outline while editing; gone after Escape",
    async run(t, ctx) {
      await openFiles(ctx, "many100", 100);
      await ctx.focusList();
      t.eq((await ctx.m.outline(".path-bar-row input")).style, "none", "no outline before editing");
      await ctx.press.ctrlL();
      await ctx.waitFor(`document.activeElement === document.querySelector('.path-bar-row input')`, { label: "the path input to take focus" });
      t.eq((await ctx.m.cs(".path-bar-row input", ["background-color"]))["background-color"], RGB.surface, "editing background (surface = bg in nord)");
      const o = await ctx.m.outline(".path-bar-row input");
      t.eq(o.width, FRAME_FOCUS.width, "outline-width");
      t.eq(o.style, FRAME_FOCUS.style, "outline-style");
      t.eq(o.color, FRAME_FOCUS.color, "outline-color");
      t.eq(o.offset, FRAME_FOCUS.offset, "outline-offset");
      await ctx.press.escape();
      await ctx.waitFor(`document.activeElement !== document.querySelector('.path-bar-row input')`, { label: "the list to take focus back" });
      t.eq((await ctx.m.outline(".path-bar-row input")).style, "none", "outline-style after Escape");
      t.eq((await ctx.m.cs(".path-bar-row input", ["background-color"]))["background-color"], RGB.surface2, "background after Escape");
    },
  },
];
