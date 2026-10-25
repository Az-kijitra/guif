// features/fuzzy-search/fuzzy-search-state.svelte.ts: reactive state for in-app fuzzy search modal.

import { fsFuzzySearch, type FuzzyMatchItem } from "$lib/shared/ipc/fuzzy";

export class FuzzySearchState {
  isOpen = $state(false);
  query = $state("");
  items = $state<FuzzyMatchItem[]>([]);
  selectedIndex = $state(0);
  loading = $state(false);
  currentSearchPath = $state("");

  private requestSequence = 0;

  get selectedItem(): FuzzyMatchItem | null {
    if (this.items.length === 0 || this.selectedIndex < 0 || this.selectedIndex >= this.items.length) {
      return null;
    }
    return this.items[this.selectedIndex] ?? null;
  }

  open(path: string): void {
    this.currentSearchPath = path;
    this.query = "";
    this.items = [];
    this.selectedIndex = 0;
    this.isOpen = true;
    this.runSearch("");
  }

  close(): void {
    this.isOpen = false;
    this.query = "";
    this.items = [];
    this.selectedIndex = 0;
    this.loading = false;
    this.requestSequence += 1;
  }

  setQuery(newQuery: string): void {
    this.query = newQuery;
    this.selectedIndex = 0;
    this.runSearch(newQuery);
  }

  moveSelection(delta: number): void {
    if (this.items.length === 0) return;
    const len = this.items.length;
    this.selectedIndex = (this.selectedIndex + delta + len) % len;
  }

  selectIndex(index: number): void {
    if (index >= 0 && index < this.items.length) {
      this.selectedIndex = index;
    }
  }

  private async runSearch(searchQuery: string): Promise<void> {
    const seq = ++this.requestSequence;
    this.loading = true;

    try {
      const results = await fsFuzzySearch({
        path: this.currentSearchPath,
        query: searchQuery,
        maxResults: 100,
      });

      // Ignore stale responses
      if (seq === this.requestSequence) {
        this.items = results;
        this.selectedIndex = 0;
        this.loading = false;
      }
    } catch (e) {
      if (seq === this.requestSequence) {
        this.items = [];
        this.loading = false;
      }
    }
  }
}

export const fuzzySearchState = new FuzzySearchState();
