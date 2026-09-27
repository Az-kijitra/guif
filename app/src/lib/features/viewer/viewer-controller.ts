// SPEC-0300-0015 (SPEC-0200-0001 §3.5.7): the viewer feature's orchestration,
// split into the two sides that use it:
//   - `createMainOpenController` -- the filer (main window) side of R-401/
//     R-404/R-405/R-406: classify, then either open the viewer or launch the
//     OS association app; failures go through `error-format.ts` (R-513) to
//     an injected status reporter, never thrown back at the caller (R-408:
//     the caller fires-and-forgets this).
//   - `createViewerContentLoader` -- the viewer window side: turns a pending
//     open / navigate result into displayable content (R-410-2/R-493), using
//     `request-sequencer.ts` (R-409/R-431) so a slow earlier load can never
//     clobber a faster later one (AC-411).
// Every dependency is injected (no `@tauri-apps/*`, no other feature import).

import type { NavigateResultDto, PendingOpenDto, TextPayloadDto } from "$lib/shared/ipc/viewer";
import { formatViewerError, type ViewerDisplayErrorCode } from "./error-format";
import { createRequestSequencer } from "./request-sequencer";

// R-480/R-410: the fixed 4-extension image list is the only source of MIME
// types the viewer ever needs; deriving it here avoids a second IPC round
// trip just to learn what `viewer_read_image`'s raw bytes are (R-520).
function mimeTypeForPath(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

function errorCodeOf(e: unknown): ViewerDisplayErrorCode {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (typeof code === "string") return code as ViewerDisplayErrorCode;
  }
  return "unknown";
}

// ---------------------------------------------------------------------
// Main window side (R-401/R-404/R-405/R-406)
// ---------------------------------------------------------------------

export interface MainOpenDeps {
  classify: (path: string) => Promise<string>;
  open: (path: string, requestEpoch: number, requestSeq: number) => Promise<void>;
  osOpen: (path: string) => Promise<void>;
  reportError: (message: string) => void;
}

export function createMainOpenController(deps: MainOpenDeps) {
  // MUST-74/81/SHOULD-114: `requestEpoch` is minted ONCE per page load (this
  // module instance's lifetime); `requestSeq` increments per `openFile` call
  // within it. Sent to the backend so `viewer_open` itself (not only this
  // frontend's `request-sequencer.ts`) can discard a request that is not
  // newer than the one it already applied (`viewer::session::is_newer`).
  const requestEpoch = Date.now();
  let requestSeq = 0;

  // R-404/R-410: `open` (Enter/double-click) judges the kind first and
  // routes an OS-association file there instead of the viewer.
  async function openFile(path: string): Promise<void> {
    try {
      const kind = await deps.classify(path);
      if (kind === "os_open") {
        await deps.osOpen(path);
      } else {
        requestSeq += 1;
        await deps.open(path, requestEpoch, requestSeq);
      }
    } catch (e) {
      deps.reportError(formatViewerError(errorCodeOf(e)));
    }
  }

  // R-401-2: Shift+Enter always uses the OS association app, no judgment.
  async function openWithOsAssociation(path: string): Promise<void> {
    try {
      await deps.osOpen(path);
    } catch (e) {
      deps.reportError(formatViewerError(errorCodeOf(e)));
    }
  }

  return { openFile, openWithOsAssociation };
}

// ---------------------------------------------------------------------
// Viewer window side (R-430, R-490~R-493)
// ---------------------------------------------------------------------

export type ViewerContent =
  | { status: "loading" }
  | { status: "text" | "markdown"; payload: TextPayloadDto }
  // R-520: `blobUrl` is an object URL (`URL.createObjectURL`) over a `Blob`
  // built from the raw `ArrayBuffer` `viewer_read_image` returns -- the
  // CALLER (this loader) creates it; whoever replaces/discards a
  // `ViewerContent` of this shape is responsible for `URL.revokeObjectURL`
  // (`loadFromPending`/`navigateTo` below do this for their own superseded
  // results; `routes/viewer/+page.svelte` does it when swapping/unmounting).
  | { status: "image"; blobUrl: string }
  | { status: "unsupported" } // R-493: navigated to a file the viewer can't display
  | { status: "error"; message: string };

function revokeIfImage(content: ViewerContent): void {
  if (content.status === "image") URL.revokeObjectURL(content.blobUrl);
}

export interface ViewerLoadResult {
  content: ViewerContent;
  fileName: string;
  path: string;
  currentIndex: number;
  total: number;
}

export interface ViewerLoaderDeps {
  takePending: () => Promise<PendingOpenDto | null>;
  readText: (path: string) => Promise<TextPayloadDto>;
  readImage: (path: string) => Promise<ArrayBuffer>;
  navigate: (direction: "prev" | "next") => Promise<NavigateResultDto>;
}

function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function createViewerContentLoader(deps: ViewerLoaderDeps) {
  // R-409/R-431: a slow earlier load's result is discarded if a newer one
  // (pending-changed event, or a prev/next navigation) has since begun.
  const sequencer = createRequestSequencer();

  async function loadKind(path: string, kind: string): Promise<ViewerContent> {
    try {
      if (kind === "image") {
        const buffer = await deps.readImage(path);
        const blob = new Blob([buffer], { type: mimeTypeForPath(path) });
        return { status: "image", blobUrl: URL.createObjectURL(blob) };
      }
      // R-493: an OS-open-only file reached via prev/next is never launched.
      if (kind === "os_open") {
        return { status: "unsupported" };
      }
      const payload = await deps.readText(path);
      return { status: kind === "markdown" ? "markdown" : "text", payload };
    } catch (e) {
      return { status: "error", message: formatViewerError(errorCodeOf(e)) };
    }
  }

  // R-430: consumes the pending-open slot and loads its content.
  async function loadFromPending(): Promise<ViewerLoadResult | null> {
    const token = sequencer.begin();
    const pending = await deps.takePending();
    if (pending === null) return null;
    const content = await loadKind(pending.path, pending.kind);
    if (!sequencer.isCurrent(token)) {
      revokeIfImage(content); // R-520: a superseded image's blob URL must not leak.
      return null;
    }
    return {
      content,
      fileName: fileNameOf(pending.path),
      path: pending.path,
      currentIndex: pending.currentIndex,
      total: pending.siblings.length,
    };
  }

  // R-490~R-492: moves within the backend's snapshot; never re-lists.
  async function navigateTo(direction: "prev" | "next"): Promise<ViewerLoadResult | null> {
    const token = sequencer.begin();
    try {
      const result = await deps.navigate(direction);
      const content = await loadKind(result.path, result.kind);
      if (!sequencer.isCurrent(token)) {
        revokeIfImage(content); // R-520: a superseded image's blob URL must not leak.
        return null;
      }
      return {
        content,
        fileName: fileNameOf(result.path),
        path: result.path,
        currentIndex: result.currentIndex,
        total: result.total,
      };
    } catch (e) {
      if (!sequencer.isCurrent(token)) return null;
      return {
        content: { status: "error", message: formatViewerError(errorCodeOf(e)) },
        fileName: "",
        path: "",
        currentIndex: 0,
        total: 0,
      };
    }
  }

  return { loadFromPending, navigateTo };
}
