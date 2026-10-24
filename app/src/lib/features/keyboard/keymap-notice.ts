// SPEC-0300-0010 R-45-2/R-45-5; SPEC-0200-0001 §3.6.11.11 SHOULD-119: the
// keymap-load notice's text is built here (a pure function in
// features/keyboard/, not in routes/startup-wiring.ts, which only
// concatenates the three startup notices, §4.1 SHOULD-19).

import { limitList } from "$lib/shared/notice-list";
import { KEYMAP_MESSAGES } from "./messages";

export interface KeymapParseErrorLike {
  message: string;
  line: number | null;
  // SPEC-0200-0001 §3.13.7: false only for the one route where `input_keymap_custom` is not a table (W-30-2).
  // undefined / true: the whole file was unreadable.
  wholeFile?: boolean;
}

// R-45-2 (syntax error) takes precedence over R-45-5 (per-element issues) --
// they are mutually exclusive in practice (config/config_toml.rs never returns
// both), but a parse error is always the more actionable message.
// SPEC-0300-0023 R-1823: `alsoDefaultsAppearance` (the whole file was unreadable, so the colour scheme fell back to nord as well)
// only changes the closing sentence; this feature knows nothing else about the appearance (SPEC-0200-0001 §3.18.4).
export function buildKeymapLoadNotice(
  parseError: KeymapParseErrorLike | null,
  invalidActions: readonly string[],
  // SPEC-0300-0022 R-1642: `invalidActionLines` is parallel to `invalidActions` (ValidatedKeymap); omitted = no line is known.
  opts?: { alsoDefaultsAppearance?: boolean; invalidActionLines?: readonly (number | null)[] },
): string | null {
  if (parseError !== null) {
    // W-30-2: the type error carries its own full sentence (no detail, the theme is not touched).
    // SPEC-0300-0022 R-1660: without a line the sentence is the one before.
    if (parseError.wholeFile === false) {
      return parseError.line === null ? KEYMAP_MESSAGES.customKeymapUnreadable : KEYMAP_MESSAGES.customKeymapUnreadableAt(parseError.line);
    }
    const defaults = opts?.alsoDefaultsAppearance
      ? KEYMAP_MESSAGES.closingKeymapAndAppearance
      : KEYMAP_MESSAGES.closingKeymapOnly;
    return KEYMAP_MESSAGES.readFailed(KEYMAP_MESSAGES.readTarget(parseError.line), defaults, parseError.message);
  }
  if (invalidActions.length > 0) {
    const lines = opts?.invalidActionLines ?? [];
    const items = invalidActions.map((id, i) => {
      const line = lines[i] ?? null;
      return line === null ? id : KEYMAP_MESSAGES.idAtLine(id, line);
    });
    return KEYMAP_MESSAGES.invalidOverrides(invalidActions.length, limitList(items));
  }
  return null;
}
