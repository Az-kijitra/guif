// Binds the real shared/ipc/file-ops wrappers to the controller's injected
// `ipc` surface (SPEC-0200-0001 §3.3.4). Kept out of +page.svelte to keep the
// composition layer thin (§3.3.5).

import {
  createFileOpsOperationId,
  fsOpsCancel,
  fsOpsCopy,
  fsOpsCreate,
  fsOpsDeletePermanently,
  fsOpsDeleteTrash,
  fsOpsDetectConflicts,
  fsOpsMove,
  fsOpsRename,
  listenFileOpsProgress,
} from "$lib/shared/ipc/file-ops";

export const fileOpsIpc = {
  detectConflicts: fsOpsDetectConflicts,
  copy: fsOpsCopy,
  move: fsOpsMove,
  cancel: fsOpsCancel,
  deleteTrash: fsOpsDeleteTrash,
  deletePermanently: fsOpsDeletePermanently,
  rename: fsOpsRename,
  create: fsOpsCreate,
  listenProgress: listenFileOpsProgress,
  newOperationId: createFileOpsOperationId,
};
