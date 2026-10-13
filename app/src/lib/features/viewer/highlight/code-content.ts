// SPEC-0200-0001 §3.14.12-3 (b): Svelte action that owns the children of `<pre class="code">`. Svelte never manages
// them: the uncoloured body is set through `textContent` (a text node, never HTML -- R-466-4), and the coloured
// result replaces it through applyHighlightedChunks (the one door for markup). The scroll position of the scrolling
// ancestor is kept across the swap (R-466-6).

import { applyHighlightedChunks } from "./render-html";

export interface CodeContentParams {
  text: string;
  // Accepted chunks from the highlighter for THIS text, or null (uncoloured).
  highlight: readonly string[] | null;
}

export function codeContent(node: HTMLElement, initial: CodeContentParams): { update: (p: CodeContentParams) => void } {
  let shownText: string | null = null;
  let coloured = false;

  function apply(p: CodeContentParams): void {
    const scroller = node.closest<HTMLElement>(".viewer-body");
    const left = scroller?.scrollLeft ?? 0;
    const top = scroller?.scrollTop ?? 0;
    if (p.text !== shownText || (coloured && p.highlight === null)) {
      node.textContent = p.text;
      shownText = p.text;
      coloured = false;
    }
    if (p.highlight !== null && !coloured) {
      coloured = applyHighlightedChunks(node, p.highlight);
    }
    if (scroller) {
      scroller.scrollLeft = left;
      scroller.scrollTop = top;
    }
  }

  apply(initial);
  return { update: apply };
}
