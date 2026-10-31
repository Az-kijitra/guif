# トレーサビリティ台帳 (`traceability.md`)

仕様ID (Spec ID) ⇔ 実装モジュール ⇔ テストの対応表。パスはリポジトリの `app/` からの相対パスです。

- 単体テスト(TS): 実装と同じフォルダーにある `*.test.ts`(Vitest)。2026-10-31 時点で 219 ファイル / 4,524 件。
- 単体テスト(Rust): 実装と同じフォルダーにある `*_tests.rs` と、`src-tauri/src/` 直下の構造テスト(`*_structure_tests.rs`、`acl_consistency*.rs` など)。2026-10-31 時点で 1,663 件。
- E2E: `e2e/specs/*.mjs`(`npm run e2e`。WebView2 の CDP で実際のアプリを操作)。
- CI(`.github/workflows/ci.yml`): Vitest、svelte-check、tsc、cargo test、ビルド。

| Spec ID | タイトル | 実装モジュール | 単体テスト / E2E |
|---|---|---|---|
| SPEC-0100-0001 | `guif` 全体コンセプト・スコープ境界 | `src/`, `src-tauri/` | 単体テスト全件 |
| SPEC-0100-0003 | 製品名 `guif` | `src-tauri/tauri.conf.json`, `package.json`, `src-tauri/src/shared/product.rs` | `src/tauri-conf.test.ts`, `src/release-config-static.test.ts`, `scripts/release/` |
| SPEC-0200-0001 | 技術スタックとレイヤードアーキテクチャ | `src/lib/`, `src/routes/`, `src-tauri/src/` | `src/import-boundary.test.ts`, `src-tauri/src/*_structure_tests.rs`, `src-tauri/src/acl_consistency*.rs` |
| SPEC-0300-0002 / 0009 | ファイル一覧とツリービュー | `src/lib/features/file-list/`, `src/routes/_components/`, `src-tauri/src/fs/` | `src/lib/features/file-list/*.test.ts`, E2E `list.mjs` / `tree.mjs` / `scroll.mjs` / `select-focus.mjs` |
| SPEC-0300-0003 / 0010 | キーボードナビゲーションとキーマップ | `src/lib/features/keyboard/`, `src/routes/*-wiring.ts`, `src-tauri/src/config/` | `src/lib/features/keyboard/*.test.ts`, `src/routes/*-wiring*.test.ts`, E2E `menubar-keymap.mjs`, `os-input.mjs` |
| SPEC-0300-0004 / 0012 | 検索(部分一致・正規表現) | `src/lib/features/search/` | `src/lib/features/search/*.test.ts` |
| SPEC-0300-0005 / 0011 | ファイル基本操作 | `src/lib/features/file-ops/`, `src-tauri/src/fs_ops/` | `src/lib/features/file-ops/*.test.ts`, `src-tauri/src/fs_ops/**/*_tests.rs`, E2E `clipboard.mjs` |
| SPEC-0300-0006 / 0014 | ZIP 圧縮と展開 (CP932 対応) | `src/lib/features/archive/`, `src-tauri/src/archive/` | `src/lib/features/archive/*.test.ts`, `src-tauri/src/archive/*_tests.rs` |
| SPEC-0300-0007 / 0013 | 訪問履歴とジャンプリスト | `src/lib/features/navigation-history/`, `src-tauri/src/config/navigation.rs` | `src/lib/features/navigation-history/*.test.ts`, E2E `history-invalid.mjs` |
| SPEC-0300-0008 / 0015 | 内蔵ビューア | `src/routes/viewer/`, `src-tauri/src/viewer/` | `src-tauri/src/viewer/*_tests.rs`, E2E `viewer.mjs` / `viewer-text.mjs` / `viewer-keys.mjs` / `viewer-highlight.mjs` |
| SPEC-0300-0016 | パスバーとドライブ切替 | `src/lib/features/path-bar/`, `src-tauri/src/fs/win_drives.rs` | `src/lib/features/path-bar/*.test.ts`, `src-tauri/src/fs/win_drives_tests.rs`, E2E `path-bar.mjs` |
| SPEC-0300-0017 | 画面の見た目 | `src/app.css`, `src/routes/_components/`, 各 feature の `.svelte` | `src/*-static.test.ts`, E2E `layout.mjs` / `color-font.mjs` / `status-bar.mjs` / `window.mjs` |
| SPEC-0300-0018 | 右クリックメニュー | `src/lib/features/context-menu/` | `src/lib/features/context-menu/*.test.ts`, E2E `contextmenu.mjs` |
| SPEC-0300-0019 | 画面の文言の日本語統一 | 各 feature の `messages.ts`、`src/lib/shared/messages.ts` | `src/ac1212-wording.test.ts`, E2E `wording.mjs` |
| SPEC-0300-0020 | メニューバー | `src/lib/features/menu-bar/`, `src/routes/menu-bar-*.ts` | `src/lib/features/menu-bar/*.test.ts`, E2E `menubar.mjs` |
| SPEC-0300-0021 | 外部アプリで開く | `src/lib/features/external-apps/`, `src-tauri/src/external_apps/` | `src/lib/features/external-apps/*.test.ts`, `src-tauri/src/external_apps/*_tests.rs`, E2E `external-apps.mjs` |
| SPEC-0300-0022 | 設定ファイルを開く・チェック | `src/lib/features/settings-file/`, `src-tauri/src/settings_file/`, `src-tauri/src/config_bridge/`, `src-tauri/templates/config.sample.toml` | `src/lib/features/settings-file/*.test.ts`, `src-tauri/src/settings_file/*_tests.rs`, `src-tauri/src/config_bridge/*_tests.rs`, `src/settings-template-static.test.ts`, E2E `settings-file.mjs` / `config.mjs` |
| SPEC-0300-0023 | 画面の見た目を tuif に合わせる | `src-tauri/src/appearance/`, `src/lib/features/appearance/`, `src/lib/shared/appearance-apply.ts`, `src/lib/shared/state/appearance-state.svelte.ts`, `src/lib/shared/file-icons.ts`, `static/fonts/` | `src-tauri/src/appearance/*_tests.rs`, `src/lib/features/appearance/*.test.ts`, `src/appearance-static.test.ts`, `src/lib/shared/file-icons.test.ts`, E2E `appearance.mjs` / `theme.mjs` |
| SPEC-0300-0024 | ファジー検索 (Quick Open) | `src/lib/features/fuzzy-search/`, `src/routes/fuzzy-wiring.ts`, `src/lib/shared/ipc/fuzzy.ts`, `src-tauri/src/fs/fuzzy.rs` | `src/lib/features/fuzzy-search/fuzzy-search-state.test.ts`(Rust 側の単体テストと E2E は未作成) |
| SPEC-0400-0001 | テスト戦略 | `e2e/`, `.github/workflows/ci.yml` | `src/e2e-*-static.test.ts` |
| SPEC-0600-0001 | Windows インストーラー (NSIS) | `src-tauri/tauri.conf.json`, `scripts/release/` | `src/release-*.test.ts`, `src/docs-release-static.test.ts` |
