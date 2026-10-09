// SPEC-0300-0011 R-15-3 / CB-06, R-19-5 / CB-13 (SPEC-0200-0001 §3.10.8). Pure status texts.

import { CLIPBOARD_MESSAGES } from "./messages";

export type PasteNotice = "cut-changed" | "cut-write-failed";

const NOTICE_TEXT: Record<PasteNotice, string> = {
  "cut-changed": CLIPBOARD_MESSAGES.noticeCutChanged,
  "cut-write-failed": CLIPBOARD_MESSAGES.noticeCutWriteFailed,
};

// CB-06: `{n}件をコピーしました` / `{n}件を切り取りました`, with
// `(OSのクリップボードには書き込めませんでした)` appended when `os === "failed"`.
export function formatCopyCutStatus(
  origin: "internal-copy" | "internal-cut",
  count: number,
  os: "written" | "failed" | "not-applicable",
): string {
  const verb = origin === "internal-cut" ? CLIPBOARD_MESSAGES.verbCut : CLIPBOARD_MESSAGES.verbCopy;
  const base = CLIPBOARD_MESSAGES.countWithVerb(count, verb);
  return os === "failed" ? `${base}${CLIPBOARD_MESSAGES.osWriteFailed}` : base;
}

// CB-13: concatenates the notice text AFTER the status, with no separator.
export function appendPasteNotice(status: string, notice: PasteNotice | undefined): string {
  return notice === undefined ? status : `${status}${NOTICE_TEXT[notice]}`;
}
