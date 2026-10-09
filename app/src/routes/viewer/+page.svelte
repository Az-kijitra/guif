<script lang="ts">
  // routes/viewer/+page.svelte (SPEC-0300-0015 §5, §7~§13; SPEC-0200-0001
  // §3.5.7): composition layer only. All decision logic lives in
  // features/viewer/* and this file's own `viewer-wiring.ts`. Kept at/under
  // 400 lines (§7.1) -- this is a MVP-scope UI (no virtual scroll, no image
  // cache, R-530).
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { renderMarkdown } from "$lib/features/viewer/markdown-render";
  import { resolveViewerKeyAction, shouldSuppressWebviewDefault } from "$lib/features/viewer/viewer-keys";
  import type { ViewerContent } from "$lib/features/viewer/viewer-controller";
  import { formatViewerError } from "$lib/features/viewer/error-format";
  import { COMMON } from "$lib/shared/messages";
  import { ROUTE_MESSAGES } from "../messages";
  import { initializeViewer, listenPendingChanged, viewerContentLoader } from "./viewer-wiring";
  import "./viewer-theme.css";

  let content: ViewerContent = $state({ status: "loading" });
  let fileName = $state("");
  let currentIndex = $state(0);
  let total = $state(0);
  // R-470/R-470-2: Markdown mode persists across files, resets to HTML when
  // the window closes (a fresh page load starts here again).
  let markdownMode: "html" | "text" = $state("html");
  // R-471-1/R-471-2: 50~300%, 10-point steps, never persisted.
  let markdownZoom = $state(100);
  // R-481/R-482: 1~800% (0.01~8), Fit by default; R-487: reset on file switch.
  let imageZoomMode: "fit" | number = $state("fit");

  let bodyEl: HTMLDivElement | undefined = $state();
  let hasFile = $derived(fileName !== "");
  // R-512 / R-514: true once a file was handed over, so the first load shows `読み込み中…` rather than the
  // "no file" placeholder (fileName is only known when the content has arrived).
  let fileTaken = $state(false);

  function contentKind(): "text" | "markdown" | "image" | "error" {
    if (content.status === "text") return "text";
    if (content.status === "markdown") return "markdown";
    if (content.status === "image") return "image";
    return "error"; // "loading"/"unsupported"/"error" all use the fixed-key error bucket (R-500-5).
  }

  // R-520: `content.blobUrl` is an object URL the loader created via
  // `URL.createObjectURL` over the raw image bytes (no more base64/data-URL
  // built by concatenating one `String.fromCharCode` per byte). Whichever
  // `ViewerContent` this file replaces is revoked here if it was an image.
  function applyLoadResult(result: Awaited<ReturnType<typeof viewerContentLoader.loadFromPending>>): void {
    if (result === null) return;
    if (content.status === "image") URL.revokeObjectURL(content.blobUrl);
    content = result.content;
    fileName = result.fileName;
    currentIndex = result.currentIndex;
    total = result.total;
    // R-470-2/R-487: HTML mode / Fit are the per-file defaults; zoom resets.
    markdownMode = "html";
    markdownZoom = 100;
    imageZoomMode = "fit";
  }

  async function loadPending(): Promise<void> {
    applyLoadResult(await viewerContentLoader.loadFromPending({ onTaken: () => (fileTaken = true) }));
  }

  async function navigate(direction: "prev" | "next"): Promise<void> {
    applyLoadResult(await viewerContentLoader.navigateTo(direction));
  }

  function closeViewer(): void {
    try {
      void getCurrentWindow().close();
    } catch {
      // Not running inside Tauri (plain browser dev).
    }
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function zoomMarkdown(op: "in" | "out" | "reset"): void {
    if (op === "reset") markdownZoom = 100;
    else if (op === "in") markdownZoom = clamp(markdownZoom + 10, 50, 300);
    else markdownZoom = clamp(markdownZoom - 10, 50, 300);
  }

  function currentImageScale(): number {
    return imageZoomMode === "fit" ? 1 : imageZoomMode;
  }

  function zoomImage(op: "in" | "out" | "reset" | "fit" | "200"): void {
    if (op === "fit") {
      imageZoomMode = "fit";
      return;
    }
    if (op === "reset") {
      imageZoomMode = 1;
      return;
    }
    if (op === "200") {
      imageZoomMode = 2;
      return;
    }
    const base = currentImageScale();
    const next = op === "in" ? base * 1.25 : base / 1.25;
    imageZoomMode = clamp(next, 0.01, 8);
  }

  function scrollBody(axis: "y" | "x", amount: number): void {
    bodyEl?.scrollBy(axis === "y" ? { top: amount } : { left: amount });
  }

  function pageScroll(direction: "up" | "down"): void {
    const height = bodyEl?.clientHeight ?? 0;
    scrollBody("y", direction === "up" ? -height : height);
  }

  function goHome(): void {
    bodyEl?.scrollTo({ top: 0, left: 0 });
  }

  function goEnd(): void {
    if (bodyEl === undefined) return;
    bodyEl.scrollTo({ top: bodyEl.scrollHeight, left: 0 });
  }

  function onKeydown(event: KeyboardEvent): void {
    const keyLike = {
      key: event.key,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    };
    if (shouldSuppressWebviewDefault(keyLike)) event.preventDefault();

    const action = resolveViewerKeyAction(keyLike, { contentKind: contentKind() });
    if (action === null) return;
    event.preventDefault();

    switch (action.kind) {
      case "scroll":
        scrollBody(action.axis, action.axis === "y" ? action.amount : action.amount);
        return;
      case "page":
        pageScroll(action.direction);
        return;
      case "home":
        goHome();
        return;
      case "end":
        goEnd();
        return;
      case "navigate":
        void navigate(action.direction);
        return;
      case "zoom":
        if (content.status === "markdown") {
          if (action.op === "in" || action.op === "out" || action.op === "reset") zoomMarkdown(action.op);
        } else if (content.status === "image") {
          zoomImage(action.op);
        }
        return;
      case "close":
        closeViewer();
        return;
    }
  }

  let unlistenPending: (() => void) | undefined;

  onMount(() => {
    // MUST-75: `initializeViewer` awaits `listenPendingChanged` BEFORE the
    // first `loadPending`, so no update that arrives while registration is
    // still in flight is silently missed.
    void initializeViewer({ listenPendingChanged, loadFromPending: loadPending }).then((unlisten) => {
      unlistenPending = unlisten;
    });
    window.addEventListener("keydown", onKeydown, { capture: true });
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onKeydown, { capture: true });
    unlistenPending?.();
    if (content.status === "image") URL.revokeObjectURL(content.blobUrl);
  });
