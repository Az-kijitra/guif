# SPEC-0300-0008: ReflexViewer統合

| 項目 | 内容 |
|---|---|
| Spec ID | SPEC-0300-0008 |
| 領域 | 0300 コア機能 |
| 階層 | 詳細仕様レベル(親: SPEC-0300-0001) |
| ステータス | APPROVED(2026-09-22 ベースライン承認) |
| 作成日 | 2026-09-22 |
| 作成者 | spec-writer (Claude) |
| 一次出典 | 要件ドラフト §5.2(確定)/ 既存調査 1.1-7 |
| 関連Issue | ISS-0003, ISS-0006, ISS-0007 |

## 1. 仕様

- **[R-01] ファイルビューア(ReflexViewer)を統合機能として提供する。** ファイラーから選択したファイルをビューアで開けること。

## 2. 既存実装の参照点(ISS-0013解消済み・2026-09-22: 機能単位でのロジック移植を許容。参照専用ではない。ISS-0007解消済み: ReflexViewer本体もクリーンな再構築対象に含める)

既存調査 1.1-7 の記録:
- フロントエンド: `routes/viewer/+page.svelte`(2,675行)
- バックエンド: `viewer_cmds.rs`(`open_viewer` / `close_viewer` / `viewer_take_pending_path` / `viewer_take_pending_open`)。ビューアは別Tauri Webviewウィンドウ(label `"viewer"`)として起動される
- イベント: `viewer_cmds.rs` が `tauri::Emitter` で `viewer:open-path` イベントを発火(既存調査 2.3)

注記: 上記は既存調査時のHEAD(`new-feature-experiment`)基準(→ ISS-0003)。

## 3. 本仕様では確定しない事項

- ~~**ReflexViewer自体の再構築範囲**(→ ISS-0007)~~ **【RESOLVED・発注者確認 2026-09-22】**: クリーンな土台作りの対象に含める(ゼロから書き直す)。既存の単一ファイル2,675行実装は参照点として扱い、機能単位でのロジック移植は可(ISS-0013と同様の方針)。
- 対応ファイル形式(テキスト/画像/バイナリ等)、ビューアの機能範囲(→ ISS-0006)
- ビューアの表示方式(別ウィンドウ / 同一ウィンドウ内ペイン)
- 既存 README が参照する `docs/VIEWER_SPEC.md` は実在せず、実体は `development_documents/VIEWER_SPEC.md` にある(既存調査 1.1 補足, 3.1-1)。新プロダクトでは SPEC-0500-0001 に従い、この種のパス不整合を持ち込まないこと。
