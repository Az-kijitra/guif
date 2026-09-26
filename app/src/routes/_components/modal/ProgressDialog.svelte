<script lang="ts">
  // Thin presentation of a progress modal (SPEC-0200-0001 §3.3.3). The cancel
  // button uses aria-disabled (not disabled) so focus never falls to <body>
  // (SHOULD-79); the state module ignores repeated cancels (R-43).
  import type { ProgressSpec } from "$lib/shared/state/modal-host.svelte";

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
  class="dialog"
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
      {canCancel ? spec.cancelLabel : "キャンセル中…"}
    </button>
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
  .body p {
    margin: 0.2rem 0;
    word-break: break-all;
  }
  progress {
    width: 100%;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.75rem;
  }
</style>
