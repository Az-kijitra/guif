# ヒアリングメモ(追加): ReflexFiles後継プロダクト コンセプトの確定事項

- 日時: 2026-09-22
- 相手: プロダクト発注者(toshihide.asada@gmail.com)
- 聞き手: Claude(要件確定・仕様ベースライン準備)
- 位置づけ: `intake/20260922-hearing-new-product-concept.md`(初回ヒアリング)で残された「未確認事項(TBD)」、およびその後の既存調査(codebase-researcher)・検証(research-verifier)で判明した事実を踏まえた追加ヒアリングの記録。本メモは初回ヒアリングメモを補完する一次資料である。

## 経緯

初回ヒアリング後、`specs/_drafts/existing-20260922-reflexfiles-overview.md` の既存調査結果を提示したところ、README/user_manual.mdに未記載の「隠れ機能」(デュアルペイン/F3、Git連携パネル/Ctrl+G、WinMerge連携/Ctrl+W)が発見された。これを踏まえて発注者に削除方針を確認したところ「削除対象にしたい」との回答を得た(初回ラウンド)。

その後、調査対象のGitリポジトリの状態を確認したところ、これらの「隠れ機能」はいずれも`main`ブランチには存在せず、`main`から107コミット進んだ`new-feature-experiment`という未マージの実験用ブランチにのみ存在することが判明した。この事実を発注者に提示し、削除方針を再確認した。

## Q&A

**Q1. 新プロダクトの土台とする「既存ReflexFiles」とは、どちらのブランチの状態を指すか?**
> main(リリース済みと見なす基本7機能のみ)

→ 解釈: `new-feature-experiment`ブランチ上にのみ存在する機能(Git連携パネル、WinMerge連携、デュアルペイン、Google Drive関連、Storage Provider抽象化層等)は、「既存ReflexFilesの基本機能」には含まれないものとして扱う。

**Q2.「隠れ機能」(Git連携パネル/WinMerge連携/デュアルペイン)がmainにはなく、未マージの実験的機能だと分かった上で、削除方針は変わるか?**
> GitとWinMergeは将来必要になる可能性が高い。ただし、要件・実装は現時点で決められない。

→ 解釈: Git連携パネル・WinMerge連携は、今回の新プロダクトのスコープには含めないが、「削除」ではなく「今回は移植しない」という位置づけとし、将来のロードマップ候補として記録する。要件・実装の詳細は今回決定しない。

**Q3. デュアルペイン機能(F3)についてはどちらの位置づけか?**
> 今回は完全にスコープ外(ロードマップとしても記録不要)

→ 解釈: デュアルペインはGit連携・WinMergeとは異なり、将来候補としても記録しない。完全に対象外とする。

## この結果を反映した仕様書

- `specs/product/SPEC-0100-0005-scope-boundary.md`(基準ブランチ=main、スコープ外機能の確定)
- `specs/roadmap/SPEC-0900-0001-future-roadmap-candidates.md`(Git連携・WinMergeを将来候補として記録)
- `specs/_drafts/20260922-reflexfiles-successor-concept.md` §1.1, §3.1, §3.3, §5.1(人間レビュー結果として反映済み)

## 前提事実の検証状況(参考)

- `main`は`a62954e`("test", 2026-02-18)で更新が止まっており、`new-feature-experiment`はそこから107コミット進んでいる。
- Git連携パネル(`GitPanel.svelte`等)、WinMerge連携(`winmerge_ops.rs`等)、デュアルペイン(`page_dual_pane_handlers.ts`等)は`git show main:<path>`でいずれも`main`に存在しないことを確認済み。
- Storage Provider抽象化層(`storage_provider.rs`)も同様に`main`には存在しないことを確認済み。
- Google Drive関連の実装(`gdrive_*.rs`)は`main`・`new-feature-experiment`分岐後に追加され、同ブランチ内で削除されており、`main`には一度も存在しなかったことを確認済み(詳細: `specs/_issues.md` ISS-0011)。
