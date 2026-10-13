<script lang="ts">
  // routes/viewer/+page.svelte (SPEC-0300-0015 §5, §7~§13; SPEC-0200-0001
  // §3.5.7, §3.14): composition layer only. All decision logic lives in
  // features/viewer (the feature folder) and this folder's wiring files (viewer-wiring,
  // highlight-wiring, image-interaction, focus-wiring) and components
  // (_components/TextView, ImageView). Kept at/under 400 lines (§7.1).
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { renderMarkdown } from "$lib/features/viewer/markdown-render";
  import {
    resolveViewerKeyAction,
    selectAllTarget,
    shouldSuppressWebviewDefault,
  } from "$lib/features/viewer/viewer-keys";
  import type { ViewerContent } from "$lib/features/viewer/viewer-controller";
  import { formatViewerError } from "$lib/features/viewer/error-format";
  import { lineCount } from "$lib/features/viewer/text-lines";
  import { canHighlight } from "$lib/features/viewer/highlight/limits";
  import { languageForPath } from "$lib/features/viewer/highlight/language-map";
  import { COMMON } from "$lib/shared/messages";
  import { ROUTE_MESSAGES } from "../messages";
  import { initializeViewer, listenPendingChanged, viewerContentLoader } from "./viewer-wiring";
  import { createHighlighter, newHighlightWorker } from "./highlight-wiring";
  import { attachImageInteraction, type ImageInteraction, type ZoomMode } from "./image-interaction";
  import { focusBody, installBodyFocus } from "./focus-wiring";
  import TextView from "./_components/TextView.svelte";
  import ImageView from "./_components/ImageView.svelte";
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
  let imageZoomMode: ZoomMode = $state("fit");
  // The REAL displayed image scale (Fit: clientWidth / naturalWidth), reported by ImageView.
  let imageScale = $state(1);
  let imgEl: HTMLImageElement | undefined = $state();

  let bodyEl: HTMLDivElement | undefined = $state();
  let markdownEl: HTMLDivElement | undefined = $state();
  let imageInteraction: ImageInteraction | undefined;
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

  // The text shown in the two-column view: a text file, or Markdown in Text mode (null otherwise).
  function codeTextOf(c: ViewerContent, mode: "html" | "text"): string | null {
    if (c.status === "text" || (c.status === "markdown" && mode === "text")) return c.payload.content;
    return null;
  }
  let codeText = $derived(codeTextOf(content, markdownMode));
  let codeLines = $derived(codeText === null ? 1 : lineCount(codeText));

  // R-466: colour the body in a Web Worker. The result is kept together with the text it was made for, so a result is
  // never shown over a different text (R-431); the body is shown uncoloured first and in every failure case (R-466-9).
  const highlighter = createHighlighter({ createWorker: newHighlightWorker });
  let highlighted: { text: string; chunks: string[] } | null = $state(null);
  function chunksFor(h: { text: string; chunks: string[] } | null, text: string | null): string[] | null {
    return h !== null && text !== null && h.text === text ? h.chunks : null;
  }
  let highlightChunks = $derived(chunksFor(highlighted, codeText));

  $effect(() => {
    const text = codeText;
    const language = languageForPath(fileName, { mode: content.status === "markdown" ? markdownMode : "text" });
    if (text === null || language === null || !canHighlight(text, language)) {
      highlighter.cancel(); // R-431: a previous file's Worker must not keep running for a body that is not coloured.
      return;
    }
    let stale = false;
    void highlighter.request(text, language).then((chunks) => {
      if (!stale && chunks !== null) highlighted = { text, chunks };
    });
    return () => {
      stale = true;
    };
  });

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
    highlighted = null;
    bodyEl?.scrollTo({ top: 0, left: 0 });
    focusBody(bodyEl); // R-500-8: also when an already open viewer is reused for another file.
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

  // R-500: the amount is signed (Up / Left negative), so it goes to scrollBy as it is.
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

  // R-500-9: Ctrl+A selects the body text only (image / error: no selection).
  function selectBody(): void {
    const target = selectAllTarget({ contentKind: contentKind(), markdownMode });
    const element = target === "code" ? bodyEl?.querySelector("pre.code") : target === "markdown-html" ? markdownEl : null;
    if (element) window.getSelection()?.selectAllChildren(element);
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
        scrollBody(action.axis, action.amount);
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
          void imageInteraction?.applyOp(action.op);
        }
        return;
      case "select_all":
        selectBody();
        return;
      case "close":
        closeViewer();
        return;
    }
  }

  let unlistenPending: (() => void) | undefined;
  let removeFocus: (() => void) | undefined;

  onMount(() => {
    // MUST-75: `initializeViewer` awaits `listenPendingChanged` BEFORE the
    // first `loadPending`, so no update that arrives while registration is
    // still in flight is silently missed.
    void initializeViewer({ listenPendingChanged, loadFromPending: loadPending }).then((unlisten) => {
      unlistenPending = unlisten;
    });
    window.addEventListener("keydown", onKeydown, { capture: true });
    removeFocus = installBodyFocus(() => bodyEl);
    if (bodyEl !== undefined) {
      imageInteraction = attachImageInteraction({
        body: bodyEl,
        isActive: () => content.status === "image",
        getImage: () => imgEl,
        getMode: () => imageZoomMode,
        setMode: (mode) => (imageZoomMode = mode),
      });
    }
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onKeydown, { capture: true });
    unlistenPending?.();
    removeFocus?.();
    imageInteraction?.dispose();
    highlighter.dispose();
    if (content.status === "image") URL.revokeObjectURL(content.blobUrl);
  });
