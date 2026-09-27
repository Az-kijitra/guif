import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0015 R-409, R-431. AC-411.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.5.12.2
//   (MUST-74/81): `features/viewer/request-sequencer.ts`, "the same shape as
//   `list-state.svelte.ts::loadDirectory`'s generation guard" (that guard is
//   inlined there as `let loadSequence = 0; const mySequence = ++loadSequence;
//   ...; if (mySequence !== loadSequence) return null;` -- this module
//   extracts the same increment-and-compare pattern into a small reusable
//   pure object so `viewer-controller.ts` can gate `viewer_open`/
//   `viewer_navigate`/`viewer_read_*` responses the same way).
// Module under test (not yet implemented): ./request-sequencer.ts
//
// Contract assumed (documented in the handback report):
//   export interface RequestSequencer {
//     begin(): number;              // mint a new, strictly increasing token
//     isCurrent(token: number): boolean; // true only for the LATEST token minted
//   }
//   createRequestSequencer(): RequestSequencer

import { createRequestSequencer } from "./request-sequencer";

describe("createRequestSequencer (R-409/R-431)", () => {
  it("mints strictly increasing tokens starting above zero", () => {
    const s = createRequestSequencer();
    const a = s.begin();
    const b = s.begin();
    const c = s.begin();
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("a token is current immediately after being minted, with nothing newer yet", () => {
    const s = createRequestSequencer();
    const a = s.begin();
    expect(s.isCurrent(a)).toBe(true);
  });

  it("AC-411: minting a NEWER token makes every earlier one stale (a.txt then b.txt: only b.txt's token stays current)", () => {
    const s = createRequestSequencer();
    const aToken = s.begin();
    const bToken = s.begin();
    expect(s.isCurrent(aToken)).toBe(false);
    expect(s.isCurrent(bToken)).toBe(true);
  });

  it("a token that was never minted by this sequencer is never current", () => {
    const s = createRequestSequencer();
    s.begin();
    expect(s.isCurrent(999)).toBe(false);
  });

  it("two independent sequencers do not interfere with each other", () => {
    const s1 = createRequestSequencer();
    const s2 = createRequestSequencer();
    const t1 = s1.begin();
    s2.begin();
    s2.begin();
    expect(s1.isCurrent(t1)).toBe(true);
  });
});
