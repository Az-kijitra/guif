// SPEC-0300-0015 R-460/R-462-1/R-463/R-463-1, SPEC-0200-0001 §3.14.5: the line arithmetic shared by the two-column
// text view and the highlight chunking. The count is that of content.split("\n") (a final newline gives an empty
// last line, which is numbered too).

export function lineCount(content: string): number {
  let n = 1;
  let at = content.indexOf("\n");
  while (at >= 0) {
    n++;
    at = content.indexOf("\n", at + 1);
  }
  return n;
}

// One text node "1\n2\n...\nN" (no trailing newline).
export function gutterText(count: number): string {
  const parts = new Array<string>(Math.max(0, count));
  for (let i = 0; i < parts.length; i++) parts[i] = String(i + 1);
  return parts.join("\n");
}

// A <pre> makes no line box for a trailing newline alone, so the view adds a one-row spacer for it.
export function needsTailSpacer(content: string): boolean {
  return content.endsWith("\n");
}
