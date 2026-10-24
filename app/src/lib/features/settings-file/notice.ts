// SPEC-0300-0022 R-1643 / R-1654 / R-1663; SPEC-0300-0019 第5版 W-A9~W-AC; SPEC-0200-0001 §3.17.8: the unknown-settings notice (W-AC) and the
// check-result notice (W-A9 + ...). Pure. The choice of the display time is made HERE, not in routes/ (SHOULD-19: routes hold no branch).

import { limitList } from "$lib/shared/notice-list";
import type { UnknownSettingDto } from "$lib/shared/ipc/config";
import { SETTINGS_FILE_MESSAGES as M } from "./messages";

// R-1663: quiet = the check without a problem / an open result, startup = the start-up notice without a config.toml problem (SHOULD-119),
// problem = anything the user has to read (an error or an unknown setting).
export const NOTICE_MS = { quiet: 2500, startup: 6000, problem: 15000 } as const;

function itemOf(u: UnknownSettingDto): string {
  const base =
    u.kind === "appField"
      ? M.unknownAppField(u.position ?? 0, u.name)
      : u.kind === "tableKey"
        ? M.unknownTableKey(u.table ?? "", u.name)
        : M.unknownKey(u.name);
  return u.line === null ? base : base + M.atLine(u.line);
}

// R-1643-1: in the order of the lines (stable); items without a line follow, in the order given. 0 items = null.
export function buildUnknownSettingsNotice(unknown: readonly UnknownSettingDto[]): string | null {
  if (unknown.length === 0) return null;
  const sorted = unknown
    .map((u, i) => ({ u, i }))
    .sort((a, b) => (a.u.line ?? Infinity) - (b.u.line ?? Infinity) || a.i - b.i)
    .map(({ u }) => itemOf(u));
  return M.unknownSettings(unknown.length, limitList(sorted));
}

// R-1654: W-A9 + (W-AB | W-AA | the config.toml part), and how long to show it (R-1663-1).
export function buildCheckNotice(input: { present: boolean; configNotice: string | null }): { text: string; durationMs: number } {
  if (!input.present) return { text: M.checkPrefix + M.checkNoFile, durationMs: NOTICE_MS.quiet };
  if (input.configNotice === null) return { text: M.checkPrefix + M.checkOk, durationMs: NOTICE_MS.quiet };
  return { text: M.checkPrefix + input.configNotice, durationMs: NOTICE_MS.problem };
}
