import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0015 R-401~R-407, R-401-2, R-401-3, R-401-5, R-401-6,
//   R-402, R-402-1, R-402-2, R-403, R-404. AC-400~AC-403-1, AC-405,
//   AC-405-1, AC-405-5, AC-406, AC-407.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.5.7
//   (`features/viewer/open-decision.ts`: pure, "(entry, shiftKey) ->
//   navigate-dir | open-file | os-open | noop"; called from BOTH
//   `routes/list-action-wiring.ts`'s `case "open"` and the file-list
//   double-click handler, so the keyboard and mouse paths share one
//   judgment, SHOULD-110).
// Module under test (not yet implemented): ./open-decision.ts
//
// Contract assumed (documented in the handback report):
//   export type OpenDecision = "navigate-dir" | "open-file" | "os-open" | "noop";
//   decideOpen(entry: { entryType: "file" | "dir" } | null, shiftKey: boolean): OpenDecision
//   `entry === null` covers R-402-1 (focused entry not displayed / no focus
//   at all) and, for the tree panel (R-401-6), the caller passes shiftKey
//   without ever calling this for a non-directory (the tree's own focus row
//   is always a directory) -- ISS-0124(d)/L-8 is exercised at the
//   list-action-wiring / tree-wiring layer, not duplicated here.

import { decideOpen } from "./open-decision";

describe("decideOpen (SPEC-0300-0015 §3.5.7, the shared keyboard/mouse judgment)", () => {
  it("AC-401/R-403: a directory with no Shift navigates into it", () => {
    expect(decideOpen({ entryType: "dir" }, false)).toBe("navigate-dir");
  });

  it("AC-400/R-404: a file with no Shift opens in the viewer", () => {
    expect(decideOpen({ entryType: "file" }, false)).toBe("open-file");
  });

  it("AC-405/R-401-2: a file with Shift launches the OS association app", () => {
    expect(decideOpen({ entryType: "file" }, true)).toBe("os-open");
  });

  it("AC-405-1/R-401-3: a directory with Shift does nothing (the key is still consumed by the caller)", () => {
    expect(decideOpen({ entryType: "dir" }, true)).toBe("noop");
  });

  it("AC-407/R-402-1: no focused/displayed entry with no Shift does nothing", () => {
    expect(decideOpen(null, false)).toBe("noop");
  });

  it("R-401-4/R-402-1: no focused/displayed entry with Shift does nothing either", () => {
    expect(decideOpen(null, true)).toBe("noop");
  });
});
