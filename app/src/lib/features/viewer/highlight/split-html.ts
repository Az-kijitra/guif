// SPEC-0300-0015 R-466-3 / R-466-6, SPEC-0200-0001 §3.14.7: split the highlight.js HTML of a whole file into chunks
// of `linesPerChunk` source lines. Each chunk is balanced on its own: at a boundary the stack of open tags is closed,
// and the next chunk re-opens the same tags (outermost first), so a multi-line token keeps its colour.
// Chunk k holds lines [k*n, (k+1)*n); every chunk but the last ends with the "\n" of its last line.

const PIECE = /<span [^>]*>|<\/span>|[^<]+/g;

export function splitBalanced(html: string, linesPerChunk: number): string[] {
  const n = Math.max(1, Math.floor(linesPerChunk));
  const chunks: string[] = [];
  const stack: string[] = [];
  let parts: string[] = [];
  let lines = 0;

  const flush = (): void => {
    for (let i = 0; i < stack.length; i++) parts.push("</span>");
    chunks.push(parts.join(""));
    parts = stack.slice();
    lines = 0;
  };

  PIECE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PIECE.exec(html)) !== null) {
    const piece = m[0];
    if (piece === "</span>") {
      stack.pop();
      parts.push(piece);
    } else if (piece.startsWith("<span ")) {
      stack.push(piece);
      parts.push(piece);
    } else {
      let from = 0;
      let nl = piece.indexOf("\n");
      while (nl >= 0) {
        parts.push(piece.slice(from, nl + 1));
        from = nl + 1;
        if (++lines === n) flush();
        nl = piece.indexOf("\n", from);
      }
      if (from < piece.length) parts.push(from === 0 ? piece : piece.slice(from));
    }
  }
  chunks.push(parts.join(""));
  return chunks;
}
