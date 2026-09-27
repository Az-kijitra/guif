// The Tauri window has no backend HTTP server to render against, so the
// SvelteKit app runs purely client-side (SPA mode via adapter-static's
// `fallback`, see svelte.config.js).
export const ssr = false;

// SPEC-0300-0015 R-420-1 (SPEC-0200-0001 §3.5.7): a synchronous route guard,
// run BEFORE any page component mounts, so the viewer window never mounts the
// main route's `onMount` bootstrap (global keydown listener, initial
// directory load, window-close flush, ...) and the main window never mounts
// `/viewer`'s. `getCurrentWindow().label` is a plain, already-known property
// (no IPC round-trip), so this check needs no `await`.
import { redirect } from "@sveltejs/kit";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { resolveRouteGuardRedirect } from "$lib/features/viewer/window-guard";

export function load({ url }: { url: URL }): Record<string, never> {
  let label = "main";
  try {
    label = getCurrentWindow().label;
  } catch {
    // Not running inside Tauri (plain browser dev): treat as the main window.
  }
  const target = resolveRouteGuardRedirect(label, url.pathname);
  if (target !== null) {
    throw redirect(307, target);
  }
  return {};
}
