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
}

// R-33/R-33-1: normalize a binding string's modifier order to
// Ctrl -> Alt -> Shift -> Meta, followed by the key itself. A single-
// alphabet-character key body is also uppercased here so that the
// binding-string side matches the same case-insensitive normalization
// `eventKeyToken` already applies to the event side (R-33-2: this affects
// only the key body's letter case, never the Shift modifier itself).
export function normalizeKeyString(binding: string): string {
  const parts = binding.split("+");
  const rawKey = parts[parts.length - 1];
  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  const presentModifiers = new Set(parts.slice(0, -1));

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

function eventKeyToken(key: string): string {
  if (key === " ") {
    return "Space";
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

// R-33/R-34: match a keydown event against a resolved list of bindings,
// including the Shift-only rescue match (a Shift-only event also matches a
// binding string with no modifiers, i.e. the "Shift+" prefix stripped).
export function matchesAction(event: KeydownLikeEvent, bindings: readonly string[]): boolean {
  const normalizedBindings = bindings.map(normalizeKeyString);
  const eventString = eventToNormalizedString(event);

  if (normalizedBindings.includes(eventString)) {
    return true;
  }

  const shiftOnly = event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey;
  if (shiftOnly) {
    const keyOnly = eventKeyToken(event.key);
    if (normalizedBindings.includes(keyOnly)) {
      return true;
    }
  }

  return false;
}
