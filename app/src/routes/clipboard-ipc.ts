// Binds the shared/ipc/clipboard wrappers to the OS clipboard port's injected `ipc`
// (SPEC-0200-0001 §3.10.8; same shape as file-ops-ipc.ts).

import { clipboardClearIfUnchanged, clipboardGetFiles, clipboardSetFiles } from "$lib/shared/ipc/clipboard";

export const clipboardIpc = {
  setFiles: clipboardSetFiles,
  getFiles: clipboardGetFiles,
  clearIfUnchanged: clipboardClearIfUnchanged,
};
