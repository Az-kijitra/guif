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
