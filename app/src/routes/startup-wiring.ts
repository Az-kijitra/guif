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
import { keymapState } from "$lib/features/keyboard/keymap-state.svelte";
import { validateKeymapEntries, type ValidatedKeymap } from "$lib/features/keyboard/keymap-validate";
import { keyRules } from "$lib/features/keyboard/key-rules";
import { externalAppsLoad } from "$lib/shared/ipc/external-apps";
import { externalAppsState } from "$lib/features/external-apps/external-apps-state.svelte";
import { buildRegistry } from "$lib/features/external-apps/registry";
import { buildExternalAppsNotice } from "$lib/features/external-apps/notice";
import { buildKeymapLoadNotice } from "$lib/features/keyboard/keymap-notice";
import { buildThemeNotice } from "$lib/shared/theme-notice";

export interface StartupHydrateDeps {
  loadUiState: () => Promise<{ notice: string | null }>;
  loadKeymap: () => Promise<{ notice: string | null }>;
  loadNavigation: () => Promise<string | null>; // navigationPersistence.hydrateAll()'s contract (MUST-88)
}

// SHOULD-119: shown for longer than the default 2.5s auto-dismiss so it is
// not clipped before the user reads it.
const STARTUP_NOTICE_DURATION_MS = 6000;

export async function runStartupHydrate(deps: StartupHydrateDeps): Promise<void> {
  const uiStateResult = await deps.loadUiState();
  const keymapResult = await deps.loadKeymap();
  const navigationNotice = await deps.loadNavigation();

  const notices = [keymapResult.notice, uiStateResult.notice, navigationNotice].filter(
    (n): n is string => n !== null && n !== "",
  );

  if (notices.length > 0) {
    // SHOULD-119: priority so a subsequent short-lived notice (e.g. R-40-3's
    // tree load-failure message) appends instead of clobbering this one.
    statusMessage.showPriority(notices.join(" / "), STARTUP_NOTICE_DURATION_MS);
  }
}

// SPEC-0300-0021 R-1501 / R-1574 (SPEC-0200-0001 §3.16.6): the external-app registrations are read ONCE here, judged against the EFFECTIVE keymap
// (the keys the user's keymap took are not usable), written to the state (this is the ONLY writer), and the notice of the unusable ones is returned.
// A failed load does not stop the start: zero registrations, no notice, one console line (MINOR-33).
async function loadExternalAppsForStartup(validated: ValidatedKeymap): Promise<string | null> {
  try {
    const registry = buildRegistry(await externalAppsLoad(), keyRules(validated.effective));
    externalAppsState.hydrate(registry);
    return buildExternalAppsNotice(registry);
  } catch (error) {
    console.error("external apps: the registrations could not be loaded", error);
    return null;
  }
}

// Keymap load for `runStartupHydrate`'s `loadKeymap` (SPEC-0200-0001 §3.10.1 S1): applies the
// validated effective keymap to the feature state, then returns only the notice text. The config.toml part
// of the startup message is the keymap notice followed by the theme notice, as separate sentences joined
// with one space (SPEC-0300-0017 R-917-4 / AC-958; SPEC-0200-0001 §3.11.4). The theme itself is applied by
// the platform and CSS, not here.
export async function loadKeymapForStartup(): Promise<{ notice: string | null }> {
  const raw = await configLoadKeymap();
  const validated = validateKeymapEntries(raw.entries);
  keymapState.hydrate(validated.effective);
  const parts = [
    buildKeymapLoadNotice(raw.parseError, validated.invalidActions, {
      alsoDefaultsTheme: raw.parseError?.wholeFile === true,
    }),
    buildThemeNotice(raw.uiThemeInvalid),
    await loadExternalAppsForStartup(validated),
  ].filter((n): n is string => n !== null);
  return { notice: parts.length > 0 ? parts.join(" ") : null };
}