</script>

<!-- R-511 / R-913: the viewer follows the main window's theme; colours come from viewer-theme.css. -->
<div class="viewer">
  <header class="viewer-header">
    <button onclick={() => void navigate("prev")} disabled={total <= 1}>◀ Prev</button>
    <span class="position">{hasFile ? `${currentIndex + 1} / ${total}` : ""}</span>
    <button onclick={() => void navigate("next")} disabled={total <= 1}>Next ▶</button>
    <span class="filename">{fileName}</span>
    <span class="spacer"></span>
    {#if content.status === "markdown"}
      <button aria-pressed={markdownMode === "html"} onclick={() => (markdownMode = "html")}>HTML</button>
      <button aria-pressed={markdownMode === "text"} onclick={() => (markdownMode = "text")}>Text</button>
      <button onclick={() => zoomMarkdown("out")}>-</button>
      <span class="zoom">{markdownZoom}%</span>
      <button onclick={() => zoomMarkdown("in")}>+</button>
    {:else if content.status === "text"}
      <span class="encoding">{content.payload.encoding}</span>
    {:else if content.status === "image"}
      <button onclick={() => zoomImage("fit")}>Fit</button>
      <button onclick={() => zoomImage("reset")}>100%</button>
      <button onclick={() => zoomImage("200")}>200%</button>
      <span class="zoom">{Math.round(currentImageScale() * 100)}%</span>
    {/if}
    <button aria-label={COMMON.close} onclick={closeViewer}>✕</button>
  </header>

  {#if content.status === "text" || content.status === "markdown"}
    {#if content.payload.truncationMessage}
      <p class="truncation-banner">{content.payload.truncationMessage}</p>
    {/if}
  {/if}

  <div class="viewer-body" bind:this={bodyEl}>
    {#if !hasFile && !fileTaken && content.status === "loading"}
      <p class="placeholder">{ROUTE_MESSAGES.viewerNoFile}</p>
    {:else if content.status === "loading"}
      <p class="placeholder">{COMMON.loading}</p>
    {:else if content.status === "error"}
      <p class="placeholder error" role="alert">{content.message}</p>
    {:else if content.status === "unsupported"}
      <p class="placeholder">{formatViewerError("unsupported_kind")}</p>
    {:else if content.status === "text"}
      <pre class="text-view">{#each content.payload.content.split("\n") as line, i}<span class="line"><span class="lineno">{i + 1}</span>{line}</span>
{/each}</pre>
    {:else if content.status === "markdown"}
      {#if markdownMode === "html"}
        <div class="markdown-html" style="font-size: {markdownZoom}%">{@html renderMarkdown(content.payload.content)}</div>
      {:else}
        <pre class="text-view" style="font-size: {markdownZoom}%">{#each content.payload.content.split("\n") as line, i}<span class="line"><span class="lineno">{i + 1}</span>{line}</span>
{/each}</pre>
      {/if}
    {:else if content.status === "image"}
      <div class="image-view" class:fit={imageZoomMode === "fit"}>
        <img
          src={content.blobUrl}
          alt={fileName}
          style={imageZoomMode === "fit" ? "" : `transform: scale(${currentImageScale()});`}
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .viewer {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--vw-bg);
    color: var(--vw-fg);
    font-family: sans-serif;
  }
  .viewer-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--vw-header-bg);
    border-bottom: 1px solid var(--vw-border);
  }
  .filename {
    font-weight: bold;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  .truncation-banner {
    margin: 0;
    padding: 0.25rem 0.5rem;
    background: var(--vw-banner-bg);
    color: var(--vw-banner-fg);
  }
  .viewer-body {
    flex: 1;
    overflow: auto;
    padding: 0.5rem;
  }
  .placeholder {
    color: var(--vw-muted);
  }
  .placeholder.error {
    color: var(--vw-error);
  }
  .text-view {
    white-space: pre;
    font-family: "Consolas", "Courier New", monospace;
    tab-size: 4;
    margin: 0;
  }
  .line {
    display: block;
  }
  .lineno {
    display: inline-block;
    width: 4em;
    color: var(--vw-lineno);
    user-select: none;
  }
  .markdown-html {
    max-width: 60rem;
  }
  .image-view {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .image-view.fit img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
</style>
