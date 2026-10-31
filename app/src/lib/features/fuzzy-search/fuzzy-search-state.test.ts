import { describe, expect, it, vi } from "vitest";
import { FuzzySearchState } from "./fuzzy-search-state.svelte";

vi.mock("$lib/shared/ipc/fuzzy", () => ({
  fsFuzzySearch: vi.fn().mockResolvedValue([
    { path: "C:/app/src/lib.rs", relativePath: "src/lib.rs", name: "lib.rs", isDir: false, matchIndices: [4, 5, 6], score: 100 },
    { path: "C:/app/src/main.rs", relativePath: "src/main.rs", name: "main.rs", isDir: false, matchIndices: [4, 5, 6, 7], score: 90 },
  ]),
}));

describe("FuzzySearchState", () => {
  it("initial state is closed and empty", () => {
    const state = new FuzzySearchState();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe("");
    expect(state.items).toEqual([]);
    expect(state.selectedItem).toBeNull();
  });

  it("open() opens modal and resets query", async () => {
    const state = new FuzzySearchState();
    state.open("C:/app");
    expect(state.isOpen).toBe(true);
    expect(state.currentSearchPath).toBe("C:/app");
    expect(state.query).toBe("");
  });

  it("moveSelection() cycles through items", () => {
    const state = new FuzzySearchState();
    state.items = [
      { path: "a", relativePath: "a", name: "a", isDir: false, matchIndices: [], score: 10 },
      { path: "b", relativePath: "b", name: "b", isDir: false, matchIndices: [], score: 5 },
    ];
    state.selectedIndex = 0;
    expect(state.selectedItem?.name).toBe("a");

    state.moveSelection(1);
    expect(state.selectedIndex).toBe(1);
    expect(state.selectedItem?.name).toBe("b");

    state.moveSelection(1); // wrap around
    expect(state.selectedIndex).toBe(0);

    state.moveSelection(-1); // wrap back
    expect(state.selectedIndex).toBe(1);
  });

  it("SPEC-0300-0024: the search follows the list's hidden-files setting given to open()", async () => {
    const { fsFuzzySearch } = await import("$lib/shared/ipc/fuzzy");
    vi.mocked(fsFuzzySearch).mockClear();
    const state = new FuzzySearchState();
    state.open("C:\\app", true);
    expect(fsFuzzySearch).toHaveBeenCalledWith(expect.objectContaining({ path: "C:\\app", query: "", showHidden: true }));
  });

  it("SPEC-0300-0024: typing searches once the input has been still for 150ms (one search for a burst)", async () => {
    vi.useFakeTimers();
    try {
      const { fsFuzzySearch } = await import("$lib/shared/ipc/fuzzy");
      const state = new FuzzySearchState();
      state.open("C:\\app", false);
      vi.mocked(fsFuzzySearch).mockClear();
      state.setQuery("m");
      state.setQuery("ma");
      state.setQuery("mai");
      expect(fsFuzzySearch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(149);
      expect(fsFuzzySearch).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(fsFuzzySearch).toHaveBeenCalledTimes(1);
      expect(fsFuzzySearch).toHaveBeenCalledWith(expect.objectContaining({ query: "mai", showHidden: false }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("close() cancels a pending search", async () => {
    vi.useFakeTimers();
    try {
      const { fsFuzzySearch } = await import("$lib/shared/ipc/fuzzy");
      const state = new FuzzySearchState();
      state.open("C:\\app", false);
      vi.mocked(fsFuzzySearch).mockClear();
      state.setQuery("x");
      state.close();
      await vi.advanceTimersByTimeAsync(500);
      expect(fsFuzzySearch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("close() resets state", () => {
    const state = new FuzzySearchState();
    state.open("C:/app");
    state.close();
    expect(state.isOpen).toBe(false);
    expect(state.query).toBe("");
    expect(state.items).toEqual([]);
    expect(state.selectedIndex).toBe(0);
  });
});
