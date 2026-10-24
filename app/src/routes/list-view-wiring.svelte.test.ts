import { describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0023 R-1792 (the page follows the cursor), R-1791 (min_col_width), R-1804, SPEC-0300-0009 R-59-1 (page_up / page_down move by `rows`),
//   R-116 (the displayed count is the FILTERED count), R-956 replaced.
// Architecture: SPEC-0200-0001 §3.18.7 / §3.18.15 SHOULD-2: \`createListView\` (routes/list-view-wiring.svelte.ts) calls
//   deps.fileList.layout(frameWidth, frameHeight, entryCount, rowHeight, focusIndex, minColWidth, ch)
//   where focusIndex = the position of \`deps.fileList.focusedPath\` in the FILTERED array (-1 when it is not shown), minColWidth and ch come from
//   \`appearanceState\` (the file-list feature itself never reads appearanceState), rowHeight from readRowHeightPx(), and the size falls back to 800 x 400
//   when the frame is not measured yet. \`setPageRows(layout.rows)\` keeps R-59-1 in step. \`+page.svelte\` is not touched (399 lines).
//   Assumed dependency shape (reported): \`ListViewDeps.fileList\` gains the getter \`focusedPath: string\`.
//
// Module under test: ./list-view-wiring.svelte.ts (existing; the \`layout\` call changes)

vi.mock("$lib/features/file-list/text-measure", () => ({ readRowHeightPx: () => 21 }));
vi.mock("$lib/shared/state/appearance-state.svelte", () => ({ appearanceState: { minColWidth: 30, ch: 9.5 } }));

import { createListView } from "./list-view-wiring.svelte";

const entry = (name: string) => ({ path: `C:\\w\\${name}`, name, entryType: "file" as const, ext: "", size: 1, modified: "0", hidden: false });

function setup(over: { names?: string[]; focused?: string; search?: { active: boolean; query: string; regexMode: boolean }; size?: { width: number; height: number } } = {}) {
  const layout = vi.fn((...args: unknown[]) => ({ rows: 20, args }));
  const setPageRows = vi.fn();
  const names = over.names ?? ["a.txt", "b.txt", "c.txt"];
  const deps = {
    fileList: { entries: names.map(entry), focusedPath: over.focused ?? "C:\\w\\b.txt", layout, setPageRows },
    search: over.search ?? { active: false, query: "", regexMode: false },
    size: () => over.size ?? { width: 1000, height: 420 },
  };
  // vitest compiles Svelte for the server: $derived is evaluated, $effect is a no-op (so R-59-1 setPageRows is the E2E / page test, not here).
  const view = createListView(deps as never);
  return { view, layout, setPageRows, cleanup: () => {} };
}

describe("createListView: the layout call (SHOULD-2)", () => {
  it("passes (width, height, filtered count, row height, focusIndex, minColWidth, ch)", () => {
    const s = setup();
    void s.view.layout;
    expect(s.layout).toHaveBeenCalledWith(1000, 420, 3, 21, 1, 30, 9.5);
    s.cleanup();
  });

  it("focusIndex is the position in the FILTERED array: a search that hides earlier entries moves it", () => {
    const s = setup({ names: ["a.txt", "b.txt", "bb.txt"], focused: "C:\\w\\bb.txt", search: { active: true, query: "b", regexMode: false } });
    void s.view.layout;
    expect(s.layout).toHaveBeenCalledWith(1000, 420, 2, 21, 1, 30, 9.5);
    s.cleanup();
  });

  it("focusIndex is -1 when the focused entry is filtered out", () => {
    const s = setup({ names: ["a.txt", "b.txt"], focused: "C:\\w\\a.txt", search: { active: true, query: "b", regexMode: false } });
    void s.view.layout;
    expect(s.layout.mock.calls.at(-1)?.[4]).toBe(-1);
    s.cleanup();
  });

  it("an unmeasured frame falls back to 800 x 400", () => {
    const s = setup({ size: { width: 0, height: 0 } });
    void s.view.layout;
    expect(s.layout.mock.calls.at(-1)?.slice(0, 2)).toEqual([800, 400]);
    s.cleanup();
  });
});
