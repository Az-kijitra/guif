// SPEC-0300-0010 R-45-2/R-45-5; SPEC-0200-0001 §3.6.11.11 SHOULD-119: the
// keymap-load notice's text is built here (a pure function in
// features/keyboard/, not in routes/startup-wiring.ts, which only
// concatenates the three startup notices, §4.1 SHOULD-19).

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
// R-917-5 (2): `alsoDefaultsTheme` (the whole file was unreadable, so the theme fell back to the OS as well)
// only changes the closing sentence; this feature knows nothing else about the theme (SPEC-0200-0001 §3.11.4).
export function buildKeymapLoadNotice(
  parseError: KeymapParseErrorLike | null,
  invalidActions: readonly string[],
  opts?: { alsoDefaultsTheme?: boolean },
): string | null {
  if (parseError !== null) {
    // W-30-2: the type error carries its own full sentence (no detail, the theme is not touched).
    if (parseError.wholeFile === false) return KEYMAP_MESSAGES.customKeymapUnreadable;
    const defaults = opts?.alsoDefaultsTheme
      ? KEYMAP_MESSAGES.closingKeymapAndTheme
      : KEYMAP_MESSAGES.closingKeymapOnly;
    return KEYMAP_MESSAGES.readFailed(KEYMAP_MESSAGES.readTarget(parseError.line), defaults, parseError.message);
  }
  if (invalidActions.length > 0) {
    return KEYMAP_MESSAGES.invalidOverrides(invalidActions.length, invalidActions);
  }
  return null;
}
