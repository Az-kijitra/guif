// SPEC-0300-0015 第9版 R-466 ~ R-466-9 (syntax highlighting in the viewer) and SPEC-0200-0001 §3.14.7 / §3.14.12 ([CDP]).
//   MUST-138 (the dev server does not reload the page at the FIRST highlight; this file runs before anything else that
//   colours code, see SPEC_FILES in run.mjs), AC-528 (the colours of the 8 languages, light; dark in theme.mjs),
//   AC-525-in-the-browser (a multi-line comment keeps its colour on every line), AC-478 (Markdown colours in Text mode
//   only), AC-526 (code in a string is text, not markup), AC-527 (1,000,000 characters are coloured, 1,000,001 are not,
//   nothing is announced), AC-529 (Down and Esc stay responsive while a large file is being coloured).

import fs from "node:fs";
import { listTargets, MOD, sleep } from "../lib/cdp.mjs";
import { openViewerWindow, waitViewerShows } from "./_util.mjs";
import { bodyState, clickButton, closeViewerWindow, press, showInViewer } from "./_viewer.mjs";

/** R-913-1-1 as getComputedStyle prints it: the colours of the highlight classes. */
export const HL = {
  light: { keyword: "rgb(215, 58, 73)", title: "rgb(111, 66, 193)", constant: "rgb(0, 92, 197)", string: "rgb(3, 47, 98)", builtin: "rgb(194, 78, 0)", comment: "rgb(106, 115, 125)", section: "rgb(0, 92, 197)" },
  dark: { keyword: "rgb(255, 123, 114)", title: "rgb(210, 168, 255)", constant: "rgb(121, 192, 255)", string: "rgb(165, 214, 255)", builtin: "rgb(255, 166, 87)", comment: "rgb(139, 148, 158)", section: "rgb(74, 140, 247)" },
};

const SOURCES = {
  c: { file: "1.c", text: '#include <stdio.h>\nint main(void) {\n  /* c */ return 0; // x\n}\nconst char *s = "x";\nint n = 42;\n', has: ["keyword", "comment", "string", "number"] },
  cpp: { file: "2.cpp", text: '#include <vector>\nclass A {};\n// c\nstd::string s = "x";\nint n = 42;\n', has: ["keyword", "comment", "string", "number"] },
  rust: { file: "3.rs", text: 'fn main() { let s = "x"; println!("{}", s); } // c\nfn f() -> i32 { 42 }\n', has: ["keyword", "comment", "string", "number", "builtin"] },
  javascript: { file: "4.js", text: 'const a = "x"; // c\nfunction f() { return 1; }\nlet r = /ab+c/;\n', has: ["keyword", "comment", "string", "number", "title"] },
  typescript: { file: "5.ts", text: 'interface A { x: number }\nconst s: string = "x"; // c\nlet n: number = 7;\n', has: ["keyword", "comment", "string", "number"] },
  python: { file: "6.py", text: 'def f(x):\n    return "x"  # c\nprint(42)\n', has: ["keyword", "comment", "string", "number", "builtin", "title"] },
  json: { file: "7.json", text: '{"a": "x", "b": 1, "c": true}\n', has: ["string", "number", "attr"] },
  markdown: { file: "8.md", text: "# Title\n\n- item\n\n`code`\n\nplain text\n", has: ["section", "bullet"] },
};

/** class -> palette key. `attr`, `number`, `literal` take the "constant" colour; `bullet` is its own. */
const CLASS_OF = {
  keyword: ["hljs-keyword", "keyword"], comment: ["hljs-comment", "comment"], string: ["hljs-string", "string"], number: ["hljs-number", "constant"],
  builtin: ["hljs-built_in", "builtin"], title: ["hljs-title", "title"], attr: ["hljs-attr", "constant"], section: ["hljs-section", "section"], bullet: ["hljs-bullet", "bullet"],
};
const BULLET = { light: "rgb(115, 92, 15)", dark: "rgb(242, 204, 96)" };

const colorOf = (viewer, cls) => viewer.ev(`(() => { const e = document.querySelector('.viewer-body pre.code .${cls}'); return e ? getComputedStyle(e).color : null; })()`);
const waitColoured = async (viewer, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await viewer.ev(`!!document.querySelector('.viewer-body pre.code [class*="hljs-"]')`)) return true;
    if (Date.now() > deadline) return false;
    await sleep(150);
  }
};

