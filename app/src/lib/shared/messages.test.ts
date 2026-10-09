import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0019 R-1220 (term table), R-1221, W-02 / W-07 / W-09 / W-12 / W-14 / W-16 / W-20~W-27 /
//   W-33 / W-36~W-38 / W-51, AC-1206 (i) (the value of `読み込み中…`), AC-1212.
// Architecture: SPEC-0200-0001 §3.13.2 / §3.13.14 SHOULD-192 (the placement table) and MUST-128 (b) / MUST-127 (c):
//   `shared/messages.ts` is a LEAF module that holds the terms, the region names, the common words, the sentences shown
//   by more than one feature, the file-operation error-code table and the notices of shared modules. This small test
//   pins the VALUES (the module has no behaviour to test). The keys are the ones introduced in stage A; stage C only
//   changes the values marked there as "stage C".
//
// Module under test: ./messages.ts

import {
  COMMON,
  FILE_OP_ERROR_MESSAGES,
  OPERATION_NAMES,
  REGION_NAMES,
  SHARED_NOTICES,
  SHARED_SENTENCES,
} from "./messages";

describe("OPERATION_NAMES: the R-1220 terms", () => {
  it("cut / copy / paste / rename / delete / zipCompress / zipExtract", () => {
    expect(OPERATION_NAMES.cut).toBe("切り取り");
    expect(OPERATION_NAMES.copy).toBe("コピー");
    expect(OPERATION_NAMES.paste).toBe("貼り付け");
    expect(OPERATION_NAMES.rename).toBe("名前の変更");
    expect(OPERATION_NAMES.delete).toBe("削除");
    expect(OPERATION_NAMES.zipCompress).toBe("ZIPに圧縮");
    expect(OPERATION_NAMES.zipExtract).toBe("ZIPを展開");
  });
});

describe("REGION_NAMES: the focus-area / accessible names", () => {
  it("W-23 / W-24 / W-27: history -> 履歴, jumpList -> ジャンプリスト, sortMenu -> 並び替えメニュー", () => {
    expect(REGION_NAMES.history).toBe("履歴");
    expect(REGION_NAMES.jumpList).toBe("ジャンプリスト");
    expect(REGION_NAMES.sortMenu).toBe("並び替えメニュー");
  });

  it("MUST-128 (b): contextMenu -> 右クリックメニュー (the aria-label of ContextMenu.svelte, SPEC-0300-0018 R-1111)", () => {
    expect(REGION_NAMES.contextMenu).toBe("右クリックメニュー");
  });

  it("W-02 / W-07 and the other areas (R-972): 検索 / パス / ツリー / 一覧 / ダイアログ / なし", () => {
    expect(REGION_NAMES.search).toBe("検索");
    expect(REGION_NAMES.path).toBe("パス");
    expect(REGION_NAMES.tree).toBe("ツリー");
    expect(REGION_NAMES.list).toBe("一覧");
    expect(REGION_NAMES.dialog).toBe("ダイアログ");
    expect(REGION_NAMES.none).toBe("なし");
  });
});

describe("COMMON: the common words", () => {
  it("W-12 / W-51 (AC-1206 (i)): loading is `読み込み中…` (one `…` character, not three dots)", () => {
    expect(COMMON.loading).toBe("読み込み中…");
    expect(COMMON.loading).not.toContain("...");
    expect(COMMON.loading.endsWith("…")).toBe(true);
  });

  it("W-14 / W-16 (R-1220 `項目なし`): noItems", () => {
    expect(COMMON.noItems).toBe("項目なし");
  });

  it("buttons and labels: キャンセル / 閉じる / 上書き / スキップ / すべてに適用 / 名前", () => {
    expect(COMMON.cancel).toBe("キャンセル");
    expect(COMMON.close).toBe("閉じる");
    expect(COMMON.overwrite).toBe("上書き");
    expect(COMMON.skip).toBe("スキップ");
    expect(COMMON.applyToAll).toBe("すべてに適用");
    expect(COMMON.name).toBe("名前");
  });

  it("R-1204 / T-06: the detail prefix is `詳細: ` (with the single half-width space after the colon)", () => {
    expect(COMMON.detailPrefix).toBe("詳細: ");
  });
});

describe("SHARED_SENTENCES: the sentences shown by more than one feature (R-1201 1)", () => {
  it("noTarget / noSelection / notZipFile / extractOneAtATime keep their wording", () => {
    expect(SHARED_SENTENCES.noTarget).toBe("対象がありません");
    expect(SHARED_SENTENCES.noSelection).toBe("選択がありません");
    expect(SHARED_SENTENCES.notZipFile).toBe("ZIPファイルではありません");
    expect(SHARED_SENTENCES.extractOneAtATime).toBe("展開は1件ずつ指定してください");
  });
});

describe("FILE_OP_ERROR_MESSAGES: W-25 `フォルダー`", () => {
  it("the entries that name a folder use `フォルダー`", () => {
    expect(FILE_OP_ERROR_MESSAGES.parent_not_found).toBe("作成先のフォルダーが見つかりません。");
    expect(FILE_OP_ERROR_MESSAGES.destination_not_found).toBe("宛先フォルダーが見つかりません。");
    expect(FILE_OP_ERROR_MESSAGES.destination_not_dir).toBe("宛先がフォルダーではありません。");
    expect(FILE_OP_ERROR_MESSAGES.overwrite_ancestor).toBe("コピー先の上位フォルダーを上書きすることはできません。");
    expect(FILE_OP_ERROR_MESSAGES.not_a_directory).toBe("フォルダーではありません。");
  });

  it("no entry uses the bare `フォルダ` (a `フォルダ` not followed by `ー`)", () => {
    for (const [code, text] of Object.entries(FILE_OP_ERROR_MESSAGES)) {
      expect(text, code).not.toMatch(/フォルダ(?!ー)/);
    }
  });

  it("the entries that do not name a folder are unchanged (R-1207)", () => {
    expect(FILE_OP_ERROR_MESSAGES.invalid_path).toBe("パスが正しくありません。");
    expect(FILE_OP_ERROR_MESSAGES.not_found).toBe("対象が見つかりません。");
    expect(FILE_OP_ERROR_MESSAGES.no_items).toBe("対象が選択されていません。");
    expect(FILE_OP_ERROR_MESSAGES.permission_denied).toBe("権限がないため操作を実行できませんでした。");
    expect(FILE_OP_ERROR_MESSAGES.conflict).toBe("同名の項目がすでに存在するため処理を中止しました。");
  });
});

describe("SHARED_NOTICES: the notices of shared modules (W-33 / W-36 / W-37 / W-38)", () => {
  it("W-33: the invalid ui_theme notice", () => {
    expect(SHARED_NOTICES.themeInvalid).toBe(
      'config.toml の ui_theme を解釈できないため、OS のテーマ設定に従います(使える値: "light"、"dark"、"system")。',
    );
  });

  it("W-36: navigation.toml was corrupted", () => {
    expect(SHARED_NOTICES.navigationCorrupted).toBe(
      "navigation.toml を読み込めなかったため、履歴・ジャンプリスト・検索履歴を空にしました。元のファイルは退避しました。",
    );
  });

  it("W-37: navigation.toml could not be saved", () => {
    expect(SHARED_NOTICES.navigationSaveFailed).toBe("履歴・ジャンプリスト・検索履歴を保存できませんでした。");
  });

  it("W-38: the saved data could not be loaded", () => {
    expect(SHARED_NOTICES.loadFailed).toBe("保存データを読み込めなかったため、今回の変更は保存しません。");
  });
});
