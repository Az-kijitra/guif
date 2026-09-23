import { describe, expect, it } from "vitest";
import { dropEffectForCut, resolvePasteMode } from "./clipboard-mode";

// Spec: SPEC-0300-0011 (file operations detail) §3.2
// Module under test (not yet implemented): ./clipboard-mode.ts
//
// R-16: an internal cut writes a "MOVE" drop-effect hint for other apps
//       (output-side only — R-19-1 says this app never *reads* it back).
// R-19: paste is a move only when the clipboard's *origin* is this app's own
//       cut; every other origin (this app's own copy, or any external
//       clipboard) is a copy.
// R-19-1: even a clipboard cut by another app is always pasted as a copy —
//         the (ignored) drop-effect hint must not influence the decision.

describe("dropEffectForCut (SPEC-0300-0011 R-16)", () => {
  it("AC-05: produces the MOVE drop-effect value written for an internal cut", () => {
    expect(dropEffectForCut()).toBe("MOVE");
  });
});

describe("resolvePasteMode (SPEC-0300-0011 R-19, R-19-1)", () => {
  it("AC-05 (paste-mode half): an internal cut resolves to 'move'", () => {
    const mode = resolvePasteMode({ origin: "internal-cut", paths: ["/a.txt"] });
    expect(mode).toBe("move");
  });

  it("AC-06: an internal copy resolves to 'copy'", () => {
    const mode = resolvePasteMode({ origin: "internal-copy", paths: ["/a.txt"] });
    expect(mode).toBe("copy");
  });

  it("AC-06-1: an external clipboard resolves to 'copy', even if it originated from a cut", () => {
    const mode = resolvePasteMode({ origin: "external", paths: ["/a.txt"] });
    expect(mode).toBe("copy");
  });

  it("AC-06-1/R-19-1: an external drop-effect hint claiming MOVE is ignored", () => {
    // The input type intentionally has no drop-effect field to read from —
    // this test exists to document/lock in that omission. If a future
    // implementation is tempted to add one and honor it, this test's
    // intent (R-19-1) is violated even though the exact shape may differ;
    // the essential assertion is that "external" always yields "copy".
    const mode = resolvePasteMode({ origin: "external", paths: ["/a.txt"] });
    expect(mode).toBe("copy");
  });
});
