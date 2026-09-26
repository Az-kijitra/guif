<script lang="ts">
  // Thin presentation of a ConfirmSpec (SPEC-0200-0001 §3.3.3): no logic of
  // its own. Keys are handled by the global listener (R-10); the default
  // button carries data-modal-initial so routes focuses it on open (R-35).
  import type { ConfirmSpec } from "$lib/shared/state/modal-host.svelte";

  interface Props {
    spec: ConfirmSpec;
    checked: boolean;
    rootEl?: HTMLDivElement;
    onPress: (buttonId: string) => void;
    onCheckedChange: (checked: boolean) => void;
  }

  let { spec, checked, rootEl = $bindable(), onPress, onCheckedChange }: Props = $props();
</script>

<div
  bind:this={rootEl}
  class="dialog"
  class:danger={spec.tone === "danger"}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <h2 id="modal-title">{spec.title}</h2>
  <div class="body">
    {#each spec.lines as line, i (i)}
      <p>{line}</p>
    {/each}
    {#if spec.note}
      <p class="note">{spec.note}</p>
    {/if}
    {#if spec.checkbox}
      <label class="checkbox">
        <input
          type="checkbox"
          {checked}
          onchange={(event) => onCheckedChange((event.currentTarget as HTMLInputElement).checked)}
        />
        {spec.checkbox.label}
      </label>
    {/if}
  </div>
  <div class="buttons">
    {#each spec.buttons as button (button.id)}
      <button
        type="button"
        data-modal-initial={button.id === spec.defaultButtonId ? "" : undefined}
        onclick={() => onPress(button.id)}
      >
        {button.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .dialog {
    min-width: 20rem;
    max-width: 32rem;
    padding: 1rem 1.25rem;
    background: #fff;
    border: 1px solid #888;
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }
  .dialog.danger {
    border-color: #b00020;
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .body p {
    margin: 0.2rem 0;
    word-break: break-all;
  }
  .note {
    color: #555;
  }
  .checkbox {
    display: block;
    margin-top: 0.5rem;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
</style>
