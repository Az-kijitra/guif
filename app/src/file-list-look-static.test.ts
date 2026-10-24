/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0023 R-1760 .. R-1765 (frame + heading, `.pane` / `.pane-title`), R-1780 .. R-1790 (the row: mark column, `<DIR>`, colours, no
//   emoji, no row separator, `項目なし` as text on the first row), R-1792 / R-1793 / R-1794 (page-wise drawing, vertical line on all but the last drawn column),
//   R-1800 .. R-1804 (tree: ▾ ▸, indent in ch, width as a percentage), R-1753 / R-1754 (list font + 21px row via `--list-*` variables), R-1761 (the frame colour and
//   the cursor row use the SAME focus boolean), AC-1760, AC-1781, AC-1783, AC-1793, AC-1800, AC-1804.
// Architecture: SPEC-0200-0001 §3.18.5 .. §3.18.8, §3.18.12, §3.18.15 SHOULD-4. Svelte components are not rendered (environment: node), so their STRUCTURE is
//   checked on the source; the measured values are the E2E's. Component names are those of the design (routes/_components/FileListRow|FileListPanel|FileListBody,
//   features/file-list/TreePanel).

const SRC = resolve(__dirname);
const read = (rel: string): string => readFileSync(join(SRC, rel), "utf-8");
const style = (code: string): string => [...code.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const markup = (code: string): string => code.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ROW = "routes/_components/FileListRow.svelte";
const PANEL = "routes/_components/FileListPanel.svelte";
const BODY = "routes/_components/FileListBody.svelte";
const TREE = "lib/features/file-list/TreePanel.svelte";

describe("FileListRow.svelte (R-1780 .. R-1788)", () => {
  const code = strip(read(ROW));

  it("R-1780: no emoji icons (📁 / 📄) and no edge markers inside the name cell (R-1795)", () => {
    expect(code).not.toMatch(/📁|📄/);
    expect(code).not.toMatch(/class="marker"|markerLeft|markerRight/);
  });

  it("R-1781: the size cell comes from formatSizeCell (`<DIR>` for a folder); the executable test is isExecutableName", () => {
    expect(code).toContain("formatSizeCell");
    expect(code).toContain("isExecutableName");
  });

  it("R-1783: the cells sit on rowGridTemplate (2ch / flexible / 10ch / 16ch) with a 1ch gap and no side padding", () => {
    expect(code).toContain("rowGridTemplate");
    expect(style(read(ROW))).toMatch(/column-gap:\s*1ch/);
  });

  it("R-1784 / AC-1781: no border-top on a row, and the old --ui-border-muted / --ui-muted cell colours are gone (the whole row has one colour)", () => {
    const css = style(read(ROW));
    expect(css).not.toMatch(/border-top/);
    expect(css).not.toContain("--ui-border-muted");
    expect(css).not.toContain("--ui-muted");
    expect(css).not.toMatch(/font-size:\s*11px/);
  });

  it("R-1785: the colour classes use the new variables (cursor / selected / dir / exe)", () => {
    const css = style(read(ROW));
    for (const v of ["--ui-cursor-bg", "--ui-cursor-fg", "--ui-selected-fg", "--ui-folder", "--ui-executable", "--ui-fg"]) expect(css, v).toContain(v);
    for (const c of [".cursor", ".selected", ".dir", ".exe"]) expect(css, c).toContain(c);
  });

  it("R-1786: with no list focus the cursor row has an outline of --ui-border-active and no background", () => {
    const css = style(read(ROW));
    expect(css).toMatch(/outline:\s*1px solid var\(--ui-border-active\)/);
    expect(css).toMatch(/outline-offset:\s*-1px/);
  });

  it("R-1753: font from --ui-font / --ui-font-size (no 12px / --ui-font-mono)", () => {
    const css = style(read(ROW)) + style(read(PANEL));
    expect(css).toContain("var(--ui-font)");
    expect(css).toContain("var(--ui-font-size)");
    expect(css).not.toMatch(/font:\s*12px/);
    expect(css).not.toContain("--ui-font-mono");
  });

  it("R-1788: the name is shortened by ellipsizeFileName with a measurer (no CSS text-overflow cut)", () => {
    expect(code).toContain("ellipsizeFileName");
  });

  it("R-1789: role=option and aria-selected stay", () => {
    expect(read(ROW)).toMatch(/role="option"/);
    expect(read(ROW)).toMatch(/aria-selected/);
  });
});

describe("FileListPanel.svelte (R-1790, R-1792 .. R-1795, R-1760 .. R-1762)", () => {
  const raw = read(PANEL);
  const code = strip(raw);
  const css = style(raw);

  it("R-1793: no horizontal scrolling machinery (column-scroll, scrollLeft, edge-marker rows, scroll snapping)", () => {
    expect(code).not.toMatch(/column-scroll|columnScroll|scrollLeft|computeEdgeMarkerRows|scroll-snap|overflow-x:\s*(auto|scroll)/);
  });

  it("R-1792: only the drawn page is rendered (slice from the geometry's first .. last)", () => {
    expect(code).toMatch(/\.slice\(/);
    expect(code).toMatch(/colWidths/);
  });

  it("R-1794 / AC-1793: all but the last drawn column get `border-right: 1px solid var(--ui-border)` inside the column width (border-box); no column gap", () => {
    expect(css).toMatch(/border-right:\s*1px solid var\(--ui-border\)/);
    expect(css).toMatch(/box-sizing:\s*border-box/);
    expect(css).not.toMatch(/column-gap:\s*16px|gap:\s*16px/);
  });

  it("R-1790 / AC-1783 / SHOULD-4: `項目なし` is plain text placed ON the first row (absolute), click-through, coloured --ui-border, no frame", () => {
    const rule = /\.list-empty\s*\{([^}]*)\}/g;
    const body = [...css.matchAll(rule)].map((m) => m[1]).join("\n");
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/pointer-events:\s*none/);
    expect(body).toContain("var(--ui-border)");
    expect(body).not.toMatch(/\bborder:\s*1px/);
    expect(body).not.toMatch(/background/);
  });

  it("R-1760 .. R-1762 / R-1765: the frame is `.pane` (+ `.active` from the focus boolean) with a `.pane-title` heading (presentation only) from listHeadingText", () => {
    expect(markup(raw)).toMatch(/class="[^"]*\bpane\b/);
    expect(markup(raw)).toMatch(/pane-title/);
    expect(code).toContain("listHeadingText");
    expect(markup(raw)).toMatch(/role="presentation"/);
  });

  it("R-1761 / MINOR-9: the frame colour and the cursor row come from ONE focus boolean; no `:focus-within` / `:focus` outline of the container (R-968 replaced)", () => {
    expect(css).not.toMatch(/:focus-within/);
    expect(css).not.toMatch(/\.file-list:focus\s*\{[^}]*outline/);
    expect(code).toMatch(/onfocus/);
    expect(code).toMatch(/onblur/);
  });

  it("§3.18.6: ch is measured (createCanvasMeasurer / measureText of `0`) and stored with appearanceState.setCh", () => {
    expect(code).toContain("setCh");
    expect(code).toMatch(/fonts\.ready/);
  });
});

