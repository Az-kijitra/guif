import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0019 W-10 / T-03 (AC-1204 (i)): the delete button's aria-label is `{path} を一覧から削除`
//   (the visible `×` stays, R-1203 5). W-14 (`項目なし`) is tested in navigation-history-state.test.ts.
//
// Module under test: ./messages.ts

import { NAVIGATION_HISTORY_MESSAGES } from "./messages";

describe("NAVIGATION_HISTORY_MESSAGES.removeItem (W-10)", () => {
  it("`{path} を一覧から削除` (half-width space after the path)", () => {
    expect(NAVIGATION_HISTORY_MESSAGES.removeItem("C:\\work\\a")).toBe("C:\\work\\a を一覧から削除");
  });

  it("the old `Remove {path}` is gone", () => {
    expect(NAVIGATION_HISTORY_MESSAGES.removeItem("C:\\x").startsWith("Remove ")).toBe(false);
  });

  it("addedJump formats the jump notification", () => {
    expect(NAVIGATION_HISTORY_MESSAGES.addedJump("C:\\work")).toBe("ジャンプリストに追加しました: C:\\work");
  });
});
