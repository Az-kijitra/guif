<script lang="ts">
  // routes/+page.svelte (SPEC-0200-0001 §4.1 path 2: composition layer only —
  // no state, no business logic of its own). It wires two features together:
  // - features/file-list/list-state.svelte.ts owns the directory listing,
  //   selection and focus state and exposes action functions.
  // - features/keyboard/key-dispatch.ts owns "which key maps to which
  //   action id"; this file only forwards resolved action ids to the
  //   file-list feature's own action functions (§4.3: keyboard never
  //   implements the actions themselves).
  import { onMount, onDestroy } from "svelte";
  import { attachGlobalKeydownListener, dispatchKeydown, type DispatchContext } from "$lib/features/keyboard/key-dispatch";
  import type { KeydownLikeEvent } from "$lib/features/keyboard/keymap-resolve";
  import { fileListState } from "$lib/features/file-list/list-state.svelte";
  import { computeFileListAria, computeRowAria } from "$lib/features/file-list/aria";

  let containerEl: HTMLDivElement | undefined = $state();
  let containerWidth = $state(0);
  let containerHeight = $state(0);

  let layout = $derived(fileListState.layout(containerWidth || 800, containerHeight || 400));

  let keydownHandler: ((event: Event) => void) | undefined;

  onMount(() => {
    void fileListState.loadDirectory(".");

    keydownHandler = (event: Event) => {
      const ke = event as KeyboardEvent;
      const keydownLike: KeydownLikeEvent = {
        key: ke.key,
        ctrlKey: ke.ctrlKey,
        altKey: ke.altKey,
        shiftKey: ke.shiftKey,
        metaKey: ke.metaKey,
      };

      const ctx: DispatchContext = {
        isSettingsOpen: false,
        isOverlayOpen: false,
        isMenuBarActive: false,
        isTreeFocused: false,
        profile: "windows",
        customOverrides: {},
        onHardcodedShortcut: () => false,
        onExitAction: () => false,
        onOverlayKey: () => false,
        onMenuBarKey: () => false,
        onTreeAction: () => false,
        onListAction: (action) => {
          if (action === null) return false;
          switch (action) {
            case "move_up":
              fileListState.moveRow("up");
              return true;
            case "move_down":
              fileListState.moveRow("down");
              return true;
            case "move_left":
              fileListState.moveColumn("left", Math.max(layout.rows, 1));
              return true;
            case "move_right":
              fileListState.moveColumn("right", Math.max(layout.rows, 1));
              return true;
            case "open":
              void fileListState.openFocused();
              return true;
            case "go_parent":
              void fileListState.goParent();
              return true;
            case "select_toggle":
              fileListState.toggleFocused();
              return true;
            default:
              return false;
          }
        },
      };

      const handled = dispatchKeydown(keydownLike, ctx);
      if (handled) {
        ke.preventDefault();
      }
    };

    attachGlobalKeydownListener(window, keydownHandler);
  });

  onDestroy(() => {
    if (keydownHandler !== undefined) {
      window.removeEventListener("keydown", keydownHandler, { capture: true });
    }
  });

  function focusedPath(): string {
    return fileListState.entries[fileListState.focusedIndex]?.path ?? "";
  }
</script>

<main>
  <h1>ReflexFiles Successor — Phase 1</h1>
  <p class="current-path">Current directory: {fileListState.currentPath}</p>

  {#if fileListState.loading}
    <p>Loading…</p>
  {/if}
  {#if fileListState.error}
    <p role="alert" class="error">Error: {fileListState.error}</p>
  {/if}

  <div
    bind:this={containerEl}
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    class="file-list"
    tabindex="0"
    role="listbox"
    aria-multiselectable={computeFileListAria({ focusedPath: focusedPath() })["aria-multiselectable"]}
    aria-activedescendant={computeFileListAria({ focusedPath: focusedPath() })["aria-activedescendant"]}
    style="grid-template-rows: repeat({Math.max(layout.rows, 1)}, 2rem); grid-auto-flow: column;"
  >
    {#each fileListState.entries as entry, index (entry.path)}
      <div
        id={entry.path}
        class="file-list-row"
        class:focused={index === fileListState.focusedIndex}
        role={computeRowAria({ selected: fileListState.selected.has(entry.path) }).role}
        aria-selected={computeRowAria({ selected: fileListState.selected.has(entry.path) })["aria-selected"]}
      >
        <span class="name">{entry.entryType === "dir" ? "📁" : "📄"} {entry.name}</span>
        <span class="size">{entry.entryType === "dir" ? "" : entry.size}</span>
        <span class="modified">{entry.modified}</span>
      </div>
    {/each}
  </div>
</main>

<style>
  main {
    font-family: sans-serif;
    padding: 0.5rem 1rem;
  }
  .current-path {
    font-family: monospace;
  }
  .error {
    color: #b00020;
  }
  .file-list {
    display: grid;
    grid-auto-columns: 352px;
    gap: 0 0.5rem;
    overflow: auto;
    border: 1px solid #ccc;
    padding: 0.25rem;
    min-height: 200px;
  }
  .file-list-row {
    display: grid;
    grid-template-columns: 1fr 72px 140px;
    align-items: center;
    padding: 0 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-list-row.focused {
    outline: 2px solid #2266dd;
    outline-offset: -2px;
  }
  .file-list-row[aria-selected="true"] {
    background: #dbe9ff;
  }
</style>