function fixtureSources(ctx) {
  if (ctx.fx.exists("vh-lang")) return;
  ctx.fx.mkdir("vh-lang");
  for (const s of Object.values(SOURCES)) fs.writeFileSync(ctx.fx.at("vh-lang", s.file), s.text);
}

/**
 * AC-528 colours for one language in the open viewer: every wanted class exists and has the palette colour.
 * Returns the list of problems (empty = fine).
 */
async function checkLanguage(viewer, language, palette, mode) {
  const problems = [];
  if (!(await waitColoured(viewer))) return [`${language}: nothing was coloured`];
  for (const key of SOURCES[language].has) {
    const [cls, paletteKey] = CLASS_OF[key];
    const expected = paletteKey === "bullet" ? BULLET[mode] : palette[paletteKey];
    const actual = await colorOf(viewer, cls);
    if (actual === null) {
      const present = await viewer.ev(`[...new Set([...document.querySelectorAll('.viewer-body pre.code [class*="hljs-"]')].map((e) => e.className))].join(" | ")`);
      problems.push(`${language}: no .${cls} element (classes present: ${present}; text: ${JSON.stringify(await viewer.ev(`document.querySelector('.viewer-body pre.code').textContent.slice(0, 80)`))})`);
    }
    else if (actual !== expected) problems.push(`${language}: .${cls} is ${actual}, expected ${expected}`);
  }
  return problems;
}

/** AC-528: the Rust sample's keyword / string / comment / built-in colours in the open viewer (shared with theme.mjs for dark). */
export async function checkRustColours(t, ctx, mode) {
  fixtureSources(ctx);
  const viewer = await showInViewer(t, ctx, "vh-lang", "3.rs", "text", { contains: "fn main" });
  if (viewer === undefined) return;
  try {
    const problems = await checkLanguage(viewer, "rust", HL[mode], mode);
    t.eq(problems, [], `the Rust sample's keyword / string / comment / built-in / number colours are the ${mode} palette`);
  } finally {
    await closeViewerWindow(ctx, viewer);
  }
}

/** AC-528 (OS theme switch, emulated): the colours change without a reload and the scroll position stays. Used by theme.mjs (no config.toml). */
export async function checkHighlightFollowsOs(t, ctx) {
  ctx.fx.mkdir("vh-os");
  const text = Array.from({ length: 200 }, (_, i) => `fn f${i}() { let s = "x"; } // c`).join("\n") + "\n";
  fs.writeFileSync(ctx.fx.at("vh-os", "big.rs"), text);
  const viewer = await showInViewer(t, ctx, "vh-os", "big.rs", "text", { contains: "fn f0" });
  if (viewer === undefined) return;
  try {
    t.ok(await waitColoured(viewer), "the sample was coloured");
    await viewer.ev(`window.__hlMarker = "kept"; document.querySelector('.viewer-body').scrollTop = 300; true`);
    await sleep(200);
    const look = async (want) => {
      for (let i = 0; i < 20; i++) {
        const c = await colorOf(viewer, "hljs-keyword");
        if (c === want) return c;
        await sleep(100);
      }
      return colorOf(viewer, "hljs-keyword");
    };
    await ctx.emulateColorScheme("light", viewer);
    t.eq(await look(HL.light.keyword), HL.light.keyword, "light: the keyword colour");
    const top = (await bodyState(viewer)).top;
    await ctx.emulateColorScheme("dark", viewer);
    t.eq(await look(HL.dark.keyword), HL.dark.keyword, "dark: the keyword colour changed without a reload");
    t.eq(await colorOf(viewer, "hljs-comment"), HL.dark.comment, "dark: the comment colour");
    t.eq(await viewer.ev(`window.__hlMarker ?? null`), "kept", "no reload (the marker is kept)");
    t.eq((await bodyState(viewer)).top, top, "the scroll position is unchanged");
  } finally {
    await ctx.emulateColorScheme("", viewer).catch(() => {});
    await closeViewerWindow(ctx, viewer);
  }
}

