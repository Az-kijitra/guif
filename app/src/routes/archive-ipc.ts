// Binds the real shared/ipc/archive wrappers to the archive controller's
// injected `ipc` surface (SPEC-0200-0001 §3.4.6). Kept out of +page.svelte to
// keep the composition layer thin.

import {
  archiveCancel,
  archiveCheckCreate,
  archiveCreate,
  archiveDetectConflicts,
  archiveExtract,
  createArchiveOperationId,
  listenArchiveProgress,
} from "$lib/shared/ipc/archive";

export const archiveIpc = {
  checkCreate: archiveCheckCreate,
  create: archiveCreate,
  detectConflicts: archiveDetectConflicts,
  extract: archiveExtract,
  cancel: archiveCancel,
  listenProgress: listenArchiveProgress,
  newOperationId: createArchiveOperationId,
};
