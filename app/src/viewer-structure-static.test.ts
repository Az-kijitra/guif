/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的 / 構造] Spec: SPEC-0300-0015 第8版 R-462 / R-462-1 (13px / 20px, two columns: a 72px right-aligned gutter with a 10px right padding, a 1px
//   right border, a background, not selectable) / R-462-2 / R-462-3 (the row pitch is the line height: no per-row elements, no newline text left
//   between rows) / R-462-5 (the Markdown Text zoom scales font, line height AND gutter width), R-463-1 (the tail row), R-483-1 / R-483-2 (the image is
//   laid out at its real size, scroll range = whole image, a direction that fits is centred, the two directions independent), R-481-1 (Ctrl+wheel needs a
//   NON-passive listener), R-483 (drag pan), R-500-8 (the body takes the focus; the buttons do not steal it), R-510-2 (header font 13px, buttons inherit),
//   R-913-4 / R-462 (the fonts are the `--vw-font*` variables, not `sans-serif`).
// Architecture: SPEC-0200-0001 §3.14.3~§3.14.5 and §3.14.12-2 (the page is split: `routes/viewer/_components/TextView.svelte`, `ImageView.svelte`,
//   `highlight-wiring.ts`, `image-interaction.ts`, `focus-wiring.ts`), §3.14.12-4 (a)~(d) (gutter / body gap 8px, body padding kept at 0.5rem).
//   These are the structure tests behind the [CDP] measurements of AC-517~AC-523: they check the CSS the measurements depend on, so a regression is
//   caught without a real window.
//

const VIEWER = resolve(__dirname, "routes", "viewer");
const read = (...p: string[]): string => readFileSync(join(VIEWER, ...p), "utf-8");
const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const styleOf = (svelte: string): string => [...svelte.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();
// +page.svelte together with every component under _components/ (the page is split, so the markup may live in either)
const allViewerSvelte = (): string => {
  const dir = join(VIEWER, "_components");
  const parts = [read("+page.svelte")];
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.endsWith(".svelte")) parts.push(readFileSync(join(dir, f), "utf-8"));
  return parts.join("\n");
};

// declarations of every rule whose selector list contains `selector` (merged, later wins)
function decls(css: string, selector: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripComments(css))) !== null) {
    const sels = m[1].split(",").map((s) => squash(s));
    if (!sels.includes(selector)) continue;
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) out.set(d.slice(0, i).trim(), squash(d.slice(i + 1)).toLowerCase());
    }
  }
  return out;
}

