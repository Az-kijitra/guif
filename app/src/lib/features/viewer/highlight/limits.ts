// SPEC-0300-0015 R-466-5 (T-17): the highlight limit is a constant of 1,000,000 UTF-16 code units of the decoded
// string. Over it the body is shown without colour and nothing is announced.
// R-466-5-1 (第10版): a file whose LONGEST LINE is over 10,000 UTF-16 code units (newline characters not counted) is
// also shown without colour as a whole -- highlight.js takes time quadratic in the length of one line. Exactly
// 10,000 is coloured. Both limits are checked here, before anything is sent to the Worker.

export const MAX_HIGHLIGHT_CHARS = 1_000_000;
export const MAX_HIGHLIGHT_LINE_CHARS = 10_000;

// Length of the longest line, in UTF-16 code units, not counting "\n" or the "\r" of a "\r\n".
export function longestLineLength(code: string): number {
  let longest = 0;
  let start = 0;
  while (start <= code.length) {
    let end = code.indexOf("\n", start);
    if (end < 0) end = code.length;
    let len = end - start;
    if (len > 0 && code.charCodeAt(end - 1) === 13) len--;
    if (len > longest) longest = len;
    start = end + 1;
  }
  return longest;
}

export function canHighlight(code: string, language: string | null): boolean {
  if (language === null || code.length > MAX_HIGHLIGHT_CHARS) return false;
  return longestLineLength(code) <= MAX_HIGHLIGHT_LINE_CHARS;
}
