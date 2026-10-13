// SPEC-0300-0020 R-1354 / SPEC-0300-0018 R-1081 / SPEC-0200-0001 §3.14.1-2. Pure.
// Highlight navigation shared by the context menu and the menu bar: disabled items and separators are skipped.

export type NavEntry<Id extends string = string> = { type: "item"; id: Id; enabled: boolean } | { type: "separator" };

function enabledIds<Id extends string>(entries: readonly NavEntry<Id>[]): Id[] {
  const ids: Id[] = [];
  for (const e of entries) if (e.type === "item" && e.enabled) ids.push(e.id);
  return ids;
}

export function firstEnabled<Id extends string>(entries: readonly NavEntry<Id>[]): Id | null {
  const ids = enabledIds(entries);
  return ids.length > 0 ? ids[0] : null;
}

export function lastEnabled<Id extends string>(entries: readonly NavEntry<Id>[]): Id | null {
  const ids = enabledIds(entries);
  return ids.length > 0 ? ids[ids.length - 1] : null;
}

export function nextEnabled<Id extends string>(
  entries: readonly NavEntry<Id>[],
  current: Id | null,
  dir: "up" | "down",
  wrap: boolean,
): Id | null {
  const ids = enabledIds(entries);
  if (ids.length === 0) return null;
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return dir === "down" ? ids[0] : ids[ids.length - 1];
  const raw = dir === "down" ? at + 1 : at - 1;
  if (raw < 0 || raw >= ids.length) return wrap ? ids[(raw + ids.length) % ids.length] : ids[at];
  return ids[raw];
}
