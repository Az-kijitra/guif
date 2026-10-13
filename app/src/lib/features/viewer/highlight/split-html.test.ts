import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0015 第8版 R-466-3 (a multi-line token keeps the colour it has when the whole file is highlighted at
//   once), AC-525 (i)~(iv) (C comment, JS template literal, Python triple quotes, Rust nested comment; checked LINE BY LINE),
//   R-466-6 (chunked hand-over), R-460 (one source line = one screen line).
// Architecture: SPEC-0200-0001 §3.14.7 (`splitBalanced(html, linesPerChunk)` in `features/viewer/highlight/split-html.ts`: tokenise the
//   highlight.js HTML into `<span ...>` / `</span>` / "\n" / text, keep a stack of open tags, at a chunk boundary close the
//   whole stack and re-open the same tags at the start of the next chunk; the three properties a / b / c), §3.14.12-13
//   (SHOULD-203: AC-525 is verified with `splitBalanced(html, 1)` -- one line per chunk -- besides the 2,000-line chunks).
//
// The HTML fixtures are hand-written in the exact shape
// highlight.js 11 emits (`<span class="hljs-...">`, `&lt; &gt; &amp; &quot; &#x27;` escapes). A test that runs the REAL
// highlight.js over the AC-525 sources is in highlight-real.test.ts.
//
// Contract assumed (reported to the implementer):
//   splitBalanced(html: string, linesPerChunk: number): string[]
//     - the lines are the "\n"-separated parts of the TEXT (the count equals text-lines.ts `lineCount`);
//     - chunk k holds source lines [k*n, (k+1)*n); every chunk EXCEPT THE LAST ends with the "\n" of its last line
//       (so `chunks.join("")` has exactly the original text); closing tags may be placed before or after that "\n";
//     - every chunk is balanced on its own; the next chunk re-opens the same `<span class="...">` tags, outermost first;
//     - one chunk (linesPerChunk >= line count) is returned UNCHANGED; "" gives [""].
//
// Module under test (not yet implemented): ./split-html.ts

import { splitBalanced } from "./split-html";

// ---- helpers (test-side parsing, deliberately independent of the implementation) --------------------------------------------

type Tok = { t: "open"; cls: string; raw: string } | { t: "close" } | { t: "text"; s: string };

function tokenize(html: string): Tok[] {
  const out: Tok[] = [];
  const re = /<span class="([^"]*)">|<\/span>|[^<]+/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(html)) !== null) {
    if (m.index !== last) throw new Error(`unexpected markup at ${last}: ${html.slice(last, m.index)}`);
    last = re.lastIndex;
    if (m[0] === "</span>") out.push({ t: "close" });
    else if (m[1] !== undefined) out.push({ t: "open", cls: m[1], raw: m[0] });
    else out.push({ t: "text", s: m[0] });
  }
  if (last !== html.length) throw new Error(`unparsed tail: ${html.slice(last)}`);
  return out;
}

const textOf = (html: string): string => tokenize(html).map((x) => (x.t === "text" ? x.s : "")).join("");

function isBalanced(html: string): boolean {
  let depth = 0;
  for (const x of tokenize(html)) {
    if (x.t === "open") depth++;
    else if (x.t === "close" && --depth < 0) return false;
  }
  return depth === 0;
}

// For every non-newline character of the raw text: the stack of classes it sits in.
function charClasses(html: string): string[] {
  const stack: string[] = [];
  const out: string[] = [];
  for (const x of tokenize(html)) {
    if (x.t === "open") stack.push(x.cls);
    else if (x.t === "close") stack.pop();
    else for (const ch of x.s) if (ch !== "\n") out.push(`${stack.join(">")}::${ch}`);
  }
  return out;
}

// ---- fixtures --------------------------------------------------------------------------------------------------------------

const C_COMMENT = '<span class="hljs-type">int</span> a;\n<span class="hljs-comment">/* x\n y\n z */</span>\n<span class="hljs-type">int</span> b;';
const C_SOURCE = "int a;\n/* x\n y\n z */\nint b;";

const JS_TEMPLATE =
  '<span class="hljs-keyword">const</span> s = <span class="hljs-string">`a\nb &lt;i&gt;\nc`</span>;\n<span class="hljs-built_in">console</span>.log(s);';
