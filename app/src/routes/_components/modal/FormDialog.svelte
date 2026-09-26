<script lang="ts">
  // Thin presentation of a FormSpec (SPEC-0200-0001 §3.3.3): no logic of its
  // own. Enter/Escape are handled by the global listener (R-61); the
  // "submitting" state disables the OK button and cancel is ignored by the
  // state module (MUST-63).
  import type { FormSpec } from "$lib/shared/state/modal-host.svelte";

  interface Props {
    spec: FormSpec;
    values: Record<string, string>;
    error: string | null;
    submitting: boolean;
    rootEl?: HTMLDivElement;
    onSubmit: () => void;
    onCancel: () => void;
    onValueChange: (fieldId: string, value: string) => void;
  }

  let { spec, values, error, submitting, rootEl = $bindable(), onSubmit, onCancel, onValueChange }: Props = $props();

  // The first text field receives the initial focus (falls back to the first field).
  const initialId = $derived(
    (spec.fields.find((f) => f.type === "text") ?? spec.fields[0])?.id,
  );

  // R-60-1: the initial selection is applied on the input's own mount (an
  // operation on the element itself, not focus control).
  function applySelection(node: HTMLInputElement, selection: [number, number] | undefined) {
    if (selection) node.setSelectionRange(selection[0], selection[1]);
  }
</script>

<div
  bind:this={rootEl}
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <h2 id="modal-title">{spec.title}</h2>
  <div class="body">
    {#each spec.fields as field (field.id)}
      <label class="field">
        <span>{field.label}</span>
        {#if field.type === "text"}
          <input
            type="text"
            value={values[field.id] ?? ""}
            data-modal-initial={field.id === initialId ? "" : undefined}
            use:applySelection={field.selection}
            oninput={(event) => onValueChange(field.id, (event.currentTarget as HTMLInputElement).value)}
          />
        {:else}
          <select
            value={values[field.id] ?? field.value}
            data-modal-initial={field.id === initialId ? "" : undefined}
            onchange={(event) => onValueChange(field.id, (event.currentTarget as HTMLSelectElement).value)}
          >
            {#each field.options as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {/if}
      </label>
    {/each}
    {#if error}
      <p role="alert" class="error">{error}</p>
    {/if}
  </div>
  <div class="buttons">
    <button type="button" aria-disabled={submitting} onclick={onSubmit}>{spec.submitLabel}</button>
    <button type="button" aria-disabled={submitting} onclick={onCancel}>{spec.cancelLabel}</button>
  </div>
</div>

<style>
  .dialog {
    min-width: 22rem;
    max-width: 32rem;
    padding: 1rem 1.25rem;
    background: #fff;
    border: 1px solid #888;
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.35rem 0;
  }
  .field span {
    min-width: 3.5rem;
  }
  .field input,
  .field select {
    flex: 1;
    font-family: monospace;
  }
  .error {
    color: #b00020;
    margin: 0.35rem 0 0;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
</style>
