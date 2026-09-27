// Binds the real shared/ipc/viewer wrappers + status reporting to the main
// window's `viewer.openFile`/`viewer.openWithOsAssociation` entry points used
// by `list-action-wiring.ts` (SPEC-0300-0015 §3.5.3) and the file list's
// double-click handler. The same "keep +page.svelte thin" pattern as
// `routes/archive-ipc.ts`.

import { viewerClassifyPath, viewerOpen, viewerOsOpenPath } from "$lib/shared/ipc/viewer";
import { createMainOpenController } from "$lib/features/viewer/viewer-controller";

export function createMainViewerOpenController(reportError: (message: string) => void) {
  return createMainOpenController({
    classify: viewerClassifyPath,
    open: viewerOpen,
    osOpen: viewerOsOpenPath,
    reportError,
  });
}
