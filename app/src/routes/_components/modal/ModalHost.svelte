<script lang="ts">
  // Renders the single modal slot's current dialog (SPEC-0200-0001 §3.3.2/
  // §3.3.3). Presentation only: the state lives in shared/state/modal-host
  // and is passed in through props (this component never imports it). The
  // active dialog's root element is exposed via bind:dialogEl so routes can
  // sequence .focus() (§3.3.2). Rendered OUTSIDE <main> (which is inert while
  // a modal is open).
  import type { ConfirmSpec, FormSpec, ModalIntent, ModalTop, ProgressSpec } from "$lib/shared/state/modal-host.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import FormDialog from "./FormDialog.svelte";
  import ProgressDialog from "./ProgressDialog.svelte";

  interface Props {
    top: ModalTop | null;
    dialogEl?: HTMLDivElement;
    dispatch: (intent: ModalIntent) => void;
    setFieldValue: (fieldId: string, value: string) => void;
    setChecked: (checked: boolean) => void;
  }

  let { top, dialogEl = $bindable(), dispatch, setFieldValue, setChecked }: Props = $props();
</script>

{#if top}
  <div class="backdrop ui-root">
    {#key top.id}
      {#if top.kind === "confirm"}
        <ConfirmDialog
          bind:rootEl={dialogEl}
          spec={top.spec as ConfirmSpec}
          checked={top.checked ?? false}
          onPress={(id) => dispatch({ type: "pressButton", id })}
          onCheckedChange={setChecked}
        />
      {:else if top.kind === "form"}
        <FormDialog
          bind:rootEl={dialogEl}
          spec={top.spec as FormSpec}
          values={top.values ?? {}}
          error={top.error ?? null}
          submitting={top.submitting ?? false}
          onSubmit={() => dispatch({ type: "submit" })}
          onCancel={() => dispatch({ type: "cancel" })}
          onValueChange={setFieldValue}
        />
      {:else}
        <ProgressDialog
          bind:rootEl={dialogEl}
          spec={top.spec as ProgressSpec}
          label={top.label ?? ""}
          index={top.index ?? 0}
          total={top.total ?? 0}
          canCancel={top.canCancel ?? true}
          onCancel={() => dispatch({ type: "cancel" })}
        />
      {/if}
    {/key}
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ui-backdrop);
    z-index: 1000;
  }
</style>
