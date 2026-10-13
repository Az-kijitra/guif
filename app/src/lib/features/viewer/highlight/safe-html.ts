// SPEC-0300-0015 R-466-4, SPEC-0200-0001 §3.14.7 / §3.14.12-13: defence in depth for highlighted markup. A chunk is
// accepted only when it is made of nothing but
//   - `<span class="TOKEN [TOKEN...]">` with TOKEN = [A-Za-z0-9_-]+ (the only attribute is class),
//   - `</span>`,
//   - text without a bare `<`, `>` or `&` (`&` only as &amp; &lt; &gt; &quot; &#x27;).
// Tag balance is not checked here (splitBalanced guarantees it). All-or-nothing, never throws.

const PIECE = /<span class="[A-Za-z0-9_-]+(?: +[A-Za-z0-9_-]+)*">|<\/span>|[^<>&]+|&(?:amp|lt|gt|quot|#x27);/y;

export function isSafeHighlightHtml(chunk: string): boolean {
  let at = 0;
  while (at < chunk.length) {
    PIECE.lastIndex = at;
    if (PIECE.exec(chunk) === null) return false;
    at = PIECE.lastIndex;
  }
  return true;
}
