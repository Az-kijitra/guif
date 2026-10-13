import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0015 第8版 R-466-4 (the file content is never interpreted as HTML; `<script>` in the file is shown as text),
//   R-466-9 (a rejected result is silent: the body stays uncoloured), R-434, AC-526.
// Architecture: SPEC-0200-0001 §3.14.7 "XSS" (defence in depth: a chunk with any `<` outside the allowed shapes is discarded) and
//   §3.14.12-13 (the ACCEPTED GRAMMAR, fixed here):
//     - elements: `<span class="...">` and `</span>` only;
//     - `class` value: one or more whitespace-separated tokens, each `[A-Za-z0-9_-]+` (so `hljs-title class_`,
//       `hljs-title function_` -- the trailing `_` -- and the embedded-language `language-xml` pass);
//     - the only attribute is `class`;
//     - text: no bare `<` or `>`, and `&` only as one of `&amp; &lt; &gt; &quot; &#x27;`.
//   §3.14.12-3 (the only place that puts coloured HTML into the DOM runs every chunk through this function).
//
//
// Contract assumed (reported to the implementer):
//   isSafeHighlightHtml(chunk: string): boolean       // pure; never throws; true = may be handed to the DOM as is
//   (tag balance is NOT part of this function's duty: splitBalanced guarantees it)
//
// Module under test (not yet implemented): ./safe-html.ts

import { isSafeHighlightHtml } from "./safe-html";

describe("accepted (true)", () => {
  it.each([
    ["", "an empty chunk"],
    ["plain text", "text without markup"],
    ["line one\nline two\n", "newlines and no markup"],
    ['<span class="hljs-keyword">fn</span> main()', "a simple highlight span"],
    ['<span class="hljs-comment">/* a\n b */</span>', "a multi-line token"],
    ['<span class="hljs-title class_">Foo</span>', "a compound class with a trailing underscore (class_)"],
    ['<span class="hljs-title function_">main</span>', "function_"],
    ['<span class="hljs-title class_ inherited__">X</span>', "inherited__ (double underscore)"],
    ['<span class="language-xml">x</span>', "an embedded-language class (language-xml)"],
    ['<span class="hljs-built_in">Vec</span>', "an underscore inside a token (built_in)"],
    ['<span class="hljs-meta"><span class="hljs-keyword">#include</span></span>', "nested spans"],
    ["a &amp; b &lt; c &gt; d &quot;e&quot; &#x27;f&#x27;", "the five escapes highlight.js emits"],
    ['<span class="hljs-string">&quot;&lt;script&gt;&quot;</span>', "a script tag that was escaped by highlight.js stays text"],
    ["1 + 2 = 3", "operators that are not markup"],
    ["日本語のテキスト\n全角 ＜＞", "non-ASCII text (full-width brackets are not `<` `>`)"],
    ['</span><span class="hljs-comment">x', "an unbalanced chunk is NOT this function's concern (re-opened tags of a continuation chunk)"],
  ] as const)("%j (%s)", (chunk, _why) => {
    expect(isSafeHighlightHtml(chunk)).toBe(true);
  });
});

describe("rejected (false): anything outside the grammar", () => {
  it.each([
    ["<script>alert(1)</script>", "a script element"],
    ['<img src=x onerror="window.__y=1">', "an img with an event handler"],
    ['<span onclick="alert(1)">x</span>', "span with an event-handler attribute only"],
    ['<span class="hljs-keyword" onclick="alert(1)">x</span>', "span with class plus another attribute"],
    ['<span class="hljs-keyword" id="x">x</span>', "span with class plus id"],
    ['<span id="x">x</span>', "span without class"],
    ["<span>x</span>", "span with no attribute at all"],
    ['<span class="">x</span>', "an empty class value (at least one token is required)"],
    ['<span class=" ">x</span>', "a blank class value"],
    ['<span class="a b!">x</span>', "a class token with a character outside [A-Za-z0-9_-]"],
    ['<span class="a;b">x</span>', "a semicolon in a class token"],
    ['<span class="a&quot;b">x</span>', "an entity inside the attribute value"],
    ['<span class="hljs-keyword"><b>x</b></span>', "a <b> element"],
    ['<a href="javascript:alert(1)">x</a>', "an anchor"],
    ['<span class="x">x</span ><script>', "script after a span"],
    ['<span class="x">x</span x="y">', "attributes on a closing tag"],
    ["</script>", "a closing script"],
    ["<!-- c -->", "a comment"],
    ["<![CDATA[x]]>", "CDATA"],
    ["<?php ?>", "a processing instruction"],
    ["a < b", "a bare less-than in text"],
    ["a > b", "a bare greater-than in text"],
    ["a<b", "a bare less-than glued to text"],
    ["<", "a lone <"],
    [">", "a lone >"],
    ["a & b", "a bare ampersand"],
    ["&nbsp;", "a named entity outside the list"],
    ["&copy;", "another named entity"],
    ["&#60;", "a numeric entity (decimal) -- not in the list"],
    ["&#x3c;", "a numeric entity (hex, lower) -- not in the list"],
    ["&lt", "an entity without the semicolon"],
    ["&amp", "an entity without the semicolon"],
    ['<SPAN class="x">x</SPAN>', "upper-case element names are not emitted by highlight.js"],
    ['<span class="x"/>', "a self-closing span"],
    ["<span class=\"x\">x</span><iframe src=\"//evil\"></iframe>", "an iframe after valid markup"],
  ] as const)("%j (%s)", (chunk, _why) => {
    expect(isSafeHighlightHtml(chunk)).toBe(false);
  });
});

describe("a single bad construct poisons the whole chunk (all-or-nothing)", () => {
  it("valid markup followed by one script tag is rejected as a whole", () => {
    const good = '<span class="hljs-keyword">fn</span> main() {}\n';
    expect(isSafeHighlightHtml(good)).toBe(true);
    expect(isSafeHighlightHtml(good + "<script>x</script>")).toBe(false);
    expect(isSafeHighlightHtml("<script>x</script>" + good)).toBe(false);
  });

  it("a very long valid chunk (2,000 lines) is accepted and a bad tag at the very end is still found", () => {
    const line = '<span class="hljs-number">123</span> &amp; <span class="hljs-string">&quot;x&quot;</span>\n';
    const big = line.repeat(2000);
    expect(isSafeHighlightHtml(big)).toBe(true);
    expect(isSafeHighlightHtml(big + "<img>")).toBe(false);
  });

  it("never throws, whatever the input", () => {
    for (const s of ["<<<<", "&&&&", '<span class="', '<span class="a', "</", "<span", "‮<span class=\"x\">"]) {
      expect(() => isSafeHighlightHtml(s)).not.toThrow();
    }
  });

  it("incomplete markup is rejected: an unterminated tag cannot be smuggled through", () => {
    expect(isSafeHighlightHtml('<span class="a')).toBe(false);
    expect(isSafeHighlightHtml("<span")).toBe(false);
    expect(isSafeHighlightHtml("</spa")).toBe(false);
  });
});
