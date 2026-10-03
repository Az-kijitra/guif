# 既存仕様調査(main基準): Phase 10 右クリックメニュー(コンテキストメニュー)

- 調査日: 2026-10-03 / 対象: `C:\Users\toshi\git\ReflexFiles` の `main`(`git show main:` / `git grep main`)のみ
- 作成: codebase-researcher(本文)。Write 不可のためオーケストレーターがファイル化(要点を保持)。オーケストレーターが `git grep oncontextmenu main` と `context_menu_state.ts:23-45` を直接確認済み。

## A. main の実装
- 表示: `main:app/src/lib/components/ContextMenu.svelte:16-36`(`role="menu"`、`tabindex=0`、`style top/left`)。見た目(:39-53): `position:fixed`、幅 160〜260px、`--ui-surface`、`1px solid var(--ui-border-strong)`、`box-shadow:0 8px 20px var(--ui-shadow-2)`、`padding:4px 0`、`z-index:20`、`max-height:70vh`、`overflow:auto`。項目(`ActionItem.svelte:75-102`): `padding:4px 10px`、13px、active/hover `--ui-hover`、無効 `--ui-muted-2`、無効理由を 11px で表示。**コンテキストメニューではショートカット表示なし**。区切り線は label "-"(連続・先頭・末尾は除去)。
- 開く契機: **マウス右クリックのみ**。一覧の行(`ListRow.svelte:33`)と一覧の余白(`FileList.svelte:57`)。ツリーには無い。キーボード(Shift+F10・ContextMenu キー)は無い。
- 位置: カーソル位置。画面端で反転し、8px のマージンでクランプ(`position.ts:9-28`)。
- 対象: 右クリックした行をフォーカス行にし、**その行が選択に含まれていなければ選択をその1件に置換**(アンカー更新)、含まれていれば選択を維持(`context_menu_state.ts:29-40`)。余白では選択もフォーカスも変えない。
- 項目(`context_menu_items.ts:205-354`): 余白 = 新規作成... / 区切り / ペースト(可否で有効・無効)。行 = 開く(単一)/ 外部アプリ起動 4種(スコープ外)/ 親フォルダを開く / 区切り / コピー・複製(スコープ外)・日付接頭辞(スコープ外)・カット / ペースト / 区切り / 削除 / 名前変更(単一)/ プロパティ(スコープ外)/ 区切り / ZIPに圧縮 / ZIPを解凍(単一かつ .zip)。「OSの関連付けで開く」「パスのコピー」は main に無い。
- キー: ↑↓(有効項目を循環、初期は未選択)、Enter(未選択なら先頭)、Escape、Tab 閉じ込め。頭文字・Home/End なし。開いている間は window の keydown を capture で奪う。
- 閉じる: Escape、項目実行、メニュー外クリック(下の要素にも届くと推測)、再度の右クリック。閉じた後のフォーカスの戻り先は明示処理なし(不明)。

## B. 新リポジトリの現状
- `app/src` に contextmenu ハンドラは無く、メインウィンドウでは WebView2 既定のメニューが出る(推測、実機未確認)。
- 後続フェーズに送った承認済み記述: SPEC-0300-0014 R-306(ZIP)、SPEC-0300-0015 R-401 経路3・R-401-1・AC-404・AC-512・AC-513、SPEC-0300-0011 R-14・R-14-1・R-11・R-12・R-72-3・AC-07・AC-50・AC-62-1(ファイル操作はキーボードと右クリックの双方から、余白にも貼り付け、新規作成は1項目でファイル)、SPEC-0300-0010 R-12 優先3(オーバーレイにコンテキストメニューの名前のみ)、SPEC-0300-0009(コンテキストメニュー規定なし)、SPEC-0300-0017(見た目の規定なし)、ISS-0122(:1265 に必要な規定を予告)。
- 利用できる既存処理: file-ops-controller の handleAction(copy/cut/paste/delete/rename/new_file)、archive-controller(zip_create/zip_extract)、viewer.openFile / openWithOsAssociation、decideOpen、対象解決(選択、0件ならフォーカス行)。プロパティの UI は無い(スコープ外)。OS クリップボード連携は未実装(SPEC-0300-0011 R-15〜R-18 は GAP)。

## 発注者決定(2026-10-03)
1. 項目: main のスコープ内の項目(行: 開く / コピー / カット / ペースト / 削除 / 名前の変更 / ZIPに圧縮 / ZIPを解凍、余白: 新規作成... / ペースト)**+「OSの関連付けで開く」+「パスのコピー」**。親フォルダを開く・スコープ外項目は入れない。
2. 開く契機: マウスの右クリックのみ(一覧の行と余白)。ツリーでは出さない。
3. WebView 標準の右クリックメニュー: 入力欄(パスバー・検索欄・ダイアログの入力欄)以外では出さない。
4. その他(推奨案すべて採用): 未選択の行を右クリックしたら選択をその1件に置換・選択済みなら維持(main どおり)/ キーは ↑↓・Enter・Escape のみ(ソートメニューと同じ)/ 閉じたら常に一覧へフォーカス、メニュー外クリックは下に渡さない / 無効項目は灰色表示で理由を小さく表示 / 見た目は main の値 / 完全削除はメニューに出さない。
