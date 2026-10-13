// SPEC-0300-0015 R-466-1/R-466-3/R-466-6, SPEC-0200-0001 §3.14.7: the ONLY place highlight.js is imported (core + the
// eight language definitions one by one, never the all-languages entry). It runs in a Web Worker created lazily by
// routes/viewer/highlight-wiring.ts, so neither the viewer's first paint nor the main window carries the library.
//
// In:  { requestId, language, code }      Out: { requestId, chunks: string[] } | { requestId, error }
// The whole file is highlighted in ONE call (so a token that spans lines keeps its colour), then cut into chunks of
// LINES_PER_CHUNK source lines by splitBalanced.

import hljs from "highlight.js/lib/core";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import typescript from "highlight.js/lib/languages/typescript";
import { splitBalanced } from "./split-html";

const LINES_PER_CHUNK = 2000;

hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("typescript", typescript);

interface WorkerScope {
  onmessage: ((e: { data: { requestId: number; language: string; code: string } }) => void) | null;
  postMessage(message: unknown): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { requestId, language, code } = e.data;
  try {
    const html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
    scope.postMessage({ requestId, chunks: splitBalanced(html, LINES_PER_CHUNK) });
  } catch (error) {
    scope.postMessage({ requestId, error: String(error) });
  }
};
