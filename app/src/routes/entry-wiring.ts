// SPEC-0200-0001 §3.17.8 / §3.17.13: the "entrance" wirings of +page.svelte in ONE call (SPEC-0300-0021 external apps, SPEC-0300-0022 settings file),
// so that +page.svelte does not grow. It only composes; it adds no logic.

import { createExternalAppsWiring, type ExternalAppsWiringDeps } from "./external-apps-wiring";
import { createSettingsFileWiring, type SettingsFileWiringDeps } from "./settings-file-wiring";

export type EntryWiringDeps = Omit<ExternalAppsWiringDeps, "status"> & {
  // One status for both: `show` for the external apps and the open result, `showPriority` for the check result.
  status: ExternalAppsWiringDeps["status"] & SettingsFileWiringDeps["status"];
  closeMenus: SettingsFileWiringDeps["closeMenus"];
  settingsFileIpc?: SettingsFileWiringDeps["ipc"];
};

export function createEntryWiring(deps: EntryWiringDeps) {
  const { closeMenus, settingsFileIpc, ...externalAppsDeps } = deps;
  return {
    externalApps: createExternalAppsWiring(externalAppsDeps),
    settingsFile: createSettingsFileWiring({ status: deps.status, closeMenus, ipc: settingsFileIpc }),
  };
}
