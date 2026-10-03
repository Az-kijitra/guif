// SPEC-0300-0011 R-15-3 / CB-06, R-19-5 / CB-13 (SPEC-0200-0001 §3.10.8). Pure status texts.

export type PasteNotice = "cut-changed" | "cut-write-failed";

const NOTICE_TEXT: Record<PasteNotice, string> = {
  "cut-changed": "(切り取りの後にクリップボードが変わったため、コピーしました)",
  "cut-write-failed": "(切り取りをOSのクリップボードに書き込めなかったため、コピーしました)",
};

// CB-06: `{n}件をコピーしました` / `{n}件を切り取りました`, with
// `(OSのクリップボードには書き込めませんでした)` appended when `os === "failed"`.
export function formatCopyCutStatus(
  origin: "internal-copy" | "internal-cut",
  count: number,
  os: "written" | "failed" | "not-applicable",
): string {
  const verb = origin === "internal-cut" ? "切り取りました" : "コピーしました";
  const base = `${count}件を${verb}`;
  return os === "failed" ? `${base}(OSのクリップボードには書き込めませんでした)` : base;
}

// CB-13: concatenates the notice text AFTER the status, with no separator.
export function appendPasteNotice(status: string, notice: PasteNotice | undefined): string {
  return notice === undefined ? status : `${status}${NOTICE_TEXT[notice]}`;
}
