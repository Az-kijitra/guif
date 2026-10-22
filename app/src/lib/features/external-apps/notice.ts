// SPEC-0300-0021 R-1574 / SPEC-0300-0019 第3版 W-9A~W-9C; SPEC-0200-0001 §3.16.6: the start-up notice of the external apps. Pure.
// The sentences come in the order registrations (W-9A) -> type error (W-9B) -> unusable keys (W-9C), joined by one half-width
// space (W-39). Nothing to say = null.

import { limitList } from "$lib/shared/notice-list";
import { EXTERNAL_APP_MESSAGES as M } from "./messages";

export interface NoticeInput {
  // The lines are optional (SPEC-0300-0022 R-1660): absent / null = the sentence as before.
  invalid: readonly { position: number; name: string | null; reason: "invalid" | "limit"; line?: number | null }[];
  typeError: boolean;
  typeErrorLine?: number | null;
  rejectedKeys: readonly { label: string; key: string | null; line?: number | null }[];
}

// `3(VS Codeで開く、20 行目)`, `21(上限を超えています、60 行目)`, `1(20 行目)` when the name cannot be read; without a line the line part is left out.
function invalidItem(item: NoticeInput["invalid"][number]): string {
  const name = item.reason === "limit" ? M.limitReason : item.name;
  const line = item.line ?? null;
  if (name === null) return line === null ? `${item.position}` : M.invalidItemLineOnly(item.position, line);
  return line === null ? `${item.position}(${name})` : M.invalidItemAt(item.position, name, line);
}

// `ターミナルで開く: Ctrl+Alt+C(25 行目)`; a `key` that was not a string has nothing to show after the name (`NoString(31 行目)`).
function rejectedKeyItem(item: NoticeInput["rejectedKeys"][number]): string {
  const base = item.key === null ? item.label : `${item.label}: ${item.key}`;
  return item.line == null ? base : base + M.atLine(item.line);
}

export function buildExternalAppsNotice(input: NoticeInput): string | null {
  const sentences: string[] = [];
  if (input.invalid.length > 0) {
    sentences.push(M.invalidRegistrations(input.invalid.length, limitList(input.invalid.map(invalidItem))));
  }
  if (input.typeError) sentences.push(input.typeErrorLine == null ? M.typeError : M.typeErrorAt(input.typeErrorLine));
  if (input.rejectedKeys.length > 0) {
    sentences.push(M.unusableKeys(input.rejectedKeys.length, limitList(input.rejectedKeys.map(rejectedKeyItem))));
  }
  return sentences.length === 0 ? null : sentences.join(" ");
}
