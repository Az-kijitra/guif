import { describe, expect, it } from "vitest";
import hljs from "highlight.js/lib/core";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";

// [単体 / 実ライブラリ] Spec: SPEC-0300-0015 第8版 R-466-1 (highlight.js 11.11.1, core + 8 languages imported one by one), R-466-3,
//   R-466-4, AC-525 (the four multi-line sources, checked line by line), AC-526 (a script in the file is text), AC-528 (the classes
//   that appear for keyword / string / comment / built_in -- 【再レビュー m-c】 if no `built_in` token is produced for the sample,
//   THIS TEST FAILS instead of passing without it).
// Architecture: SPEC-0200-0001 §3.14.7 (`hljs.highlight(code, { language, ignoreIllegals: true })` over the whole file, then
//   `splitBalanced`; the output is filtered by `isSafeHighlightHtml`).
//

import { splitBalanced } from "./split-html";
import { isSafeHighlightHtml } from "./safe-html";

hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("typescript", typescript);

const highlight = (code: string, language: string): string => hljs.highlight(code, { language, ignoreIllegals: true }).value;

type Tok = { t: "open"; cls: string } | { t: "close" } | { t: "text"; s: string };
function tokenize(html: string): Tok[] {
  const out: Tok[] = [];
  const re = /<span class="([^"]*)">|<\/span>|[^<]+/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(html)) !== null) {
    if (m.index !== last) throw new Error(`unexpected markup: ${html.slice(last, m.index)}`);
    last = re.lastIndex;
    if (m[0] === "</span>") out.push({ t: "close" });
    else if (m[1] !== undefined) out.push({ t: "open", cls: m[1] });
    else out.push({ t: "text", s: m[0] });
  }
  if (last !== html.length) throw new Error("unparsed tail");
  return out;
}
const decode = (s: string): string =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const textOf = (html: string): string => decode(tokenize(html).map((x) => (x.t === "text" ? x.s : "")).join(""));
function charClasses(html: string): string[] {
  const stack: string[] = [];
  const out: string[] = [];
  for (const x of tokenize(html)) {
    if (x.t === "open") stack.push(x.cls);
    else if (x.t === "close") stack.pop();
    else for (const ch of decode(x.s)) if (ch !== "\n") out.push(`${stack.join(">")}::${ch}`);
  }
  return out;
}
function balanced(html: string): boolean {
  let d = 0;
  for (const x of tokenize(html)) {
    if (x.t === "open") d++;
    else if (x.t === "close" && --d < 0) return false;
  }
  return d === 0;
}

const AC525: { name: string; language: string; code: string }[] = [
  { name: "(i) C multi-line comment", language: "c", code: "int a;\n/* x\n y\n z */\nint b;" },
  { name: "(ii) JavaScript multi-line template literal", language: "javascript", code: "const s = `a\nb ${1 + 1}\nc`;\nlet t = 1;" },
  { name: "(iii) Python triple-quoted string", language: "python", code: 'x = """a\nb\nc"""\nprint(x)' },
  { name: "(iv) Rust nested multi-line comment", language: "rust", code: "/* outer /* inner\nstill inner */\nstill outer */\nfn main() {}" },
];

describe("AC-525 with the real highlight.js: line-by-line pieces equal the whole-file result", () => {
  for (const s of AC525) {
    it(`${s.name}: every one-line chunk is balanced, the text is the source, the per-character classes equal the whole result`, () => {
      const whole = highlight(s.code, s.language);
      const chunks = splitBalanced(whole, 1);
      expect(chunks.length).toBe(s.code.split("\n").length);
      s.code.split("\n").forEach((line, i) => expect(textOf(chunks[i]).replace(/\n$/, "")).toBe(line));
      for (const ch of chunks) expect(balanced(ch)).toBe(true);
      expect(charClasses(chunks.join(""))).toEqual(charClasses(whole));
    });
  }

  it("(i) the line after the comment (`int b;`) is not inside the comment element", () => {
    const chunks = splitBalanced(highlight(AC525[0].code, "c"), 1);
    expect(charClasses(chunks[4]).some((x) => x.includes("hljs-comment"))).toBe(false);
    expect(charClasses(chunks[2]).every((x) => x.startsWith("hljs-comment::"))).toBe(true);
  });
});

describe("AC-528: the classes appear for a Rust sample (m-c: fail, do not skip, when no built_in is produced)", () => {
  const code = 'fn main() { let s = "x"; println!("hi"); } // c';
  const html = highlight(code, "rust");
  const classOf = (needle: string): string[] =>
    tokenize(html).reduce<{ stack: string[]; hits: string[] }>(
      (acc, x) => {
        if (x.t === "open") acc.stack.push(x.cls);
        else if (x.t === "close") acc.stack.pop();
        else if (decode(x.s).includes(needle)) acc.hits.push(acc.stack.join(">"));
        return acc;
      },
      { stack: [], hits: [] },
    ).hits;

  it("`fn` is a keyword, `\"x\"` a string, `// c` a comment", () => {
    expect(classOf("fn")[0]).toContain("hljs-keyword");
    expect(classOf('"x"').join()).toContain("hljs-string");
    expect(classOf("// c").join()).toContain("hljs-comment");
  });

  it("at least one built_in token exists for this sample (otherwise pick another sample: the colour check needs one)", () => {
    expect(html).toContain("hljs-built_in");
  });
});

describe("AC-526 / R-466-4: markup inside the source never becomes markup in the output", () => {
  const samples: { language: string; code: string }[] = [
    { language: "javascript", code: 'const a = "<script>window.__x = 1</script>";\nconst b = \'<img src=x onerror="window.__y=1">\';' },
    { language: "markdown", code: '# t\n\n<script>window.__x = 1</script>\n<img src=x onerror="window.__y=1">\n\n```js\n<b>x</b>\n```' },
    { language: "typescript", code: "const x: Array<string> = []; // <iframe src=//evil></iframe>" },
    { language: "cpp", code: '#include <vector>\nstd::vector<int> v; // a < b && c > d' },
    { language: "json", code: '{"a": "<script>", "b": "&amp; &lt;"}' },
  ];

  it.each(samples)("$language: no <script / <img / <iframe element in the output and the text is the source", ({ language, code }) => {
    const html = highlight(code, language);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(textOf(html)).toBe(code);
  });

  it.each(samples)("$language: every 2,000-line chunk passes isSafeHighlightHtml (the real output stays inside the accepted grammar)", ({ language, code }) => {
    for (const chunk of splitBalanced(highlight(code, language), 2000)) expect(isSafeHighlightHtml(chunk), chunk.slice(0, 80)).toBe(true);
  });

  it("every class token highlight.js emits for the eight languages fits [A-Za-z0-9_-]+ (class_, function_, language-xml included)", () => {
    const codes: [string, string][] = [
      ["javascript", "class A extends B { f() { return `x ${1}`; } }"],
      ["typescript", "interface I { a: number } const f = (x: I): void => {};"],
      ["python", "class A(B):\n    def f(self): return '''x'''"],
      ["rust", "impl<T> A for B<T> where T: C { fn f(&self) -> Option<u8> { None } }"],
      ["markdown", "# t\n- [a](b)\n`c`\n<div>x</div>"],
      ["cpp", "template<typename T> class A : public B { void f() const; };"],
    ];
    for (const [language, code] of codes) {
      for (const m of highlight(code, language).matchAll(/class="([^"]*)"/g)) {
        for (const tok of m[1].split(/\s+/)) expect(tok, `${language}: ${m[1]}`).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    }
  });
});
