// SPEC-0300-0015 R-466-4/R-466-5/R-466-6/R-466-9/R-431, SPEC-0200-0001 §3.14.7 and §3.14.12-2: owns the highlight Web
// Worker's life, the requestId and the acceptance of its replies. The page sees only `createHighlighter()` ->
// `request(code, language)` / `dispose()`. The Worker is injected (`createWorker`) so this runs without a DOM.

import { isSafeHighlightHtml } from "$lib/features/viewer/highlight/safe-html";
import { MAX_HIGHLIGHT_CHARS } from "$lib/features/viewer/highlight/limits";

export interface WorkerLike {
  postMessage(message: { requestId: number; language: string; code: string }): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface HighlighterDeps {
  createWorker: () => WorkerLike;
}

export interface Highlighter {
  // chunks, or null = "leave the body uncoloured" (never rejects, never announces anything).
  request(code: string, language: string): Promise<string[] | null>;
  // The body changed to something that is not coloured (an image, an error, ...): stop the running Worker.
  cancel(): void;
  dispose(): void;
}

// The only place the Worker file is named (Vite's module-worker form). Called lazily, on the first request.
export function newHighlightWorker(): WorkerLike {
  return new Worker(new URL("../../lib/features/viewer/highlight/highlight.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as WorkerLike;
}

function acceptedChunks(data: unknown): string[] | null {
  if (typeof data !== "object" || data === null) return null;
  const chunks = (data as { chunks?: unknown }).chunks;
  if ("error" in data || !Array.isArray(chunks)) return null;
  for (const chunk of chunks) {
    if (typeof chunk !== "string" || !isSafeHighlightHtml(chunk)) return null;
  }
  return chunks as string[];
}

export function createHighlighter(deps: HighlighterDeps): Highlighter {
  let worker: WorkerLike | null = null;
  let pending: { id: number; settle: (chunks: string[] | null) => void } | null = null;
  let lastId = 0;

  function dropWorker(): void {
    const old = worker;
    worker = null;
    if (old === null) return;
    old.onmessage = null;
    old.onerror = null;
    try {
      old.terminate();
    } catch {
      // Already gone; nothing to do.
    }
  }

  // A synchronous highlight cannot be interrupted, so a superseded request ends its Worker.
  function supersede(): void {
    if (pending === null) return;
    const old = pending;
    pending = null;
    dropWorker();
    old.settle(null);
  }

  function fail(): void {
    const old = pending;
    pending = null;
    dropWorker();
    old?.settle(null);
  }

  function ensureWorker(): WorkerLike {
    if (worker !== null) return worker;
    const created = deps.createWorker();
    created.onmessage = (event) => {
      if (worker !== created || pending === null) return;
      const data = event.data;
      if (typeof data !== "object" || data === null || (data as { requestId?: unknown }).requestId !== pending.id) return;
      const done = pending;
      pending = null;
      done.settle(acceptedChunks(data));
    };
    created.onerror = () => {
      if (worker === created) fail();
    };
    worker = created;
    return created;
  }

  return {
    request(code, language) {
      supersede();
      if (code.length > MAX_HIGHLIGHT_CHARS) return Promise.resolve(null);
      return new Promise<string[] | null>((resolve) => {
        const id = ++lastId;
        pending = { id, settle: resolve };
        try {
          ensureWorker().postMessage({ requestId: id, language, code });
        } catch {
          fail();
        }
      });
    },
    cancel: supersede,
    dispose() {
      const old = pending;
      pending = null;
      dropWorker();
      old?.settle(null);
    },
  };
}
