// SPEC-0300-0021 R-1503-1 / R-1510-1 / R-1550 / R-1551 / R-1506; SPEC-0200-0001 §3.16.6: turns the start-up snapshot (`ExternalAppsDto`) into what
// the screen uses: the entries (label + usable keys) and what the start-up notice is built from. Pure.
//
// The key rules are INJECTED (`KeyRules`): the grammar and the overlaps with the fixed keys and the keymap belong to `features/keyboard`, and a
// feature may not import another feature (`routes/` bridges them).

import type { ExternalAppsDto } from "$lib/shared/ipc/external-apps";
import { DEFAULT_APP_NAMES } from "./messages";

export interface KeyRules {
  // Per comma element, already trimmed.
  isValidKey(element: string): boolean;
  collides(element: string): boolean;
}

export interface ExternalAppEntry {
  index: number;
  label: string;
  // The USABLE key elements, trimmed, as written.
  keys: string[];
  // SPEC-0300-0022 R-1642: the line of the registration's `key` (null for the default four, or when unknown).
  keyLine: number | null;
}

// `key: null` = the `key` was not a string (R-1503-1).
export interface RejectedKey {
  label: string;
  key: string | null;
  // The `keyLine` of the registration the key belongs to (SPEC-0300-0022 W-9C).
  line: number | null;
}

export interface Registry {
  entries: ExternalAppEntry[];
  invalid: ExternalAppsDto["invalid"];
  typeError: boolean;
  typeErrorLine: number | null;
  rejectedKeys: RejectedKey[];
}

function labelOf(app: ExternalAppsDto["apps"][number]): string {
  const defaultNo = app.defaultNo;
  if (defaultNo !== null && defaultNo in DEFAULT_APP_NAMES) return DEFAULT_APP_NAMES[defaultNo as keyof typeof DEFAULT_APP_NAMES];
  return app.name ?? "";
}

export function buildRegistry(dto: ExternalAppsDto, rules: KeyRules): Registry {
  const rejectedKeys: RejectedKey[] = [];
  // Keys already used by an EARLIER registration (R-1551 3). Compared without case.
  const taken = new Set<string>();
  const entries = dto.apps.map((app): ExternalAppEntry => {
    const label = labelOf(app);
    // The line is passed through as the DTO has it (SPEC-0300-0022 R-1642); a DTO without one gives null on the entry.
    const keyLine = app.keyLine;
    const keys: string[] = [];
    if (app.keyInvalid) rejectedKeys.push({ label, key: null, line: keyLine });
    const raw = app.key ?? "";
    if (raw.trim() !== "") {
      for (const element of raw.split(",").map((e) => e.trim())) {
        const normalized = element.toLowerCase();
        if (keys.some((k) => k.toLowerCase() === normalized)) continue;
        if (!rules.isValidKey(element) || rules.collides(element) || taken.has(normalized)) {
          rejectedKeys.push({ label, key: element, line: keyLine });
          continue;
        }
        keys.push(element);
      }
    }
    for (const key of keys) taken.add(key.toLowerCase());
    return { index: app.index, label, keys, keyLine: keyLine ?? null };
  });
  return { entries, invalid: dto.invalid.map((i) => ({ ...i })), typeError: dto.typeError, typeErrorLine: dto.typeErrorLine, rejectedKeys };
}
