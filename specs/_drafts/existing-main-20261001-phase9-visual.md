# 既存仕様調査(main基準): Phase 9 見た目(画面構成とスタイル)

- 調査日: 2026-10-01 / 対象: `C:\Users\toshi\git\ReflexFiles` の `main`(`a62954e`)のみ(`git show main:` / `git grep main`)
- 作成: codebase-researcher(本文)。Write 不可のためオーケストレーターがファイル化(要点を保持)。
- 凡例: `M:` = `main:app/src/lib/`、`MC:` = `main:app/src/lib/components/`。「推測」はコードから確定できない内容。

## 0. 発注者提供の参考画像との関係(オーケストレーター確認)
- 参考画像の各行の `[ ]` 選択マーカーは **main に存在しない**(`git grep` 0件)。旧リポジトリの作業ツリー(`new-feature-experiment` ブランチ)の `app/src/lib/components/ListRow.svelte:51` `{selected ? '[x]' : '[ ]'}` にのみ存在。参考画像は new-feature-experiment の画面。
- **発注者決定(2026-10-01): 見た目の基準は main の画面構成**(`[ ]` マーカーは採用しない)。
- ツリーの「C:」表示は main に専用処理は無く、`treeNodeName`(`M:utils/tree.ts:4-10`)が末尾区切りを除いた副作用。

## 1. レイアウト(`MC:PageShell.svelte:27-58, 71-88`)
- `<main.container>`: flex column、`height:100vh`、`padding:2px`、`gap:3px`、`overflow:hidden`。html/body `margin:0; overflow:hidden`。
- 順序: MenuBar → PathBar → オーバーレイ(DropdownList/SearchBar/SortMenu を**パスバー直下の通常フロー**に `margin-top:4px` で挿入。ContextMenu のみ `position:fixed`)→ `.content`(flex、gap 3px、flex:1、min-height:0。TreePanel 幅220px〈min200/max320〉+ FileList flex:1)→ StatusBar。
- 全領域(メニューバー、パスバー、ツリー、一覧、ステータスバー)が `1px solid var(--ui-border)` の独立した枠。領域自体に角丸なし。
- 初期ウィンドウ 800x600(`main:app/src-tauri/tauri.conf.json:15-18`)。
- 寸法: メニューバー padding `3px 6px`(font 12px)、パスバー padding `4px 6px` gap 8px、ステータスバー padding `3px 6px` gap 12px font 11px `flex-wrap:wrap`。

## 2. CSS 変数・テーマ(`main:app/src/app.css:1-44`)
| 変数 | light | dark |
|---|---|---|
| --ui-bg | #f5f5f5 | #1e1f22 |
| --ui-fg | #111 | #e6e6e6 |
| --ui-surface | #fff | #2b2d31 |
| --ui-surface-2 | #f0f0f0 | #2b2d31 |
| --ui-surface-3 | #e8f0ff | #3a4a63 |
| --ui-border | #d0d0d0 | #3a3d44 |
| --ui-border-strong | #cfcfcf | #3a3d44 |
| --ui-border-muted | #eee | #3a3d44 |
| --ui-muted | #666 | #cfcfcf |
| --ui-muted-2 | #999 | #999 |
| --ui-hover | #e8f0ff | #3a4a63 |
| --ui-selected | #dbe9ff | #3a4a63 |
| --ui-focused | #7aa7ff | #7aa7ff |
| --ui-row-head | #f0f0f0 | #333741 |
| --ui-link | #2a6fdb | #7ab4ff |
| --ui-error | #b00020 | #ff8a80 |
| --ui-backdrop | rgba(0,0,0,.35) | 同 |
| --ui-shadow-1/2 | rgba(0,0,0,.12)/.14 | .4/.45 |
- テーマ切替は `body.ui_theme-dark`(`M:effects/theme.ts:10`)+ `set_window_theme`。既定 light。OS 追従なし。
- フォント: 基本 `"Segoe UI","Meiryo",sans-serif` 13px(`MC:PageShell.svelte:61-69`)。一覧行・ツリー・パス入力・ドロップダウン項目は等幅 `ui-monospace,"Cascadia Mono","Consolas","Menlo","Monaco","Courier New",monospace`。サイズ: 行12px、サイズ/日時列11px、ツリー12px、パス12px、メニューバー12px、ステータス11px、メニュー項目13px。行高 `--list-row-height: 28px`(ツリーも同値)。
- 角丸 4px(パス入力、モーダル内入力、検索入力、メニューボタン active)。影はメニュードロップダウン `0 8px 20px var(--ui-shadow-1)`、コンテキストメニュー。モーダル本体は角丸・影なし。

