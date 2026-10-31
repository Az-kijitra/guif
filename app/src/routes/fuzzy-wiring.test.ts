// [単体] SPEC-0300-0024: choosing a result navigates to a path the backend accepts, and closing returns the focus.
import { describe, expect, it, vi } from "vitest";

vi.mock("svelte", async (orig) => ({ ...(await orig<typeof import("svelte")>()), tick: () => Promise.resolve() }));

import { createFuzzySearchWiring, parentDirOf } from "./fuzzy-wiring";

describe("parentDirOf", () => {
  it("returns the containing folder of a native path", () => {
    expect(parentDirOf("C:\\Users\\toshi\\note.txt")).toBe("C:\\Users\\toshi");
  });
  it("a file directly under a drive yields the drive root with its separator", () => {
    expect(parentDirOf("C:\\note.txt")).toBe("C:\\");
    expect(parentDirOf("D:/note.txt")).toBe("D:\\");
  });
  it("UNC paths keep the server and share", () => {
    expect(parentDirOf("\\\\server\\share\\dir\\a.txt")).toBe("\\\\server\\share\\dir");
  });
  it("no separator: no parent", () => {
    expect(parentDirOf("note.txt")).toBeNull();
  });
});

function setUp(entries: { path: string }[]) {
  const navigate = vi.fn(() => Promise.resolve({ ok: true }) as never);
  const focusIndex = vi.fn();
  const close = vi.fn();
  const focusContainer = vi.fn();
  const wiring = createFuzzySearchWiring({
    fuzzySearchState: { open: vi.fn(), close } as never,
    fileListState: { currentPath: "C:\\Users", navigate, focusIndex, entries, showHidden: () => false } as never,
    afterUserNavigation: (p) => p,
    focusContainer,
    closeMenus: vi.fn(),
  });
  return { wiring, navigate, focusIndex, close, focusContainer };
}

describe("handleFuzzySelect / closeFuzzySearch", () => {
  it("a file: navigates to its parent and focuses the row with the same path", async () => {
    const s = setUp([{ path: "C:\\Users\\toshi\\a.txt" }, { path: "C:\\Users\\toshi\\note.txt" }]);
    await s.wiring.handleFuzzySelect({ path: "C:\\Users\\toshi\\note.txt", isDir: false } as never);
    expect(s.navigate).toHaveBeenCalledWith("C:\\Users\\toshi");
    expect(s.focusIndex).toHaveBeenCalledWith(1);
    expect(s.focusContainer).toHaveBeenCalled();
  });
  it("a folder: navigates into it", async () => {
    const s = setUp([]);
    await s.wiring.handleFuzzySelect({ path: "C:\\Users\\toshi\\src", isDir: true } as never);
    expect(s.navigate).toHaveBeenCalledWith("C:\\Users\\toshi\\src");
  });
  it("closing returns the focus to the list", () => {
    const s = setUp([]);
    s.wiring.closeFuzzySearch();
    expect(s.close).toHaveBeenCalled();
    expect(s.focusContainer).toHaveBeenCalled();
  });
});
