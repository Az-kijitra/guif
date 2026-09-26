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
