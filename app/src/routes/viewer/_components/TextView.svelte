<script lang="ts">
  // SPEC-0300-0015 R-460~R-463-1, R-462-5; SPEC-0200-0001 §3.14.5, §3.14.12-3/-4: the two-column text view.
  // The gutter is ONE text node ("1\n2\n..."); the body is ONE <pre> whose children belong to the codeContent action
  // (uncoloured text, or the highlighted markup through render-html.ts). No per-row elements.
  import { codeContent } from "$lib/features/viewer/highlight/code-content";
  import { gutterText, needsTailSpacer } from "$lib/features/viewer/text-lines";

  interface Props {
    text: string;
    lines: number;
    highlight: readonly string[] | null;
    scale: number;
  }
  let { text, lines, highlight, scale }: Props = $props();
</script>

<div class="text-view" style="--vw-text-scale: {scale}">
  <div class="gutter" aria-hidden="true">{gutterText(lines)}</div>
  <div class="code-column">
    <pre class="code" use:codeContent={{ text, highlight }}></pre>
    {#if needsTailSpacer(text)}<span class="tail" aria-hidden="true"></span>{/if}
  </div>
</div>

<style>
  .text-view {
    display: flex;
    font-family: var(--vw-font-mono);
    font-size: calc(13px * var(--vw-text-scale, 1));
    line-height: calc(20px * var(--vw-text-scale, 1));
  }
  .gutter {
    flex: none;
    box-sizing: border-box;
    width: calc(72px * var(--vw-text-scale, 1));
    text-align: right;
    padding-right: 10px;
    border-right: 1px solid var(--vw-gutter-border);
    background: var(--vw-gutter-bg);
    color: var(--vw-lineno);
    user-select: none;
    white-space: pre;
    font-family: var(--vw-font-mono);
    font-size: calc(13px * var(--vw-text-scale, 1));
    line-height: calc(20px * var(--vw-text-scale, 1));
  }
  .code-column {
    flex: 1;
  }
  .code {
    white-space: pre;
    tab-size: 4;
    margin: 0;
    padding-left: 8px;
    font-family: var(--vw-font-mono);
    font-size: calc(13px * var(--vw-text-scale, 1));
    line-height: calc(20px * var(--vw-text-scale, 1));
  }
  .tail {
    display: block;
    height: calc(20px * var(--vw-text-scale, 1));
    user-select: none;
  }
</style>