describe("TextView.svelte: the two-column text view (R-462-1, R-462-3, R-463-1)", () => {
  const path = join(VIEWER, "_components", "TextView.svelte");
  const exists = existsSync(path);
  const src = exists ? read("_components", "TextView.svelte") : "";
  const css = styleOf(src);
  const markup = stripComments(src.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "").replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""));

  it("exists", () => {
    expect(exists).toBe(true);
  });

  it("markup: .text-view > .gutter (aria-hidden) + <pre class=\"code\"> + .tail (aria-hidden)", () => {
    expect(markup).toMatch(/class="text-view"/);
    expect(markup).toMatch(/<div\b[^>]*class="gutter"[^>]*aria-hidden="true"|<div\b[^>]*aria-hidden="true"[^>]*class="gutter"/);
    expect(markup).toMatch(/<pre\b[^>]*class="code"/);
    expect(markup).toMatch(/<span\b[^>]*class="tail"[^>]*aria-hidden="true"|<span\b[^>]*aria-hidden="true"[^>]*class="tail"/);
  });

  it("there is no per-row element: no `{#each` over lines and no class=\"line\" / class=\"line-number\" (12万行でも DOM が少ない)", () => {
    expect(markup).not.toMatch(/\{#each/);
    expect(markup).not.toMatch(/class="line(?:-number)?"/);
  });

  it(".text-view is a flex row", () => {
    expect(decls(css, ".text-view").get("display")).toBe("flex");
  });

  it(".gutter: 72px wide, right-aligned, padding-right 10px, 1px right border and a background from the --vw-gutter-* variables, not selectable, pre", () => {
    const d = decls(css, ".gutter");
    expect(d.get("text-align")).toBe("right");
    expect(d.get("padding-right")).toBe("10px");
    expect(d.get("border-right")).toBe("1px solid var(--vw-gutter-border)");
    expect(d.get("background") ?? d.get("background-color")).toBe("var(--vw-gutter-bg)");
    expect(d.get("user-select")).toBe("none");
    expect(d.get("white-space")).toBe("pre");
    const w = d.get("width") ?? d.get("min-width") ?? "";
    expect(w).toMatch(/^(72px|calc\(72px \* var\(--vw-text-scale(?:, ?1)?\)\))$/);
  });

  it(".code: pre, tab size 4, no margin, 8px gap to the border (T-14: left padding 8px)", () => {
    const d = decls(css, ".code");
    expect(d.get("white-space")).toBe("pre");
    expect(d.get("tab-size")).toBe("4");
    expect(d.get("margin")).toBe("0");
    expect(d.get("padding-left")).toBe("8px");
  });

  it("both columns use 13px / 20px and the variable --vw-font-mono (R-462), scaled by --vw-text-scale for the Markdown Text zoom (R-462-5)", () => {
    const text = squash(css);
    expect(text).toMatch(/--vw-text-scale/);
    expect(text).toMatch(/13px/);
    expect(text).toMatch(/20px/);
    expect(text).toMatch(/var\(--vw-font-mono\)/);
    expect(text).toMatch(/calc\(\s*13px \* var\(--vw-text-scale/);
    expect(text).toMatch(/calc\(\s*20px \* var\(--vw-text-scale/);
    expect(text).toMatch(/calc\(\s*72px \* var\(--vw-text-scale/);
    for (const sel of [".gutter", ".code"]) {
      const d = decls(css, sel);
      const fam = `${d.get("font") ?? ""} ${d.get("font-family") ?? ""}`;
      expect(fam, sel).toContain("var(--vw-font-mono)");
    }
  });

  it(".tail: a block 20px high, not selectable (the empty last row of a body that ends with a newline)", () => {
    const d = decls(css, ".tail");
    expect(d.get("display")).toBe("block");
    expect(d.get("height")).toMatch(/^(20px|calc\(20px \* var\(--vw-text-scale(?:, ?1)?\)\))$/);
    expect(d.get("user-select")).toBe("none");
  });

  it("§3.14.12-3 (b): the <pre class=\"code\"> has an action and no Svelte-managed children", () => {
    const pre = /<pre\b[^>]*class="code"[^>]*?(\/>|>([\s\S]*?)<\/pre>)/.exec(markup);
    expect(pre).not.toBeNull();
    expect(pre![0]).toMatch(/use:codeContent/);
    if (pre![2] !== undefined) expect(pre![2].trim()).toBe("");
  });

  it("no colour literal (AC-905): only var(--vw-*)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });
});

describe("ImageView.svelte: real size, centred when smaller, reachable ends (R-483-1, R-483-2)", () => {
  const path = join(VIEWER, "_components", "ImageView.svelte");
  const exists = existsSync(path);
  const src = exists ? read("_components", "ImageView.svelte") : "";
  const css = styleOf(src);
  const markup = stripComments(src.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "").replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""));

  it("exists", () => {
    expect(exists).toBe(true);
  });

  it("never scales with a transform (a transform does not change the layout size, so the scroll range would not grow: the reported defect)", () => {
    expect(stripComments(src)).not.toMatch(/transform\s*:\s*[^;]*scale/);
    expect(stripComments(src)).not.toMatch(/\bzoom\s*:/);
  });

  it(".image-stage: a flex box at least as large as the body, border-box", () => {
    const d = decls(css, ".image-stage");
    expect(d.get("display")).toBe("flex");
    expect(d.get("min-width")).toBe("100%");
    expect(d.get("min-height")).toBe("100%");
    expect(d.get("box-sizing")).toBe("border-box");
  });

  it("centring is by `margin: auto` on the <img>, NOT justify-content / align-items center (those cut off the start when the image overflows)", () => {
    const stage = decls(css, ".image-stage");
    expect(stage.get("justify-content")).not.toBe("center");
    expect(stage.get("align-items")).not.toBe("center");
    const img = new Map([...decls(css, ".image-stage img"), ...decls(css, "img")]);
    expect(img.get("margin")).toBe("auto");
    expect(img.get("flex")).toBe("none");
  });

  it("the <img> is not draggable (the browser's own image drag must not start) and the stage is not selectable", () => {
    expect(markup).toMatch(/<img\b[^>]*draggable="false"/);
    expect(decls(css, ".image-stage").get("user-select")).toBe("none");
  });

  it("the size comes from width / height in px (naturalWidth x scale); Fit is the computed fitScale (R-482 第9版), not a CSS max-width / max-height", () => {
    expect(markup).toMatch(/<img\b[^>]*(?:width|height|style)=/);
    expect(stripComments(src)).toMatch(/fitScale\(/);
    expect(squash(css) + squash(markup)).not.toMatch(/max-width:\s*100%/);
    expect(squash(css) + squash(markup)).not.toMatch(/max-height:\s*100%/);
  });
});

describe("routes/viewer/+page.svelte: composition (R-500-8, R-510-2, R-913-4)", () => {
  const src = read("+page.svelte");
  const css = styleOf(src);

  it("the body is focusable but not a tab stop: tabindex=\"-1\" on .viewer-body", () => {
    expect(allViewerSvelte()).toMatch(/<div\b[^>]*class="viewer-body"[^>]*tabindex="-1"|<div\b[^>]*tabindex="-1"[^>]*class="viewer-body"/);
  });

  it("the header buttons do not take the focus from the body on mouse down (R-500-3 / AC-521)", () => {
    expect(allViewerSvelte()).toMatch(/onmousedown=\{[^}]*preventDefault/);
  });

  it("fonts are the variables: font-family uses var(--vw-font), no `sans-serif` literal (R-913-4, AC-907 第8版)", () => {
    expect(css).toMatch(/var\(--vw-font\)/);
    expect(css).not.toMatch(/font-family\s*:\s*sans-serif/);
  });

  it("R-510-2: buttons inherit the font (`font: inherit`) and the header text is 13px", () => {
    expect(squash(css)).toMatch(/button\s*\{[^}]*font:\s*inherit/);
    expect(squash(css)).toMatch(/font-size:\s*13px|font:\s*13px/);
  });

  it("the header is not selectable, so Ctrl+A (body only) is never widened by header text (§3.14.12-4 (d) insurance)", () => {
    expect(squash(css)).toMatch(/user-select:\s*none/);
  });

  it(".viewer-body keeps its 0.5rem padding for text (R-462-2 / MUST-132 (b)) and some rule sets the padding to 0 for the image display (R-483-1: exact end reach)", () => {
    const body = decls(css, ".viewer-body");
    expect(body.get("padding")).toBe("0.5rem");
    const all = styleOf(allViewerSvelte());
    expect(squash(all)).toMatch(/padding:\s*0(?![.\w])/);
  });

  it("the old positive-only scroll helper is gone: no `action.axis === \"y\" ? action.amount : action.amount`", () => {
    expect(src).not.toMatch(/action\.axis === "y" \? action\.amount : action\.amount/);
  });

  it("no `{#each` over lines remains in the page (the text view is TextView.svelte)", () => {
    expect(stripComments(src)).not.toMatch(/class="line"/);
  });
});

describe("image-interaction.ts: Ctrl+wheel and the drag pan (R-481-1, R-483, AC-519)", () => {
  const path = join(VIEWER, "image-interaction.ts");
  const exists = existsSync(path);
  const src = exists ? stripComments(read("image-interaction.ts")) : "";

  it("exists", () => {
    expect(exists).toBe(true);
  });

  it("the wheel listener is registered with { passive: false } (Svelte's onwheel is passive and cannot preventDefault)", () => {
    expect(src).toMatch(/addEventListener\(\s*["']wheel["'][\s\S]*?passive:\s*false/);
  });

  it("the wheel handler acts on ctrlKey and prevents the default zoom of the WebView", () => {
    expect(src).toMatch(/ctrlKey/);
    expect(src).toMatch(/preventDefault\(\)/);
    expect(src).toMatch(/deltaY/);
  });

  it("the drag pan uses pointer events with capture: pointerdown / pointermove / pointerup / pointercancel and setPointerCapture", () => {
    for (const e of ["pointerdown", "pointermove", "pointerup", "pointercancel", "setPointerCapture"]) expect(src, e).toContain(e);
  });

  it("it calls the pure functions of features/viewer/image-zoom (the arithmetic is not re-implemented here)", () => {
    expect(src).toMatch(/from\s+["']\$lib\/features\/viewer\/image-zoom["']/);
    expect(src).toMatch(/anchoredScroll|panScroll/);
  });

  it("only the left button starts a pan and a click on the scroll bar (target = the body itself) does not", () => {
    expect(src).toMatch(/button\s*[!=]==?\s*0|\.button\b/);
    expect(src).toMatch(/event\.target|e\.target/);
  });
});

describe("focus-wiring.ts: the body takes the keyboard focus by itself (R-500-8, AC-520 page side)", () => {
  const path = join(VIEWER, "focus-wiring.ts");
  const exists = existsSync(path);
  const src = exists ? stripComments(read("focus-wiring.ts")) : "";

  it("exists", () => {
    expect(exists).toBe(true);
  });

  it("focuses the body without scrolling, on the window's focus event and on onFocusChanged", () => {
    expect(src).toMatch(/focus\(\s*\{\s*preventScroll:\s*true\s*\}\s*\)/);
    expect(src).toMatch(/onFocusChanged/);
    expect(src).toMatch(/["']focus["']/);
  });

  it("does not pull the focus away from a header button", () => {
    expect(src).toMatch(/activeElement/);
  });
});
