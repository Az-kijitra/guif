import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0019 W-50 (AC-1210 (i): the viewer's placeholder body), R-1207 (the status-bar fixed items and
//   `キャンセル中…` are unchanged), R-1220 (the `…` is the single character).
// Architecture: SPEC-0200-0001 §3.13.14 SHOULD-192 (placement): `routes/messages.ts` holds the status-bar fixed items,
//   `listErrorText` (tested in list-error-display.test.ts), `キャンセル中…` and W-50. The overlay aria-labels
//   (W-09: `履歴` / `ジャンプリスト`) come from `shared/messages.ts` `REGION_NAMES` in stage C (tested in
//   shared/messages.test.ts); the temporary stage-A keys of this module are NOT asserted here.
//
// Module under test: ./messages.ts

import { ROUTE_MESSAGES } from "./messages";

describe("ROUTE_MESSAGES", () => {
  it("W-50: the viewer's placeholder body is `ファイルが選択されていません` (the old `No file selected` is gone)", () => {
    expect(ROUTE_MESSAGES.viewerNoFile).toBe("ファイルが選択されていません");
  });

  it("R-971: the status-bar fixed items keep their wording", () => {
    expect(ROUTE_MESSAGES.statusFocus).toBe("フォーカス: ");
    expect(ROUTE_MESSAGES.statusSort).toBe("並び替え: ");
    expect(ROUTE_MESSAGES.statusSelected).toBe("選択: ");
    expect(ROUTE_MESSAGES.statusHidden).toBe("隠し: ");
    expect(ROUTE_MESSAGES.statusOn).toBe("オン");
    expect(ROUTE_MESSAGES.statusOff).toBe("オフ");
    expect(ROUTE_MESSAGES.statusFilter).toBe("絞り込み: ");
  });

  it("the progress dialog's cancelling label is `キャンセル中…` (one `…` character)", () => {
    expect(ROUTE_MESSAGES.cancelling).toBe("キャンセル中…");
    expect(ROUTE_MESSAGES.cancelling).not.toContain("...");
  });
});
