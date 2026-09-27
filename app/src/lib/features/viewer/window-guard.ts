// SPEC-0300-0015 R-420-1 (SPEC-0200-0001 §3.5.7): pure route-guard decision
// (no Tauri/DOM access here) -- the viewer window must never show any route
// other than `/viewer`, and the main window must never show `/viewer`.
// `routes/+layout.ts` calls this from a SYNCHRONOUS `load`, so a viewer
// window is redirected to `/viewer` before the main route's `+page.svelte`
// (and its `onMount` bootstrap: global keydown listener, initial directory
// load, etc.) ever mounts, and vice versa.

export type WindowLabel = "main" | "viewer" | (string & {});

function isViewerRoute(pathname: string): boolean {
  return pathname === "/viewer" || pathname.startsWith("/viewer/");
}

// Returns the path to redirect to, or `null` when the current route already
// matches the window's kind.
export function resolveRouteGuardRedirect(windowLabel: WindowLabel, pathname: string): string | null {
  const onViewerRoute = isViewerRoute(pathname);
  if (windowLabel === "viewer" && !onViewerRoute) return "/viewer";
  if (windowLabel !== "viewer" && onViewerRoute) return "/";
  return null;
}
