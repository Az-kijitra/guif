// SPEC-0300-0021 R-1574 / SPEC-0300-0019 第3版 W-9A~W-9C; SPEC-0200-0001 §3.16.6: the start-up notice of the external apps. Pure.
// The sentences come in the order registrations (W-9A) -> type error (W-9B) -> unusable keys (W-9C), joined by one half-width
// space (W-39). Nothing to say = null.

import { EXTERNAL_APP_MESSAGES as M } from "./messages";

export interface NoticeInput {
  invalid: readonly { position: number; name: string | null; reason: "invalid" | "limit" }[];
  typeError: boolean;
  rejectedKeys: readonly { label: string; key: string | null }[];
}

// `3(VS Codeで開く)`, `21(上限を超えています)`, or just `1` when the name cannot be read.
function invalidItem(item: NoticeInput["invalid"][number]): string {
  if (item.reason === "limit") return `${item.position}(${M.limitReason})`;
  return item.name === null ? `${item.position}` : `${item.position}(${item.name})`;
}

// `ターミナルで開く: Ctrl+Alt+C`; a `key` that was not a string has nothing to show after the name.
function rejectedKeyItem(item: NoticeInput["rejectedKeys"][number]): string {
  return item.key === null ? item.label : `${item.label}: ${item.key}`;
}

export function buildExternalAppsNotice(input: NoticeInput): string | null {
  const sentences: string[] = [];
  if (input.invalid.length > 0) {
    sentences.push(M.invalidRegistrations(input.invalid.length, input.invalid.map(invalidItem).join(", ")));
  }
  if (input.typeError) sentences.push(M.typeError);
  if (input.rejectedKeys.length > 0) {
    sentences.push(M.unusableKeys(input.rejectedKeys.length, input.rejectedKeys.map(rejectedKeyItem).join(", ")));
  }
  return sentences.length === 0 ? null : sentences.join(" ");
}
