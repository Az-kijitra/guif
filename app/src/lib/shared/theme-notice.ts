// SPEC-0300-0017 R-917-4 / AC-958; SPEC-0200-0001 §3.11.4: the notice for an uninterpretable `ui_theme`
// in config.toml. A pure function in shared/ (it knows no feature); routes/startup-wiring.ts joins it
// with the keymap notice. The wording lives in `shared/messages.ts` (SPEC-0200-0001 §3.13).

import { SHARED_NOTICES } from "$lib/shared/messages";

// SPEC-0300-0022 W-33: with the line of `ui_theme`, `config.toml の {N} 行目の ui_theme を…`; without it the sentence is as before (R-1660).
export function buildThemeNotice(invalid: boolean, line?: number | null): string | null {
  if (!invalid) return null;
  return line == null ? SHARED_NOTICES.themeInvalid : SHARED_NOTICES.themeInvalidAt(line);
}
