// SPEC-0300-0021 §9 (R-1570~R-1577) / SPEC-0200-0001 §3.16.6, §3.16.9: runs one launch and reports the result as ONE status message.
// A failure is a status message, never a dialog and never an exception (R-1575). What goes to the backend is the registration number,
// the target path and its kind, nothing else (R-1581). The caller shows the "no target" sentence when there is no target.

import { normalizeExternalAppError, type ExternalAppError } from "$lib/shared/ipc/external-apps";
import { EXTERNAL_APP_MESSAGES as M } from "./messages";

export interface LaunchFlowInput {
  entry: { index: number; label: string };
  target: { path: string; kind: "file" | "dir" };
  ipc: { externalAppLaunch(index: number, path: string, kind: "file" | "dir"): Promise<void> };
  status: { show(message: string): void };
}

// §3.16.9: the table of results. `unknown_app` (cannot happen in normal use) has no sentence of its own: W-97 with `unknown app`.
function failureMessage(name: string, error: ExternalAppError): string {
  switch (error.code) {
    case "program_not_found":
      return M.programNotFound(name, error.program ?? "");
    case "target_missing":
      return M.targetMissing(name);
    case "invalid_path":
      return M.invalidPath(name);
    case "e2e_scope_violation":
      return M.outOfScope(name);
    case "unknown_app":
      return M.failed(name, "unknown app");
    default:
      return M.failed(name, error.message);
  }
}

export async function launchExternalApp({ entry, target, ipc, status }: LaunchFlowInput): Promise<void> {
  try {
    await ipc.externalAppLaunch(entry.index, target.path, target.kind);
  } catch (raw) {
    status.show(failureMessage(entry.label, normalizeExternalAppError(raw)));
    return;
  }
  status.show(M.launched(entry.label));
}
