<script lang="ts">
  // features/path-bar/PathBar.svelte -- SPEC-0300-0016 §3 (R-700~R-705).
  // A single always-mounted text input (R-700). Pure presentation: it holds no
  // state and registers NO `onkeydown` handler -- every key is resolved by
  // the single global listener (features/keyboard/key-dispatch.ts, R-14-4,
  // R-760). Focus/blur/input events are forwarded to routes/path-bar-wiring.ts
  // (decision logic: R-704/R-704-1 live there, SPEC-0200-0001 §3.7.10.4).
  interface Props {
    text: string;
    inputEl?: HTMLInputElement;
    onFocus: () => void;
    onBlur: (event: FocusEvent) => void;
    onInput: (value: string) => void;
  }

  let { text, inputEl = $bindable(), onFocus, onBlur, onInput }: Props = $props();
</script>

<input
  bind:this={inputEl}
  type="text"
  class="path-bar"
  aria-label="Current directory"
  spellcheck="false"
  autocomplete="off"
  value={text}
  onfocus={onFocus}
  onblur={onBlur}
  oninput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
/>

<style>
  .path-bar {
    display: block;
    box-sizing: border-box;
    width: 100%;
    font-family: monospace;
  }
</style>
