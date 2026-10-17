// SPEC-0300-0021 R-1551 / SPEC-0200-0001 §3.16.6, §3.16.15 SHOULD-218: the rules for the key of a registration, injected into
// `features/external-apps/registry.ts` by `routes/` (a feature may not import another feature).
//   isValidKey: the grammar of ONE comma element (`isValidBindingElement`: no new grammar).
//   collides:   a fixed key (judged by passing a synthesised event through the real predicates; the four keys without a predicate come from
//               the list), or a key that matches ANY action's CURRENT binding (the defaults with `input_keymap_custom` applied, the R-34 rescue
//               match included) -- `resolveActionForKey` is the one matcher.

import { FIXED_KEYS_WITHOUT_PREDICATE } from "./fixed-keys";
import { matchesHardcodedShortcut, resolveActionForKey } from "./key-dispatch";
import { isValidBindingElement } from "./keymap-validate";
import { keyStringToEvent, normalizeKeyString } from "./keymap-resolve";
import { matchesMenuBarActivation } from "./menubar-activation";

export function keyRules(customOverrides: Record<string, string>): {
  isValidKey(element: string): boolean;
  collides(element: string): boolean;
} {
  return {
    isValidKey: isValidBindingElement,
    collides(element: string): boolean {
      if (FIXED_KEYS_WITHOUT_PREDICATE.includes(normalizeKeyString(element))) return true;
      const event = keyStringToEvent(element);
      if (matchesHardcodedShortcut(event) !== null || matchesMenuBarActivation(event) !== null) return true;
      return resolveActionForKey(event, customOverrides) !== null;
    },
  };
}
