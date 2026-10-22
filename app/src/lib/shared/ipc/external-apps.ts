// SPEC-0300-0021 (external-app launch); SPEC-0200-0001 §3.16.3 / §3.16.6: thin invoke wrappers for the two commands in
// app/src-tauri/src/external_apps/commands.rs (camelCase DTOs on the wire). No business logic, no state.
//
// R-1581 / AC-1524: the screen sends ONLY the registration number, the target path and its kind. There is no parameter
// that could carry a program or arguments.

import { invoke } from "@tauri-apps/api/core";

export interface ExternalAppDto {
  index: number;
  // 1..4 for a default registration (its display name is on the screen, W-90..W-93); null for a user registration.
  defaultNo: number | null;
  name: string | null;
  // The raw `key` string; the front end alone judges its grammar and overlaps.
  key: string | null;
  // `key` was present but not a string (R-1503-1).
  keyInvalid: boolean;
  // SPEC-0300-0022 R-1642: the line of the registration's `key`, or null (always null for the default four).
  keyLine: number | null;
}

export interface InvalidRegistrationDto {
  position: number;
  name: string | null;
  reason: "invalid" | "limit";
  // SPEC-0300-0022 R-1642: the line of the registration (its heading / element), or null.
  line: number | null;
}

export interface ExternalAppsDto {
  apps: ExternalAppDto[];
  invalid: InvalidRegistrationDto[];
  typeError: boolean;
  // SPEC-0300-0022 R-1642: the line of `external_apps`, or null.
  typeErrorLine: number | null;
}

export type ExternalAppKind = "file" | "dir";

// R-1576: a machine-readable code plus raw values; the sentence is built by `features/external-apps/messages.ts`.
// R-1571: `program` of "program_not_found" is the expanded value. R-1573: `message` of "os_error" is the OS text, untouched.
export class ExternalAppError extends Error {
  code: string;
  program?: string;

  constructor(code: string, message: string, program?: string) {
    super(message);
    this.name = "ExternalAppError";
    this.code = code;
    this.program = program;
  }
}

// Never throws: any rejected value becomes an ExternalAppError (code "unknown" when nothing structured can be recovered).
export function normalizeExternalAppError(raw: unknown): ExternalAppError {
  if (raw instanceof ExternalAppError) return raw;
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { code?: unknown; message?: unknown; program?: unknown };
    if (typeof o.code === "string") {
      return new ExternalAppError(
        o.code,
        typeof o.message === "string" ? o.message : "",
        typeof o.program === "string" ? o.program : undefined,
      );
    }
    return new ExternalAppError("unknown", typeof o.message === "string" ? o.message : "");
  }
  if (typeof raw === "string") return new ExternalAppError("unknown", raw);
  if (raw instanceof Error) return new ExternalAppError("unknown", raw.message);
  return new ExternalAppError("unknown", String(raw));
}

// R-1501: a read-only snapshot taken at start-up; the file is not read again.
export async function externalAppsLoad(): Promise<ExternalAppsDto> {
  try {
    return await invoke<ExternalAppsDto>("external_apps_load");
  } catch (e) {
    throw normalizeExternalAppError(e);
  }
}

export async function externalAppLaunch(index: number, path: string, kind: ExternalAppKind): Promise<void> {
  try {
    await invoke<void>("external_app_launch", { index, path, kind });
  } catch (e) {
    throw normalizeExternalAppError(e);
  }
}