export const tests = [
  {
    id: "AC-530",
    title: "longest line of exactly 10,000 characters (c.js, also CRLF e.js) is coloured; 10,001 (d.js) is shown whole and uncoloured, with no notice (R-466-5-1)",
    async run(t, ctx) {
      const lineOf = (n) => "// " + "x".repeat(n - 3);
      const body = (n, eol) => ["const a = 1; // short", lineOf(n), "function f() { return 'y'; }", ""].join(eol);
      ctx.fx.mkdir("vh-line");
      fs.writeFileSync(ctx.fx.at("vh-line", "c.js"), body(10000, "\n"));
      fs.writeFileSync(ctx.fx.at("vh-line", "d.js"), body(10001, "\n"));
      fs.writeFileSync(ctx.fx.at("vh-line", "e.js"), body(10000, "\r\n"));
      for (const [file, coloured] of [["c.js", true], ["d.js", false], ["e.js", true]]) {
        const viewer = await showInViewer(t, ctx, "vh-line", file, "text", { contains: "const a = 1;" });
        if (viewer === undefined) return;
        try {
          if (coloured) t.ok(await waitColoured(viewer, 30000), `${file}: coloured`);
          else await sleep(3000);
          const r = await viewer.ev(`({ colour: !!document.querySelector('.viewer-body [class*="hljs-"]'), longest: Math.max(...document.querySelector('.viewer-body pre.code').textContent.split(/\\r?\\n/).map((l) => l.length)),
            banner: !!document.querySelector('.truncation-banner'), alert: !!document.querySelector('[role=alert]'), shortLine: document.querySelector('.viewer-body pre.code').textContent.includes('function f()') })`);
          t.eq(r.colour, coloured, `${file}: ${coloured ? "has" : "has no"} highlight elements`);
          t.eq(r.longest, file === "d.js" ? 10001 : 10000, `${file}: the whole text is shown`);
          t.eq([r.shortLine, r.banner, r.alert], [true, false, false], `${file}: the other lines are shown and nothing is announced`);
        } finally {
          await closeViewerWindow(ctx, viewer);
        }
      }
    },
  },
  {
    id: "MUST-138",
    title: "the dev server does not reload the pages when the FIRST file is highlighted (a marker in the main and viewer pages survives; the viewer's time origin is unchanged)",
    async run(t, ctx) {
      fixtureSources(ctx);
      await ctx.reload();
      await ctx.ev(`window.__rf138 = "main"; true`);
      await ctx.nav(ctx.fx.at("vh-lang"));
      const downs = (await ctx.ev(`[...document.querySelectorAll('.app-shell .file-list-row')].map((e) => e.getAttribute('aria-label'))`)).indexOf("5.ts");
      const viewer = await openViewerWindow(t, ctx, { downs });
      if (viewer === undefined) return;
      try {
        const origin0 = await viewer.ev(`performance.timeOrigin`);
        await viewer.ev(`window.__rf138 = "viewer"; true`);
        if (!(await waitViewerShows(t, viewer, "5.ts", "text", { contains: "interface A" }))) return;
        t.ok(await waitColoured(viewer, 60000), "the TypeScript file was coloured (the Worker ran and the libraries loaded)");
        await sleep(2500); // a late optimiser reload would show up here
        t.eq(await viewer.ev(`window.__rf138 ?? null`), "viewer", "the viewer page was not reloaded (marker kept)");
        t.eq(await viewer.ev(`performance.timeOrigin`), origin0, "the viewer's time origin is unchanged");
        t.eq(await ctx.ev(`window.__rf138 ?? null`), "main", "the main page was not reloaded either (marker kept)");
        t.note("deps が既に最適化済み(node_modules/.vite)だと、この確認は常に通る。初回の最適化の再読込そのものは vite.config.ts の optimizeDeps.include で防ぐ");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-528",
    title: "light: the 8 languages are coloured with the R-913-1-1 palette (keyword / string / comment / number / built-in / title / attr / section / bullet as each sample has them)",
    async run(t, ctx) {
      fixtureSources(ctx);
      await ctx.reload();
      await ctx.nav(ctx.fx.at("vh-lang"));
      const viewer = await openViewerWindow(t, ctx, { downs: 0 });
      if (viewer === undefined) return;
      try {
        const order = ["c", "cpp", "rust", "javascript", "typescript", "python", "json", "markdown"];
        for (let i = 0; i < order.length; i++) {
          const language = order[i];
          const src = SOURCES[language];
          if (i > 0) await press(viewer, "ArrowRight", MOD.Alt);
          if (!(await waitViewerShows(t, viewer, src.file, language === "markdown" ? "markdown" : "text"))) return;
          if (language === "markdown") {
            // R-474: Markdown is coloured in Text mode only
            t.eq(await viewer.ev(`!!document.querySelector('.viewer-body [class*="hljs-"]')`), false, "markdown: HTML mode has no colour elements");
            t.eq(await clickButton(viewer, "Text"), true, "markdown: the Text button exists");
            await sleep(300);
          }
          const problems = await checkLanguage(viewer, language, HL.light, "light");
          t.eq(problems, [], `${language}: token colours`);
        }
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-528-rust",
    title: "light Rust sample: fn / \"x\" / // c / println! are the keyword, string, comment and built-in colours (the built-in class must really exist)",
    async run(t, ctx) {
      await checkRustColours(t, ctx, "light");
    },
  },
  {
    id: "AC-525",
    title: "a multi-line C comment keeps the comment colour on every line and the code after it does not (the highlight is split per line without breaking tokens)",
    async run(t, ctx) {
      ctx.fx.mkdir("vh-ml");
      const text = "int a;\n/* x\n y\n z */\nint b;\n";
      fs.writeFileSync(ctx.fx.at("vh-ml", "ml.c"), text);
      const viewer = await showInViewer(t, ctx, "vh-ml", "ml.c", "text", { contains: "int a" });
      if (viewer === undefined) return;
      try {
        t.ok(await waitColoured(viewer), "the sample was coloured");
        const r = await viewer.ev(`(() => {
          const pre = document.querySelector('.viewer-body pre.code');
          const lines = pre.textContent.split('\\n');
          const w = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
          const out = []; let line = 0;
          for (let n = w.nextNode(); n; n = w.nextNode()) {
            const inComment = !!n.parentElement.closest('.hljs-comment');
            for (const ch of n.data) { if (ch === '\\n') { line++; continue; } out.push({ line, ch, inComment }); }
          }
          const ofLine = (i) => out.filter((c) => c.line === i && c.ch.trim() !== '');
          return { lines, comment: [1, 2, 3].map((i) => ofLine(i).every((c) => c.inComment)), after: ofLine(4).some((c) => c.inComment), before: ofLine(0).some((c) => c.inComment) };
        })()`);
        t.eq(r.lines.slice(0, 5), text.split("\n").slice(0, 5), "the text is unchanged");
        t.eq(r.comment, [true, true, true], "every character of the three comment lines is inside a comment element");
        t.eq([r.before, r.after], [false, false], "the lines before and after the comment are not inside a comment element");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-478",
    title: "Markdown: HTML mode has no colour elements (code blocks monospace); Text mode shows the numbered, coloured source (the heading line has a highlight element)",
    async run(t, ctx) {
      ctx.fx.mkdir("vh-md");
      fs.writeFileSync(ctx.fx.at("vh-md", "a.md"), "# Heading\n\ntext\n\n```js\nconst a = 1; // c\n```\n");
      const viewer = await showInViewer(t, ctx, "vh-md", "a.md", "markdown");
      if (viewer === undefined) return;
      try {
        await sleep(800);
        t.eq(await viewer.ev(`document.querySelectorAll('.viewer-body [class*="hljs-"]').length`), 0, "HTML mode: no highlight element");
        const font = await viewer.ev(`getComputedStyle(document.querySelector('.markdown-html pre code')).fontFamily`);
        t.ok(font.startsWith("ui-monospace"), "HTML mode: the code block font starts with ui-monospace", font);
        t.eq(await clickButton(viewer, "Text"), true, "the Text button exists");
        t.ok(await waitColoured(viewer), "Text mode: the source is coloured");
        t.eq(await viewer.ev(`!!document.querySelector('.viewer-body .gutter') && !!document.querySelector('.viewer-body pre.code .hljs-section')`), true, "Text mode: numbered, and the heading line has a section element");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-526",
    title: "code inside a string (<script>, <img onerror>) is shown as text: no script / img element, no window.__x / __y",
    async run(t, ctx) {
      ctx.fx.mkdir("vh-xss");
      const text = 'const s = "<script>window.__x = 1</script>";\nconst i = \'<img src=x onerror="window.__y=1">\';\n';
      fs.writeFileSync(ctx.fx.at("vh-xss", "a.js"), text);
      const viewer = await showInViewer(t, ctx, "vh-xss", "a.js", "text", { contains: "window.__x" });
      if (viewer === undefined) return;
      try {
        t.ok(await waitColoured(viewer), "the sample was coloured");
        await sleep(600);
        const r = await viewer.ev(`({ shown: document.querySelector('.viewer-body pre.code').textContent, elements: document.querySelectorAll('.viewer-body script, .viewer-body img').length, x: typeof window.__x, y: typeof window.__y })`);
        t.eq(r.shown, text, "the text is shown as written");
        t.eq(r.elements, 0, "no script / img element in the body");
        t.eq([r.x, r.y], ["undefined", "undefined"], "window.__x and window.__y are undefined");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
  {
    id: "AC-527",
    title: "1,000,000 characters are coloured (and Down / Esc answer within 1 s while it is being coloured, AC-529); 1,000,001 are not coloured and nothing is announced",
    async run(t, ctx) {
      const line = "const a = 1; // c\n";
      const exact = line.repeat(Math.ceil(1_000_000 / line.length)).slice(0, 1_000_000);
      ctx.fx.mkdir("vh-limit");
      fs.writeFileSync(ctx.fx.at("vh-limit", "a.ts"), exact);
      fs.writeFileSync(ctx.fx.at("vh-limit", "b.ts"), exact + "x");
      // a.ts: exactly the limit
      const opened = Date.now();
      const lap = (label) => t.note(`lap ${label}: ${Date.now() - opened} ms since the start of this test`);
      let viewer = await showInViewer(t, ctx, "vh-limit", "a.ts", "text", { contains: "const a = 1;", timeout: 90000 });
      if (viewer === undefined) return;
      try {
        t.note(`a.ts (1,000,000 characters) was shown ${Date.now() - opened} ms after Enter`);
        const started = Date.now();
        await viewer.key("ArrowDown");
        let moved = false;
        while (Date.now() - started < 1000 && !moved) {
          moved = Math.abs((await bodyState(viewer)).top - 72) <= 1;
          if (!moved) await sleep(25);
        }
        lap("Down checked");
        t.ok(moved, "AC-529: Down scrolls 72 px within 1 s of sending it, while the highlight is still being made");
        const colouringStarted = Date.now();
        t.ok(await waitColoured(viewer, 120000), "AC-527: the file of exactly 1,000,000 characters is coloured");
        t.note(`the colour appeared ${Date.now() - colouringStarted} ms after the check of Down`);
        lap("coloured");
        t.eq(await viewer.ev(`document.querySelector('.viewer-body pre.code').textContent.length`), 1_000_000, "all 1,000,000 characters are shown");
        const esc = Date.now();
        await viewer.key("Escape");
        let gone = false;
        while (Date.now() - esc < 1000 && !gone) {
          gone = !(await listTargets(ctx.port)).some((x) => x.type === "page" && x.url.includes("/viewer"));
          if (!gone) await sleep(50);
        }
        t.ok(gone, "AC-529: Esc closes the viewer within 1 s");
        lap("Esc checked");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
      lap("a.ts window closed");
      // b.ts: one character over
      const openedB = Date.now();
      viewer = await showInViewer(t, ctx, "vh-limit", "b.ts", "text", { contains: "const a = 1;", timeout: 90000 });
      if (viewer === undefined) return;
      try {
        t.note(`b.ts (1,000,001 characters) was shown ${Date.now() - openedB} ms after Enter (incl. reload and navigation)`);
        lap("b.ts shown");
        await sleep(6000);
        const r = await viewer.ev(`({ colour: !!document.querySelector('.viewer-body [class*="hljs-"]'), length: document.querySelector('.viewer-body pre.code').textContent.length,
          banner: !!document.querySelector('.viewer-body .truncation-banner, .truncation-banner'), alert: !!document.querySelector('[role=alert]') })`);
        t.eq(r.colour, false, "1,000,001 characters: not coloured");
        t.eq(r.length, 1_000_001, "1,000,001 characters: the whole text is shown");
        t.eq([r.banner, r.alert], [false, false], "nothing is announced about the limit");
      } finally {
        await closeViewerWindow(ctx, viewer);
      }
    },
  },
];

