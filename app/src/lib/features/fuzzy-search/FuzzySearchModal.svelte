<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { FuzzySearchState } from "./fuzzy-search-state.svelte";
  import type { FuzzyMatchItem } from "$lib/shared/ipc/fuzzy";
  import { FUZZY_SEARCH_MESSAGES } from "./messages";

  interface Props {
    fuzzy: FuzzySearchState;
    onSelect: (item: FuzzyMatchItem) => void;
    onClose: () => void;
  }

  let { fuzzy, onSelect, onClose }: Props = $props();

  let inputEl: HTMLInputElement | undefined = $state();
  let listEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (fuzzy.isOpen) {
      tick().then(() => inputEl?.focus());
    }
  });

  // Scroll active item into view
  $effect(() => {
    const idx = fuzzy.selectedIndex;
    if (listEl && idx >= 0) {
      const activeEl = listEl.querySelector(`[data-index="${idx}"]`);
      activeEl?.scrollIntoView({ block: "nearest" });
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || (e.ctrlKey && e.key === "n")) {
      e.preventDefault();
      fuzzy.moveSelection(1);
    } else if (e.key === "ArrowUp" || (e.ctrlKey && e.key === "p")) {
      e.preventDefault();
      fuzzy.moveSelection(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (fuzzy.selectedItem) {
        onSelect(fuzzy.selectedItem);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  // Split relative path into matching highlighted segments
  function renderHighlightedName(item: FuzzyMatchItem) {
    const text = item.name;
    // Indices in matchIndices are relative to relativePath
    // Find where name starts in relativePath
    const nameStartInRel = item.relativePath.lastIndexOf(item.name);
    if (nameStartInRel < 0 || item.matchIndices.length === 0) {
      return [{ text, match: false }];
    }

    const nameIndices = new Set(
      item.matchIndices
        .filter((idx) => idx >= nameStartInRel && idx < nameStartInRel + text.length)
        .map((idx) => idx - nameStartInRel),
    );

    const segments: { text: string; match: boolean }[] = [];
    let curText = "";
    let curMatch = false;

    for (let i = 0; i < text.length; i++) {
      const isM = nameIndices.has(i);
      if (i === 0) {
        curMatch = isM;
        curText = text[i];
      } else if (isM === curMatch) {
        curText += text[i];
      } else {
        segments.push({ text: curText, match: curMatch });
        curMatch = isM;
        curText = text[i];
      }
    }
    if (curText) {
      segments.push({ text: curText, match: curMatch });
    }
    return segments;
  }

  function getDirPrefix(relativePath: string, name: string): string {
    const lastSlash = relativePath.lastIndexOf("/");
    if (lastSlash >= 0) {
      return relativePath.slice(0, lastSlash);
    }
    return "";
  }
</script>

{#if fuzzy.isOpen}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fuzzy-backdrop" onclick={onClose}>
    <!-- Floating Modal Palette -->
    <div
      class="fuzzy-palette"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label="Quick Open File Search"
      onclick={(e) => e.stopPropagation()}
    >
      <div class="fuzzy-input-wrapper">
        <span class="search-icon" aria-hidden="true">🔍</span>
        <input
          bind:this={inputEl}
          type="text"
          class="fuzzy-input"
          placeholder={FUZZY_SEARCH_MESSAGES.placeholder}
          value={fuzzy.query}
          oninput={(e) => fuzzy.setQuery(e.currentTarget.value)}
          onkeydown={handleKeydown}
        />
        {#if fuzzy.loading}
          <span class="spinner" aria-hidden="true">⏳</span>
        {/if}
      </div>

      <div class="fuzzy-list" bind:this={listEl} role="listbox">
        {#if fuzzy.items.length === 0}
          <div class="empty-notice">
            {fuzzy.loading ? FUZZY_SEARCH_MESSAGES.loading : FUZZY_SEARCH_MESSAGES.empty}
          </div>
        {:else}
          {#each fuzzy.items as item, index (item.path)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="fuzzy-row"
              class:selected={index === fuzzy.selectedIndex}
              data-index={index}
              role="option"
              tabindex="-1"
              aria-selected={index === fuzzy.selectedIndex}
              onclick={() => onSelect(item)}
            >
              <span class="entry-icon" aria-hidden="true">{item.isDir ? "📁" : "📄"}</span>
              <span class="entry-name">
                {#each renderHighlightedName(item) as seg}
                  {#if seg.match}
                    <span class="match-highlight">{seg.text}</span>
                  {:else}
                    <span>{seg.text}</span>
                  {/if}
                {/each}
              </span>
              {#if getDirPrefix(item.relativePath, item.name)}
                <span class="dir-prefix" title={item.relativePath}>
                  {getDirPrefix(item.relativePath, item.name)}
                </span>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .fuzzy-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: var(--ui-backdrop);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 10vh;
  }

  .fuzzy-palette {
    width: 620px;
    max-width: 92vw;
    background: var(--ui-surface);
    border: 1px solid var(--ui-border-active);
    box-shadow: var(--ui-shadow-2);
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--ui-fg);
    font-family: var(--ui-font-family);
    font-size: var(--ui-font-size);
  }

  .fuzzy-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--ui-border);
    background: var(--ui-bg);
  }

  .search-icon {
    font-size: 14px;
    opacity: 0.7;
  }

  .fuzzy-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--ui-fg);
    font-family: inherit;
    font-size: inherit;
  }

  .fuzzy-input::placeholder {
    color: var(--ui-border-inactive);
  }

  .spinner {
    font-size: 12px;
  }

  .fuzzy-list {
    max-height: 380px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  .empty-notice {
    padding: 16px;
    text-align: center;
    color: var(--ui-border-inactive);
  }

  .fuzzy-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    user-select: none;
  }

  .fuzzy-row.selected {
    background: var(--ui-hover);
    color: var(--ui-cursor-fg);
    font-weight: 500;
  }

  .entry-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  .entry-name {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .match-highlight {
    color: var(--ui-border-active);
    font-weight: bold;
    text-decoration: underline;
  }

  .dir-prefix {
    flex: 1;
    min-width: 0;
    margin-left: 8px;
    font-size: 0.9em;
    color: var(--ui-border-inactive);
    opacity: 0.8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: right;
  }

  .fuzzy-row.selected .dir-prefix {
    color: var(--ui-fg);
    opacity: 0.9;
  }
</style>
