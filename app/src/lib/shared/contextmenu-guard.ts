// SPEC-0300-0018 R-1010~R-1013 / SPEC-0200-0001 §3.9.9.
// One global `contextmenu` guard: the WebView's native menu is suppressed
// everywhere except in text input fields.

export interface ElementLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password", "number"]);

export function isEditableTarget(target: ElementLike | null): boolean {
  if (target === null) return false;
  if (target.isContentEditable === true) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  const type = (target.type ?? "text").toLowerCase();
  return TEXT_INPUT_TYPES.has(type);
}

export function attachContextMenuGuard(doc: {
  addEventListener: Document["addEventListener"];
  removeEventListener: Document["removeEventListener"];
}): () => void {
  const handler = (event: Event): void => {
    if (!isEditableTarget(event.target as ElementLike | null)) event.preventDefault();
  };
  doc.addEventListener("contextmenu", handler, true);
  return () => doc.removeEventListener("contextmenu", handler, true);
}
