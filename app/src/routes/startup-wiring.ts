// SPEC-0300-0009 R-45-6/R-77-3-1/R-77-6; SPEC-0300-0010 R-45-2/R-45-5/R-45-6;
// SPEC-0300-0013 R-242. AC-62-2. Architecture:
// docs/architecture/proposals/SPEC-0200-0001.md §3.6.2, §3.6.11.11
// SHOULD-119/120.
//
// Contract (documented in the handback report): each `load*` dependency is a
// zero-argument closure that already performs its own "apply to feature
// state" side effect internally before resolving, returning only the notice
// text (or null). R-77-3-1: the APPLY order is ui-state -> config(keymap) ->
// (then navigation), all applied before the caller's first fs_list_dir.
// R-45-6/R-77-6: the NOTICE order is config -> ui-state -> navigation --
// explicitly a DIFFERENT order from the apply order.

import { statusMessage } from "$lib/shared/state/status-message.svelte";
import { configLoadKeymap } from "$lib/shared/ipc/config";
import { externalAppsLoad, type ExternalAppsDto } from "$lib/shared/ipc/external-apps";
import type { AppearanceDto } from "$lib/shared/ipc/appearance";
import { startAppearanceLoad } from "$lib/shared/state/appearance-state.svelte";
import { keymapState } from "$lib/features/keyboard/keymap-state.svelte";
import { externalAppsState } from "$lib/features/external-apps/external-apps-state.svelte";
import { NOTICE_MS } from "$lib/features/settings-file/notice";
import { evaluateConfig } from "./config-evaluate";

export interface StartupHydrateDeps {
  loadUiState: () => Promise<{ notice: string | null }>;
  loadKeymap: () => Promise<{ notice: string | null }>;
  loadNavigation: () => Promise<string | null>; // navigationPersistence.hydrateAll()'s contract (MUST-88)
}

export async function runStartupHydrate(deps: StartupHydrateDeps): Promise<void> {
  const uiStateResult = await deps.loadUiState();
  const keymapResult = await deps.loadKeymap();
  const navigationNotice = await deps.loadNavigation();

  const notices = [keymapResult.notice, uiStateResult.notice, navigationNotice].filter(
    (n): n is string => n !== null && n !== "",
  );

  if (notices.length > 0) {
    // SHOULD-119: priority so a subsequent short-lived notice (e.g. R-40-3's tree load-failure message) appends instead of clobbering this one.
    // SPEC-0300-0022 R-1663: 15 s when the config.toml part has something to read (an error or an unknown setting), 6 s otherwise.
    const hasConfigPart = keymapResult.notice !== null && keymapResult.notice !== "";
    statusMessage.showPriority(notices.join(" / "), hasConfigPart ? NOTICE_MS.problem : NOTICE_MS.startup);
  }
}

// SPEC-0300-0021 R-1501: a failed load of the external apps does not stop the start: zero registrations, no notice, one console line (MINOR-33).
// The EMPTY snapshot below makes W-9A / W-9B / W-9C not appear, which keeps "no notice" (SPEC-0200-0001 §3.17.8).
const EMPTY_EXTERNAL_APPS: ExternalAppsDto = { apps: [], invalid: [], typeError: false, typeErrorLine: null };

// A failed appearance load: the part is simply empty (no problems to report).
const NO_APPEARANCE_PROBLEMS: AppearanceDto = {
  dark: true,
  bg: "",
  uiVars: [],
  fontFamily: "",
  fontSize: 12,
  rowHeight: 16,
  minColWidth: 24,
  treeWidthPercent: 24,
  problems: [],
};

async function loadExternalAppsSnapshot(): Promise<ExternalAppsDto> {
  try {
    return await externalAppsLoad();
  } catch (error) {
    console.error("external apps: the registrations could not be loaded", error);
    return EMPTY_EXTERNAL_APPS;
  }
}

// SPEC-0300-0023 R-1820 / SPEC-0200-0001 §3.18.5: the appearance comes from the SAME Promise +layout.ts awaited (one IPC). A failure was already
// reported there (console.error); here it only means "no appearance sentence". This module never APPLIES the appearance (only +layout.ts does).
async function loadAppearanceSnapshot(): Promise<AppearanceDto | null> {
  try {
    return await startAppearanceLoad();
  } catch {
    return null;
  }
}

// Keymap load for `runStartupHydrate`'s `loadKeymap` (SPEC-0200-0001 §3.10.1 S1, §3.17.8): IPC -> `evaluateConfig` (the pure evaluation the check
// shares, SPEC-0300-0022 R-1651) -> write the keymap and the external-app state (this is the ONLY writer, AC-1652) -> the notice text.
// The appearance itself is applied by +layout.ts, not here.
export async function loadKeymapForStartup(): Promise<{ notice: string | null }> {
  const keymap = await configLoadKeymap();
  const externalApps = await loadExternalAppsSnapshot();
  const appearance = (await loadAppearanceSnapshot()) ?? NO_APPEARANCE_PROBLEMS;
  const evaluation = evaluateConfig({ keymap, externalApps, appearance });
  keymapState.hydrate(evaluation.validated.effective);
  externalAppsState.hydrate(evaluation.registry);
  return { notice: evaluation.notice };
}
