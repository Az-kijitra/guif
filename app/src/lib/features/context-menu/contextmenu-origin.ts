// SPEC-0300-0018 R-1002 / SPEC-0200-0001 §3.9.9, §3.9.17.1 (MUST-113/114).
// Real right click: pointerdown(button 2) precedes `contextmenu` (verified on WebView2, G-9).
// Keyboard (Shift+F10 / ContextMenu key) and synthetic dispatchEvent have no such pointerdown.

export function createContextMenuOriginTracker(): {
  onPointerDown(e: { button: number }): void;
  onKeyDown(e: { key: string; shiftKey: boolean; repeat?: boolean }): void;
  consume(): "pointer" | "keyboard";
} {
  let rightDown = false;
  return {
    onPointerDown(e) {
      rightDown = e.button === 2;
    },
    onKeyDown(e) {
      if (e.repeat === true) return;
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) rightDown = false;
    },
    consume() {
      const origin = rightDown ? "pointer" : "keyboard";
      rightDown = false;
      return origin;
    },
  };
}
