# トレーサビリティマトリクス

仕様 ⇔ アーキテクチャ ⇔ コード ⇔ テストケース の対応を管理する。architecture-mapper / coverage-auditor が更新する。

> 2026-09-22 architecture-mapper更新: APPROVED済み17件(SPEC-0100-0001〜SPEC-0900-0001)をアーキテクチャ構成要素にマッピングした。新リポジトリはゼロベース再構築(SPEC-0100-0002)であり、対応する実装コードは本更新時点で未着手(GAP)。「アーキ構成要素」欄は `docs/architecture/proposals/` の提案(未承認)に基づく計画上の構成要素であり、確定した既存実装ではない。大きな構造変更を伴う提案には提案ファイル側に `REQUIRES_HUMAN_APPROVAL` を明記した。詳細は各提案ファイルを参照。
>
> 2026-09-22(第1次改訂) architecture-mapper更新: architecture-guardianによる監査(第1回、条件付き承認、MUST指摘8件・SHOULD指摘6件)を受け、`SPEC-0200-0001.md`(節番号を全面採番し直し。検索配置の検討事項は§3.1、モジュール分割基準は§7)、`SPEC-0400-0001.md`(Storage Provider再導入禁止リストを§4.1に新設、承認区分をREQUIRES_HUMAN_APPROVALへ格上げ)、`SPEC-0500-0001.md`(生成物の非コミット・スコープ外語の禁止を§3.1に追加)を改訂した。本マトリクスの節番号参照・承認区分・実装列の表記もこれに合わせて更新した。
>
> 2026-09-22(第2次改訂) architecture-mapper更新: architecture-guardianによる再検証(第2回、MUST-15〜18・SHOULD-19〜25)を受け、以下を対応した。
> - MUST-15/16/17(`SPEC-0200-0001.md`側): `config/`を第4のレイヤーとして§2図・§4.2に明記し、schema型を`shared/schema/`へ移設(§6全面改訂)、フロント側の永続化経路を`shared/ipc/config.ts`に一本化(§6.4)。関連してMUST-16は`SPEC-0400-0001.md` §4.1-4に除外条項を追加する形で解消(SPEC-0200-0001側の「コマンドレジストリ」表記は変更なし)。
> - MUST-18(本ファイル): 「実装」列の規約違反を是正した。SPEC-0100-0003/0004行の列の逆転を修正し、SPEC-0300-0002〜0008行の散文を新設列「移植参照元(旧リポジトリ)」へ分離した。
> - SHOULD-22(本ファイル): 5.2節が求める共有状態登録表を新設(現状は空表)。
> - SHOULD-23(本ファイル・SPEC-0200-0001.md双方): ※1のISS-0006ラベル誤り(「検索の詳細仕様」→正しくは「基本7機能の詳細仕様が未収集」)を修正。
> - feature名対応表のSPEC-0300-0004行: `symmetric`列を`false`から空欄(未確定)に修正(guardian参考指摘への対応)。
> - SPEC-0300-0003/0007行のアーキ構成要素欄を、schema型の配置変更(`keymap::schema`/`navigation_history::schema` → `shared/schema/`)に合わせて更新。
>
> 2026-09-22 unit-test-writer更新: APPROVED済みの Phase 1 詳細仕様(SPEC-0300-0009 / SPEC-0300-0010)を対象に、実装に先立つ単体テスト(TDD)を作成した。SPEC-0300-0002/0003行および新設したSPEC-0300-0009/0010行の「単体テスト」列に、作成したテストファイルの一覧と実行結果(実装未着手のため全件失敗、想定どおりの赤)を記録した。実装コード(`app/src/lib/features/**/*.ts`本体、`app/src-tauri/src/**/*.rs`本体)は本更新の対象外であり、code-generator工程の責務として残る。フロントエンドの土台(`app/package.json` 等)・バックエンドの土台(`app/src-tauri/Cargo.toml` 等)はテスト実行に必要な最小限のスケルトンとして本更新で新設した。
>
> 2026-09-23 unit-test-writer更新: APPROVED済みの Phase 2 詳細仕様(SPEC-0300-0011、ファイル操作: コピー/移動/削除/リネーム/新規作成)を対象に、実装に先立つ単体テスト(TDD)を作成した。SPEC-0300-0005行および新設したSPEC-0300-0011行の「単体テスト」列に、作成したテストファイルの一覧を記録した。あわせて、SPEC-0300-0010(第4版+追補2、`new_folder`追加・`delete`のShift分岐・Shift禁止バリデーション・大文字小文字双方向正規化)のうちPhase 2で初めて確定した2点(R-33/R-33-1のバリデーション文字列側正規化、R-18-2の`delete`カスタム割当Shift禁止)についても、Phase 1で凍結済みの既存keymapテスト(`keymap-resolve.test.ts`等、181件に含まれる)を変更せず、新規ファイル`app/src/lib/features/keyboard/delete-override-validation.test.ts`を追加する形でテスト化した。
> - 実行結果: vitest(`npx vitest run`)は既存20ファイル/181件が全件成功したまま、新規追加した10ファイル(file-ops 9件 + keyboard 1件)がいずれも対象モジュール未実装のため「モジュール解決エラー」で失敗することを確認済み(想定どおりの赤。ファイル一覧は下記対応表を参照)。cargo test(`cargo test --lib`)は、新設した`app/src-tauri/src/fs_ops/`配下6ファイルがいずれも未実装関数/型の参照によりコンパイルエラーとなることを確認済み(86件のE0425/E0433、想定どおりの赤)。`fs_ops`モジュールの`mod`宣言を一時的に外した状態で別途`cargo test --lib`を実行し、Phase 1の既存16件が全件成功することも確認済み(既存テストは無変更)。
> - 実装コード(`app/src/lib/features/file-ops/**/*.ts`本体、`app/src-tauri/src/fs_ops/**/*.rs`本体)は本更新の対象外であり、code-generator工程の責務として残る。`app/src-tauri/src/lib.rs`への`pub mod fs_ops;`宣言、および`app/src-tauri/src/fs_ops/mod.rs`のサブモジュール宣言は、テストをcargoに認識させる最小限の配線(型/関数の実装は一切含まない)として本更新で追加した。

