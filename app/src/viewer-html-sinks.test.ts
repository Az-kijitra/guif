/// <reference types="node" />
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0015 第8版 R-466-4 (the file content is never interpreted as HTML), R-472 (`html:false` Markdown), R-434 (nothing in the
//   viewer reaches outside), AC-526 (static side).
// Architecture: SPEC-0200-0001 §3.14.12-3 (MUST-131): the ONLY ways to put HTML into the viewer's DOM are (1) `{@html renderMarkdown(...)}` for the
//   Markdown HTML mode and (2) `features/viewer/highlight/render-html.ts` `applyHighlightedChunks(preEl, chunks)`, which runs every chunk through
//   `isSafeHighlightHtml` and then uses a <template>'s `innerHTML` + `replaceChildren`. A scan of `routes/viewer/**` and `features/viewer/**`
//   (tests excluded) for the 7 sinks `{@html` `innerHTML` `outerHTML` `insertAdjacentHTML` `createContextualFragment` `DOMParser` `document.write`
//   is limited to those two places; `<pre class="code">`'s children are managed by an action, never by Svelte (§3.14.12-3 (b)).
//

const SRC = resolve(__dirname);
const ROOTS = [join(SRC, "routes", "viewer"), join(SRC, "lib", "features", "viewer")];
const RENDER_HTML = "lib/features/viewer/highlight/render-html.ts";
const SINKS = ["{@html", "innerHTML", "outerHTML", "insertAdjacentHTML", "createContextualFragment", "DOMParser", "document.write"] as const;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === ".svelte-kit") continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");

interface Hit {
  file: string;
  sink: string;
  line: string;
}
function scan(files: { rel: string; text: string }[]): Hit[] {
  const hits: Hit[] = [];
  for (const f of files) {
    const text = stripComments(f.text);
    for (const sink of SINKS) {
      let at = text.indexOf(sink);
      while (at >= 0) {
        const lineStart = text.lastIndexOf("\n", at) + 1;
        const lineEnd = text.indexOf("\n", at);
        hits.push({ file: f.rel, sink, line: text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim() });
        at = text.indexOf(sink, at + sink.length);
      }
    }
  }
  return hits;
}
const files = (): { rel: string; text: string }[] =>
  ROOTS.flatMap((r) => walk(r))
    .filter((f) => /\.(ts|svelte)$/.test(f) && !/\.test\.ts$/.test(f) && !/\.d\.ts$/.test(f))
    .map((f) => ({ rel: relative(SRC, f).split(sep).join("/"), text: readFileSync(f, "utf-8") }));

describe("the scan itself (self-check)", () => {
  it("finds each of the 7 sinks, ignores comments", () => {
    const text = "a.innerHTML = x; b.outerHTML; c.insertAdjacentHTML(); d.createContextualFragment(); new DOMParser(); document.write(); {@html y}\n// innerHTML in a comment\n/* DOMParser */";
    const hits = scan([{ rel: "x.ts", text }]);
    expect(hits.map((h) => h.sink).sort()).toEqual([...SINKS].sort());
  });

  it("sees the viewer sources at all (guards against an empty scan)", () => {
    const rels = files().map((f) => f.rel);
    expect(rels).toContain("routes/viewer/+page.svelte");
    expect(rels).toContain("lib/features/viewer/markdown-render.ts");
    expect(rels.length).toBeGreaterThan(8);
  });
});

describe("MUST-131: the allow-list of HTML sinks", () => {
  const hits = scan(files());

  it("every `{@html` in the viewer is `{@html renderMarkdown(` (the html:false Markdown renderer) and there is exactly one", () => {
    const html = hits.filter((h) => h.sink === "{@html");
    expect(html.length).toBe(1);
    expect(html[0].line).toMatch(/\{@html\s+renderMarkdown\(/);
    expect(html[0].file.startsWith("routes/viewer/")).toBe(true);
  });

  it("`innerHTML` appears in render-html.ts only", () => {
    expect(hits.filter((h) => h.sink === "innerHTML").map((h) => h.file)).toEqual([RENDER_HTML]);
  });

  it("outerHTML / insertAdjacentHTML / createContextualFragment / DOMParser / document.write appear nowhere", () => {
    expect(hits.filter((h) => !["{@html", "innerHTML"].includes(h.sink))).toEqual([]);
  });

  it("the whole result is exactly the two allowed places (the {@html Markdown line and render-html.ts innerHTML)", () => {
    expect(hits.map((h) => `${h.sink}@${h.file}`).sort()).toEqual([`{@html@${hits.find((h) => h.sink === "{@html")?.file ?? "?"}`, `innerHTML@${RENDER_HTML}`].sort());
  });
});

describe("render-html.ts is the single door for coloured text (MUST-131 (a))", () => {
  const path = join(SRC, RENDER_HTML);

  it("exists and exports applyHighlightedChunks", () => {
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toMatch(/export\s+function\s+applyHighlightedChunks\b/);
  });

  it("runs every chunk through isSafeHighlightHtml before it touches innerHTML", () => {
    const src = stripComments(readFileSync(path, "utf-8"));
    expect(src).toMatch(/isSafeHighlightHtml/);
    expect(src.indexOf("isSafeHighlightHtml")).toBeLessThan(src.indexOf("innerHTML"));
  });

  it("builds the fragment on a <template> (inert) and swaps the <pre>'s children at once with replaceChildren", () => {
    const src = stripComments(readFileSync(path, "utf-8"));
    expect(src).toMatch(/createElement\(\s*["']template["']\s*\)/);
    expect(src).toMatch(/replaceChildren\(/);
  });

  it("does not use the Markdown renderer or any eval-like API", () => {
    const src = stripComments(readFileSync(path, "utf-8"));
    expect(src).not.toMatch(/\beval\s*\(|new Function\s*\(|renderMarkdown/);
  });
});

describe("§3.14.12-3 (b): the text <pre> is not managed by Svelte, and the uncoloured path never uses HTML (R-466-4)", () => {
  const textView = join(SRC, "routes", "viewer", "_components", "TextView.svelte");

  it("TextView.svelte exists", () => {
    expect(existsSync(textView)).toBe(true);
  });

  it('<pre class="code"> has an action (use:codeContent) and NO Svelte-managed children', () => {
    const src = stripComments(readFileSync(textView, "utf-8"));
    const pre = /<pre\b[^>]*class="code"[^>]*?(\/>|>([\s\S]*?)<\/pre>)/.exec(src);
    expect(pre, '<pre class="code"> must be in TextView.svelte').not.toBeNull();
    expect(pre![0]).toMatch(/use:codeContent/);
    if (pre![2] !== undefined) expect(pre![2].trim()).toBe("");
  });

  it("the uncoloured text is set through textContent (a text node), never an HTML string", () => {
    const files13 = files().filter((f) => /codeContent|code-content/.test(f.text));
    expect(files13.length).toBeGreaterThan(0);
    expect(files13.some((f) => /textContent\s*=/.test(stripComments(f.text)))).toBe(true);
  });
});
