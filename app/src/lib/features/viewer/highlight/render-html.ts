// SPEC-0300-0015 R-466-4, SPEC-0200-0001 §3.14.12-3 (MUST-131): the ONLY door through which coloured markup enters the
// viewer's DOM. Every chunk is checked by isSafeHighlightHtml first; the markup is parsed on an inert <template> and the
// <pre>'s children are swapped in one go.

import { isSafeHighlightHtml } from "./safe-html";

// Returns false (and leaves the <pre> untouched) when any chunk is outside the accepted grammar: all or nothing.
export function applyHighlightedChunks(preEl: HTMLElement, chunks: readonly string[]): boolean {
  for (const chunk of chunks) {
    if (!isSafeHighlightHtml(chunk)) return false;
  }
  const template = document.createElement("template");
  template.innerHTML = chunks.join("");
  preEl.replaceChildren(template.content);
  return true;
}