</script>

<!-- R-511 / R-913: the viewer follows the main window's theme; colours come from viewer-theme.css. -->
<div class="viewer">
  <!-- R-500-3: a mouse press on the header must not take the keyboard focus away from the body. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header class="viewer-header" onmousedown={(e) => e.preventDefault()}>
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
      <button onclick={() => void imageInteraction?.applyOp("fit")}>Fit</button>
      <button onclick={() => void imageInteraction?.applyOp("reset")}>100%</button>
      <button onclick={() => void imageInteraction?.applyOp("200")}>200%</button>
      <span class="zoom">{Math.round(imageScale * 100)}%</span>
    {/if}
    <button aria-label={COMMON.close} onclick={closeViewer}>✕</button>
  </header>

  {#if content.status === "text" || content.status === "markdown"}
    {#if content.payload.truncationMessage}
      <p class="truncation-banner">{content.payload.truncationMessage}</p>
    {/if}
  {/if}

  <!-- R-500-8: focusable (tabindex -1) so the keys work as soon as the window opens; not a tab stop. -->
  <div class="viewer-body" class:image={content.status === "image"} bind:this={bodyEl} tabindex="-1" role="document">
    {#if !hasFile && !fileTaken && content.status === "loading"}
      <p class="placeholder">{ROUTE_MESSAGES.viewerNoFile}</p>
    {:else if content.status === "loading"}
      <p class="placeholder">{COMMON.loading}</p>
    {:else if content.status === "error"}
      <p class="placeholder error" role="alert">{content.message}</p>
    {:else if content.status === "unsupported"}
      <p class="placeholder">{formatViewerError("unsupported_kind")}</p>
    {:else if codeText !== null}
      <TextView
        text={codeText}
        lines={codeLines}
        highlight={highlightChunks}
        scale={content.status === "markdown" ? markdownZoom / 100 : 1}
      />
    {:else if content.status === "markdown"}
      <div class="markdown-html" bind:this={markdownEl} style="font-size: {markdownZoom}%">{@html renderMarkdown(content.payload.content)}</div>
    {:else if content.status === "image"}
      {#key content.blobUrl}
        <ImageView src={content.blobUrl} alt={fileName} mode={imageZoomMode} bind:img={imgEl} bind:scale={imageScale} />
      {/key}
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
    font-family: var(--vw-font);
  }
  .viewer-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--vw-header-bg);
    border-bottom: 1px solid var(--vw-border);
    font-size: 13px;
    user-select: none;
  }
  .viewer-header button {
    font: inherit;
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
  .viewer-body:focus {
    outline: none;
  }
  /* R-483-1: the image display has no padding, so both ends of the scroll range are reached exactly. */
  .viewer-body.image {
    padding: 0;
  }
  .placeholder {
    color: var(--vw-muted);
  }
  .placeholder.error {
    color: var(--vw-error);
  }
  .markdown-html {
    max-width: 60rem;
  }
  .markdown-html :global(code),
  .markdown-html :global(pre) {
    font-family: var(--vw-font-mono);
  }
</style>
