// SPEC-0300-0010 §5 (R-30~R-34): keymap resolution — combining custom
// overrides with profile defaults, normalizing key-binding strings, and
// matching a keydown event against a resolved list of bindings.

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"] as const;
type ModifierName = (typeof MODIFIER_ORDER)[number];

export interface KeydownLikeEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

// R-33: normalize a binding string's modifier order to Ctrl -> Alt -> Shift
// -> Meta, followed by the key itself.
export function normalizeKeyString(binding: string): string {
  const parts = binding.split("+");
  const key = parts[parts.length - 1];
  const presentModifiers = new Set(parts.slice(0, -1));

  const orderedModifiers = MODIFIER_ORDER.filter((mod: ModifierName) => presentModifiers.has(mod));
  return [...orderedModifiers, key].join("+");
}

export interface ResolveBindingInput {
  profile: "windows" | "vim";
  customOverrides: Record<string, string>;
  actionId: string;
  profileDefault: string;
}

// R-30/R-31/R-32: a custom override (if present) replaces the profile
// default entirely. An empty-string override disables the action (no
// bindings). Multiple bindings may be comma-separated.
export function resolveBinding(input: ResolveBindingInput): string[] {
  const raw =
    input.actionId in input.customOverrides ? input.customOverrides[input.actionId] : input.profileDefault;

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
