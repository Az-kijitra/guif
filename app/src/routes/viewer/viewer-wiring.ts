// Binds the real shared/ipc/viewer wrappers to the viewer feature's injected
// `ipc` surface (SPEC-0300-0015; SPEC-0200-0001 §3.5.7), the same pattern as
// `routes/archive-ipc.ts`. Kept out of `routes/viewer/+page.svelte` to keep
// the composition layer thin, AND to make the MUST-75 initialization-order
// requirement below independently testable with fakes (no real Tauri APIs).

import {
  listenPendingChanged as realListenPendingChanged,
  viewerNavigate,
  viewerReadImage,
  viewerReadText,
  viewerTakePending,
} from "$lib/shared/ipc/viewer";
import { createViewerContentLoader } from "$lib/features/viewer/viewer-controller";

export const viewerContentLoader = createViewerContentLoader({
  takePending: viewerTakePending,
  readText: viewerReadText,
  readImage: viewerReadImage,
  navigate: viewerNavigate,
});

export { realListenPendingChanged as listenPendingChanged };

export interface InitializeViewerDeps {
  listenPendingChanged: (handler: () => void) => Promise<() => void>;
  loadFromPending: () => Promise<unknown>;
}

// MUST-75: the pending-open-changed event listener must be FULLY REGISTERED
// (awaited) before the first `loadFromPending` call. Registering it only
// AFTER (or concurrently with, via a bare `void`) the initial load leaves a
// window where a `viewer_open` that arrives in between is never noticed (the
// pending slot itself always holds the latest value -- R-430 -- but without
// this ordering the frontend has no reliable signal telling it to re-fetch
// it). Returns the `unlisten` function so the caller can dispose it.
export async function initializeViewer(deps: InitializeViewerDeps): Promise<() => void> {
  const unlisten = await deps.listenPendingChanged(() => {
    void deps.loadFromPending();
  });
  await deps.loadFromPending();
  return unlisten;
}
