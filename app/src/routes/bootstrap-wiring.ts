// Extracted from +page.svelte's `bootstrap()` (SPEC-0200-0001 §3.7.10.7
// MUST-103, same idea as MUST-93's startup-wiring.ts): everything that runs
// AFTER the startup hydrate -- the single global keydown listener, the
// initial directory load, and the window close-request flush.

import { attachGlobalKeydownListener } from "$lib/features/keyboard/key-dispatch";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createMainKeydownHandler, type MainKeydownWiringDeps } from "./main-keydown-wiring";
import { createCloseRequestHandler, loadInitialDirectory, type InitialDirectoryDeps } from "./navigation-wiring";

// Both exit routes (hardcoded Ctrl+Q and a keymap-bound "exit") converge here.
export function exitOnly(action: string): boolean {
  if (action !== "exit") return false;
  try {
    getCurrentWindow().close().catch(() => {});
  } catch {
    /* not running inside Tauri (plain browser dev): nothing to close */
  }
  return true;
}

export interface BootstrapDeps {
  keydown: MainKeydownWiringDeps;
  initialDirectory: InitialDirectoryDeps;
  focusContainer: () => void;
  // R-244/R-77-2-1: flushes both persistence coordinators.
  flush: () => Promise<void>;
  isDestroyed: () => boolean;
  // Lets the page remove the listener from onDestroy even while the initial
  // load is still pending.
  onKeydownHandler: (handler: (event: Event) => void) => void;
}

export async function runBootstrap(deps: BootstrapDeps): Promise<{ unlistenClose?: () => void }> {
  const keydownHandler = createMainKeydownHandler(deps.keydown);
  deps.onKeydownHandler(keydownHandler);
  attachGlobalKeydownListener(window, keydownHandler);

  // R-208 #6/§3.2.7: awaited so R-14-12/AC-613 can focus the list right after
  // the initial directory settles. A "stale" result means the user already
  // moved on (R-726): the unconditional focus move is skipped so it cannot
  // fight the focus handling of that newer move (MUST-96).
  const initial = await loadInitialDirectory(deps.initialDirectory);
  if (deps.isDestroyed()) {
    window.removeEventListener("keydown", keydownHandler, { capture: true });
    return {};
  }
  if (initial.status !== "stale") deps.focusContainer();

  try {
    const unlisten = await getCurrentWindow().onCloseRequested(createCloseRequestHandler({ flush: deps.flush }));
    if (deps.isDestroyed()) {
      unlisten();
      return {};
    }
    return { unlistenClose: unlisten };
  } catch {
    // Not running inside Tauri (plain browser dev).
    return {};
  }
}
