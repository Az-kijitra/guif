// SPEC-0300-0015 R-500-8 (AC-520 page side), SPEC-0200-0001 §3.14.3: the viewer body takes the keyboard focus by itself,
// so the keys work right after the window opens without a click. The Rust side hands the focus to the webview
// (viewer/window.rs); this side puts it on the body element (tabindex="-1": focusable, not a tab stop).

import { getCurrentWindow } from "@tauri-apps/api/window";

// Focus the body unless a header button already has it (a click on a button must not be undone).
export function focusBody(body: HTMLElement | undefined): void {
  if (body === undefined) return;
  const active = document.activeElement;
  if (active instanceof HTMLButtonElement) return;
  body.focus({ preventScroll: true });
}

// On mount, on the window's `focus` event and on Tauri's onFocusChanged (focus gained). Returns the disposer.
export function installBodyFocus(getBody: () => HTMLElement | undefined): () => void {
  const refocus = (): void => focusBody(getBody());
  refocus();
  window.addEventListener("focus", refocus);
  let unlisten: (() => void) | undefined;
  let disposed = false;
  try {
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) refocus();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // Not running inside Tauri (plain browser dev): the window `focus` event is enough.
      });
  } catch {
    // Same: getCurrentWindow() throws outside Tauri.
  }
  return () => {
    disposed = true;
    window.removeEventListener("focus", refocus);
    unlisten?.();
  };
}