const PY_TRIPLE = 'x = <span class="hljs-string">&quot;&quot;&quot;a\nb\nc&quot;&quot;&quot;</span>\n<span class="hljs-built_in">print</span>(x)';
const RUST_NESTED =
  '<span class="hljs-comment">/* outer <span class="hljs-comment">/* inner\nstill inner */</span>\nstill outer */</span>\n<span class="hljs-keyword">fn</span> <span class="hljs-title function_">main</span>() {}';
const TWO_LEVELS = '<span class="a">p<span class="b">q\nr</span>s\nt</span>u\nv';
const PLAIN = "line one\nline two\n\nline four";
const ENTITIES = "a &amp;&amp; b\n&lt;script&gt;alert(&#x27;x&#x27;)&lt;/script&gt;\n&quot;q&quot;";
const TRAILING_NEWLINE = '<span class="hljs-comment">// c</span>\n';
const EMPTY_LINES = '<span class="hljs-comment">/*\n\n*/</span>\nx';

const FIXTURES: Record<string, string> = {
  "C multi-line comment (AC-525 i)": C_COMMENT,
  "JS template literal (AC-525 ii)": JS_TEMPLATE,
  "Python triple quotes (AC-525 iii)": PY_TRIPLE,
  "Rust nested comment (AC-525 iv)": RUST_NESTED,
  "two nested levels across lines": TWO_LEVELS,
  "plain text without tags": PLAIN,
  "escaped entities": ENTITIES,
  "trailing newline": TRAILING_NEWLINE,
  "empty lines inside a token": EMPTY_LINES,
};

const linesOf = (html: string): string[] => textOf(html).split("\n");

describe("the three properties of SPEC-0200-0001 §3.14.7 hold for every fixture and every chunk size", () => {
  for (const [name, html] of Object.entries(FIXTURES)) {
    for (const n of [1, 2, 3, 2000]) {
      describe(`${name}, linesPerChunk = ${n}`, () => {
        const chunks = splitBalanced(html, n);

        it("(a) every chunk is balanced on its own (no element is left open across a chunk boundary)", () => {
          for (const c of chunks) expect(isBalanced(c), JSON.stringify(c)).toBe(true);
        });

        it("(b) the concatenated text equals the original text (nothing lost, nothing added)", () => {
          expect(textOf(chunks.join(""))).toBe(textOf(html));
        });

        it("(c) every character keeps the SAME class stack as in the whole-file result (the colours are identical)", () => {
          expect(charClasses(chunks.join(""))).toEqual(charClasses(html));
        });

        it("the number of chunks is ceil(lines / n)", () => {
          expect(chunks.length).toBe(Math.ceil(linesOf(html).length / n));
        });

        it("every chunk except the last ends with the newline of its last line", () => {
          for (const c of chunks.slice(0, -1)) expect(textOf(c).endsWith("\n"), JSON.stringify(c)).toBe(true);
        });
      });
    }
  }
});

