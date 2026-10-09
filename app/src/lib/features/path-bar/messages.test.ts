import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0019 W-07 (AC-1203: the path input's aria-label is `パス`; the visible label `PATH` is a fixed
//   display, R-1203 1, and stays in PathBar.svelte), SPEC-0300-0016 R-731 / R-744-1 (the candidate texts are unchanged, R-1207).
//
// Module under test: ./messages.ts

import { PATH_BAR_MESSAGES } from "./messages";

describe("PATH_BAR_MESSAGES", () => {
  it("W-07: the input's aria-label is `パス` (the old `Current directory` is gone)", () => {
    expect(PATH_BAR_MESSAGES.inputLabel).toBe("パス");
  });

  it("R-1207: the candidate texts are unchanged", () => {
    expect(PATH_BAR_MESSAGES.noCandidates).toBe("候補がありません。");
    expect(PATH_BAR_MESSAGES.ambiguousCandidates(3)).toBe("候補が3件あります。");
  });
});
