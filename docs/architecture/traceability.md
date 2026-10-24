# トレーサビリティ台帳 (`traceability.md`)

仕様ID (Spec ID) ⇔ 実装モジュール ⇔ テストスイートの対応表。

| Spec ID | タイトル | 実装モジュール | 単体テスト / E2E テスト |
|---|---|---|---|
| SPEC-0100-0001 | `guif` 全体コンセプト・スコープ境界 | `app/src/`, `app/src-tauri/` | 単体テスト全件 (Vitest 4,510件, Cargo test 1,658件) |
| SPEC-0100-0003 | 製品名 `guif` の確定 | `app/src-tauri/tauri.conf.json`, `app/package.json` | ビルド検証、E2E テスト |
| SPEC-0200-0001 | 技術スタックとレイヤードアーキテクチャ (Tauri 2 + Rust + Svelte 5) | `app/src/lib/`, `app/src-tauri/src/` | フロントエンド・バックエンド各単体テスト |
| SPEC-0300-0002 | ファイル一覧とツリービュー | `app/src/lib/features/file-list/`, `app/src/lib/features/tree-view/` | `list-state.svelte.test.ts`, `tree-state.svelte.test.ts`, E2E `AC-17` |
| SPEC-0300-0003 | キーボードナビゲーションとキーマップ | `app/src/lib/features/keyboard/`, `app/src-tauri/src/keymap/` | `keymap_tests.rs`, `keyboard-navigation.test.ts` |
| SPEC-0300-0004 | 検索機能 (インクリメンタル・部分一致・正規表現) | `app/src/lib/features/search/`, `app/src-tauri/src/fs/search/` | `search_tests.rs`, `search-state.svelte.test.ts` |
| SPEC-0300-0005 | ファイル基本操作 (コピー、切り取り、貼り付け、削除、名前変更、新規作成) | `app/src-tauri/src/fs_ops/`, `app/src/lib/features/file-ops/` | `fs_ops_tests.rs`, `clipboard_win_tests.rs`, E2E テスト |
| SPEC-0300-0006 | ZIP 圧縮と展開 (CP932 対応) | `app/src-tauri/src/archive/`, `app/src/lib/features/zip/` | `archive_tests.rs`, `zip-dialog.svelte.test.ts` |
| SPEC-0300-0007 | 訪問履歴とジャンプリスト | `app/src/lib/features/history/`, `app/src-tauri/src/fs/history/` | `history_tests.rs`, `history-state.svelte.test.ts` |
| SPEC-0300-0008 | 内蔵テキスト・Markdown・画像ビューア | `app/src/lib/features/viewer/`, `app/src-tauri/src/viewer/` | `viewer_tests.rs`, `viewer-state.svelte.test.ts` |
| SPEC-0300-0021 | 外部アプリで開く機能 | `app/src-tauri/src/external_apps/`, `app/src/lib/features/external-apps/` | `external_apps_tests.rs`, `external-apps.test.ts` |
| SPEC-0300-0022 | 設定ファイルを開く・設定ファイルのチェック | `app/src-tauri/src/config/`, `app/src/lib/features/config/` | `config_tests.rs`, `config-validation.test.ts` |
| SPEC-0300-0023 | 画面の見た目を tuif に合わせる (配色・フォント・枠線・配置) 第2版 | `app/src/app.css`, `app/src/lib/features/file-list/`, `app/src/routes/` | `app.css`, E2E `AC-17`, E2E `AC-18` |
