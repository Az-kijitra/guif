// SPEC-0300-0015 第9版 R-462 / R-463-1 / R-464 / R-500-9 / R-510-2: the text display of the viewer ([CDP]).
//   AC-522 (fonts, 13 px / 20 px lines, the 72 px line-number column; the dark side is in theme.mjs), AC-523 (the number
//   column and the body agree line by line, nothing but the body is selected / copied, the last line of a file that ends
//   in a newline, the 150% size of Markdown Text mode).
// The DOM contract (SPEC-0200-0001 §3.14.5): .text-view > .gutter (ONE text node "1\n2\n...") + .code-column > pre.code
// (+ .tail for a final newline). Positions are read with Range.getClientRects, never from per-row elements.

import fs from "node:fs";
import { MOD, sleep } from "../lib/cdp.mjs";
import { bodyState, clickButton, closeViewerWindow, press, showInViewer } from "./_viewer.mjs";

const near = (t, actual, expected, label, tol = 1) => t.approx(actual, expected, label, tol);

/** AC-523 file: 50 lines, empty lines and a tab, no newline at the end. */
export const FIFTY = Array.from({ length: 50 }, (_, i) => {
  const n = i + 1;
  if (n === 5 || n === 10 || n === 15) return "";
  if (n === 7) return "\tindented seven";
  return `line ${n} text`;
}).join("\n");

/** In-page tools: the viewport top of the first character of each wanted line of an element's text. */
const TOOLS = `
  const textNodes = (root) => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const out = []; for (let n = w.nextNode(); n; n = w.nextNode()) out.push(n); return out; };
  const locate = (root, offset) => { let acc = 0; for (const n of textNodes(root)) { if (offset < acc + n.length) return { node: n, off: offset - acc }; acc += n.length; } return null; };
  const starts = (text) => { const s = [0]; for (let i = 0; i < text.length; i++) if (text[i] === '\\n') s.push(i + 1); return s; };
  const rectOf = (root, offset) => { const p = locate(root, offset); if (!p) return null; const r = document.createRange(); r.setStart(p.node, p.off); r.setEnd(p.node, Math.min(p.node.length, p.off + 1)); const l = r.getClientRects(); return l.length ? l[0] : null; };
  const topsOf = (root, lines) => { const s = starts(root.textContent); return lines.map((n) => rectOf(root, s[n - 1])?.top ?? null); };
`;

const MEASURE = (lines) => `(() => {
  ${TOOLS}
  const gutter = document.querySelector('.viewer-body .gutter');
  const pre = document.querySelector('.viewer-body pre.code');
  const column = document.querySelector('.viewer-body .code-column');
  const g = gutter.getBoundingClientRect();
  const p = pre.getBoundingClientRect();
  const first = rectOf(pre, 0);
  return {
    gutterNumbers: gutter.textContent.split('\\n'), codeLineCount: pre.textContent.split('\\n').length,
    preHeight: p.height, columnHeight: column.getBoundingClientRect().height,
    gutterTop: g.top, gutterBottom: g.bottom, gutterRight: g.right, preTop: p.top, preBottom: p.bottom,
    gutterTops: topsOf(gutter, ${JSON.stringify(lines)}), codeTops: topsOf(pre, ${JSON.stringify(lines)}),
    firstCharLeft: first ? first.left : null,
  };
})()`;

