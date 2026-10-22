// SPEC-0300-0022 R-1600 / R-1606 / R-1650~R-1665 / R-1671; SPEC-0200-0001 §3.17.8: the entrances "open the settings file" and "check the settings
// file" (the menu items, the `settings` action, the pre-empted Ctrl+,). It decides nothing itself (SHOULD-19: no branch on the content): the
// judgements live in `features/settings-file` and in `config-evaluate.ts`; this only calls the IPC, hands the result over and shows the text.
// The check evaluates and shows; it writes NO setting state (R-1652 / AC-1652: the only writer is startup-wiring.ts).

import { buildCheckNotice } from "$lib/features/settings-file/notice";
import { buildOpenResult } from "$lib/features/settings-file/open-result";
import { settingsFileCheck, settingsFileOpen } from "$lib/shared/ipc/settings-file";
import type { KeydownLikeEvent } from "$lib/features/keyboard/keymap-resolve";
import { exitOnly } from "./bootstrap-wiring";
import { evaluateConfig } from "./config-evaluate";

export interface SettingsFileWiringDeps {
  // R-1663: the open result is an ordinary message; the check result REPLACES what is shown.
  status: { show(message: string): void; showPriority(message: string, durationMs: number): void };
  // R-1671-1: closes the right-click menu / the menu bar, only the ones that are open (decided by the caller).
  closeMenus: () => void;
  ipc?: { settingsFileOpen: typeof settingsFileOpen; settingsFileCheck: typeof settingsFileCheck };
}

export function createSettingsFileWiring(deps: SettingsFileWiringDeps) {
  const ipc = deps.ipc ?? { settingsFileOpen, settingsFileCheck };

  // R-1664: a failure is a status message (W-A5 with the exception's text), never a dialog and never a throw.
  const failed = (error: unknown): string =>
    buildOpenResult({
      templateCreated: false,
      sampleError: null,
      result: { kind: "open_failed", message: error instanceof Error ? error.message : String(error) },
    });

  async function open(): Promise<void> {
    try {
      deps.status.show(buildOpenResult(await ipc.settingsFileOpen()));
    } catch (error) {
      deps.status.show(failed(error));
    }
  }

  async function check(): Promise<void> {
    try {
      const snapshot = await ipc.settingsFileCheck();
      // R-1654 / R-1663-1: W-A9 + (W-AB | W-AA | the config.toml part); the time is chosen by buildCheckNotice, not here.
      const result = buildCheckNotice({ present: snapshot.keymap.present, configNotice: evaluateConfig(snapshot).notice });
      deps.status.showPriority(result.text, result.durationMs);
    } catch (error) {
      deps.status.show(failed(error));
    }
  }

  // R-1606 / R-1671: Ctrl+, is pre-empted. An auto-repeat is swallowed; a press closes the menus first, then opens (not awaited).
  function onHardcoded(action: "exit" | "settings", event: Pick<KeydownLikeEvent, "repeat">): boolean {
    if (action === "exit") return exitOnly(action);
    if (event.repeat) return true;
    deps.closeMenus();
    void open();
    return true;
  }

  return { open, check, onHardcoded };
}
