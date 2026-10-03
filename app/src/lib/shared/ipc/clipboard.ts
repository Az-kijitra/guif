// SPEC-0300-0011 R-18; SPEC-0200-0001 §3.10.8 / §4.5: thin invoke() wrappers for the
// three clipboard commands (app/src-tauri/src/fs_ops/clipboard/commands.rs). No logic, no state.
// Argument names are camelCase (Tauri maps them to the Rust snake_case parameters).

import { invoke } from "@tauri-apps/api/core";

// Mirrors commands.rs::ClipboardWriteDto.
export interface ClipboardWriteResult {
  ok: boolean;
  sequence: number;
  error?: string | null;
}

// Mirrors commands.rs::ClipboardReadDto.
export interface ClipboardReadResult {
  state: "files" | "none" | "unavailable";
  paths: string[];
  sequence: number;
}

// R-15 / R-16 / R-18: with `expectedSequence` the write happens only if the OS clipboard still
// has that sequence number (MUST-121); a refusal is `{ ok: false, error: "changed" }`.
export function clipboardSetFiles(
  paths: string[],
  effect: "copy" | "move",
  opts?: { expectedSequence?: number },
): Promise<ClipboardWriteResult> {
  const args: Record<string, unknown> = { paths, effect };
  if (opts?.expectedSequence !== undefined) args.expectedSequence = opts.expectedSequence;
  return invoke<ClipboardWriteResult>("clipboard_set_files", args);
}

// R-17 / CB-11: `probeOnly` asks only whether a file list is present (the clipboard is not opened).
export function clipboardGetFiles(probeOnly: boolean): Promise<ClipboardReadResult> {
  return invoke<ClipboardReadResult>("clipboard_get_files", { probeOnly });
}

// R-19-6: empties the OS clipboard only if its sequence number is still `sequence`.
export function clipboardClearIfUnchanged(sequence: number): Promise<boolean> {
  return invoke<boolean>("clipboard_clear_if_unchanged", { sequence });
}
