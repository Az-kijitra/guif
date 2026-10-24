// SPEC-0300-0022 R-1651 / R-1661; SPEC-0200-0001 §3.17.2 (f) / §3.17.8: the ONE pure evaluation of a config.toml snapshot, shared by the
// start-up (routes/startup-wiring.ts, which then writes the state) and the check (routes/settings-file-wiring.ts, which writes nothing, R-1652).
// snapshot -> validated keymap, registry, and the `config.toml` part of the notice. No state, no IPC (AC-1652).
//
// The order of the sentences (SPEC-0300-0022 R-1661 第2版 / SPEC-0300-0023 R-1820, W-39): keymap -> appearance (W-B0..W-B7, W-B9) -> external apps
// (W-9A -> W-9B -> W-9C) -> unused settings (W-B8) -> unknown settings (W-AC), joined by one half-width space.

import type { KeymapRawLoadResultDto } from "$lib/shared/ipc/config";
import type { ExternalAppsDto } from "$lib/shared/ipc/external-apps";
import type { AppearanceDto } from "$lib/shared/ipc/appearance";
import { validateKeymapEntries, type ValidatedKeymap } from "$lib/features/keyboard/keymap-validate";
import { keyRules } from "$lib/features/keyboard/key-rules";
import { buildKeymapLoadNotice } from "$lib/features/keyboard/keymap-notice";
import { buildRegistry, type Registry } from "$lib/features/external-apps/registry";
import { buildExternalAppsNotice } from "$lib/features/external-apps/notice";
import { buildUnknownSettingsNotice } from "$lib/features/settings-file/notice";
import { buildAppearanceNotice, buildUnusedNotice } from "$lib/features/appearance/notice";

export interface ConfigSnapshot {
  keymap: KeymapRawLoadResultDto;
  externalApps: ExternalAppsDto;
  appearance: AppearanceDto;
}

export interface ConfigEvaluation {
  validated: ValidatedKeymap;
  registry: Registry;
  // The `config.toml` part only; null = nothing to report.
  notice: string | null;
}

export function evaluateConfig(snapshot: ConfigSnapshot): ConfigEvaluation {
  const { keymap, externalApps, appearance } = snapshot;
  const validated = validateKeymapEntries(keymap.entries);
  const registry = buildRegistry(externalApps, keyRules(validated.effective));
  const parts = [
    buildKeymapLoadNotice(keymap.parseError, validated.invalidActions, {
      alsoDefaultsAppearance: keymap.parseError?.wholeFile === true,
      invalidActionLines: validated.invalidActionLines,
    }),
    buildAppearanceNotice(appearance.problems),
    buildExternalAppsNotice(registry),
    buildUnusedNotice(appearance.problems),
    buildUnknownSettingsNotice(keymap.unknownSettings),
  ].filter((n): n is string => n !== null);
  return { validated, registry, notice: parts.length > 0 ? parts.join(" ") : null };
}