/** AC-522: the computed look of the text view and the header; `p` = the gutter colours of the theme. */
export async function checkTextLook(t, viewer, p) {
  const look = await viewer.ev(`(() => {
    const cs = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null; };
    const pick = (s, props) => (s ? Object.fromEntries(props.map((k) => [k, s.getPropertyValue(k)])) : null);
    return {
      code: pick(cs('.viewer-body pre.code'), ['font-family', 'font-size', 'line-height', 'tab-size', 'white-space']),
      gutter: pick(cs('.viewer-body .gutter'), ['font-family', 'font-size', 'line-height', 'width', 'text-align', 'padding-right', 'border-right-width', 'border-right-style', 'border-right-color', 'user-select', 'background-color']),
      name: pick(cs('.viewer-header .filename'), ['font-family', 'font-size']),
      encoding: pick(cs('.viewer-header .encoding'), ['font-family', 'font-size']),
      button: pick(cs('.viewer-header button'), ['font-family', 'font-size']),
    };
  })()`);
  const mono = (v) => String(v).startsWith("ui-monospace");
  const segoe = (v) => String(v).startsWith('"Segoe UI"');
  t.ok(mono(look.code["font-family"]), "body font-family starts with ui-monospace", look.code["font-family"]);
  t.eq([look.code["font-size"], look.code["line-height"], look.code["tab-size"], look.code["white-space"]], ["13px", "20px", "4", "pre"], "body: 13px, line-height 20px, tab-size 4, white-space pre");
  t.ok(mono(look.gutter["font-family"]), "number column font-family starts with ui-monospace", look.gutter["font-family"]);
  t.eq([look.gutter["font-size"], look.gutter["line-height"]], ["13px", "20px"], "number column: 13px / 20px");
  t.eq([look.gutter.width, look.gutter["text-align"], look.gutter["padding-right"]], ["72px", "right", "10px"], "number column: width 72px, right-aligned, padding-right 10px");
  t.eq([look.gutter["border-right-width"], look.gutter["border-right-style"], look.gutter["border-right-color"]], ["1px", "solid", p.border], "number column: right border 1px solid (theme colour)");
  t.eq(look.gutter["user-select"], "none", "number column: user-select none");
  t.eq(look.gutter["background-color"], p.header, "number column background");
  for (const [what, v] of [["file name", look.name], ["encoding", look.encoding], ["button", look.button]]) {
    t.ok(v !== null && segoe(v["font-family"]) && v["font-size"] === "13px", `header ${what}: Segoe UI 13px`, JSON.stringify(v));
  }
}

