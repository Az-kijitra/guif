// SPEC-0300-0017 R-917-4 / AC-958; SPEC-0200-0001 §3.11.4: the notice for an uninterpretable `ui_theme`
// in config.toml. A pure function in shared/ (it knows no feature); routes/startup-wiring.ts joins it
// with the keymap notice. English like the other startup notices.

export function buildThemeNotice(invalid: boolean): string | null {
  if (!invalid) return null;
  return 'Could not understand ui_theme in config.toml (use "light", "dark" or "system"); following the OS theme.';
}