## 3. ファイル一覧の行(`MC:ListRow.svelte`)
- `[アイコン] 名前 [◀/▶ 端マーカー]` + サイズ(showSize、dir は空欄)+ 日時(showTime)。既定 `ui_show_size:true`、`ui_show_time:false`。
- `.row`: grid、gap 2px、padding `4px 6px`、height 28px、`width:var(--list-col-width)`、`border-top:1px solid var(--ui-border-muted)`。列: 名前のみ `minmax(140px,1fr)`/+サイズ `56px`/+日時 `140px`。サイズ・日時は右寄せ、`--ui-muted`、nowrap、省略。
- 名前省略: JS の `formatName(name, ext, maxChars)`(拡張子を残し `base…ext`、最小8文字、`M:utils/format.ts:38-52`)+ CSS ellipsis。
- サイズ書式: B/KB/MB/GB/TB、10以上またはBは小数0桁、それ以外1桁、0は空文字(`M:utils/format.ts:4-15`)。日時 `YYYY-MM-DD HH:mm`。
- 多列(`M:utils/list_layout.ts:28-80`): `rows = floor(高さ/行高)`、`minCol = 140 + size72 + time140 + gap8*(列数-1) + padding32`、`maxCol 720`、`colGap 16`、`cols = min(収まる列数, 必要列数)`、列幅は収まるなら `clamp(minCol, 幅, 720)`。`.list-body{display:grid; grid-auto-flow:column; gap:0 16px; padding:2px 0 4px; overflow:hidden}`。横スクロールは1列単位でスナップ(`M:effects/list_layout.ts:38-58`)、端に `◀`/`▶`。`nameMaxChars = floor((nameCell-12)/6)+4`(最小8)。
- 状態: 選択 背景 `--ui-selected`、フォーカス `outline:1px solid var(--ui-focused); outline-offset:-1px`、一覧自体のフォーカスも 1px outline。ホバーなし。
- アイコン: 絵文字。`ui_file_icon_mode` = by_type(既定)/simple/none(`M:utils/file_icon.ts`)。simple は 📁/📄。

## 4. ツリー(`MC:TreePanel.svelte`)
- インデント `depth*14 + 8` px、キャレット ▼/▶(button、幅16px、背景なし、`--ui-muted`)、子なし確定は `visibility:hidden`。行高28px、gap 4px、等幅12px。選択 `--ui-selected`、フォーカス枠はパネルにフォーカスがあるときのみ 1px。スクロールバー非表示。

## 5. パスバー(`MC:PathBar.svelte`)
- ラベル「PATH」(en/ja とも固定、太字600、12px)。入力 flex:1、padding `4px 6px`、`1px solid --ui-border-strong`、角丸4px、背景 `--ui-surface-2`、等幅12px、ellipsis。

## 6. ステータスバー(`M:effects/status.ts:12-49`、`MC:StatusBar.svelte`)
- 項目(gap 12px): statusMessage(あれば先頭)/ `フォーカス: {target}` / `並び替え... {sortKey} ↑/↓`(sortKey は生の内部キー)/ `選択: {n}` / `隠し: オン/オフ` / 絞り込み(検索有効時)/ `F1: キー一覧`。
- target の優先: modal > context > dropdown > menu > list > tree > path > none。

## 7. メニューバー(事実のみ)
- ファイル/編集/表示/移動/ヘルプ(`M:ui_constants.ts:916`)。**発注者決定(2026-10-01): Phase 9 では置かない**(SPEC-0300-0009 R-10-11 維持)。

## 8. ダイアログ・オーバーレイ
- モーダル: 背景 `--ui-backdrop` fixed、本体幅420px、`--ui-surface`、1px枠、padding 16px、最大高90vh、角丸・影なし、タイトル太字600、アクション右寄せ gap 8px。
- 検索バー: 通常フロー、padding `6px 8px`。履歴ドロップダウン: 通常フロー、max-height 240px、📁/🌐 + 等幅値 + 削除ボタン、active `--ui-hover`。ソートメニュー: 横並びボタン4つ。

## 9. 新リポジトリとの差分(2026-10-01 時点)
- `app.css`/CSS変数なし(色はハードコード)、`<main>` は `padding:.5rem 1rem` で領域がウィンドウを満たさない、パスバーにラベルなし、一覧は固定 352px 列・区切り線なし・等幅でない・名前とサイズが詰まる、ステータスバーは `role=status` の単一メッセージのみ、モーダルは角丸4px・影あり。
- 2026-10-01 実アプリのスクリーンショット: `C:\Users\toshi\AppData\Local\Temp\claude\...\scratchpad\current-phase8.png`(参照用、リポジトリ外)。

## 発注者決定(2026-10-01)
1. 見た目の基準は **main の画面構成**(参考画像の `[ ]` マーカーは採用しない)。
2. メニューバーは Phase 9 では置かない。
3. 色を CSS 変数化し、ライトのみ(ダーク切替は別フェーズ。ビューアのダーク固定は維持)。
4. ステータスバーは画像どおりの項目のうち実在する機能のみ(フォーカス位置・並び替え〈日本語化して「並び替え: 種類 ↑」の形〉・選択数・隠し)。F1キー一覧は機能未実装のため出さない。
