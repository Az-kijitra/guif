# テスト結果台帳

| 実行日時 | Case ID | 結果(PASS/FAIL/NOT_RUN) | 証跡(ログ/スクショへのリンク) | 実行者(subagent/人間) |
|---|---|---|---|---|
| 2026-09-22 | 未採番(SPEC-0300-0009) | 混合: フロント PASS / バック NOT_RUN | `docs/architecture/traceability.md` L42 | unit-test-writer → code-generator → code-reviewer |
| 2026-09-22 | 未採番(SPEC-0300-0010) | 混合: フロント PASS / バック NOT_RUN | `docs/architecture/traceability.md` L43 | unit-test-writer → code-generator → code-reviewer |

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

### バックエンド(Rust): NOT_RUN

**理由**: 本実行環境にcargo/rustcがインストールされていない(`which cargo`/`which rustc`ともに未検出)

**対象ファイル**
- `app/src-tauri/src/fs/query.rs`
- `app/src-tauri/src/shared/schema/keymap.rs`
- `app/src-tauri/src/keymap/defaults.rs`
- `app/src-tauri/src/config/io.rs`

**代替措置**
- code-generatorおよびcode-reviewerが独立して、テストコードと実装コードを手動レビュー
- 型シグネチャ・期待値の論理的整合性を確認済み(実行による検証ではない)
- traceability.md L42-43に確認済みとして記録

**既知のリスク・次の確認点**
- `app/src-tauri/src/config/io.rs`の`Config`構造体が`#[serde(flatten)]`を用いており、`toml`クレートとの既知の相性問題(スカラー/テーブルの宣言順序制約)がある。フィールド順序で回避を試みているが、**実行による検証はまだ未実施**
- 次にcargo/rustcが使える環境で以下を実行し、Rust側の実装を検証すること：
  ```bash
  cd app/src-tauri
  cargo test --lib
  ```
- 特に`config/io.rs`のserdeフラット化による構造体シリアライズ・デシリアライズが正常に動作することを確認すること(サンプルのtomlファイルの読み書き機能テスト)

