# テスト結果台帳

| 実行日時 | Case ID | 結果(PASS/FAIL/NOT_RUN) | 証跡(ログ/スクショへのリンク) | 実行者(subagent/人間) |
|---|---|---|---|---|
| 2026-09-22 | 未採番(SPEC-0300-0009) | PASS(フロント・バック双方) | `docs/architecture/traceability.md` L42 | unit-test-writer → code-generator → code-reviewer → 発注者(rustup導入後、`cargo test --lib`実行) |
| 2026-09-22 | 未採番(SPEC-0300-0010) | PASS(フロント・バック双方) | `docs/architecture/traceability.md` L43 | unit-test-writer → code-generator → code-reviewer → 発注者(rustup導入後、`cargo test --lib`実行) |

## 2026-09-22 MVP Phase 1(SPEC-0300-0009/0010) テスト実行結果

### フロントエンド(vitest): PASS

**対象ファイル** (10ファイル / 181件テスト)
- `app/src/lib/features/file-list/{list-layout,sort,selection,navigation,tree,dir-load,aria}.test.ts`
- `app/src/lib/features/keyboard/{keymap-defaults,keymap-resolve,key-dispatch}.test.ts`

**実行コマンド・結果**
- `cd app && npx vitest run`: 181件全て成功
- `npx tsc --noEmit -p tsconfig.json`: エラーなし

**実行プロセス**
1. unit-test-writer: テストコード作成(TDD)
2. code-generator: 実装コード作成 + vitest実行で全件成功を確認
3. code-reviewer: 独立してvitest再実行し同じ結果を確認。合わせてStorage Provider再導入・feature間直接importがないことをgrep監査で確認。「PR作成可」と判定

### バックエンド(Rust): PASS【2026-09-22 更新・実行検証済み】

**経緯**: 当初は本実行環境にcargo/rustcが無くNOT_RUNだったが、発注者がrustupでRustツールチェインを導入。`export PATH="$HOME/.cargo/bin:$PATH"`の上で`cd app/src-tauri && cargo test --lib`を実行し、実際にコンパイル・実行して検証した。

**実行結果**
```
running 16 tests
test shared::schema::keymap::tests::r20_default_profile_is_windows ... ok
test keymap::defaults::tests::default_keymap_config_matches_schema_default ... ok
test shared::schema::keymap::tests::r41_default_custom_overrides_are_empty ... ok
test shared::schema::keymap::tests::r42_legacy_field_names_are_not_treated_as_aliases ... ok
test shared::schema::keymap::tests::r41_toml_field_names_are_input_keymap_profile_and_input_keymap_custom ... ok
test config::io::tests::load_missing_file_returns_defaults ... ok
test fs::query::tests::ac13_directory_size_is_empty ... ok
test fs::query::tests::ac56_entry_has_the_seven_specified_fields ... ok
test fs::query::tests::ac56_ext_is_extracted_without_the_leading_dot ... ok
test fs::query::tests::ac20_name_sort_desc_reverses_the_case_insensitive_order ... ok
test fs::query::tests::show_hidden_false_excludes_dotfiles ... ok
test fs::query::tests::show_hidden_true_includes_dotfiles_and_marks_hidden_flag ... ok
test fs::query::tests::ac21_size_sort_is_numeric_not_lexicographic ... ok
test fs::query::tests::ac20_name_sort_is_case_insensitive ... ok
test fs::query::tests::ac22_type_sort_groups_dirs_first_then_ext_then_name ... ok
test config::io::tests::ac33_saving_unrelated_settings_preserves_manually_edited_keymap_fields ... ok

test result: ok. 16 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
```

**対象ファイル**
- `app/src-tauri/src/fs/query.rs`
- `app/src-tauri/src/shared/schema/keymap.rs`
- `app/src-tauri/src/keymap/defaults.rs`
- `app/src-tauri/src/config/io.rs`

**既知リスクの解消**: `config/io.rs`の`Config`構造体が`#[serde(flatten)]`を用いており、`toml`クレートとの既知の相性問題(スカラー/テーブルの宣言順序制約)が懸念されていたが、`ac33_saving_unrelated_settings_preserves_manually_edited_keymap_fields`テスト(flatten構造体のTOMLラウンドトリップを直接検証)が成功したことにより、この懸念は解消された。

