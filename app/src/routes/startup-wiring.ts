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
import { validateKeymapEntries } from "$lib/features/keyboard/keymap-validate";
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
  ].filter((n): n is string => n !== null);
  return { notice: parts.length > 0 ? parts.join(" ") : null };
}
