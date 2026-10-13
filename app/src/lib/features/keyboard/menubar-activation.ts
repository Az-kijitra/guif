// SPEC-0300-0010 第16版 R-14-5-1 / §3.1 #13, SPEC-0300-0020 R-1350 1 / 3. Pure.
// Which keydown activates the menu bar: F10 (no modifier) or Alt + F/E/V/G (Alt only). IME composition never does.
// Alt-alone (keyup) is on hold and is not part of this predicate.

import type { KeydownLikeEvent } from "./keymap-resolve";

export type MenuBarActivationKind = "f10" | "access";

const ACCESS_KEYS = new Set(["f", "e", "v", "g"]);

export function matchesMenuBarActivation(event: KeydownLikeEvent): MenuBarActivationKind | null {
  if (event.isComposing === true || event.keyCode === 229) return null;
  if (event.ctrlKey || event.metaKey) return null;
  if (event.key === "F10") return !event.altKey && !event.shiftKey ? "f10" : null;
  if (event.altKey && !event.shiftKey && ACCESS_KEYS.has(event.key.toLowerCase())) return "access";
  return null;
}