export const tests = [
  {
    id: "AC-522",
    title: "light: body / number column fonts (ui-monospace 13px, line 20px, tab 4, pre), 72px right-aligned number column, header Segoe UI 13px; Markdown HTML body Segoe UI and code blocks monospace",
    async run(t, ctx) {
      ctx.fx.mkdir("vt-look");
      fs.writeFileSync(ctx.fx.at("vt-look", "a.txt"), FIFTY);
      fs.writeFileSync(ctx.fx.at("vt-look", "b.md"), "# Title\n\nbody text\n\n```js\nlet a = 1;\n```\n");
      let viewer = await showInViewer(t, ctx, "vt-look", "a.txt", "text", { contains: "line 1 text" });
      if (viewer === undefined) return;
      try {
        await checkTextLook(t, viewer, { header: "rgb(240, 240, 240)", border: "rgb(208, 208, 208)" });
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
      viewer = await showInViewer(t, ctx, "vt-look", "b.md", "markdown");
      if (viewer === undefined) return;
      try {
        const fonts = await viewer.ev(`(() => ({
          html: getComputedStyle(document.querySelector('.markdown-html')).fontFamily,
          code: getComputedStyle(document.querySelector('.markdown-html pre code')).fontFamily,
        }))()`);
        t.ok(fonts.html.startsWith('"Segoe UI"'), "Markdown HTML body: Segoe UI first", fonts.html);
        t.ok(fonts.code.startsWith("ui-monospace"), "Markdown HTML code block: ui-monospace first", fonts.code);
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-523",
    title: "50 lines (empty lines, a tab, no final newline): number column and body agree (50 / 50), lines 20 px apart and aligned, continuous column, Ctrl+A selects the body text only, gap 8 px; a trailing newline gives 3 numbers",
    async run(t, ctx) {
      ctx.fx.mkdir("vt-lines");
      fs.writeFileSync(ctx.fx.at("vt-lines", "a.txt"), FIFTY);
      fs.writeFileSync(ctx.fx.at("vt-lines", "ab.txt"), "a\nb\n");
      let viewer = await showInViewer(t, ctx, "vt-lines", "a.txt", "text", { contains: "line 1 text" });
      if (viewer === undefined) return;
      try {
        const m = await viewer.ev(MEASURE([1, 2, 3, 25, 50]));
        t.eq([m.gutterNumbers.length, m.gutterNumbers[m.gutterNumbers.length - 1]], [50, "50"], "(a) the number column shows 50 numbers, the last is 50");
        t.eq(m.codeLineCount, 50, "(a) the body has 50 lines");
        near(t, m.preHeight, 50 * 20, "(b) the body height is 50 x 20");
        const diffs = m.gutterTops.map((g, i) => (g === null || m.codeTops[i] === null ? null : g - m.codeTops[i]));
        t.ok(diffs.every((d) => d !== null && Math.abs(d) <= 1), "(b) number n and line n start at the same height (n = 1, 2, 3, 25, 50)", JSON.stringify({ g: m.gutterTops, c: m.codeTops }));
        near(t, m.codeTops[2] - m.codeTops[1], 20, "(b) neighbouring lines are 20 px apart");
        near(t, m.gutterTops[2] - m.gutterTops[1], 20, "(b) neighbouring numbers are 20 px apart");
        near(t, m.gutterTop, m.preTop, "(c) the number column starts at the top of the first line");
        t.ok(m.gutterBottom >= m.preBottom - 1, "(c) the number column reaches the bottom of the last line", `${m.gutterBottom} vs ${m.preBottom}`);
        near(t, m.firstCharLeft - m.gutterRight, 8, "(e) the first character is 8 px right of the divider");
        // (d) Ctrl+A: only the body text
        await viewer.key("a", MOD.Ctrl, "KeyA");
        await sleep(150);
        const sel = await viewer.ev(`(() => {
          const s = getSelection(); const pre = document.querySelector('.viewer-body pre.code');
          return { text: s.toString(), ranges: s.rangeCount, anchorIn: pre.contains(s.anchorNode), focusIn: pre.contains(s.focusNode) };
        })()`);
        t.eq(sel.text, FIFTY, "(d) Ctrl+A selects exactly the file's text (no number, no file name, no button text)");
        t.eq([sel.ranges, sel.anchorIn, sel.focusIn], [1, true, true], "(d) the selection lies inside the body element");
        t.eq(sel.text.split("\n").length, FIFTY.split("\n").length, "(d) the number of line breaks is the file's");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
      // a final newline
      viewer = await showInViewer(t, ctx, "vt-lines", "ab.txt", "text", { contains: "a" });
      if (viewer === undefined) return;
      try {
        const m = await viewer.ev(MEASURE([1, 2]));
        t.eq(m.gutterNumbers, ["1", "2", "3"], "a\\nb\\n: the numbers are 1 to 3");
        near(t, m.columnHeight, 60, "a\\nb\\n: the body is 3 lines high (the empty last line is shown)");
        near(t, m.gutterBottom - m.gutterTop, 60, "a\\nb\\n: the number column is 3 lines high");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-523-f",
    title: "Markdown Text mode at 150% (Ctrl++ x5): font 19.5 px, neighbouring lines 30 px apart",
    async run(t, ctx) {
      ctx.fx.mkdir("vt-md");
      fs.writeFileSync(ctx.fx.at("vt-md", "m.md"), FIFTY);
      const viewer = await showInViewer(t, ctx, "vt-md", "m.md", "markdown");
      if (viewer === undefined) return;
      try {
        t.eq(await clickButton(viewer, "Text"), true, "the Text button exists");
        await sleep(500);
        for (let i = 0; i < 5; i++) await press(viewer, "+", MOD.Ctrl);
        await sleep(400);
        t.eq(await viewer.ev(`document.querySelector('.viewer-header .zoom')?.textContent`), "150%", "the Markdown zoom is 150%");
        const m = await viewer.ev(MEASURE([20, 21]));
        near(t, m.codeTops[1] - m.codeTops[0], 30, "neighbouring body lines are 30 px apart");
        near(t, m.gutterTops[1] - m.gutterTops[0], 30, "neighbouring numbers are 30 px apart");
        t.eq(await viewer.ev(`getComputedStyle(document.querySelector('.viewer-body pre.code')).fontSize`), "19.5px", "the body font size is 19.5px");
        const s = await bodyState(viewer);
        t.ok(s.maxTop > 0, "the scrolled height grew with the zoom", JSON.stringify(s));
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
];
