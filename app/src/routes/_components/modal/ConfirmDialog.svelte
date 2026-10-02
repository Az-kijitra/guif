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
  class="ui-dialog"
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
  /* Frame (size, padding, border, radius, shadow) is the shared .ui-dialog in app.css. */
  .danger {
    border-color: var(--ui-error);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .body p {
    margin: 4px 0;
  }
  .note {
    color: var(--ui-muted);
  }
  .checkbox {
    display: block;
    margin-top: 8px;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
</style>
