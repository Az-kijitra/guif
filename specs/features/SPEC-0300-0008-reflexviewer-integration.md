# SPEC-0300-0008: ReflexViewer統合

| 項目 | 内容 |
|---|---|
| Spec ID | SPEC-0300-0008 |
| 領域 | 0300 コア機能 |
| 階層 | 詳細仕様レベル(親: SPEC-0300-0001) |
| ステータス | APPROVED(**2026-09-27 発注者承認、第2版**。子仕様 SPEC-0300-0015〈ReflexViewer 統合 詳細仕様〉の承認に伴う記述更新〈ISS-0131 (b) RESOLVED〉: §2 に `main` 基準の訂正を注記、§3 の未確定事項に確定先を注記、§4 子仕様を追加。R-01 は変更なし。第1版〈2026-09-22 ベースライン承認〉を置き換え) |
| 作成日 | 2026-09-22 |
| 最終改訂 | 2026-09-27(第2版) |
| 作成者 | spec-writer (Claude) |
| 一次出典 | 要件ドラフト §5.2(確定)/ 既存調査 1.1-7 / 第2版: main調査(Phase6)`specs/_drafts/existing-main-20260927-phase6-viewer-detail.md` |
| 関連Issue | ISS-0003, ISS-0006, ISS-0007, **ISS-0131**(第2版) |
| 子仕様 | **SPEC-0300-0015**(ReflexViewer 統合 詳細仕様、APPROVED 2026-09-27) |

## 1. 仕様

- **[R-01] ファイルビューア(ReflexViewer)を統合機能として提供する。** ファイラーから選択したファイルをビューアで開けること。

## 2. 既存実装の参照点(ISS-0013解消済み・2026-09-22: 機能単位でのロジック移植を許容。参照専用ではない。ISS-0007解消済み: ReflexViewer本体もクリーンな再構築対象に含める)

既存調査 1.1-7 の記録:
- フロントエンド: `routes/viewer/+page.svelte`(2,675行)
- バックエンド: `viewer_cmds.rs`(`open_viewer` / `close_viewer` / `viewer_take_pending_path` / `viewer_take_pending_open`)。ビューアは別Tauri Webviewウィンドウ(label `"viewer"`)として起動される
- イベント: `viewer_cmds.rs` が `tauri::Emitter` で `viewer:open-path` イベントを発火(既存調査 2.3)

注記: 上記は既存調査時のHEAD(`new-feature-experiment`)基準(→ ISS-0003)。

**第2版注記(2026-09-27、ISS-0131 (b))**: `main` 基準の調査(main調査(Phase6))では、`routes/viewer/+page.svelte` は **2,626 行**であり、上記の 2,675 行は `new-feature-experiment` 基準の値である。コマンド4本・ウィンドウ label `"viewer"`・`viewer:open-path` イベントは `main` でも同じ。新プロダクトではこれらのコマンド名・pending 方式を踏襲しない(SPEC-0300-0015 §5.4)。

## 3. 本仕様では確定しない事項

- ~~**ReflexViewer自体の再構築範囲**(→ ISS-0007)~~ **【RESOLVED・発注者確認 2026-09-22】**: クリーンな土台作りの対象に含める(ゼロから書き直す)。既存の単一ファイル2,675行実装は参照点として扱い、機能単位でのロジック移植は可(ISS-0013と同様の方針)。
- ~~対応ファイル形式(テキスト/画像/バイナリ等)、ビューアの機能範囲(→ ISS-0006)~~ **【第2版: 子仕様 SPEC-0300-0015 §4, §7〜§11, §15 で確定(発注者承認 2026-09-27)】**
- ~~ビューアの表示方式(別ウィンドウ / 同一ウィンドウ内ペイン)~~ **【第2版: 別 Tauri ウィンドウ(label `viewer`)として SPEC-0300-0015 §5 で確定(発注者確定 2026-09-27)】**
- 既存 README が参照する `docs/VIEWER_SPEC.md` は実在せず、実体は `development_documents/VIEWER_SPEC.md` にある(既存調査 1.1 補足, 3.1-1)。新プロダクトでは SPEC-0500-0001 に従い、この種のパス不整合を持ち込まないこと。**【第2版注記: `main` には `docs/VIEWER_SPEC.md` も含めビューア仕様書が存在しない(main調査(Phase6)Evaluator所見)。新プロダクトのビューアの正式仕様は SPEC-0300-0015 であり、ユーザー向け文書の要件は同 R-536】**

## 4. 子仕様(第2版で追加)

- **SPEC-0300-0015** ReflexViewer 統合 詳細仕様(APPROVED 2026-09-27): 本仕様 R-01 を同 R-400 で継承し、起動と振り分け・ビューアウィンドウ・読込のセキュリティ・文字コード・テキスト / Markdown / 画像の表示・前後移動・キー操作・受入基準を規定する。本仕様は改訂版で置き換えず、親仕様として APPROVED のまま維持する。
