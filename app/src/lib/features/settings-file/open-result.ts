// SPEC-0300-0022 R-1665; SPEC-0300-0019 第5版 W-A2~W-A8 / W-AD; SPEC-0200-0001 §3.17.8: the status message after "open the settings file". Pure.
// The order is "W-A4 -> the opening result -> W-A8": nothing between W-A4 and the result, one half-width space in front of W-A8.

import type { SettingsFileOpenDto } from "$lib/shared/ipc/settings-file";
import { SETTINGS_FILE_MESSAGES as M } from "./messages";

function resultText(result: SettingsFileOpenDto["result"]): string {
  const message = result.message ?? "";
  switch (result.kind) {
    case "vscode":
      return M.openedWithVsCode;
    case "association":
      return M.openedByAssociation;
    case "not_a_file":
      return M.notAFile;
    case "out_of_scope":
      return M.outOfScope;
    case "open_failed":
      return M.openFailed(message);
    case "template_failed":
      return M.templateFailed(message);
  }
}

export function buildOpenResult(dto: SettingsFileOpenDto): string {
  const head = dto.templateCreated ? M.templateCreated : "";
  const tail = dto.sampleError === null ? "" : ` ${M.sampleFailed(dto.sampleError)}`;
  return head + resultText(dto.result) + tail;
}
