/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// [静的] Spec: SPEC-0300-0019 W-06 (sort menu items come from the SAME table as the status bar), W-27 (the menu
//   element's aria-label), AC-1202, R-1201 1.
// Architecture: SPEC-0200-0001 §3.13.4: `SortMenu.svelte` drops its own English `LABELS`, uses `sortKeyLabel(key)`
//   and puts `aria-label={REGION_NAMES.sortMenu}` on the `role="menu"` element. Same style as
//   `context-menu-static.test.ts` (read the .svelte source; Svelte component rendering is left to [CDP]).

const source = readFileSync(join(__dirname, "SortMenu.svelte"), "utf-8");
const script = /<script[^>]*>([\s\S]*?)<\/script>/.exec(source)?.[1] ?? "";

describe("SortMenu.svelte (W-06 / W-27)", () => {
  it("has no table of its own (`LABELS`) and no English sort-key names", () => {
    expect(source).not.toMatch(/\bLABELS\b/);
    for (const word of ["Name", "Size", "Type", "Modified"]) {
      expect(script, word).not.toMatch(new RegExp(`["'\`]${word}["'\`]`));
    }
  });

  it("takes the item text from `sortKeyLabel(key)` (the table the status bar uses)", () => {
    expect(source).toMatch(/sortKeyLabel\s*\(\s*key\s*\)/);
    expect(script).toMatch(/\bsortKeyLabel\b[\s\S]*from\s+["']\.\/sort["']/);
  });

  it("the role=\"menu\" element carries `aria-label={REGION_NAMES.sortMenu}` (value: 並び替えメニュー)", () => {
    expect(source).toMatch(/<div[^>]*class="sort-menu"[^>]*role="menu"[^>]*>|<div[^>]*role="menu"[^>]*>/);
    const menuTag = /<div[^>]*role="menu"[^>]*>/.exec(source)?.[0] ?? "";
    expect(menuTag).toMatch(/aria-label=\{\s*REGION_NAMES\.sortMenu\s*\}/);
    expect(script).toMatch(/REGION_NAMES[\s\S]*from\s+["']\$lib\/shared\/messages["']/);
  });
});