describe("TreePanel.svelte (R-1800 .. R-1804)", () => {
  const raw = read(TREE);
  const code = strip(raw);
  const css = style(raw);

  it("R-1800: marks are ▾ (expanded) and ▸ (collapsed); the old ▼ / ▶ are gone", () => {
    expect(code).toContain("▾");
    expect(code).toContain("▸");
    expect(code).not.toMatch(/▼|▶/);
  });

  it("R-1801: the indent is treeIndentCh (ch), not pixels; no fixed 220px width", () => {
    expect(code).toContain("treeIndentCh");
    expect(code).not.toContain("treeIndentPx");
    expect(css).not.toMatch(/width:\s*220px/);
  });

  it("R-1803: the colours are cursor / current / cursor-idle by variable; the old --ui-selected background is gone", () => {
    for (const v of ["--ui-cursor-bg", "--ui-cursor-fg", "--ui-tree-current", "--ui-tree-cursor"]) expect(css, v).toContain(v);
    expect(css).not.toContain("--ui-selected");
  });

  it("R-1764: the heading is treeHeadingText inside `.pane-title`; the font is the list font", () => {
    expect(code).toContain("treeHeadingText");
    expect(markup(raw)).toMatch(/pane-title/);
    expect(css).toContain("var(--ui-font)");
  });

  it("R-1761: the frame class `active` follows treeState.hasFocus (the same value as the cursor row)", () => {
    expect(code).toMatch(/hasFocus/);
  });
});

describe("FileListBody.svelte (R-1804)", () => {
  const code = strip(read(BODY));

  it("the tree width is treePanelWidthPx(bodyWidth, appearanceState.treeWidthPercent) with the body's measured width", () => {
    expect(code).toContain("treePanelWidthPx");
    expect(code).toContain("treeWidthPercent");
    expect(code).toMatch(/bind:clientWidth/);
  });

  it("no TREE_PANEL_WIDTH / 220 px any more", () => {
    expect(code).not.toContain("TREE_PANEL_WIDTH");
    expect(code).not.toMatch(/\b220\b/);
  });
});

describe("app.css (R-1753 / R-1754 / R-1760 / R-1813, §3.18.5)", () => {
  const css = strip(read("app.css"));

  it("defaults of the list variables: --list-row-height 16px, --ui-line-height 16px, --ui-font-size 12px, --ui-font with the R-1750 stack", () => {
    expect(css).toMatch(/--list-row-height:\s*16px/);
    expect(css).toMatch(/--ui-line-height:\s*16px/);
    expect(css).toMatch(/--ui-font-size:\s*12px/);
    expect(css).toMatch(/--ui-font:\s*"JetBrains Mono", "JetBrainsMono NFM", "JetBrainsMono NF", "Cascadia Mono", "Consolas", "BIZ UDGothic", monospace/);
  });

  it("the shared classes .pane, .pane.active and .pane-title exist", () => {
    expect(css).toMatch(/\.pane\s*[,{]/);
    expect(css).toMatch(/\.pane\.active/);
    expect(css).toMatch(/\.pane-title/);
  });

  it("the pane frame is 1px and square; active uses --ui-border-active, inactive --ui-border", () => {
    expect(css).toContain("var(--ui-border-active)");
    expect(css).toContain("var(--ui-border)");
    const pane = [...css.matchAll(/\.pane\s*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
    expect(pane).not.toMatch(/border-radius:\s*[1-9]/);
  });

  it("R-1813: .ui-dialog is square (border-radius: 0) with a --ui-border-active frame", () => {
    const dialog = [...css.matchAll(/\.ui-dialog\s*\{([^}]*)\}/g)].map((m) => m[1]).join("\n");
    expect(dialog).toMatch(/border-radius:\s*0/);
    expect(dialog).toContain("var(--ui-border-active)");
  });
});
