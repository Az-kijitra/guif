// SPEC-0300-0010 R-45-2/R-45-5; SPEC-0200-0001 §3.6.11.11 SHOULD-119: the
// keymap-load notice's text is built here (a pure function in
// features/keyboard/, not in routes/startup-wiring.ts, which only
// concatenates the three startup notices, §4.1 SHOULD-19).

export interface KeymapParseErrorLike {
  message: string;
  line: number | null;
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
    const at = parseError.line !== null ? ` (line ${parseError.line})` : "";
    const defaults = opts?.alsoDefaultsTheme
      ? "Using the default keymap and the default theme (following the OS)."
      : "Using the default keymap.";
    return `config.toml could not be read${at}: ${parseError.message}. ${defaults}`;
  }
  if (invalidActions.length > 0) {
    return `Ignored ${invalidActions.length} invalid keymap override(s) in config.toml: ${invalidActions.join(", ")}.`;
  }
  return null;
}
