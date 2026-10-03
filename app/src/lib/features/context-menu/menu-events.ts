// SPEC-0300-0018 R-1011, R-1088 (G-5), R-1101, R-1002, R-1089 (1) /
// SPEC-0200-0001 §3.9.17.4. Pure, DOM-free.

export type ContextMenuDecision = "ignore" | "close" | "open-row" | "open-blank";

export function decideContextMenuEvent(i: {
  editable: boolean;
  menuOpen: boolean;
  origin: "pointer" | "keyboard";
  insideMenu: boolean;
  overlayOpen: boolean;
  target: { kind: "row" | "blank" | "none" };
}): ContextMenuDecision {
  if (i.editable) return "ignore";
  if (i.menuOpen) return i.origin === "pointer" && !i.insideMenu ? "close" : "ignore";
  if (i.origin === "keyboard" || i.overlayOpen) return "ignore";
  if (i.target.kind === "row") return "open-row";
  if (i.target.kind === "blank") return "open-blank";
  return "ignore";
}

export function decideMenuWheel(i: { insideMenu: boolean; scrollable: boolean }): "allow" | "prevent" {
  return i.insideMenu && i.scrollable ? "allow" : "prevent";
}
