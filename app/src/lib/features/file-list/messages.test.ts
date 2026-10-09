import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0019 W-06 (sort-key names), W-11 (tree node toggle), W-34 / W-35 (notices), W-25.
// Architecture: SPEC-0200-0001 §3.13.2 / §3.13.4: `features/file-list/messages.ts` holds `SORT_KEY_LABELS`,
//   `TREE_MESSAGES` (`collapse` / `expand`) and `FILE_LIST_NOTICES` (`someFoldersNotListed`, `displaySettingsCorrupted`).
//   `sort.ts`'s `sortKeyLabel` reads `SORT_KEY_LABELS` (its own test stays in sort.test.ts).
//
// Module under test: ./messages.ts

import { FILE_LIST_NOTICES, SORT_KEY_LABELS, TREE_MESSAGES } from "./messages";

describe("SORT_KEY_LABELS (W-06)", () => {
  it("name / size / type / modified -> 名前 / サイズ / 種類 / 更新日時", () => {
    expect(SORT_KEY_LABELS).toEqual({ name: "名前", size: "サイズ", type: "種類", modified: "更新日時" });
  });
});

describe("TREE_MESSAGES (W-11, R-1222)", () => {
  it("the node toggle is `折りたたみ` / `展開` (AC-1205: collapsed node -> 展開, expanded node -> 折りたたみ)", () => {
    expect(TREE_MESSAGES.collapse).toBe("折りたたみ");
    expect(TREE_MESSAGES.expand).toBe("展開");
  });
});

describe("FILE_LIST_NOTICES (W-34 / W-35 / W-25)", () => {
  it("W-34: some folders of the tree could not be listed", () => {
    expect(FILE_LIST_NOTICES.someFoldersNotListed).toBe("一部のフォルダーの中身を読み込めませんでした。");
  });

  it("W-35: ui-state.toml was corrupted", () => {
    expect(FILE_LIST_NOTICES.displaySettingsCorrupted).toBe(
      "ui-state.toml を読み込めなかったため、表示の設定を既定に戻しました。元のファイルは退避しました。",
    );
  });
});
