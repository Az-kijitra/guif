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
  private showHidden = false;
  private debounce: ReturnType<typeof setTimeout> | null = null;

  /** SPEC-0300-0024: typing searches once the input has been still for this long (one search per burst). */
  static readonly DEBOUNCE_MS = 150;

  private cancelPending(): void {
    if (this.debounce !== null) {
      clearTimeout(this.debounce);
      this.debounce = null;
    }
  }

  get selectedItem(): FuzzyMatchItem | null {
    if (this.items.length === 0 || this.selectedIndex < 0 || this.selectedIndex >= this.items.length) {
      return null;
    }
    return this.items[this.selectedIndex] ?? null;
  }

  open(path: string, showHidden = false): void {
    this.cancelPending();
    this.showHidden = showHidden;
    this.currentSearchPath = path;
    this.query = "";
    this.items = [];
    this.selectedIndex = 0;
    this.isOpen = true;
    this.runSearch("");
  }

  close(): void {
    this.cancelPending();
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
    this.cancelPending();
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.runSearch(newQuery);
    }, FuzzySearchState.DEBOUNCE_MS);
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
        showHidden: this.showHidden,
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
