// SPEC-0300-0010 R-18-2 (mirrored in SPEC-0300-0011 R-56-4-2-1): a custom
// override for the `delete` action containing a Shift modifier is invalid
// and must be rejected (falling back to the default binding), because Shift
// is permanently reserved as the "permanent delete" modifier for `delete`.
// This restriction is specific to `delete` — every other action's custom
// override may freely include Shift (SPEC-0300-0010 R-33/R-34).

const SHIFT_RESTRICTED_ACTION_ID = "delete";

// Returns the (unchanged) binding string when it is acceptable for the
// given action, or `null` when it must be rejected (the caller then falls
// back to the default binding).
export function validateCustomOverride(actionId: string, binding: string): string | null {
  if (actionId !== SHIFT_RESTRICTED_ACTION_ID) {
    return binding;
  }

  const modifiers = binding.split("+").slice(0, -1);
  if (modifiers.some((m) => m.toLowerCase() === "shift")) {
    return null;
  }

  return binding;
}

// ---------------------------------------------------------------------
// SPEC-0200-0001 §3.6.11.3 (MUST-86, "recommendation A"): ALL per-element
// keymap validation (known-action-id check, key-string grammar, `delete`+
// Shift rejection) is consolidated into this ONE function so it can never
// drift from the actual matching logic in keymap-resolve.ts.
// ---------------------------------------------------------------------

import { ACTION_IDS } from "./keymap-defaults";
import { canonicalizeModifier, isKnownKeyBody } from "./keymap-resolve";

export interface RawKeymapEntryLike {
  actionId: string;
  value: string | null;
}

export interface ValidatedKeymap {
  effective: Record<string, string>;
  invalidActions: string[];
}

const KNOWN_ACTION_IDS = new Set<string>(ACTION_IDS);

// A single comma-separated element's grammar (R-45-4-1): zero or more
// unique modifiers, each canonicalizable and non-duplicated, followed by a
// known key body. No empty elements.
function isValidBindingElement(element: string): boolean {
  if (element === "") return false;
  const parts = element.split("+");
  const keyBody = parts[parts.length - 1];
  if (keyBody === "" || !isKnownKeyBody(keyBody)) return false;

  const modifierParts = parts.slice(0, -1);
  const seen = new Set<string>();
  for (const part of modifierParts) {
    const modifier = canonicalizeModifier(part);
    if (modifier === null) return false; // AC-62-1 (ii): an empty/unknown modifier
    if (seen.has(modifier)) return false; // AC-62-1 (iii): duplicated modifier
    seen.add(modifier);
  }
  return true;
}

// R-45-4/R-45-4-1/R-18-2, consolidated (MUST-86 recommendation A).
export function validateKeymapEntries(entries: readonly RawKeymapEntryLike[]): ValidatedKeymap {
  const effective: Record<string, string> = {};
  const invalidActions: string[] = [];

  for (const entry of entries) {
    const { actionId, value } = entry;

    // Step 1: unknown action ids are ignored (R-45-4 (i)).
    if (!KNOWN_ACTION_IDS.has(actionId)) {
      invalidActions.push(actionId);
      continue;
    }

    // Step 2: a non-string TOML value is invalid (R-45-4 (ii)/AC-62 (ii)).
    if (value === null) {
      invalidActions.push(actionId);
      continue;
    }

    // Step 3: an empty string is a VALID disabling override (R-31).
    if (value === "") {
      effective[actionId] = value;
      continue;
    }

    // Step 4: key-string grammar (R-45-4-1/AC-62-1), each comma-separated
    // element checked independently.
    const elements = value.split(",").map((s) => s.trim());
    const allValidGrammar = elements.every(isValidBindingElement);
    if (!allValidGrammar) {
      invalidActions.push(actionId);
      continue;
    }

    // Step 5: `delete` + Shift is invalid (R-18-2), reusing the existing
    // single-purpose validator.
    if (elements.some((element) => validateCustomOverride(actionId, element) === null)) {
      invalidActions.push(actionId);
      continue;
    }

    // Step 6: valid.
    effective[actionId] = value;
  }

  return { effective, invalidActions };
}
