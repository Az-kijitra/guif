# ヒアリングメモ: ReflexFiles後継プロダクトのコンセプト

- 日時: 2026-09-22
- 相手: プロダクト発注者(toshihide.asada@gmail.com)
- 聞き手: Claude(要件定義準備)
- 形式: 対話によるヒアリング(既存の企画書・議事録等の一次資料は存在しない)
- 参考資料: `specs/_drafts/existing-20260922-reflexfiles-overview.md`(ReflexFiles既存仕様調査、codebase-researcher作成)

## 背景

対象の既存プロダクト: `C:\Users\toshi\git\ReflexFiles`(Tauri + SvelteKit製のキーボード操作型ファイルマネージャ)。
このプロダクトをベースに新プロダクトを開発したいという依頼が起点。

## Q&A(発言はすべて発注者本人の回答を要約したもの)

**Q1. 新プロダクトとReflexFilesの関係は?**
> ReflexFilesの基本機能を維持しつつ、無駄な機能をそぎ落とし、アーキテクチャ・コードをクリーンな状態にする。機能拡張を容易にするための土台作りの意味合いである。

→ 解釈: 新規機能追加が主目的ではなく、「クリーンな再構築(リビルド)」が主目的。既存の基本機能は維持することが前提条件。

**Q2. 要件定義の一次資料はあるか?**
> 資料はまだない(ヒアリングしたい)。

→ 本メモが一次資料として位置づけられる。

**Q3. 技術スタック(Tauri + SvelteKit + Rust)は維持するか、見直すか?**
> 維持する。

**Q4. 既存ReflexFilesリポジトリはどう扱うか?**
> 新規リポジトリでゼロから再構築する。

→ 解釈: 既存コードは参考実装・調査対象として使うが、新プロダクトは既存リポジトリ上でのリファクタではなく別リポジトリでの再構築。

**Q5. 新プロダクトの命名は?**
> ReflexFilesの後継として同一名を仮称として使用する(正式名称は後で決める)。

**Q6. ReflexFiles既存ユーザーの設定/データ(キーマップ、プロファイル等)の互換性は必要か?**
> 互換性不要。

**Q7(既存調査結果を提示した上で). マニュアル/READMEに未記載の「隠れ機能」(デュアルペイン/F3、Git連携パネル/Ctrl+G、WinMerge連携/Ctrl+W)は新プロダクトでどうするか?**
> 削除対象にしたい。

→ 根拠資料: `specs/_drafts/existing-20260922-reflexfiles-overview.md` に記載の実装箇所(`GitPanel.svelte`, `git_ops.rs`, `git_cmds.rs`, `winmerge_ops.rs`, `page_dual_pane_handlers.ts` 等)。

**Q8. Google Drive連携(実装は削除済みだがマニュアルには案内が残存)の扱いは?**
> 今回のコンセプト外として完全に削除する。

→ 対象: ルート`user_manual.md`およびインストーラ同梱の`app/src-tauri/resources/user_manual.*.md`内のGoogle Drive関連記述、`gdrive-readonly-stub` featureフラグ等の残骸コード全般。新プロダクトのドキュメント・コードには一切含めない。

**Q9. テスト戦略はどうするか?(現行はRustの一部のみテスト、フロントエンドは標準テストフレームワーク未導入)**
> 新プロダクトではテスト体制を強化する(推奨案を採用)。フロントエンド・Rust双方に標準的なテスト基盤(vitest等)を整備し、重要機能にカバレッジを確保する方針。

## 未確認事項(TBD: 要確認)

- Storage Provider抽象化層(`storage_provider.rs`、`_by_ref`系コマンド群)の扱い。フロントエンドから未使用であることは確認済みだが、Google Drive撤去の残骸か将来のクラウド対応を見据えた意図的な抽象化かは既存調査でも「不明」と記録されている。Q8の「Google Drive関連は完全削除」という方針を機械的に適用すれば削除対象と解釈できるが、本人への明示確認はまだ行っていない。
- README記載の基本7機能(Multi-column list/tree view, キーボードナビ, Search(substring+regex), Copy/Move/Delete/Rename/Create, ZIP作成/展開, Jump list/history, ReflexViewer統合)は全て維持するという前提でよいか(「基本機能を維持」という発言からの推測であり、明示的な機能単位の確認はまだ行っていない)。
- MVPの優先順位・開発フェーズ分割(何を最初に実装するか)。
- ドキュメント(README/マニュアル/CHANGELOG)自体の整合性回復を新プロダクトの要件に含めるか(既存調査で発覚した食い違いの是正)。