## 提案ファイル一覧

| 提案ファイル | 対象Spec | 承認区分 | 承認順序制約 |
|---|---|---|---|
| `docs/architecture/proposals/SPEC-0200-0001.md` | SPEC-0200-0001 他全体 | **REQUIRES_HUMAN_APPROVAL**(新規モジュール境界・依存方向・状態管理方針全体の設計、ISS-0005への回答案を含む) | `SPEC-0400-0001.md`より先に(または同時に)承認すること |
| `docs/architecture/proposals/SPEC-0400-0001.md` | SPEC-0400-0001 | **REQUIRES_HUMAN_APPROVAL**(vitest/tempfile等の新規dev依存2件の追加判断を含むため) | **`SPEC-0200-0001.md`の人間承認前に単独承認してはならない** |
| `docs/architecture/proposals/SPEC-0500-0001.md` | SPEC-0500-0001 | 小規模(ドキュメント配置の一元化、配布物生成ステップの新設、生成物の非コミット化)。architecture-guardian再検証(第2回)で構造面は承認可と評価済み | 特になし(自動承認対象寄り) |

## 対応表

> **SHOULD-12/MUST-18対応:** 「実装」列は実コードのファイル/モジュールパスのみを記す。まだ実コードが存在しない段階(本更新時点で全件該当)は例外なく `N/A(設計文書。実装は未着手)` と記す。対応する設計文書(未承認の提案)のパスは「設計文書」列に、旧リポジトリからの移植参照元は「移植参照元(旧リポジトリ)」列に、それぞれ分離して記載する。

