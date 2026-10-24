// SPEC-0300-0010 §5 (R-30~R-34): keymap resolution — combining custom
// overrides with the default keymap, normalizing key-binding strings, and
// matching a keydown event against a resolved list of bindings.

import { validateCustomOverride } from "./keymap-validate";

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;
type ModifierName = (typeof MODIFIER_ORDER)[number];

export interface KeydownLikeEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  // SPEC-0200-0001 §3.7.10.3(c): legacy IME marker (229) used by R-764.
  keyCode?: number;
  // SPEC-0300-0021 R-1549 / SPEC-0200-0001 §3.16.6: true for an auto-repeat keydown (filled by main-keydown-wiring).
  repeat?: boolean;
}

// SPEC-0200-0001 §3.6.11.3 (MUST-86 (ii)/(iii), 発注者決定 2026-09-27): known
// multi-character key names, canonicalized case-insensitively. "Plus"/"Comma"
// are the WORD-form representations of the `+`/`,` key bodies (a bare `+`/`,`
// character is no longer a valid key-body spelling).
const KNOWN_MULTI_CHAR_KEY_BODIES = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Escape",
  "Delete",
  "Backspace",
  "Tab",
  "Space",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Comma",
  "Plus",
  "Minus",
  "Dot",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
] as const;

const KNOWN_MULTI_CHAR_KEY_BODY_BY_LOWER = new Map(
  KNOWN_MULTI_CHAR_KEY_BODIES.map((name) => [name.toLowerCase(), name] as const),
);

// MUST-86 (iii): canonicalizes a KNOWN multi-character key name case-
// insensitively to its documented capitalization; a single-character key
// body is uppercased (unchanged from before); an UNKNOWN multi-character
// string passes through unchanged (forward-compatibility -- "interpretable"
// is not the same predicate as "known", see `isKnownKeyBody` below).
export function canonicalizeKeyBody(raw: string): string {
  if (raw === "-") return "Minus";
  if (raw === ".") return "Dot";
  if (raw.length === 1) return raw.toUpperCase();
  const known = KNOWN_MULTI_CHAR_KEY_BODY_BY_LOWER.get(raw.toLowerCase());
  return known ?? raw;
}

// SHOULD-128: the single-source predicate for "is this a key body that the
// matcher can ever actually match" -- used by `keymap-validate.ts` to reject
// an unknown key name (AC-62-1 (i)). Deliberately distinct from
// `canonicalizeKeyBody`, which must pass unknown multi-character strings
// through unchanged (by design) and therefore cannot double as this check.
export function isKnownKeyBody(raw: string): boolean {
  // A bare "+"/"," is never a known key body (MUST-86 (ii): must be written
  // as the word form "Plus"/"Comma").
  if (raw === "+" || raw === ",") return false;
  if (raw.length === 1) return true;
  return KNOWN_MULTI_CHAR_KEY_BODY_BY_LOWER.has(raw.toLowerCase());
}

const MODIFIER_BY_LOWER = new Map(MODIFIER_ORDER.map((mod) => [mod.toLowerCase(), mod] as const));

// MUST-86 (i): case-insensitive modifier-name canonicalization (a lowercase
// `config.toml` entry like "ctrl+a" no longer has its modifier silently
// dropped).
export function canonicalizeModifier(raw: string): ModifierName | null {
  return MODIFIER_BY_LOWER.get(raw.toLowerCase()) ?? null;
}

// R-33/R-33-1: normalize a binding string's modifier order to
// Ctrl -> Alt -> Shift -> Meta, followed by the key itself. The key body is
// also canonicalized here (case-insensitively) so that the binding-string
// side matches the same normalization `eventKeyToken` already applies to the
// event side (R-33-2: this affects only the key body, never the Shift
// modifier itself).
export function normalizeKeyString(binding: string): string {
  const parts = binding.split("+");
  const key = canonicalizeKeyBody(parts[parts.length - 1]);
  const presentModifiers = new Set(
    parts
      .slice(0, -1)
      .map(canonicalizeModifier)
      .filter((m): m is ModifierName => m !== null),
  );

  const orderedModifiers = MODIFIER_ORDER.filter((mod: ModifierName) => presentModifiers.has(mod));
  return [...orderedModifiers, key].join("+");
}

