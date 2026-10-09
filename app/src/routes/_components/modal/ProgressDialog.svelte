<script lang="ts">
  // Thin presentation of a progress modal (SPEC-0200-0001 §3.3.3). The cancel
  // button uses aria-disabled (not disabled) so focus never falls to <body>
  // (SHOULD-79); the state module ignores repeated cancels (R-43).
  import type { ProgressSpec } from "$lib/shared/state/modal-host.svelte";
  import { ROUTE_MESSAGES } from "../../messages";

  interface Props {
    spec: ProgressSpec;
    label: string;
    index: number;
    total: number;
    canCancel: boolean;
    rootEl?: HTMLDivElement;
    onCancel: () => void;
  }

  let { spec, label, index, total, canCancel, rootEl = $bindable(), onCancel }: Props = $props();
</script>

<div
  bind:this={rootEl}
  class="ui-dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  tabindex="-1"
>
  <h2 id="modal-title">{spec.title}</h2>
  <div class="body">
    <p role="status">{label}</p>
    <progress max={total > 0 ? total : 1} value={index}></progress>
  </div>
  <div class="buttons">
    <button type="button" data-modal-initial aria-disabled={!canCancel} onclick={onCancel}>
      {canCancel ? spec.cancelLabel : ROUTE_MESSAGES.cancelling}
    </button>
  </div>
</div>

<style>
  /* Frame (size, padding, border, radius, shadow) is the shared .ui-dialog in app.css. */
  h2 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .body p {
    margin: 4px 0;
  }
  progress {
    width: 100%;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
</style>
