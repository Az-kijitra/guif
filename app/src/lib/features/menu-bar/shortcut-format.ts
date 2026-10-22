// SPEC-0300-0020 R-1330-1 / R-1331 (確定 T-10, 【レビュー m-3】) / SPEC-0200-0001 §3.14.1-1. Pure.
// From the NORMAL FORM binding string (built in routes with the keyboard feature's normalisation) to the display text.

const EXIT_DEFAULT = "Ctrl+Q";
const SETTINGS_DEFAULT = "Ctrl+,";

// The internal spellings of a key body that are shown differently.
const KEY_DISPLAY: Record<string, string> = {
  Escape: "Esc",
  Comma: ",",
};

// "" = show nothing. Only the FIRST binding of a comma-separated list is shown (R-32); an empty first element shows nothing.
export function formatShortcut(binding: string | undefined): string {
  if (binding === undefined) return "";
  const first = binding.split(",")[0].trim();
  if (first === "") return "";
  const parts = first.split("+");
  const body = parts[parts.length - 1];
  parts[parts.length - 1] = KEY_DISPLAY[body] ?? body;
  return parts.join("+");
}

// The 終了 item: priority 1 (Ctrl+Q) always exits, so an empty binding still shows it.
export function formatExitShortcut(binding: string | undefined): string {
  const shown = formatShortcut(binding);
  return shown === "" ? EXIT_DEFAULT : shown;
}

// The 設定ファイルを開く item (SPEC-0300-0022 R-1670, T-28): Ctrl+, is pre-empted at priority 1, so an empty binding still shows it.
export function formatSettingsShortcut(binding: string | undefined): string {
  const shown = formatShortcut(binding);
  return shown === "" ? SETTINGS_DEFAULT : shown;
}
