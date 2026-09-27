// SPEC-0300-0015 R-472, R-473, R-474, R-475, R-476 (SPEC-0200-0001 §3.5.6):
// `markdown-it@^15` with `html: false` (R-472) and renderer RULE OVERRIDES
// (not post-hoc regex/HTML scrubbing) that neutralize links/images (R-473)
// and strip syntax-highlight classes from code blocks (R-474). Pure, DOM-free.

import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";

const md = new MarkdownIt({
  html: false, // R-472: raw HTML is escaped, never interpreted.
  linkify: false,
  typographer: false,
});

// R-473: a Markdown link never becomes a clickable <a href> (no navigation,
// no external browser); the link text itself is still shown.
md.renderer.rules.link_open = () => "<span>";
md.renderer.rules.link_close = () => "</span>";

// R-473: a Markdown image is never fetched -- render only its alt text.
md.renderer.rules.image = (tokens: Token[], idx: number) => {
  const token = tokens[idx];
  // `token.content` already holds the plain-text rendering of the alt inline
  // tokens (markdown-it fills the "alt" attribute from this same source only
  // at the DEFAULT renderer, which this override replaces).
  return md.utils.escapeHtml(token.content ?? "");
};

// R-474: fenced/indented code blocks render as plain <pre><code>, with no
// syntax-highlight or `language-*` classes (no `highlight` option is
// configured; the default fence renderer's info-string class is dropped
// here on purpose).
const renderCodeBlock = (content: string): string => `<pre><code>${md.utils.escapeHtml(content)}</code></pre>\n`;
md.renderer.rules.fence = (tokens: Token[], idx: number) => renderCodeBlock(tokens[idx].content);
md.renderer.rules.code_block = (tokens: Token[], idx: number) => renderCodeBlock(tokens[idx].content);

// R-470/R-476: sanitized HTML string for the viewer's HTML mode.
export function renderMarkdown(source: string): string {
  return md.render(source);
}
