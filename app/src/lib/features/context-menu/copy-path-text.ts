// SPEC-0300-0018 R-1060-1~3 / SPEC-0200-0001 §3.9.8. Pure.

export const COPY_PATH_FAILED = "パスをコピーできませんでした";

export function buildPathsClipboardText(paths: readonly string[]): string {
  return paths.join("\r\n");
}

export function formatCopyPathStatus(count: number): string {
  return `パスをコピーしました(${count} 件)`;
}
