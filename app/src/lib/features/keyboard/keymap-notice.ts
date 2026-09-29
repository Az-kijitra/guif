// SPEC-0300-0010 R-45-2/R-45-5; SPEC-0200-0001 §3.6.11.11 SHOULD-119: the
// keymap-load notice's text is built here (a pure function in
// features/keyboard/, not in routes/startup-wiring.ts, which only
// concatenates the three startup notices, §4.1 SHOULD-19).

export interface KeymapParseErrorLike {
  message: string;
  line: number | null;
}

// R-45-2 (syntax error) takes precedence over R-45-5 (per-element issues) --
// they are mutually exclusive in practice (config/keymap.rs never returns
// both), but a parse error is always the more actionable message.
export function buildKeymapLoadNotice(
  parseError: KeymapParseErrorLike | null,
  invalidActions: readonly string[],
): string | null {
  if (parseError !== null) {
    const at = parseError.line !== null ? ` (line ${parseError.line})` : "";
    return `config.toml could not be read${at}: ${parseError.message}. Using the default keymap.`;
  }
  if (invalidActions.length > 0) {
    return `Ignored ${invalidActions.length} invalid keymap override(s) in config.toml: ${invalidActions.join(", ")}.`;
  }
  return null;
}
