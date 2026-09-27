import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0015 R-472, R-473, R-474, R-475, R-476. AC-475, AC-476,
//   AC-478.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.5.6
//   (`markdown-it@^15`, `html:false`; links/images are neutralized via
//   RENDERER RULE OVERRIDES -- `link_open`/`link_close` -> `span`,
//   `image` -> alt text -- not post-hoc regex/HTML scrubbing, so this stays
//   a DOM-free pure-function test), §3.5.7 (`features/viewer/markdown-render.ts`).
// Module under test (not yet implemented): ./markdown-render.ts
//
// Contract assumed (documented in the handback report):
//   renderMarkdown(source: string): string   // sanitized HTML string

import { renderMarkdown } from "./markdown-render";

describe("renderMarkdown (SPEC-0300-0015 §9)", () => {
  it("R-472: raw HTML in the source is escaped, never interpreted (html:false)", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("AC-475: an inline event-handler payload is neutralized the same way", () => {
    const html = renderMarkdown("<img src=x onerror=alert(1)>");
    expect(html).not.toMatch(/<img[^>]*onerror/i);
  });

  it("R-473: a Markdown link never becomes a clickable <a href>", () => {
    const html = renderMarkdown("[click me](https://example.com)");
    expect(html).not.toMatch(/<a\s/i);
    expect(html).toContain("click me");
  });

  it("R-473: a Markdown image is replaced by its alt text and never fetched", () => {
    const html = renderMarkdown("![a broken cat photo](https://example.com/cat.png)");
    expect(html).not.toMatch(/<img\s/i);
    expect(html).toContain("a broken cat photo");
  });

  it("R-474: a fenced code block renders as plain <pre><code>, with no syntax-highlight classes", () => {
    const html = renderMarkdown("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).not.toMatch(/class="[^"]*hljs/i);
    expect(html).not.toMatch(/class="[^"]*language-/i);
  });

  it("ordinary Markdown (headings, emphasis, lists) still renders normally", () => {
    const html = renderMarkdown("# Title\n\n**bold** and *em*\n\n- one\n- two");
    expect(html).toContain("<h1");
    expect(html).toMatch(/<strong>bold<\/strong>/);
    expect(html).toContain("<li>one</li>");
  });

  it("plain text with no Markdown syntax round-trips as a paragraph", () => {
    const html = renderMarkdown("just plain text");
    expect(html).toContain("just plain text");
  });
});
