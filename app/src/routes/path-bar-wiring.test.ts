import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0016 R-762-4, R-765, AC-719, AC-748. Architecture:
//   SPEC-0200-0001 §3.7.10.5 (MUST-101: never go through
//   overlay.openHistoryList, which would refocus the file list on an empty
//   list), §3.7.10.14 SHOULD-143 (nextTick before focusing the list; search
//   cancelled only when the list really opened; endEditing resets text only).
// Module under test: ./path-bar-wiring.ts (TDD stub, RED).

import { openHistoryFromPathBar } from "./path-bar-wiring";

function make(opts: { opens: boolean; searchActive?: boolean }) {
  const order: string[] = [];
  let isOpen = false;
  const deps = {
    history: {
      get isOpen() { return isOpen; },
      openHistory: vi.fn(() => { isOpen = opts.opens; }),
      openJump: vi.fn(() => { isOpen = opts.opens; }),
    },
    search: { active: opts.searchActive ?? false, cancel: vi.fn(() => order.push("cancel")) },
    pathBar: { endEditing: vi.fn(() => order.push("endEditing")) },
    focus: { historyList: vi.fn(() => order.push("focusList")) },
    nextTick: vi.fn(async () => { order.push("tick"); }),
  };
  return { deps, order };
}

describe("openHistoryFromPathBar", () => {
  it("AC-748/R-762-4: an empty list stays closed -- no endEditing, no search cancel, no focus move", async () => {
    const { deps, order } = make({ opens: false, searchActive: true });
    await openHistoryFromPathBar(deps, "history");
    expect(order).toEqual([]);
    expect(deps.search.cancel).not.toHaveBeenCalled();
  });

  it("AC-719/R-765: opened -> cancel search (if active), endEditing, THEN nextTick, THEN focus the list", async () => {
    const { deps, order } = make({ opens: true, searchActive: true });
    await openHistoryFromPathBar(deps, "history");
    expect(order).toEqual(["cancel", "endEditing", "tick", "focusList"]);
  });

  it("jump mode uses openJump; search not active -> no cancel", async () => {
    const { deps, order } = make({ opens: true });
    await openHistoryFromPathBar(deps, "jump");
    expect(deps.history.openJump).toHaveBeenCalled();
    expect(deps.history.openHistory).not.toHaveBeenCalled();
    expect(order).toEqual(["endEditing", "tick", "focusList"]);
  });
});
