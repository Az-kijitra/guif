// SPEC-0300-0015 §6 (SPEC-0200-0001 §3.5.2/§4.5): thin invoke wrappers for the
// seven viewer Tauri commands (app/src-tauri/src/viewer/commands.rs). No
// business logic and no state -- the same convention as
// `shared/ipc/archive.ts`. Every command rejects with a `ViewerError`
// (normalized from the backend's `{ code, message }` DTO, R-447).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface PendingOpenDto {
  path: string;
  kind: string;
  siblings: string[];
  currentIndex: number;
}

export interface TextPayloadDto {
  content: string;
  encoding: string;
  originalSizeBytes: number;
  truncatedBySize: boolean;
  truncatedByLines: boolean;
  lineCount: number;
  truncationMessage: string | null;
}

export interface NavigateResultDto {
  path: string;
  kind: string;
  currentIndex: number;
  total: number;
}

// R-447: machine-readable code + the raw backend message (translated to a
// user-facing string only by `features/viewer/error-format.ts`).
export class ViewerError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ViewerError";
    this.code = code;
  }
}

// Never throws: any rejected value becomes a ViewerError (code "unknown" when
// nothing structured can be recovered).
export function normalizeViewerError(raw: unknown): ViewerError {
  if (raw instanceof ViewerError) return raw;
  if (typeof raw === "object" && raw !== null) {
    const o = raw as { code?: unknown; message?: unknown };
    if (typeof o.code === "string") {
      return new ViewerError(o.code, typeof o.message === "string" ? o.message : "");
    }
  }
  if (typeof raw === "string") return new ViewerError("unknown", raw);
  if (raw instanceof Error) return new ViewerError("unknown", raw.message);
  return new ViewerError("unknown", String(raw));
}

async function call<T>(command: string, args: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw normalizeViewerError(e);
  }
}

// ---- Main-window-only commands (R-432-3) ----

export const viewerClassifyPath = (path: string): Promise<string> => call<string>("viewer_classify_path", { path });

// MUST-74/81/SHOULD-114: `requestEpoch`/`requestSeq` let the BACKEND itself
// (not only the frontend's own `request-sequencer.ts`) discard a request that
// is not newer than the one it already applied, even if the two `invoke()`
// calls' completions arrive out of order (`viewer::session::is_newer`).
export const viewerOpen = (path: string, requestEpoch: number, requestSeq: number): Promise<void> =>
  call<void>("viewer_open", { path, requestEpoch, requestSeq });

export const viewerOsOpenPath = (path: string): Promise<void> => call<void>("viewer_os_open_path", { path });

// ---- Viewer-window-only commands (R-432-4) ----

export const viewerTakePending = (): Promise<PendingOpenDto | null> =>
  call<PendingOpenDto | null>("viewer_take_pending", {});

export const viewerReadText = (path: string): Promise<TextPayloadDto> => call<TextPayloadDto>("viewer_read_text", { path });

// R-441/R-444/R-484/R-520: the backend returns a raw `tauri::ipc::Response`
// (not a JSON `{ bytes: number[] }` DTO), so `invoke()` itself resolves with
// an `ArrayBuffer` -- no per-byte JSON number array, no manual byte-by-byte
// string concatenation on this side (code-reviewer finding, 2026-09-27).
export const viewerReadImage = (path: string): Promise<ArrayBuffer> => call<ArrayBuffer>("viewer_read_image", { path });

export const viewerNavigate = (direction: "prev" | "next"): Promise<NavigateResultDto> =>
  call<NavigateResultDto>("viewer_navigate", { direction });

// R-421(b): an already-open viewer window is told a new open request arrived
// (it re-fetches the pending slot instead of relying only on route-load-time
// hand-off).
export function listenPendingChanged(handler: () => void): Promise<UnlistenFn> {
  return listen("viewer://pending-changed", () => handler());
}
