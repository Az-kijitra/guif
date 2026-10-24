<script lang="ts">
  // features/path-bar/PathBar.svelte -- SPEC-0300-0016 §3 (R-700~R-705);
  // SPEC-0300-0017 §6 (R-930~R-933: label "PATH" + input, editing look).
  // A single always-mounted text input (R-700). Pure presentation: it holds no
  // state and registers NO `onkeydown` handler -- every key is resolved by
  // the single global listener (features/keyboard/key-dispatch.ts, R-14-4,
  // R-760). Focus/blur/input events are forwarded to routes/path-bar-wiring.ts
  // (decision logic: R-704/R-704-1 live there, SPEC-0200-0001 §3.7.10.4).
  import { PATH_BAR_MESSAGES } from "./messages";

  interface Props {
    text: string;
    inputEl?: HTMLInputElement;
    onFocus: () => void;
    onBlur: (event: FocusEvent) => void;
    onInput: (value: string) => void;
  }

  let { text, inputEl = $bindable(), onFocus, onBlur, onInput }: Props = $props();
</script>

<div class="path-bar-row">
  <!-- R-930: display only; the input keeps its own accessible name. -->
  <span class="path-label" aria-hidden="true">PATH</span>
  <input
    bind:this={inputEl}
    type="text"
    class="path-bar"
    aria-label={PATH_BAR_MESSAGES.inputLabel}
    spellcheck="false"
    autocomplete="off"
    value={text}
    onfocus={onFocus}
    onblur={onBlur}
    oninput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
  />
</div>

<style>
  .path-bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    box-sizing: border-box;
    /* SPEC-0300-0023 R-1760 / R-1814: a band without a frame; the label has the tree's current-folder colour. */
    background: var(--ui-surface-2);
  }
  .path-label {
    font-size: var(--ui-font-size);
    font-weight: bold;
    color: var(--ui-tree-current);
  }
  .path-bar {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 1px solid var(--ui-border-strong);
    border-radius: 4px;
    background: var(--ui-surface-2);
    font-family: var(--ui-font-mono);
    font-size: var(--ui-font-size);
    text-overflow: ellipsis;
    outline-style: none;
  }
  /* R-932: only while the input has keyboard focus (= editing). */
  .path-bar:focus {
    background: var(--ui-surface);
    outline: 1px solid var(--ui-focused);
    outline-offset: -1px;
  }
</style>
