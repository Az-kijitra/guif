import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0019 W-02 / W-04 / W-05 (AC-1201), SPEC-0300-0012 R-113-4 (`正規表現が不正です`).
//   W-03 (`aria-label="正規表現"` on the `.*` toggle) is a Svelte attribute: the value is fixed here through
//   `SEARCH_MESSAGES.regexToggleLabel` (stage C adds this key; SPEC-0200-0001 §3.13.2 puts W-03 in `search/messages.ts`).
//
// Module under test: ./messages.ts

import { SEARCH_MESSAGES } from "./messages";

describe("SEARCH_MESSAGES (W-02 / W-04 / W-05)", () => {
  it("input aria-label `検索`, buttons `適用` / `クリア`", () => {
    expect(SEARCH_MESSAGES.inputLabel).toBe("検索");
    expect(SEARCH_MESSAGES.apply).toBe("適用");
    expect(SEARCH_MESSAGES.clear).toBe("クリア");
  });

  it("R-113-4: the invalid-regex text is unchanged", () => {
    expect(SEARCH_MESSAGES.invalidRegex).toBe("正規表現が不正です");
  });

  it("W-03: the regex toggle's aria-label is `正規表現` (the visible text `.*` stays in the .svelte, R-1203 5)", () => {
    expect((SEARCH_MESSAGES as Record<string, unknown>).regexToggleLabel).toBe("正規表現");
  });
});
