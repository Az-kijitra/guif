// The Tauri window has no backend HTTP server to render against, so the
// SvelteKit app runs purely client-side (SPA mode via adapter-static's
// `fallback`, see svelte.config.js).
export const ssr = false;

// SPEC-0300-0015 R-420-1 (SPEC-0200-0001 §3.5.7): a route guard, run BEFORE any page component mounts, so the viewer window
// never mounts the main route's `onMount` bootstrap (global keydown listener, initial directory load, window-close flush, ...)
// and the main window never mounts `/viewer`'s. `getCurrentWindow().label` is a plain, already-known property (no IPC round-trip).
//
// SPEC-0300-0023 R-1721 / R-1742 / R-1749; SPEC-0200-0001 §3.18.5: the colours are set BEFORE the first paint. The guard stays
// first and synchronous. The main window then waits for the back end's resolved values (the IPC is started at module load, only
// for the main label, so the wait overlaps other start-up work; routes/startup-wiring.ts shares the same Promise). The viewer
// window makes no IPC: it reads the values its initialization script placed on `window`.
import { redirect } from "@sveltejs/kit";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { resolveRouteGuardRedirect } from "$lib/features/viewer/window-guard";
import { applyAppearance, applyCssVars, readViewerInitVars } from "$lib/shared/appearance-apply";
import { startAppearanceLoad } from "$lib/shared/state/appearance-state.svelte";
import type { AppearanceDto } from "$lib/shared/ipc/appearance";

function currentLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    // Not running inside Tauri (plain browser dev): treat as the main window.
    return "main";
  }
}

const startedLabel = currentLabel();
const pending: Promise<AppearanceDto> | null = startedLabel === "main" ? startAppearanceLoad() : null;
// A failure is reported by `load` (or by the start-up wiring); keep an early rejection from being "unhandled".
pending?.catch(() => {});

export async function load({ url }: { url: URL }): Promise<Record<string, never>> {
  const label = currentLabel();
  const target = resolveRouteGuardRedirect(label, url.pathname);
  if (target !== null) {
    throw redirect(307, target);
  }
  if (label === "viewer") {
    const vars = readViewerInitVars();
    if (vars === null) console.error("appearance: the viewer's initialization values could not be read");
    else applyCssVars(vars);
    return {};
  }
  try {
    applyAppearance(await (pending ?? startAppearanceLoad()));
  } catch (e) {
    // The start does not stop: carry on without colours (the window background was painted by the back end).
    console.error("appearance_load failed", e);
  }
  return {};
}
