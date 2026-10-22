// SPEC-0300-0022 R-1662 / SPEC-0200-0001 §3.17.8: a list inside a notice shows the FIRST `max` items and the rest as `ほか {m} 件`.
// Shared by W-32 / W-9A / W-9C / W-AC, so that the four lists cannot drift apart. Pure; `shared/` knows no feature.

import { COMMON } from "$lib/shared/messages";

export function limitList(items: readonly string[], max = 5): string {
  const shown = items.slice(0, max).join(", ");
  const rest = items.length - max;
  return rest > 0 ? `${shown}, ${COMMON.listRest(rest)}` : shown;
}