| Spec ID | アーキ構成要素 | 実装(ファイル/モジュール) | 設計文書 | 移植参照元(旧リポジトリ) | 単体テスト | ユースケース/テストケースID | カバレッジ状態 |
|---|---|---|---|---|---|---|---|
| SPEC-0100-0001 | 全体方針(直接のコード対応なし。モジュール分割方針・テスト方針・ドキュメント方針として下位Specに具体化) | N/A(設計文書。実装は未着手) | N/A(方針そのものであり個別の提案文書はなし) | N/A | N/A | 未採番 | GAP |
| SPEC-0100-0002 | 新規リポジトリ全体構成(ゼロベース再構築の器そのもの) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` | N/A(ゼロベース再構築のため既存対応なし) | N/A | 未採番 | GAP |
| SPEC-0100-0003 | 製品名の一元管理モジュール。計画上の配置先: `app/src/lib/shared/branding.ts`(仮、新規・小規模) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3 | N/A(新規モジュール、旧リポジトリに対応する単一モジュールなし) | vitest(定数参照のテスト、予定) | 未採番 | GAP |
| SPEC-0100-0004 | 設定/永続化モジュール(新フォーマット、移行コードなし。永続化I/Oは`config/`に一元化、SPEC-0200-0001 §6)。計画上の配置先: バックエンド`app/src-tauri/src/config/` + フロント`features/settings/`(設定UI、`shared/ipc/config.ts`の呼び出し主体。SPEC-0200-0001 §3 SHOULD-33対応で追加) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3, §6 | 旧`config_io.rs`/`config_cmds.rs`は参考情報のみ(新フォーマットにつき非互換、移植不可) | Rust `#[cfg(test)]`(予定)、vitest(設定UI、予定) | 未採番 | GAP |
| SPEC-0100-0005 | スコープ外機能の非存在の保証(Git連携パネル/WinMerge/デュアルペイン/Storage Provider/Google Drive関連モジュールを作らないこと) | N/A(存在しないことをarchitecture-guardianが確認) | `docs/architecture/proposals/SPEC-0400-0001.md` §4.1(Storage Provider再導入禁止リスト) | N/A | N/A | 未採番 | GAP(監査対象) |
| SPEC-0200-0001 | 全体レイヤー構成(フロント: feature単位構成、バックエンド: feature単位構成+`config/`永続化層、IPC: Tauri invoke)、依存方向規定(§4)、状態管理方針(§5)、永続化I/O責務所有(§6)、モジュール分割基準(§7、ISS-0005回答案) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` | N/A | N/A | 未採番 | GAP |
| SPEC-0300-0001 | 7機能のfeatureモジュール群の束(下記子Specに分解) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3(featureモジュール対応表) | N/A(束そのものであり個別の移植元はSPEC-0300-0002〜0008の各行参照) | 各featureに同居予定 | 未採番 | GAP |
| SPEC-0300-0002(DEPRECATED。単体テストは改訂版 SPEC-0300-0009 として作成済み) | `features/file-list/`(フロント) + `fs/`(バックエンドquery系) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3 | 旧`FileList.svelte`/`TreePanel.svelte`/`utils/list_layout.ts`/`utils/tree.ts`/`fs_query.rs`等(ISS-0013解消済み。機能単位でロジック移植可) | **2026-09-22 unit-test-writer作成(TDD、実装は未着手のため全件失敗が期待値)。**vitest: `app/src/lib/features/file-list/list-layout.test.ts`, `sort.test.ts`, `selection.test.ts`, `navigation.test.ts`, `tree.test.ts`, `dir-load.test.ts`, `aria.test.ts`(いずれも対象モジュール`./*.ts`が未実装のため`npx vitest run`は10ファイル全て「モジュール解決エラー」で失敗する現状を確認済み)。Rust `#[cfg(test)]`: `app/src-tauri/src/fs/query.rs`(`fs_list_dir`のソート・隠しファイル・Entryフィールドを検証。cargo未導入の実行環境のためコンパイル未確認、一時的なスタブ実装でテストの期待値自体は妥当性確認済み)。各テストはSpec ID・R番号・AC番号をコメントで紐付け済み(詳細はunit-test-writerの報告を参照)。 | 未採番 | GAP(テスト作成済み・実装は未着手) |
| SPEC-0300-0003(DEPRECATED。単体テストは改訂版 SPEC-0300-0010 として作成済み) | `features/keyboard/`(フロント、キー→コマンドIDの対応のみ所有。SPEC-0200-0001 §4.3) + `keymap/`(バックエンド、既定値・キー処理ロジックのみ。設定スキーマ型は`shared/schema/keymap.rs`。永続化実処理は`config/`が所有、SPEC-0200-0001 §6) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3, §4.3, §6 | 旧`keyboard_list.ts`/`keyboard_tree.ts`/`keyboard_overlay.ts`/`types/config.rs`/`config_defaults.rs`等(機能単位で移植可) | **2026-09-22 unit-test-writer作成(TDD、実装は未着手のため全件失敗が期待値)。**vitest: `app/src/lib/features/keyboard/keymap-defaults.test.ts`, `keymap-resolve.test.ts`, `key-dispatch.test.ts`(対象モジュール`./*.ts`が未実装のため3ファイルとも「モジュール解決エラー」で失敗する現状を確認済み)。Rust `#[cfg(test)]`: `app/src-tauri/src/shared/schema/keymap.rs`(既定値・TOMLフィールド名・旧名非互換)、`app/src-tauri/src/keymap/defaults.rs`(既定値提供関数)、`app/src-tauri/src/config/io.rs`(設定保存でキーマップ手動編集内容が保持されること、AC-33)。cargo未導入の実行環境のためコンパイル未確認。 | 未採番 | GAP(テスト作成済み・実装は未着手) |
| SPEC-0300-0009(承認済み改訂版。SPEC-0300-0002の後継、Phase 1) | 同上(SPEC-0300-0002行を参照。モジュール構成は変更なし) | **2026-09-22 code-generator実装済み。** フロント: `app/src/lib/features/file-list/{list-layout,sort,selection,navigation,tree,dir-load,aria}.ts`。バック: `app/src-tauri/src/fs/query.rs`(`Entry`/`EntryType`/`fs_list_dir`) | `docs/architecture/proposals/SPEC-0200-0001.md` §3 | 同上(SPEC-0300-0002行を参照) | 同上(SPEC-0300-0002行を参照。テストコメントはSPEC-0300-0009のR/AC番号で紐付け)。**2026-09-22 code-reviewer検証: vitest 10ファイル/181件成功、`tsc --noEmit`エラーなし、Storage Provider再導入なし、feature間直接importなしを確認。「PR作成可」と判定。Rust側は環境にcargo/rustcが無く`cargo test`未実行(手動レビューのみ、mergeまでに実行環境での確認を推奨)。** | 未採番 | 実装・テスト完了。**2026-09-22発注者確認: rustup導入後`cargo test --lib`実行、16件全成功(コンパイル含め検証済み)。** coverage-auditor未実施 |
| SPEC-0300-0010(承認済み改訂版。SPEC-0300-0003の後継、Phase 1) | 同上(SPEC-0300-0003行を参照。モジュール構成は変更なし) | **2026-09-22 code-generator実装済み。** フロント: `app/src/lib/features/keyboard/{keymap-defaults,keymap-resolve,key-dispatch}.ts`。バック: `app/src-tauri/src/shared/schema/keymap.rs`(`KeymapProfile`/`KeymapConfig`)、`app/src-tauri/src/keymap/defaults.rs`、`app/src-tauri/src/config/io.rs`(`Config`/`load`/`save`) | `docs/architecture/proposals/SPEC-0200-0001.md` §3, §4.3, §6 | 同上(SPEC-0300-0003行を参照) | 同上(SPEC-0300-0003行を参照。テストコメントはSPEC-0300-0010のR/AC番号で紐付け)。**2026-09-22 code-reviewer検証: 上記行と同一実行(vitestは file-list/keyboard 両feature合算で10ファイル/181件)。** **2026-09-23 unit-test-writer追加: 第4版+追補2で新設されたPhase 2向け2規定(R-33/R-33-1の割当文字列側正規化、R-18-2の`delete`カスタム割当Shift禁止)について、既存keymapテストを変更せず新規ファイル`app/src/lib/features/keyboard/delete-override-validation.test.ts`を追加(下記SPEC-0300-0011行にも記載)。** | 未採番 | 実装・テスト完了。**2026-09-22発注者確認: `cargo test --lib`実行、16件全成功(`config::io`のserdeフラット化ラウンドトリップ含め検証済み)。** coverage-auditor未実施。**2026-09-23 code-generator実装済み・code-reviewer検証済み**: Phase 2向け追加2規定(R-33/R-33-1割当文字列側正規化、R-18-2 Shift禁止)は`keymap-resolve.ts`/`keymap-validate.ts`に実装済み(既存Phase1テスト181件は無変更のまま成功)。当初`validateCustomOverride`が`resolveBinding`から未呼び出しだったバグ(B2)をオーケストレーターが修正し配線済み |
| SPEC-0300-0011(承認済み改訂版。SPEC-0300-0005の後継、Phase 2) | `features/file-ops/`(フロント) + `fs_ops/`(バックエンド、copy/move/delete/rename/createをサブモジュール分割。SPEC-0300-0005行を参照) | **2026-09-23 code-generator実装済み。** フロント: `app/src/lib/features/file-ops/{target-resolution,clipboard-mode,conflict-flow,progress-modal,delete-flow,rename-flow,create-flow,name-validation,error-format}.ts`、`app/src/lib/features/keyboard/keymap-validate.ts`(新規)、`app/src/lib/shared/ipc/file-ops.ts`(Tauriコマンドの薄いラッパー)。バック: `app/src-tauri/src/fs_ops/{name_validation,preflight,transfer,delete,rename,create,error,commands}.rs`。**2026-09-23 code-reviewer検証で検出されたblocker 2件をオーケストレーターが修正済み**: (B1)`preflight_transfer`が`copy_batch`/`move_batch`から未配線で、宛先が複製元の内部にある場合に自己参照的な無限再帰でスタックオーバーフローする実クラッシュを確認・修正(`run_transfer_batch`冒頭で呼び出し、ただし`NotFound`はAC-68〈個別失敗が他項目をブロックしない〉との整合のため対象外とし既存の項目単位チェックに委譲。回帰テスト`ac15_copy_batch_rejects_destination_inside_source_with_zero_side_effects`等を追加)。(B2)`validateCustomOverride`(ISS-0048、`delete`カスタム割当のShift禁止)が実際の解決経路`resolveBinding`から未呼び出しだったため配線し、回帰テストを追加。**2026-09-23 code-reviewer再検証でBLK-1を追加検出しオーケストレーターが修正済み**: `preflight_transfer`が単一ループで`SamePath`/`DestinationInsideSource`/`NotFound`を順に判定し最初の該当で早期returnしていたため、`items=[欠落ファイル, 自己参照ディレクトリ]`のような複数アイテムのバッチでは先頭の`NotFound`のみが検出され、2件目の構造的危険(自己参照コピーによるスタックオーバーフロー)が見逃されるバグが残っていた。構造チェック(`SamePath`/`DestinationInsideSource`)を全アイテムに対して先に走査し、その後で`NotFound`を走査する2パス構成に修正(回帰テスト`ac15_destination_inside_source_is_still_caught_when_a_missing_item_sorts_first`を追加)。**発注者確認によりISS-0052(進捗表示・キャンセル、R-40〜R-45)も実装完了**: `copy_batch_with_progress`/`move_batch_with_progress`(コールバック方式)、`fs_ops_cancel`コマンド、`CancelRegistry`(`Mutex<HashMap>`、操作完了時に必ずunregisterされメモリリーク無し)、フロント`listenFileOpsProgress`/`fsOpsCancel`(`shared/ipc/file-ops.ts`は`progress-modal.ts`の型をimportせず構造的互換の独自型`FileOpsProgressEvent`を定義。SPEC-0200-0001 §4.1のshared→features非依存を維持する適切な設計とcode-reviewerが評価)。既存`copy_batch`/`move_batch`はno-opコールバックのラッパーとして無変更の挙動を維持。**残課題(非blocker)**: (a) イベント名`fs_ops://progress`とoperation_id方式は仕様未記載のcode-generator設計判断でarchitecture-mapperでの追認が必要、(b) R-43原文の単一グローバルキャンセルからoperation_id単位への変更の仕様側追認が必要、(c) `features/file-ops/`側の実UI配線(進捗モーダルを開く一連のオーケストレーション)は未実装、(d) `keymap-validate.ts`のShift検出が正規化前の生文字列に対する大文字小文字区別の完全一致であり`"shift+F8"`のような小文字表記をすり抜ける可能性(MIN-1)。 | `docs/architecture/proposals/SPEC-0200-0001.md` §3, §4.1(feature間直接import禁止) | 旧`file_ops.ts`/`clipboard.ts`/`actions/delete.ts`/`actions/edit_entries.ts`/`fs_ops_transfer_copy.rs`/`fs_ops_transfer_move.rs`/`fs_ops_delete.rs`/`fs_ops_rename.rs`/`fs_ops_create.rs`/`fs_ops_preflight.rs`/`fs_ops_mutate_helpers.rs`等(§14参照。ただし`fs_delete_with_undo`・独自退避フォルダ算出・Undo/Redo・複製生成ロジック・`fs_copy_pairs`は移植禁止、R-90/R-91/R-93/R-21-1) | **2026-09-23 unit-test-writer作成(TDD、実装は未着手のため全件失敗が期待値)。**<br>vitest(新規`app/src/lib/features/file-ops/`、9ファイル): `target-resolution.test.ts`(R-10~R-12, AC-01~AC-03, AC-50)、`clipboard-mode.test.ts`(R-16, R-19, R-19-1, AC-05, AC-06, AC-06-1)、`conflict-flow.test.ts`(R-31~R-35, AC-19, AC-22~AC-30)、`progress-modal.test.ts`(R-40~R-45, AC-31~AC-35)、`delete-flow.test.ts`(R-53~R-56-4-1, AC-39~AC-43, AC-46, AC-46-1, AC-46-3)、`rename-flow.test.ts`(R-60-1, R-61, R-63, AC-48~AC-49, AC-55)、`create-flow.test.ts`(R-71~R-76, AC-59~AC-65)、`name-validation.test.ts`(R-62-1)、`error-format.test.ts`(R-81, R-84, R-86, AC-69~AC-71, AC-73)。<br>vitest(既存`app/src/lib/features/keyboard/`への新規追加、1ファイル・Phase 1テストは無変更): `delete-override-validation.test.ts`(SPEC-0300-0010 R-33/R-33-1の割当文字列側正規化、R-18-2の`delete`カスタム割当Shift禁止)。<br>Rust `#[cfg(test)]`(新規`app/src-tauri/src/fs_ops/`、6ファイル): `name_validation.rs`(R-62, AC-52~AC-54)、`preflight.rs`(R-24, R-36, R-73~R-75, AC-15~AC-17, AC-55, AC-63, AC-66, AC-72)、`transfer.rs`(R-20~R-25, R-30~R-32, R-80, AC-08~AC-14, AC-18, AC-20, AC-21, AC-29, AC-29-1, AC-68。**R-23フォールバックバグ修正の回帰テストAC-12/AC-13を含む**)、`delete.rs`(R-50, R-51, R-56, R-56-3, R-57, R-80, R-90, AC-38, AC-44~AC-46, AC-46-2)、`rename.rs`(R-36, R-60~R-64, AC-48, AC-55, AC-56)、`create.rs`(R-70, R-73, R-74, AC-57, AC-58, AC-63)。<br>**実行結果(2026-09-23確認済み)**: `npx vitest run` は既存20ファイル/181件成功を維持したまま、新規10ファイルが対象モジュール未実装により「モジュール解決エラー」で失敗(想定どおりの赤)。`cargo test --lib` は新設6ファイルの未実装関数/型参照により86件のコンパイルエラーで失敗(想定どおりの赤)。`fs_ops`の`mod`宣言を一時的に外した状態での`cargo test --lib`ではPhase 1の既存16件が全件成功することを確認済み(既存テストへの影響なし)。<br>各テストはSpec ID・R番号・AC番号をコメントで紐付け済み。TBD未確定のACIssue(ISS-0039〈R-46/R-77/R-81-1/R-87/R-32-2〉、ISS-0040、ISS-0041項目a派生〈R-56-2/R-56-4-3〉、ISS-0044項目a/d)に対応するAC-36, AC-46-4, AC-46-8, AC-67, AC-75, AC-77は本更新のテスト化対象から除外した(役割定義「TBD注記付きのACは対象外」に従う)。AC-04/AC-05/AC-06/AC-37(実OSクリップボード・実OSごみ箱の往復)はOS統合レベルの検証であり、自動化された単体テストの対象外である旨をコメントに明記した(AC-37は`fs_ops/delete.rs`のモジュールDocコメント、AC-04〜06は`clipboard-mode.test.ts`のモジュールコメントを参照)。 | 未採番 | 実装・テスト完了(フロント255件・バック75件、blocker B1/B2/BLK-1修正済み、ISS-0052進捗/キャンセル実装済み)。TBD系AC(上記除外一覧)はさらにISS確定待ちのためGAP(仕様未確定)。MIN-1〜3(非blocker)は次工程で対応推奨。coverage-auditor未実施 |
| SPEC-0300-0004 | `features/search/`(フロント完結の暫定案。バックエンド配置は`docs/architecture/proposals/SPEC-0200-0001.md` **§3.1**参照、未確定) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3.1 | 旧`page_search.ts`/`SearchBar.svelte`等(移植可) | vitest(部分一致/正規表現、予定) | 未採番 | GAP |
| SPEC-0300-0005(DEPRECATED。単体テストは改訂版 SPEC-0300-0011 として作成済み) | `features/file-ops/`(フロント) + `fs_ops/`(バックエンド、copy/move/delete/rename/createをサブモジュール分割) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3 | 旧`file_ops.ts`/`clipboard.ts`/`fs_ops_transfer_copy.rs`等(機能単位で移植可) | 下記SPEC-0300-0011行を参照(2026-09-23 unit-test-writer作成、TDD、実装は未着手のため全件失敗が期待値) | 未採番 | GAP(テスト作成済み・実装は未着手) |
| SPEC-0300-0006 | `features/archive/`(フロント) + `archive/`(バックエンド zip_create/zip_extract) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3 | 旧`actions/zip.ts`/`fs_ops_archive.rs`等(移植可) | vitest(予定)、Rust `#[cfg(test)]` + tempfile(SPEC-0400-0001 §4) | 未採番 | GAP |
| SPEC-0300-0007 | `features/navigation-history/`(フロント、履歴の保持と問い合わせのみ所有。カレントディレクトリの現在値は複製せず`shared/state/current-directory`を参照、SPEC-0200-0001 §4.4) + `navigation_history/`(バックエンド、履歴の問い合わせロジックのみ。スキーマ型は`shared/schema/navigation_history.rs`。永続化実処理は`config/`が所有、SPEC-0200-0001 §6) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3, §4.4, §6 | 旧`actions/history.ts`等(参考情報のみ。永続化コマンドは旧実装で不明箇所ありのため新規設計) | vitest(予定)、Rust `#[cfg(test)]`(予定) | 未採番 | GAP |
| SPEC-0300-0008 | `features/viewer/`(フロント、単一巨大ファイルを責務単位に分割) + `viewer/`(バックエンド、ウィンドウライフサイクル、`viewer:open-path`イベント踏襲)※別ウィンドウ表示方式は**暫定案**(下記注記参照) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0200-0001.md` §3(注※1) | 旧`routes/viewer/+page.svelte`(2,675行)/`viewer_cmds.rs`(ISS-0007解消済み。機能単位で移植可) | vitest(分割後の各モジュール、予定)、Rust `#[cfg(test)]`(予定) | 未採番 | GAP |
| SPEC-0400-0001 | テスト基盤(vitest、Rust標準テスト、IPCモックレイヤー、tempfileによるFS統合テスト、Storage Provider再導入禁止リスト§4.1) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0400-0001.md` | N/A(基盤そのもの) | (基盤そのもの) | 未採番 | GAP |
| SPEC-0500-0001 | ドキュメント配置の一元化、配布同梱ドキュメントのビルド時生成(生成物は非コミット、§3.1) | N/A(設計文書。実装は未着手) | `docs/architecture/proposals/SPEC-0500-0001.md` | N/A | パス整合性チェックスクリプト(提案、未実装) | 未採番 | GAP |
| SPEC-0900-0001 | 対応するモジュールなし(今回のスコープに含めない)。feature単位構成が将来`features/git/`・`features/winmerge/`として追加する際の受け皿になり得る旨のみ記録(実装はしない。ディレクトリ・mod宣言・空barrelの先行作成も不可、SPEC-0200-0001 §8) | N/A | N/A | N/A | N/A | 未採番 | 対象外(N/A) |

※1 ビューアの別ウィンドウ表示方式踏襲は**暫定案**である。**(SHOULD-23対応: ラベル誤りを修正)** ISS-0006(基本7機能それぞれの詳細仕様が未収集。旧記載「検索の詳細仕様」は誤り)の確定作業やビューア個別の未決事項(ISS-0007。ただし`specs/_issues.md`は一覧表の状態表記と本文の状態表記が不一致であり、この是正はspec工程側の対象で本マトリクスの対応範囲外)と合わせて再検討可(`docs/architecture/proposals/SPEC-0200-0001.md` §3の※1参照、SHOULD-10対応)。

## フロント/バックのfeature名対応表(SHOULD-13対応、機械可読)

旧リポジトリ由来の非対称な命名(例: `file-list`↔`fs`、`keyboard`↔`keymap`)を明示的に記録する。命名の対応関係が変わった場合は本表を更新すること。`symmetric`列は真偽が確定している場合のみ`true`/`false`とし、バックエンド側モジュールが未確定の場合は空欄(未確定)とする(guardian参考指摘への対応)。

| spec_id | front_feature | back_module | symmetric | note |
|---|---|---|---|---|
| SPEC-0300-0002 | features/file-list | fs | false | 名称非対称(list→fs) |
| SPEC-0300-0003 | features/keyboard | keymap | false | 名称非対称(keyboard→keymap)。設定スキーマ型は`shared/schema/keymap.rs`に配置(keymap本体の外) |
| SPEC-0300-0004 | features/search | (未確定・暫定なし) | (空欄=未確定) | バックエンドコマンド未定、SPEC-0200-0001 §3.1参照 |
| SPEC-0300-0005 | features/file-ops | fs_ops | true | ハイフン/アンダースコア表記差のみ |
| SPEC-0300-0006 | features/archive | archive | true | 完全一致 |
| SPEC-0300-0007 | features/navigation-history | navigation_history | true | ハイフン/アンダースコア表記差のみ。スキーマ型は`shared/schema/navigation_history.rs`に配置(navigation_history本体の外) |
| SPEC-0300-0008 | features/viewer | viewer | true | 完全一致 |

## 共有状態(shared state)登録表(SHOULD-22対応、SPEC-0200-0001 §5.2の義務化を受けた台帳)

`docs/architecture/proposals/SPEC-0200-0001.md` §5.2は「複数featureが参照する共有状態を新規追加する場合、本マトリクスに所有モジュールと読み書きするfeatureを追記し、architecture-guardianの確認を経ること」と定める。本表がその登録先である。**実コード生成前の本更新時点では、5.2節が例示する2件(カレントディレクトリ、選択中ファイル集合)を含め、共有状態の新規追加はまだ発生していないため、以下は空の台帳(見出しのみ)として先行整備する。** 次回、共有状態モジュールが実際に設計・実装される段階で行を追加すること(SHOULD-22で指摘された「規定の空振り」を防ぐため、表自体を先に用意する)。

| state_id | 所有モジュール(owner_module) | 読み取りfeature(readers) | 更新feature(writers、所有モジュールの公開更新関数経由) | 関連spec_id |
|---|---|---|---|---|
| (未登録) | | | | |

## Rust側ランタイム状態(Tauri State\<T\>)の所有者一覧(SHOULD-21関連の記録)

`docs/architecture/proposals/SPEC-0200-0001.md` §6.3の規定により、読込済み設定・履歴データの実行時保持(`State<T>`)は`config/`が単独で所有する。本表はその所有関係を記録する台帳であり、こちらも実コード生成前のため見出しのみ用意する。

| state_id | Tauri State型 | 所有モジュール | 参照方法(featureからの取得手段) | 関連spec_id |
|---|---|---|---|---|
| (未登録、設計上は`ConfigState`が`config/`所有になる想定。詳細はSPEC-0200-0001 §6.3参照) | | | | |

## 未決定事項への回答案(人間承認・architecture-guardian検証待ち)

- **ISS-0005(モジュール分割の定量基準)**: `docs/architecture/proposals/SPEC-0200-0001.md` **§7**に回答案を記載(節番号は第1次改訂で§4→§7に変更)。要旨: 通常ロジックファイルは400行を上限の目安(条件を満たす純粋スキーマ/定数ファイルのみ600行まで有界的に緩和)、20行未満の単独ファイルは原則統合(既存調査の実測値に整合)、機能(feature)単位の縦割りディレクトリを採用し技術的フェーズ名による細分化を避ける。行数は機械的基準ではなくSRP判断のトリガーとして扱う。**MUST-5対応: 本回答案はISS-0005のうち「モジュール分割の定量基準」のみに対応するものである。技術スタックの具体バージョン(Tauri/SvelteKit/Rustの版、SPEC-0200-0001 §8参照)、および状態管理方式(runes/store採用方針はSPEC-0200-0001 §5で追補)は別事項であり、いずれも未確定である。したがって本回答案の反映をもってしてもISS-0005は未クローズであり、architecture-guardianの検証・人間承認・技術スタックバージョン確定が揃って初めてクローズ可能とする。**
- **ISS-0008(テストカバレッジ定量基準・E2E/CI要否)**: architecture-mapperの権限外だが、`docs/architecture/proposals/SPEC-0400-0001.md`でテスト容易性を高める構造(feature単位の対称的モジュール構成、IPCラップ層、tempfileによる統合テスト、Storage Provider再導入禁止リスト§4.1)を提案し、後続工程での数値目標設定を容易にする土台を用意した。数値目標自体は未回答。
- **ISS-0009(ドキュメント構成・対応言語・整合性担保手段)**: architecture-mapperの権限外だが、`docs/architecture/proposals/SPEC-0500-0001.md`でドキュメント配置の一元化・配布物生成の自動化(生成物は非コミット、§3.1)・パス整合性チェックの推奨を提案した。種類・対応言語自体は未回答。
- **ISS-0004 / ISS-0012(`main`に存在するが基本7機能に含まれない機能の扱い)**: 本マッピングでは対象機能のモジュールを一切設計に含めていない。ただしfeature単位の縦割り構成を採用したことで、将来これらを独立モジュールとして追加する場合も既存7機能と疎結合なまま追加できる余地がある、という設計上の留意点のみを`docs/architecture/proposals/SPEC-0200-0001.md` §8に記録した(先行してディレクトリ・mod宣言・空barrelを作成することは不可、MUST-3対応)。維持可否の判断そのものは行っていない。
- **ISS-0002(新リポジトリ名・命名)**: 本マッピングのディレクトリ例はすべて仮のパス(`<repo-root>/`)である。名称確定後もモジュール境界自体への影響はないと考えるが、確定は次工程に委ねる。

## 後続工程への申し送り(SHOULD-14対応)

- `tests/cases/_index.md`のCase ID体系は現状未整備であり、本マトリクスの「ユースケース/テストケースID」列がすべて「未採番」のままとなっている。testcase-writerがCase IDを採番する前提として、まず`tests/cases/_index.md`側のID体系(採番規則・spec_idとの対応方法)を整備することを、testcase-writer工程の着手条件として申し送る。ID体系整備が完了するまで、本マトリクスの当該列はGAPのまま据え置く。

## 注意事項

- 本マトリクスの「実装」欄は、まだ存在しないコードに対する**設計上の配置計画**である。architecture-guardianによる検証、人間承認、実際のcode-generator工程を経るまでは確定した実装対応ではない(SHOULD-12/MUST-18対応により、実コードパス・設計文書パス・移植参照元の3列を分離した)。
- スコープ外機能(SPEC-0100-0005 R-03〜R-08)に対応する行は意図的に「対応するモジュールなし」としている。将来、traceability.mdにこれらスコープ外機能に相当する実装が追加された場合、architecture-guardianはSPEC-0100-0005違反として指摘すること。
- `SPEC-0200-0001.md`と`SPEC-0400-0001.md`は承認順序制約(上表参照)があるため、`SPEC-0400-0001.md`を`SPEC-0200-0001.md`より先に、または単独で人間承認してはならない。
- **SPEC-0400-0001.md §4.1のStorage Provider再導入禁止リストをgrep等で機械運用する際、誤検出と判断した場合の判断結果・理由はここに追記すること(SHOULD-24c対応、現時点で該当事例なし)。**

## architecture-guardian 再検証所見(2026-09-22 第2回)

- SHOULD-12は**形式的にしか達成されていない(MUST-18として再指摘)**。L19の規約は「『実装』列は実コードのパスのみ。未着手は`N/A(設計文書。実装は未着手)`、設計文書のパスは『設計文書』列」と定めているが、実表がこれに従っていない。
  - SPEC-0100-0003 / SPEC-0100-0004 の2行は**列が逆**。`app/src/lib/shared/branding.ts`・`app/src-tauri/src/config/` という(未実在の)コードパスが「設計文書」列に入っている。code-generatorがこれを設計文書と読み違える。
  - SPEC-0300-0002〜0008 の7行は「実装」列が規約の`N/A(...)`表記ではなく「新規(旧◯◯から移植可)。実装は未着手」という散文になっている。移植元情報は有用なので、列を増やす(例: 「移植参照元(旧リポジトリ)」)か「アーキ構成要素」列へ移し、「実装」列は全件`N/A(設計文書。実装は未着手)`に統一すること。
- SHOULD-22: SPEC-0200-0001 §5.2 が「新規の共有状態は本マトリクスに所有モジュールと読み書きfeatureを追記する」と義務づけているが、対応する節・表が本ファイルに存在せず規定が空振りしている。空の表(state_id / owner_module / readers / writers / spec_id)を先に用意すること。
- SHOULD-23: ※1(および SPEC-0200-0001 §3.1・§3※1)がISS-0006を「検索の詳細仕様」と記述しているが、`specs/_issues.md`のISS-0006は「基本7機能それぞれの詳細仕様が未収集」。ビューアの暫定留保の根拠Issueの表記を正すこと(ISS-0007は「ビューアもゼロから再構築」としてRESOLVED済み)。
- 参考(本ファイルの担当外): `specs/_issues.md`はISS-0007のステータスが一覧表(L15: OPEN)と本文(L75: RESOLVED)で食い違っている。spec工程側での是正が望ましい。
- MUST-5(ISS-0005の参照節修正・未クローズ明記)、SHOULD-13(feature名対応表)、SHOULD-14(testcase-writerへの申し送り)は実質を伴って対応済みであることを確認した。なお feature名対応表の SPEC-0300-0004 行は back_module 未確定のまま `symmetric=false` としており、機械可読表としては「未確定」と「非対称」が区別できない。`symmetric` を空欄またはnullとすることを推奨する。

**(第2次改訂での対応状況、本節より上のMUST-18/SHOULD-22/23節を参照)** 上記のうちMUST-18・SHOULD-22・SHOULD-23・feature名対応表のsymmetric列の参考指摘は、本ファイル冒頭の改訂履歴に記載の通り本改訂で対応済み。本節はarchitecture-guardianによる指摘の履歴として保持する。

## architecture-guardian 再検証所見(2026-09-22 第3回)

- **MUST-18は解消済み**と判断する。「実装」列は全件が実コードパスを含まない`N/A`表記になり、SPEC-0100-0003/0004行の列逆転(コードパスが「設計文書」列に入っていた問題)も是正され、計画上の配置先は「アーキ構成要素」列、設計文書パスは「設計文書」列、旧リポジトリの移植元は新設の「移植参照元(旧リポジトリ)」列へ正しく分離された。SHOULD-22(共有状態登録表)・SHOULD-23(ISS-0006ラベル)・feature名対応表の`symmetric`列の参考指摘も対応済み。`specs/_issues.md` L13のISS-0006が「基本7機能それぞれの詳細仕様(受入基準レベル)が未収集」であることと本ファイル※1の記述が一致することを確認した。
- SHOULD-32(軽微・承認を妨げない): 「対応表」直前の規約文は「まだ実コードが存在しない段階(本更新時点で全件該当)は**例外なく**`N/A(設計文書。実装は未着手)`と記す」と宣言しているが、実表ではSPEC-0100-0005行が`N/A(存在しないことをarchitecture-guardianが確認)`、SPEC-0900-0001行が`N/A`と異なる表記になっている。機械的に列を検査する際に揺れるため、規約文に「対象外・非存在保証の行を除く」旨の但し書きを添えるか、表記を揃えること。
- SHOULD-33(軽微): SPEC-0100-0004行のアーキ構成要素がバックエンド`app/src-tauri/src/config/`のみで、フロント側の設定UI/`shared/ipc/config.ts`の呼び出し主体が未定義。SPEC-0200-0001 §3の機能表にも該当featureがないため、両書で揃えて明示すること。
- SPEC-0200-0001に対しては第3回でMUST-26・MUST-27(いずれも§4.2/§6の文言レベルの規定衝突)を新たに指摘した。**人間承認への付議は可**だが、これらを解消するまでcode-generatorへ進めてはならない。詳細は`docs/architecture/proposals/SPEC-0200-0001.md` §11を参照。

**【対応済み・オーケストレーター, 2026-09-22】** MUST-26・MUST-27を`SPEC-0200-0001.md` §4.2/§6.2/§6.3にて解消(詳細は同ファイル§11の対応済み注記を参照)。SHOULD-33も同ファイル§3に`features/settings/`を追加して解消し、本ファイルのSPEC-0100-0004行にもフロント側配置を追記した。SHOULD-32(N/A表記の揺れ)・SHOULD-31/34(運用上の採番・登録事項)は軽微な運用事項として次工程(coding-standards skillへの反映時)に持ち越す。