describe("AC-525, one line per chunk (SHOULD-203: splitBalanced(html, 1))", () => {
  it("(i) C: five chunks; each chunk's text is its source line; lines 2-4 are wholly inside the comment, `int b;` is not", () => {
    const chunks = splitBalanced(C_COMMENT, 1);
    expect(chunks.length).toBe(5);
    C_SOURCE.split("\n").forEach((line, i) => {
      expect(textOf(chunks[i]).replace(/\n$/, "")).toBe(line);
    });
    for (const i of [1, 2, 3]) {
      // every character of the line is in an hljs-comment element
      const classes = charClasses(chunks[i]);
      expect(classes.length).toBeGreaterThan(0);
      for (const c of classes) expect(c.startsWith("hljs-comment::"), `${i}: ${c}`).toBe(true);
    }
    expect(chunks[0]).not.toContain("hljs-comment");
    expect(chunks[4]).not.toContain("hljs-comment");
    expect(chunks[4]).toContain("hljs-type");
  });

  it("(i) the continuation lines re-open the comment: chunks 2, 3 and 4 start with <span class=\"hljs-comment\">", () => {
    const chunks = splitBalanced(C_COMMENT, 1);
    expect(chunks[2].startsWith('<span class="hljs-comment">')).toBe(true);
    expect(chunks[3].startsWith('<span class="hljs-comment">')).toBe(true);
  });

  it("(ii) JavaScript template literal: all three lines of the literal are string-coloured, the `;` after it and the next line are not part of it", () => {
    const chunks = splitBalanced(JS_TEMPLATE, 1);
    expect(chunks.length).toBe(4);
    expect(textOf(chunks[1])).toBe("b &lt;i&gt;\n");
    for (const c of charClasses(chunks[1])) expect(c.startsWith("hljs-string::")).toBe(true);
    expect(charClasses(chunks[3]).every((c) => !c.includes("hljs-string"))).toBe(true);
  });

  it("(iii) Python triple-quoted string: the middle line `b` is a string, the `print` line is not", () => {
    const chunks = splitBalanced(PY_TRIPLE, 1);
    expect(chunks.length).toBe(4);
    expect(charClasses(chunks[1])[0]).toBe("hljs-string::b");
    expect(charClasses(chunks[3]).every((c) => !c.includes("hljs-string"))).toBe(true);
  });

  it("(iv) Rust nested comment: the inner and outer comment classes are both restored on each continuation line, outermost first", () => {
    const chunks = splitBalanced(RUST_NESTED, 1);
    expect(chunks.length).toBe(4);
    // line 2 "still inner */" is inside inner (which is inside outer)
    expect(charClasses(chunks[1])[0]).toBe("hljs-comment>hljs-comment::s");
    expect(chunks[1].startsWith('<span class="hljs-comment"><span class="hljs-comment">')).toBe(true);
    // line 3 "still outer */" is inside outer only
    expect(charClasses(chunks[2])[0]).toBe("hljs-comment::s");
    // line 4 is code
    expect(chunks[3]).toContain("hljs-keyword");
    expect(chunks[3]).toContain('class="hljs-title function_"');
  });

  it("nested tags are re-opened in the original order (outer first) with their class strings unchanged", () => {
    const chunks = splitBalanced(TWO_LEVELS, 1);
    expect(chunks.length).toBe(4);
    expect(chunks[1].startsWith('<span class="a"><span class="b">')).toBe(true);
    expect(chunks[2].startsWith('<span class="a">')).toBe(true);
    expect(chunks[2].startsWith('<span class="a"><span class="b">')).toBe(false); // b was closed at "r"
  });
});

describe("edge cases", () => {
  it("a chunk size >= the line count returns ONE chunk equal to the input", () => {
    for (const html of Object.values(FIXTURES)) expect(splitBalanced(html, 100000)).toEqual([html]);
  });

  it("the empty string gives a single empty chunk", () => {
    expect(splitBalanced("", 1)).toEqual([""]);
    expect(splitBalanced("", 2000)).toEqual([""]);
  });

  it("plain text splits on newlines only: 'a\\nb' with 1 line per chunk -> ['a\\n', 'b'] (the newline stays at the end of its chunk)", () => {
    expect(splitBalanced("a\nb", 1)).toEqual(["a\n", "b"]);
    expect(splitBalanced("a\nb\nc", 2)).toEqual(["a\nb\n", "c"]);
  });

  it("a final newline produces a last EMPTY chunk (R-463-1: the empty last line exists)", () => {
    const chunks = splitBalanced("a\n", 1);
    expect(chunks.length).toBe(2);
    expect(chunks[1]).toBe("");
  });

  it("entities are passed through untouched (never decoded or double-escaped)", () => {
    const chunks = splitBalanced(ENTITIES, 1).join("");
    expect(chunks).toContain("&lt;script&gt;");
    expect(chunks).toContain("&#x27;");
    expect(chunks).not.toContain("<script");
    expect(chunks).not.toContain("&amp;amp;");
  });

  it("a very large input is handled in one pass (120,000 lines, 2,000 per chunk -> 60 chunks)", () => {
    const html = Array.from({ length: 120000 }, (_, i) => `<span class="hljs-number">${i}</span>`).join("\n");
    const chunks = splitBalanced(html, 2000);
    expect(chunks.length).toBe(60);
    expect(chunks.every(isBalanced)).toBe(true);
  });
});
