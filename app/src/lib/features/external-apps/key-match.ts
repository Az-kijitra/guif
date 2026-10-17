// SPEC-0300-0021 R-1550 / SPEC-0200-0001 §3.16.6: which registration does a key press belong to? The matching rule is the keymap's own
// (R-33 normalisation, R-34 rescue, comma lists) and is INJECTED (`matches` = `matchesAction`), so this feature imports no other feature.
// The key repeat (R-1549) is the wiring's business: a repeating keydown still names its registration here.

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  keyCode?: number;
  repeat?: boolean;
}

export type KeyMatcher<E extends KeyEventLike> = (event: E, bindings: readonly string[]) => boolean;

const IME_PROCESS_KEY_CODE = 229;

// The `index` of the first registration (config order) whose usable keys match, else null. A registration without keys is never
// offered to the matcher. An IME composition never matches.
export function matchExternalAppKey<E extends KeyEventLike>(
  event: E,
  entries: readonly { index: number; keys: readonly string[] }[],
  matches: KeyMatcher<E>,
): number | null {
  if (event.isComposing === true || event.keyCode === IME_PROCESS_KEY_CODE) return null;
  for (const entry of entries) {
    if (entry.keys.length > 0 && matches(event, entry.keys)) return entry.index;
  }
  return null;
}
