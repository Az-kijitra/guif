// SPEC-0300-0022 R-1605 / R-1650; SPEC-0200-0001 §3.17.6 / §3.17.8: thin invoke wrappers for the two commands in
// app/src-tauri/src/config_bridge/ (camelCase DTOs on the wire). No business logic, no state.
//
// R-1605 / AC-1606: there is NO parameter. The back end decides the path, the program and the arguments.

import { invoke } from "@tauri-apps/api/core";
import type { KeymapRawLoadResultDto } from "./config";
import type { ExternalAppsDto } from "./external-apps";

// R-1665: a machine-readable code plus the OS text; the sentence is built by `features/settings-file/open-result.ts`.
export interface SettingsFileOpenDto {
  templateCreated: boolean;
  // R-1623: why `config.sample.toml` could not be written (the OS text), or null.
  sampleError: string | null;
  result: {
    kind: "vscode" | "association" | "not_a_file" | "out_of_scope" | "open_failed" | "template_failed";
    // The OS text as it is (never translated or trimmed, R-1204).
    message?: string;
  };
}

// R-1650 / R-1651: the file read again, in the same shape as the two start-up snapshots.
export interface ConfigCheckDto {
  keymap: KeymapRawLoadResultDto;
  externalApps: ExternalAppsDto;
}

export class SettingsFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsFileError";
  }
}

// Never throws anything but a SettingsFileError.
function normalize(raw: unknown): SettingsFileError {
  if (raw instanceof SettingsFileError) return raw;
  if (typeof raw === "string") return new SettingsFileError(raw);
  if (raw instanceof Error) return new SettingsFileError(raw.message);
  if (typeof raw === "object" && raw !== null && typeof (raw as { message?: unknown }).message === "string") {
    return new SettingsFileError((raw as { message: string }).message);
  }
  return new SettingsFileError(raw == null ? "" : String(raw));
}

export async function settingsFileOpen(): Promise<SettingsFileOpenDto> {
  try {
    return await invoke<SettingsFileOpenDto>("settings_file_open");
  } catch (e) {
    throw normalize(e);
  }
}

export async function settingsFileCheck(): Promise<ConfigCheckDto> {
  try {
    return await invoke<ConfigCheckDto>("settings_file_check");
  } catch (e) {
    throw normalize(e);
  }
}