export interface ResolveBindingInput {
  customOverrides: Record<string, string>;
  actionId: string;
  defaultBinding: string;
}

// R-30/R-31/R-32: a custom override (if present) replaces the default
// binding entirely. An empty-string override disables the action (no
// bindings). Multiple bindings may be comma-separated.
//
// R-18-2/R-56-4-2-1: before a custom override is accepted, each of its
// comma-separated bindings is validated via `validateCustomOverride` (this
// currently only restricts Shift on the `delete` action). Any invalid
// binding causes the whole override to be discarded in favor of the
// default binding, rather than silently dropping just that one binding.
export function resolveBinding(input: ResolveBindingInput): string[] {
  let raw = input.defaultBinding;
  if (input.actionId in input.customOverrides) {
    const candidate = input.customOverrides[input.actionId];
    const bindings = candidate === "" ? [] : candidate.split(",").map((s) => s.trim());
    const allValid = bindings.every((binding) => validateCustomOverride(input.actionId, binding) !== null);
    raw = allValid ? candidate : input.defaultBinding;
  }

  if (raw === "") {
    return [];
  }
  return raw.split(",").map((s) => s.trim());
}

// MUST-86 (ii): "+"/","  themselves map to the canonical word-form key
// bodies "Plus"/"Comma" (the same position as the existing " " -> "Space"
// mapping).
function eventKeyToken(key: string): string {
  if (key === " ") {
    return "Space";
  }
  if (key === "+") {
    return "Plus";
  }
  if (key === ",") {
    return "Comma";
  }
  if (key === "-") {
    return "Minus";
  }
  if (key === ".") {
    return "Dot";
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

function eventModifiers(event: KeydownLikeEvent): ModifierName[] {
  const mods: ModifierName[] = [];
  if (event.ctrlKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  if (event.metaKey) mods.push("Meta");
  return mods;
}

function eventToNormalizedString(event: KeydownLikeEvent): string {
  return [...eventModifiers(event), eventKeyToken(event.key)].join("+");
}

export function matchesActionExact(event: KeydownLikeEvent, bindings: readonly string[]): boolean {
  const normalizedBindings = bindings.map(normalizeKeyString);
  const eventString = eventToNormalizedString(event);
  return normalizedBindings.includes(eventString);
}

// R-33/R-34: match a keydown event against a resolved list of bindings,
// including the Shift-only rescue match (a Shift-only event also matches a
// binding string with no modifiers, i.e. the "Shift+" prefix stripped).
export function matchesAction(event: KeydownLikeEvent, bindings: readonly string[]): boolean {
  if (matchesActionExact(event, bindings)) {
    return true;
  }

  const shiftOnly = event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
  if (shiftOnly) {
    const normalizedBindings = bindings.map(normalizeKeyString);
    const keyOnly = eventKeyToken(event.key);
    if (normalizedBindings.includes(keyOnly)) {
      return true;
    }
  }

  return false;
}

// SPEC-0300-0021 R-1551 2 / SPEC-0200-0001 §3.16.15 SHOULD-218: the inverse of `eventToNormalizedString` for ONE key string of the keymap
// grammar (a comma element). It lets a registration key be judged by the real matcher (`matchesAction`) instead of a copy of it.
// The modifiers and the key body are read the same way `normalizeKeyString` reads them; the word forms Comma / Plus / Space become the characters.
export function keyStringToEvent(key: string): KeydownLikeEvent {
  const parts = normalizeKeyString(key).split("+");
  const body = parts[parts.length - 1];
  const modifiers = new Set(parts.slice(0, -1));
  const shiftKey = modifiers.has("Shift");
  const named: Record<string, string> = { Comma: ",", Plus: "+", Space: " ", Minus: "-", Dot: "." };
  let eventKey = named[body] ?? body;
  if (eventKey.length === 1) eventKey = shiftKey ? eventKey.toUpperCase() : eventKey.toLowerCase();
  return { key: eventKey, ctrlKey: modifiers.has("Ctrl"), altKey: modifiers.has("Alt"), shiftKey, metaKey: modifiers.has("Meta") };
}
