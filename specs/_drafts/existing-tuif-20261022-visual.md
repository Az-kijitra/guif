# 既存仕様調査: tuif の見た目と関連する設定、および guif との差(2026-10-22)

- 調査日: 2026-10-22 / 対象: `C:\Users\toshi\git\tuif`(Rust + ratatui 0.29 / crossterm 0.28。`Cargo.toml:16-17`。最新コミット `8223140` 2026-10-21。作業ツリーのファイルを読んだ。未コミット変更の有無は未確認)と、`C:\Users\toshi\git\guif`(`main`、`187bdf1`)。読み取り専用。
- 作成: codebase-researcher。コードを一次情報とした。「推測」はコードから確定できない内容、「外部知識」はリポジトリ外の事実に基づく内容。
- 凡例: `T:` = `C:\Users\toshi\git\tuif\`、`G:` = `C:\Users\toshi\git\guif\`。出典は `T:src/tui/mod.rs:275` のように「ファイル:行」。
- 前例: `specs/_drafts/existing-main-20261001-phase9-visual.md`。

## 0. 先に押さえる事実

1. tuif の見た目の色は **`Theme` の16色だけ**で決まる(`T:src/theme/mod.rs:29-46`)。罫線は ratatui の `Borders::ALL` の既定(細い1本線)で、罫線の種類を変える設定はない(`T:src/tui/mod.rs:265-271, 303-312`)。
2. **tuif にフォントの設定はない**。`font` / `Nerd` はソース・README・docs・Cargo.toml に出てこない(grep 0件)。フォントは端末(Windows Terminal)が決める。発注者の端末の実測値は第5.1節・第5.5節。
3. **ステータスバーの「Hidden files: ON」は常設ではない**。「Items: 78 | Hidden files: ON」の後半は、隠しファイルの切替を押した直後の状態メッセージ(`T:src/app.rs:1462-1469`、`T:src/tui/mod.rs:456-462`)。起動直後のメッセージは操作ヒント(`T:src/app.rs:350`)。guif は「隠し: オン/オフ」を常設項目に持つ(`G:specs/features/SPEC-0300-0017-visual-design.md:581`)。
4. **`.` で始まる(隠し)フォルダーを薄くするコードは tuif にない**(`T:src/tui/mod.rs` に dim / hidden の分岐なし。隠しの判定は一覧の取得側 `T:src/fs/query.rs:31-32, 74` で、表示するかどうかを決めるだけ)。スクリーンショットで薄く見えた理由はコードからは不明(推測: Nord の `folder` #81A1C1 が `file` #ECEFF4 より暗いための見え方。ただし「`.` で始まるものだけ」の説明にはならないので、スクリーンショットの再確認が要る)。
5. **`symlink` の色は読み込まれるが、画面のどこにも使われていない**(`T:src/config/config_toml.rs:214` で読むだけ。`theme.symlink` の使用箇所は 0件)。16項目のうち画面に効くのは15項目。
6. tuif のソースには guif と同じ系譜の記述が残っている(`T:src/config/config_toml.rs:3-5`、`T:src/shared/schema/ui_theme.rs:1` が `SPEC-0300-0017 R-917` を参照)。tuif の `config.toml` の読み込みには guif と同じ最上位 `ui_theme` も残っているが、tuif ではその値を「プリセット名」として扱う(第1.3節)。guif の `ui_theme` と意味が食い違うので、移すときに整理が要る。

## 1. tuif の色

### 1.1 `Theme` の16項目とプリセット(`T:src/theme/mod.rs`)

項目(`CustomColors` `:8-25` / `Theme` `:29-46`): `bg`, `border`, `border_inactive`, `cursor_fg`, `cursor_bg`, `folder`, `file`, `symlink`, `executable`, `selected`, `status_bar_fg`, `status_bar_bg`, `menu_bar_active_fg`, `menu_bar_active_bg`, `tree_current`, `tree_cursor`。

プリセット名の解決(`from_preset` `:182-191`): 小文字にして `-` `_` 空白を除いてから比較。`nord` / `monokai` / `catppuccin`(別名 `catppuccinmocha`)/ `solarizeddark`(別名 `solarized`)/ `light`。**それ以外のどんな文字列も `default` になる**(通知なし。`:189`)。マニュアルの表記は `"solarized-dark"`(`T:docs/user_manual.md:483`)。発注者決定の名前 `solarized` も別名で通る。

値(16進はソースのコメントと `Rgb()` の10進を突き合わせた。食い違いは見つからなかった):

| 項目 | default(`:55-74`) | nord(`:76-95`) | monokai(`:97-116`) | catppuccin(`:118-138`) | solarized(`:140-159`) | light(`:161-180`) |
|---|---|---|---|---|---|---|
| bg | Reset | #2E3440 | #272822 | #1E1E2E | #002B36 | #F5F5F5 |
| border | Cyan | #88C0D0 | #F92672 | #CBA6F7 | #268BD2 | #0066CC |
| border_inactive | DarkGray | #4C566A | #75715E | #585B70 | #073642 | #B4B4B4 |
| cursor_fg | Black | #2E3440 | #272822 | #11111B | #002B36 | White |
| cursor_bg | Cyan | #8FBCBB | #A6E22E | #89B4FA | #2AA198 | #0078D7 |
| folder | Yellow | #81A1C1 | #FD971F | #F9E2AF | #B58900 | #D97706 |
| file | Reset | #ECEFF4 | #F8F8F2 | #CDD6F4 | #839496 | #1F2937 |
| symlink | LightMagenta | #B48EAD | #AE81FF | #F5C2E7 | #D33682 | #7C3AED |
| executable | LightGreen | #A3BE8C | #A6E22E | #A6E3A1 | #859900 | #16A34A |
| selected | LightBlue | #EBCB8B | #E6DB74 | #FAB387 | #CB4B16 | #EA580C |
| status_bar_fg | White | #E5E9F0 | #F8F8F2 | #CDD6F4 | #93A1A1 | #374151 |
| status_bar_bg | DarkGray | #3B4252 | #3E3D32 | #313244 | #073642 | #E5E7EB |
| menu_bar_active_fg | Black | #2E3440 | #272822 | #11111B | #002B36 | White |
| menu_bar_active_bg | Cyan | #88C0D0 | #F92672 | #CBA6F7 | #268BD2 | #0078D7 |
| tree_current | Cyan | #88C0D0 | #66D9EF | #89DCEB | #2AA198 | #0066CC |
| tree_cursor | Yellow | #EBCB8B | #E6DB74 | #F9E2AF | #B58900 | #D97706 |

- `light` の `status_bar_fg` は `Rgb(55,65,81)`(コメントなし。`:173`)。名前付き色が残るのは `default` の全項目と `light` の `cursor_fg` / `menu_bar_active_fg` の `White`(`:166, 175`)だけ。nord / monokai / catppuccin / solarized の4つは全項目が RGB で、端末の配色に左右されない。
- nord の `menu_bar_active_*` と `tree_current` は `border` と同じ値、`tree_cursor` は `selected` と同じ値(`:90-93`)。他のプリセットも一部の項目が同値(`:111-114, 133-136, 154-157, 175-178`)。

### 1.2 色の書式(`parse_color` `T:src/theme/mod.rs:245-296`)

- 前後の空白を除く。空文字は無効。
- `#RRGGBB`(6桁)、`#RGB`(3桁。各桁に17を掛ける)。それ以外の `#...` は無効(`:254-267`)。
- 数字だけの文字列は 0〜255 の256色番号(`Color::Indexed`)。256以上は無効(`:270-272`、テスト `:325-329`)。
- 色名(大文字小文字を区別せず、`-` と空白を `_` に直して比較。`:275-293`): `reset` / `default` / `none`(= `Reset`)、`black` `red` `green` `yellow` `blue` `magenta`(別名 `purple`)`cyan` `gray`/`grey` `dark_gray`(別名 `dark_grey` `darkgray` `darkgrey`)`light_red` `light_green` `light_yellow` `light_blue` `light_magenta`(別名 `lightmagenta` `light_purple` `lightpurple`)`light_cyan` `white`。
- 解釈できない値は**黙って無視され、プリセットの値が残る**(`apply_overrides` `:193-242` の `if let Some(col) = parse_color(c)`)。通知はない。
- `[colors]` のキーの別名(`T:src/config/config_toml.rs:207-222`): `bg` = `background`、`selected` = `selected_mark`。値が文字列でないキー、未知のキーは無視。
- マニュアルの記述(`T:docs/user_manual.md:489-496`): 色名16個・256色番号・`#RRGGBB` / `#RGB`。`bg` は `"none"` / `"reset"` で端末の背景(透過)。

### 1.3 `config.toml` の読み方(`T:src/config/config_toml.rs:162-268`)

- 場所: `%APPDATA%\tuif\config.toml`(`T:docs/user_manual.md:467`)。発注者の実ファイル(`C:\Users\toshi\AppData\Roaming\tuif\config.toml`)は `[theme]` と `preset = "nord"` の2行だけ。
- `[theme]`: テーブルのとき `preset` → `name` → `theme` の順に最初の文字列を採る(`:187-191`)。最上位の `theme = "nord"` も可(`:198`)。
- `[colors]`: プリセットを決めた後に16項目を上書き(`:202-228`)。
- 読み込みは起動時。ファイルが無ければ全部既定。BOM は除く。TOML の構文エラーのときは全体が既定に戻る(`whole_file_failure` `:132-143, 163-180`)。
- **`[theme]` が無いとき**: 最上位の `ui_theme` の文字列を `from_preset` に渡す(`default_theme_from_ui_theme` `:328-333`)。`"light"` は light プリセット、`"dark"` / `"system"` / 他は default プリセット(`from_preset` に `dark` `system` の分岐はない。`:189`)。何も無ければ default プリセット。**tuif の既定は nord ではなく default**。

### 1.4 各色が画面のどこに使われるか(`T:src/tui/mod.rs`)

| 項目 | 使われる場所(行) |
|---|---|
| bg | `Reset` 以外のとき画面全体を塗る(`:22-24`)。パス行(`:197`)、ツリー・一覧の枠の中(`:269, 306, 419`)、ビューア(`:555, 561`)、モーダルの中(`Reset` のときだけ黒に差し替え。`:586-590, 755-759`)。 |
| border | アクティブなペインの枠(`:218, 278`)、モーダル・ポップアップの枠(`:593, 782`)、ビューアの枠(`:554`)。 |
| border_inactive | 非アクティブなペインの枠(`:220, 280`)、「No items」の文字(`:316`)、2列表示の縦線 `│`(`:425`)、メニューバー右端の `  tuif`(`:168`)、ビューアの行番号の欄(`:521`)。 |
| cursor_fg / cursor_bg | カーソル行(一覧は一覧にフォーカスがあるときだけ。`:389-393`)、ツリーのカーソル行(ツリーにフォーカスがあるときだけ。`:247-251`)、ポップアップのカーソル行(`:767-772`)、ビューアの下端の案内帯(`:578`)と検索入力(`:566`)。いずれも太字(ビューアの帯を除く)。 |
| folder | フォルダーの名前(太字。`:398-401`)。 |
| file | 通常のファイル(`:405`)、パス行のパス(`:183`)、ツリーの通常ノード(`:259`)、モーダル内の文字(`:597, 773`)。 |
| symlink | **画面では使われない**。 |
| executable | 拡張子が `.exe` / `.bat` / `.cmd` / `.ps1` のファイル名(`:384-387, 402-403`)。 |
| selected | 複数選択されている行(太字の文字色。`:394-397`)、パス行の「Search」の見出し(`:191`)、ビューアの検索一致の現在行の印 `▶`(`:509, 517`)。 |
| status_bar_fg / bg | ステータスバー(`:463-467`)、メニューバーの通常の見出しと余白(`:159-163, 171`)、ビューアの検索入力欄の案内文(`:567`)。 |
| menu_bar_active_fg / bg | メニューバーで開いている見出し(太字。`:154-156`)、ビューアの検索入力の先頭 `/`(`:565`)。 |
| tree_current | ツリーの現在のフォルダー(太字。`:252-255`)、パス行の見出し「Path:」(太字。`:180`)。 |
| tree_cursor | ツリーにフォーカスがないときのカーソル位置の行(`:256-257`)、ビューアの一致行の印 `●`(`:511, 519`)。 |

- executable の判定は**拡張子の文字列比較だけ**(`entry.name.ends_with(".exe")` ほか4つ。`:384-387`)。大文字小文字を区別する(`.EXE` は通常のファイルの色。コードのとおり)。実行権限や属性は見ない。
- 行の色の優先(`:389-406`): カーソル行(一覧にフォーカス)> 選択 > フォルダー > 実行ファイル > 通常。**カーソル行は選択色より優先**され、カーソル行にいる間は選択済みかどうかが色では分からない(行頭の `*` で分かる)。一覧にフォーカスがないとき(ツリー側にいるとき)は、一覧のカーソル行は特別な色にならない(`is_focused && focused`。`:389`)。
- 選択(複数選択)の見え方: 行頭に `*`(未選択は空白)+ 空白、文字は `selected` 色の太字(`:367-368, 394-397`)。背景は変わらない。
- 隠しファイル: 見た目の区別なし(第0節の4)。太字になるのはフォルダー・選択・カーソル行。通常のファイルと実行ファイルは太字ではない。

## 2. tuif の配置と飾り(`T:src/tui/mod.rs`)

### 2.1 全体(`:33-46`)

縦に4段: メニューバー1行 / パス行(検索中は2行)/ 本体(残り。最小3行)/ ステータスバー1行。メニューバー・パス行・ステータスバーには罫線がない。罫線を持つのはツリーと一覧(とポップアップ・ビューア)だけ。ペイン同士の隙間はなく、隣り合う。端末は代替画面+マウス操作を有効にする(`T:src/main.rs:95`)。

### 2.2 メニューバー(`:139-173`)

- 見出し4つ ` File(F) ` ` Edit(E) ` ` View(V) ` ` Go(G) `(前後に空白)。通常は `status_bar_fg` / `status_bar_bg`、開いているものは `menu_bar_active_fg` / `_bg` の太字。見出しの間に `status_bar_bg` の空白1つ。行全体の背景は `status_bar_bg`。
- 右に `  tuif`(`border_inactive` 色)。
- ドロップダウンは幅42の枠付きポップアップ(`menubar_dropdown_rect` `:610-619`。文言は英語)。

### 2.3 パス行(`:175-199`)

` Path: `(`tree_current` 色・太字)+ パス(`file` 色)。枠なし、1行。検索中は2行目に ` Search [Substr]: 語` か ` Search [Regex]: 語`(見出しは `selected` 色・太字)。パスの編集は別の入力ダイアログ(`T:src/app.rs:1454-1460`)。

### 2.4 ツリー(`:215-273`、`T:src/app.rs:559-692`)

- 枠: `Borders::ALL`(既定の罫線=細い1本線)。アクティブなら `border`、そうでなければ `border_inactive`。枠の中は `bg`。
- 見出し: ` Drives / Tree (Tab | l:Expand h:Collapse Enter:Open) `(英語・固定、枠の上辺の左寄せ。幅が足りなければ右が切れる。`:270`)。
- 行: `{字下げ}{印}{名前}`。字下げは **深さ × 空白2つ**(`:244`)。印は展開中 `▾ `、折りたたみ中 `▸ `(`:245`)。**子の有無によらず全ノードに印が付く**。ルートのノード名は `C:\`(末尾の `\` 付き。`T:src/app.rs:563-565`)、2段目以下はフォルダー名。SFTP の接続先は `☁ [SFTP] ...`(`:581`)。
- 色: カーソル行でツリーにフォーカスあり → `cursor_fg` / `cursor_bg` の太字 / 現在のフォルダー → `tree_current` の太字 / フォーカスなしのカーソル → `tree_cursor` / それ以外 → `file`(`:247-260`)。
- 行の高さは端末の1行。スクロールはカーソル位置から自動(`scroll_offset` 既定2。`:222-229`)。
- ツリーの幅: 画面の幅の `tree_width_percent`%(既定24、10〜50。`T:src/config/config_toml.rs:253-257, 102`)。

### 2.5 ファイル一覧(`:275-438`)

- 枠: ツリーと同じ。アクティブ/非アクティブで `border` / `border_inactive`。
- 見出し(`:301-312`): ` Files ({件数} items) [sort: {キー} {方向}] `。件数は絞り込み後の表示件数。キー・方向は保存値の生の文字列(`name` / `size` / `type` / `modified`、`asc` / `desc`。`T:src/shared/schema/ui_state.rs:33-38`)。例 ` Files (78 items) [sort: type asc] `。隠れた列があれば左に `◀ `、右に ` ▶`(`:301-302`)。0件のときは枠の中に `  No items`(`border_inactive` 色。`:314-319`)。
- 列: **名前 + サイズ(既定で表示)+ 更新日時(既定で非表示)**(`T:src/shared/schema/ui_state.rs:21-29`、`ui_show_size` 既定 true、`ui_show_time` 既定 false)。日時の列はある。列名の見出し行はない。
- 名前のセル: `{印} {名前}`(印は `*` か空白。`:367-368`)。名前は表示幅(全角=2)で数え、収まらなければ**末尾を `…` で切る**(`truncate_display_width` `:888-904`)。名前に使える幅の最小値は8(`:352`)。アイコン・絵文字はない。
- サイズのセル: フォルダーは `<DIR>`、ファイルは `format_size`(`:906-919`)。1024進。GB 以上 `{x.x} GB`、MB 以上 `{x.x} MB`、KB 以上 `{x.x} KB`、未満は `{n} B`。小数は必ず1桁(`25.0 MB`、`1.2 KB`、`25 B`)。TB の単位はない(1024 GB 以上は `1024.0 GB` 以上の数字のまま)。
- 日時のセル: `time_format`(既定 `%Y/%m/%d %H:%M`)。トークンは `%Y %m %d %H %M %S` だけ(`:715-742`)。
- 寄せ: セルは文字列のまま `Row::new(cells)` に渡す(`:376-408`)。**寄せの指定はコードにない**。ratatui 0.29 の `Table` の既定(左寄せ)になると推測(実機未確認)。
- 列幅(1列の中の配分。`:411-417`): 名前 `Min(10)` / サイズ `Length(10)` / 日時 `Length(20)`。セルの間隔は指定なし(ratatui の既定の1マス、推測)。
- **2列表示(複数列。`:283-300, 325-437`)**:
  - 行数 `rows_per_col` = 枠の内側の高さ(上下の枠2行を除く)。
  - 1列の最小幅 = `min_col_width`(既定24、`[layout]` で10〜80)+ サイズ表示時10 + 日時表示時20(`:285-291`)。
  - 同時に並べる列数 = `min(内側の幅 ÷ 最小幅, 全体で必要な列数)`、最低1(`:292-294`)。
  - 各列の幅 = 内側の幅を表示列数で等分(`Constraint::Ratio(1, n)`。`:325-331`)。**列幅の上限はない**。
  - 並び順: **縦に流す**(1列目の上から下、次に2列目の上から下。`col_start_vis = col_idx * rows_per_col`。`:354`)。
  - 列の区切り: 右に隣の列がある列の最右マスに縦線 `│`(`border_inactive` 色。`:422-436`)。その列の表は1マス狭くして描く(`:336-343`)。
  - 画面外の列: **ページ単位**(`start_col = (focused_col / visible_cols) * visible_cols`。`:296-298`)。カーソルが右端の列を越えると、次の `visible_cols` 列がまとめて出る。
  - カーソルの移動: `←` / `→`(MoveLeft / MoveRight)は列単位で、同じ行位置のまま隣の列へ。**右の列に同じ行位置がなければ最後の項目へ寄せる**(`min(len-1)`。`T:src/app.rs:1314-1322`)。左は `focused_vis_idx >= rows` のときだけ(`:1294-1298`)。`PageUp` / `PageDown` は `rows_per_col` 件(`:1340-1357`)。ツリーにいる間は `←` が折りたたみ・親へ、`→` が展開・子へ(`:1279-1313`)。
  - `[layout]`(`T:src/config/config_toml.rs:91-107, 251-268`): `tree_width_percent`(10〜50、既定24)、`min_col_width`(10〜80、既定24)、`time_format`(空でない文字列、既定 `%Y/%m/%d %H:%M`)。範囲外は黙って既定のまま。
- マウスの当たり判定も同じ列計算(`hit_test_file_list` `:650-713`)。

### 2.6 ステータスバー(`:440-469`)

` Items: {表示件数}{ [Selected:n]}{ [Yank:n] / [Cut:n]} | {状態メッセージ}`。`status_bar_fg` / `status_bar_bg` で行全体を塗る。起動直後のメッセージは操作ヒント `j/k:Move  Enter:Open  BS/-:Up  Tab:Tree  y/x/p:Yank/Cut/Paste  /:Search  ;:Actions  F10:Menu  q:Quit`(`T:src/app.rs:350`)で、切替などの操作で上書きされる(例 `Hidden files: ON`)。「フォーカス位置」「並び替え」「隠し」の常設項目はない(並び替えは一覧の見出しにある)。

### 2.7 ビューア(`:471-581`)

全画面。枠(`border`、`bg`)、見出し ` Viewer{[Preview: leaf]/[Raw: bat]}: {ファイル名} (Line n/N){検索状況} `。本文は行番号(5桁右寄せ+印 `│`/`●`/`▶`)+ 本文。**本文の色は `Theme` で決めない**: 外部の `bat.exe --color=always` が出す ANSI のエスケープを解釈して色にする(`T:src/viewer/highlight.rs:1-54`)。bat が無ければ無着色。`Theme` が効くのは枠・背景・行番号の欄・検索の印・下端の帯だけ。マークダウンは外部の `leaf.exe`(`highlight.rs:56-`)。

### 2.8 ポップアップ(並び替え・アクションメニュー・履歴など。`:583-600, 744-787`)

画面中央の枠(`border`)、背景は `bg`(`Reset` なら黒)、カーソル行は `cursor_fg` / `cursor_bg` の太字。入力ダイアログも同様。文言は英語。

### 2.9 その他の見た目に関わる設定

- `[general]`(`T:src/config/config_toml.rs:70-89, 230-249`): `confirm_delete`(true)、`delete_to_trash`(true)、`dirs_first`(false)、`natural_sort`(true)、`scroll_offset`(2。0〜20)。見た目に直接関わるのは `scroll_offset` と `dirs_first` だけ。並び替えが `type` のときは常にフォルダーが先(`T:src/fs/query.rs:154`)。
- `ui-state.toml` に6項目: `ui_show_hidden`(既定 false)、`ui_show_size`(true)、`ui_show_time`(false)、`ui_show_tree`(true)、`sort_key`(name)、`sort_order`(asc)(`T:src/shared/schema/ui_state.rs:16-71`)。guif にも同じ6項目がある(SPEC-0300-0009 R-77)。
- 太字・下線などの装飾の設定はない。

## 3. guif の今(`G:`)

### 3.1 色(`G:app/src/app.css`)

- `:root` に19色の変数(`--ui-bg` `--ui-fg` `--ui-surface` `--ui-surface-2` `--ui-surface-3` `--ui-border` `--ui-border-strong` `--ui-border-muted` `--ui-muted` `--ui-muted-2` `--ui-hover` `--ui-selected` `--ui-focused` `--ui-row-head` `--ui-link` `--ui-error` `--ui-backdrop` `--ui-shadow-1` `--ui-shadow-2`。`:16-35`)。ライトの値。`@media (prefers-color-scheme: dark)` の中の `:root` でダークの値に上書き(`:99-120`)。値は SPEC-0300-0017 R-911 / R-911-1 の表と文字列が同じ(AC-904)。
- 使い道(各コンポーネントの `<style>`): 領域の枠 `--ui-border`(`FileListPanel.svelte:191`、`TreePanel.svelte:130`、`PathBar.svelte`、`StatusBar.svelte`、`MenuBar.svelte`)/ ツリー・一覧の背景 `--ui-surface` / バー類の背景 `--ui-surface-2` / 行の区切り線 `--ui-border-muted`(`FileListRow.svelte:92`)/ 選択行・現在のフォルダー `--ui-selected`(`FileListRow.svelte:102-104`、`TreePanel.svelte:152-154`)/ フォーカスの枠 `--ui-focused`(1px の outline。一覧にフォーカスがないときのフォーカス行は `--ui-muted`。`FileListRow.svelte:98-101`)/ サイズ・日時・キャレット・端マーカー `--ui-muted` / エラー `--ui-error`。
- **色の変数に「フォルダー」「ファイル」「実行ファイル」「リンク」の別がない**。フォルダーの見分けは絵文字 `📁` / `📄`(`FileListRow.svelte:48`、R-990)だけで、名前の文字色は全項目同じ(`--ui-fg` を継承)。種類別の色分けと拡張子による実行ファイルの判定は guif にない。
- テーマ(`ui_theme`): `config.toml` の最上位 `ui_theme` = `"light"` / `"dark"` / `"system"`(既定 `system`)。固定すると Rust がアプリ全体の優先テーマを指定し、WebView の `prefers-color-scheme` がそれになる(R-917、`G:app/src-tauri/src/shared/window_theme.rs:27-33`)。起動時に1回だけ読む(R-917-2)。不正値は OS 追従+起動時に通知(R-917-4)。**CSS の変数は「ライト/ダークの2組」で、`@media (prefers-color-scheme)` により切り替わる構造**。6プリセット+16項目の上書きを入れるには、この仕組みを変える必要がある(第5.3節)。
- ウィンドウの背景色(ちらつき防止): Rust に4つの色の定数(メイン: ライト #f5f5f5 / ダーク #1e1f22、ビューア: ライト #fff / ダーク #1e1e1e。`window_theme.rs:35-41`)があり、CSS の `--ui-bg` / `--vw-bg` と一致することを単体テストで固定している(R-919-1、AC-905 の例外)。プリセットで `bg` が変わるなら、この背景色も実行時に決める必要がある。
- 静的テスト: メインのコンポーネントに色リテラルを書かない(R-910、`G:app/src/ui-colors-static.test.ts`)。

### 3.2 フォント・行の高さ

- `--ui-font`: `"Segoe UI", "Meiryo", sans-serif`(`app.css:37`)。基本 13px(`.ui-root` `:54-59`)。
- `--ui-font-mono`: `ui-monospace, "Cascadia Mono", "Consolas", "Menlo", "Monaco", "Courier New", monospace`(`:38`)。**Windows の WebView2 では `ui-monospace` は解決されず `Cascadia Mono` が使われる**(R-921 の注記、`SPEC-0300-0017:444`)。
- 等幅を使う場所: 一覧の行(12px。`FileListPanel.svelte:204`)、ツリー(12px。`TreePanel.svelte:132`)、パスの入力欄(12px。`PathBar.svelte`)、履歴一覧のパス(12px。`NavigationHistoryList.svelte:93`)、ダイアログの入力(`FormDialog.svelte:89, 105`)。サイズ・日時は11px(`FileListRow.svelte:127`)。**発注者決定(2)の「一覧とツリーだけ」は、今の等幅の使われ方(パス入力欄・履歴一覧・ダイアログの入力も等幅)より狭い**。ビューアの等幅は `--vw-font-mono` で、メインと同じ値を静的テストで一致させている(R-913-4、`G:app/src/viewer-font-values.test.ts`)。
- 行の高さ: `--list-row-height: 28px`(`app.css:41`、R-924)。一覧の行とツリーのノードに使う。行は上辺に1pxの区切り線(`--ui-border-muted`)。12px の字に対して 28px(約2.3倍)。

### 3.3 一覧の配置(`FileListPanel.svelte` / `FileListRow.svelte` / `list-layout.ts`)

- 枠: 1px の実線(`--ui-border`)、角丸なし。見出しの文字(「Files (78 items) [sort: ...]」に当たるもの)は**ない**。並び順はステータスバー(「並び替え: 種類 ↑」。R-971)にあり、件数の表示はない。
- 列: **既に縦優先・列送りの多列グリッド**(`grid-auto-flow: column`。`FileListPanel.svelte:195-205`、R-955、SPEC-0300-0009 R-15)。1列の最小幅 `minCol` = 140 + サイズ72 + 日時140 + 項目間8×(項目数−1)+ 32 = 172 / 252 / 320 / 400px(`list-layout.ts:60-73`)。列幅は収まるなら等分(上限720px)、列の間隔16px、**縦線はない**。収まらない列は1列単位(列ピッチ)で自動スクロール(`overflow: hidden`、ホイールでは動かない。R-958)。端マーカー `◀` `▶` は表示中の最左/最右の列の先頭行の名前の後(R-959)。
- 行の中: `[📁/📄] 名前` + サイズ列(幅64px。フォルダーは空欄)+ 日時列(140px、既定で非表示)。サイズ・日時は右寄せ、`--ui-muted`、11px。名前は拡張子を残して中間を省略(R-949、`name-ellipsis.ts`)。行の左右 padding は6px、項目間2px(`FileListRow.svelte:90-91`)。
- 選択行は背景 `--ui-selected`、フォーカス行は1pxの枠。**選択を示す `*` のような文字の印はない**。
- サイズの書式(`format.ts:13-29`): B / KB / MB / GB / TB。B は整数、それ以外は小数1桁。`25 B`、`1.2 KB`、`25.0 MB` の形は tuif と同じ。違い: フォルダーは空欄(tuif は `<DIR>`)、TB まである。
- 0件のときの「項目なし」は枠の左上の小さな枠付きの表示(R-906、W-16)。tuif は `  No items`。
- ←→(`G:app/src/lib/features/file-list/navigation.ts:29-51`): 同じ行位置の隣の列へ。**隣の列に同じ行位置の項目がなければ動かない**(tuif は最後の項目へ寄せる)。

### 3.4 ツリー(`TreePanel.svelte`)

幅220px固定(`:125`)。ノード高28px、等幅12px、字下げ `8 + 14 × 深さ` px(R-936)、印は `▼`(展開)/ `▶`(折りたたみ)の16px幅のボタン、子なしは `visibility: hidden`(R-937)。ドライブ名は `C:`(R-938)。現在のフォルダーは背景 `--ui-selected`、フォーカス位置は1pxの枠(ツリーにフォーカスがあるときだけ。R-939)。ツリーの上の見出し文字はない。

### 3.5 パスバー・ステータスバー・メニューバー

- パスバー(`PathBar.svelte`): 枠付きの領域(`--ui-border`、背景 `--ui-surface-2`)、左に太字600の12px「PATH」、右に枠付き・角丸4pxの入力欄(等幅12px)。
- ステータスバー(`StatusBar.svelte`): 枠付き、11px、1行。`フォーカス: 一覧` / `並び替え: 種類 ↑` / `選択: n` / `隠し: オン` / 絞り込み / 状態メッセージ(R-971)。
- メニューバー(`MenuBar.svelte`): 枠付き、見出し12px、開いた見出しは `--ui-hover` +角丸4px。日本語(SPEC-0300-0020)。右の製品名の表示はない。

### 3.6 ビューアの色(`G:app/src/routes/viewer/viewer-theme.css`)

`--vw-bg` `--vw-fg` `--vw-header-bg` `--vw-border` `--vw-banner-bg` `--vw-banner-fg` `--vw-muted` `--vw-error` `--vw-lineno` `--vw-gutter-bg` `--vw-gutter-border` の11色+シンタックスハイライトの13色(`--vw-hl-*`)。ライトは GitHub、ダークは GitHub Dark の配色(`:12-75`)。メインの `--ui-*` とは共有しない(R-913-1)。ライト/ダークの2組で `@media (prefers-color-scheme)` により切替。フォントは `--vw-font` / `--vw-font-mono`(メインと同じ値。`:41-42`)。本文は13px、行高20px(`TextView.svelte`)。**tuif の16色にはシンタックスハイライトの色がない**(tuif は bat の ANSI 出力)ので、`Theme` の色をビューアへどう割り当てるかは決めごと。

### 3.7 設定ファイルの扱い(Rust)

- `G:app/src-tauri/src/config/config_toml.rs` が読むのは最上位の `ui_theme`、`input_keymap_custom`、`external_apps` だけ(`KNOWN` `:123`)。**`[theme]` / `[colors]` は今は「不明な設定」として通知される**(SPEC-0300-0022 R-1643)。
- 雛形・見本: `G:app/src-tauri/templates/config.sample.toml`(見本。起動のたびに書き直す)と `config.toml` の雛形(R-1610)。説明は `## `、設定の行は `# `(R-1631)。`ui_theme` は最初の表の見出しより前に書く(R-1631-1)。`[theme]` / `[colors]` は表なので、雛形の中の位置、行番号の対応づけ(`config_toml_lines.rs`)も要る。
- 一貫性のテスト: `G:app/src-tauri/src/config_bridge/template_consistency_tests.rs`、`G:app/src/settings-template-static.test.ts`、`G:app/e2e/lib/settings-template.mjs`。

## 4. 差の一覧(項目ごと)

| # | 項目 | tuif | guif | 合わせるときの論点 |
|---|---|---|---|---|
| 1 | 色の仕組み | 16色の `Theme`。プリセット6つ+`[colors]` 16項目 | 19色の CSS 変数(ライト/ダークの2組)。種類(フォルダー/ファイル)の色はない | 16色→CSS 変数への対応表が要る(第5.2節)。種類別の色の変数を新設する。 |
| 2 | 既定の色 | `default` プリセット(`Reset` と ANSI 色) | ライト/ダーク(OS 追従) | 発注者決定の既定は nord。`ui_theme` の OS 追従の扱い(第5.3節)。 |
| 3 | 背景 | `bg` 1色(`Reset` は端末に任せる)。バー類は `status_bar_bg` | ページ `--ui-bg`、領域 `--ui-surface`、バー `--ui-surface-2` | 領域ごとの背景を `bg` からどう導くか。 |
| 4 | 枠 | `Borders::ALL`(細い1本線)。アクティブ=`border`、非=`border_inactive`。ツリーと一覧だけ | 1px の実線(`--ui-border`)を全領域に。アクティブ/非アクティブの色分けなし(フォーカスは outline) | 細い線は CSS の `1px solid` で近い。アクティブ/非アクティブの色分けは新規。他の領域の枠を残すか。 |
| 5 | 見出し(枠の上辺) | ツリー ` Drives / Tree (Tab \| l:Expand h:Collapse Enter:Open) `、一覧 ` Files (78 items) [sort: type asc] ` | なし | 英語(SPEC-0300-0019 は日本語統一済み)。枠の上辺に文字を載せる見た目は CSS で作る(`<fieldset>`/`<legend>` か絶対配置)。ツリーの操作ヒントは tuif のキー(`l` `h`)で guif のキーと合わない。 |
| 6 | 一覧の行の高さ | 端末の1行(約21px、推測。第5.5節) | 28px(区切り線あり) | 「行間」の要望。第5.5節。 |
| 7 | フォント | 端末の設定(JetBrainsMono Nerd Font) | Segoe UI / Meiryo+等幅は一部(Cascadia Mono 等) | 発注者決定(2)。`config.toml` で選ぶ。一覧とツリーだけ。 |
| 8 | 名前 | `{*/空白} {名前}`、末尾を `…` で省略(全角=2) | `📁/📄 名前`、拡張子を残して中間を省略 | 絵文字を残すか。省略の仕方。 |
| 9 | サイズ | フォルダー `<DIR>`、`25 B` / `1.2 KB` / `25.0 MB`(GBまで)。寄せの指定なし(左寄せと推測) | フォルダー空欄、同じ形(TBまで)。右寄せ | `<DIR>` は発注者決定(3)。寄せは未決。 |
| 10 | 日時 | `%Y/%m/%d %H:%M`(設定可) | `YYYY-MM-DD HH:mm` 固定 | `time_format` を移すか(決定に含まれない)。 |
| 11 | 2列表示 | 縦に流す。列数=内側の幅÷(24+10+20)。列幅は等分で上限なし。縦線 `│`。ページ単位で切替 | 縦に流す(**実装済み**)。`minCol` 172〜400px、等分・上限720px、列間16px、縦線なし。1列ずつスクロール | 足りないのは縦線と、`min_col_width` に当たる設定、(合わせるなら)ページ単位の切替。 |
| 12 | ←→ | 隣の列の同じ行位置。なければ最後の項目へ寄せる | 同じ行位置になければ動かない | SPEC-0300-0009 R-58 の挙動の差。合わせるかは別の決め。 |
| 13 | ツリーの印・字下げ | `▾`/`▸`、全ノードに印、空白2つ/深さ | `▼`/`▶`、子なしは隠す、`8+14×深さ` px | 記号の置換は簡単。「子なしで隠す」を残すか。 |
| 14 | ツリーの幅 | 画面幅の `tree_width_percent`%(既定24) | 220px固定 | `[layout]` を移すかは決定にない。 |
| 15 | カーソル | 行全体を `cursor_bg`(teal)+`cursor_fg`、太字。フォーカスのあるペインだけ | 1px の枠(`--ui-focused`)。選択行は背景 `--ui-selected` | 「カーソル行を塗りつぶす」見た目は guif の「フォーカス行の枠」の置き換えになる。 |
| 16 | 選択(複数) | 行頭 `*`+`selected` 色の太字。背景は変えない | 背景 `--ui-selected` | 色にするか背景のままか。カーソル行が選択色より優先される点も同じにするか。 |
| 17 | フォルダー/実行ファイルの色 | `folder`(太字)、`executable`(`.exe .bat .cmd .ps1`、大小区別あり) | なし(絵文字のみ) | 判定を同じにするか(拡張子の大小)。`symlink` は tuif も未使用。 |
| 18 | 隠しファイル | 見た目の区別なし。常設表示なし | ステータスバーに「隠し: オン/オフ」を常設 | スクリーンショットの薄い表示の理由は不明(第0節の4)。 |
| 19 | パス行 | ` Path: `(`tree_current`、太字)+ パス。枠なし。編集は別ダイアログ | 「PATH」ラベル+編集できる入力欄(角丸4px、枠付き) | 入力欄は機能なので残す。ラベルの色・枠・背景を寄せるか。 |
| 20 | ステータスバー | ` Items: 78 \| メッセージ`。`status_bar_*` の帯 | 枠付き。フォーカス/並び替え/選択/隠し/絞り込み/メッセージ | 項目の入れ替えは R-971 / SPEC-0300-0019 の改訂。 |
| 21 | メニューバー | 英語4つ。帯は `status_bar_*`、開いた見出しは `menu_bar_active_*`。右に `  tuif` | 日本語、枠付き。開いた見出しは `--ui-hover` | 色の対応は簡単。文言は日本語のまま(SPEC-0300-0019)。 |
| 22 | ビューア | 枠+`bg`。本文は bat の ANSI | 11+13色の `--vw-*`、GitHub 配色 | 「ビューアにも使う」の範囲は未確定(第5.4節)。 |
| 23 | 設定の書き方 | `[theme] preset = "nord"`、`[colors]` | 最上位 `ui_theme`(light/dark/system) | 決定(1)は tuif と同じ書き方。`ui_theme` との関係(第5.3節)。 |
| 24 | 誤りの通知 | プリセット名・色の誤りは黙って既定/プリセットのまま | 設定の誤りは起動時と「設定ファイルのチェック」で行番号付きで通知(SPEC-0300-0022) | tuif と同じ「黙る」にすると guif の方針と食い違う。通知するなら文言(W-A*)の追加。 |

## 5. GUI に移すときの論点

### 5.1 ターミナルの色名を GUI でどの RGB にするか

- ratatui 0.29 の名前付き色は ANSI の16色を指す(`Black`=0 `Red`=1 `Green`=2 `Yellow`=3 `Blue`=4 `Magenta`=5 `Cyan`=6 `Gray`=7 `DarkGray`=8 `LightRed`=9 `LightGreen`=10 `LightYellow`=11 `LightBlue`=12 `LightMagenta`=13 `LightCyan`=14 `White`=15)。実際の RGB は端末の配色が決める(外部知識。tuif のコードには RGB の定義がない)。
- tuif で色名が出るのは、`default` プリセットの全項目と `light` の `White` 2つだけ。**6プリセットのうち `default` と `light` の2つだけが「色名」を含む**。nord・monokai・catppuccin・solarized は全項目が RGB なので、GUI でも見た目が決まる。
- 発注者の端末(`C:\Users\toshi\AppData\Local\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json` を読んだ。`:34` 既定のプロファイルは PowerShell〈`{574e775e-...}`〉、`:126-133` その配色は `One Half Dark_Toshi`、フォントは `JetBrainsMono Nerd Font`、サイズの指定なし〈既定12〉、`lineHeight` / `cellWidth` の指定なし):
  - black #282C34 / red #E06C75 / green #658251 / yellow #E5C07B / blue #61AFEF / purple #C678DD / cyan #56B6C2 / white #DCDFE4 / brightBlack #5A6374 / brightRed #E06C75 / brightGreen #98C379 / brightYellow #E5C07B / brightBlue #61AFEF / brightPurple #C678DD / brightCyan #56B6C2 / brightWhite #DCDFE4 / foreground #DCDFE4 / background #000000(`:186-209`)。
  - 発注者の端末で `default` プリセットを使うと、`Reset` の `bg` は #000000、`file` は #DCDFE4、`Cyan` は #56B6C2、`Yellow` は #E5C07B、`DarkGray`(8)は #5A6374、`LightMagenta`(13)は #C678DD、`LightGreen`(10)は #98C379、`LightBlue`(12)は #61AFEF、`White`(15)は #DCDFE4(ANSI 番号と ratatui 色名の対応は外部知識)。**発注者は nord を使っているので、これは default / light を GUI に移すときの参考値にすぎない。**
  - 別の人の端末では Windows Terminal の既定の配色 Campbell(Black #0C0C0C、Yellow #C19C00、Cyan #3A96DD、BrightBlack #767676 など)になるが、これは外部知識で、このリポジトリや発注者の設定からは確認していない。GUI の既定値は「端末に依存しない固定の RGB」を決める必要がある。
- `Reset`(`default` の `bg` と `file`): GUI には「端末の既定」がない。何かの RGB に決める必要がある(例: ライト/ダークの `--ui-bg` / `--ui-fg`)。`[colors]` の `bg = "none"` / `"reset"` を許すか(許すなら意味を決める)。
- `Indexed`(`"0"`〜`"255"`): GUI では256色の標準パレットの RGB に変換するか、受け付けないか。0〜15 は上と同じ問題。
- `#RGB`(3桁)・`#RRGGBB`(6桁)は CSS と同じ意味でそのまま使える。

### 5.2 16項目 → guif の画面への割り当て(決めるべき点の列挙)

- 対応を付けやすい: `bg`(ページ背景か、ツリー・一覧の背景か)/ `border`・`border_inactive`(領域の枠。アクティブ/非アクティブの区別は新設)/ `cursor_fg`・`cursor_bg`(フォーカス行)/ `folder`・`file`・`executable`(名前の文字色。今は色の別がない)/ `status_bar_fg`・`status_bar_bg`(ステータスバー。tuif ではメニューバーも同じ色)/ `menu_bar_active_*`(メニューバーの開いた見出し。今は `--ui-hover`+角丸)/ `tree_current`・`tree_cursor`(ツリー)。
- 曖昧: `selected`(tuif は文字色、guif は背景)/ `symlink`(tuif も未使用。guif の行表示にリンクの区別があるか〈SPEC-0300-0009 R-71-1〉は未確認)/ `bg` の範囲(バー類 `--ui-surface-2`、ダイアログ `--ui-surface`、右クリックメニュー、モーダルの背景)。
- 16項目に対応先がない guif の色: `--ui-muted`(サイズ・日時)、`--ui-border-muted`(行の区切り線)、`--ui-error`、`--ui-link`、`--ui-backdrop`、`--ui-shadow-*`、`--ui-row-head`、`--ui-surface-3`、`--ui-hover`。他の項目から導くか(例: `border_inactive` から)、プリセットごとに別の値を持つか。tuif にはこれらに当たる概念がない。
- コントラスト: SPEC-0300-0017 R-916 / R-916-1 はテキストのコントラスト比(4.5:1 等)を要求し、AC-956 で単体テストしている。tuif の色にはこの基準を満たす保証がない。私の概算では solarized の `file` #839496 on `bg` #002B36 は約4.7:1、`border_inactive` #073642 on #002B36 は約1.2:1(実測ではない)。上書きの色が自由であることとの関係も論点。

### 5.3 `ui_theme` との関係(`config.toml` の書き方)

- 発注者決定(1)は tuif と同じ書き方(`[theme] preset = "nord"`、`[colors]` の16項目)。キーの別名(`name` / `theme`、`background`、`selected_mark`)、最上位の `theme = "nord"` の文字列形式、`solarized` と `solarized-dark` の両方の名前、大文字小文字・`-` `_` 空白の無視をどこまで移すかは決まっていない。
- guif の `ui_theme`(light / dark / system)は SPEC-0300-0017 R-917 で承認済み。tuif は `ui_theme` を「`[theme]` が無いときのプリセット名」として読む(`light` だけ効き、`dark` / `system` は default プリセット)。guif では `"dark"` が「ダーク」を意味する。移すときの選択肢(推測): (a) `ui_theme` を廃止して `[theme] preset` に置き換える、(b) `ui_theme` を残し `[theme]` があればプリセットを優先、(c) `light` プリセットと `ui_theme = "light"` を同じ意味にする。いずれも R-917〜R-919 と SPEC-0300-0022 の改訂が要る。
- OS の明暗に追従する既定(`system`)は、プリセットが1つ固定されると意味を失う(nord は常に暗く、`light` だけが明るい)。**OS 追従をやめるか、`system` のとき nord と light を切り替えるか**は決めごと(決定は「既定は nord」)。
- `color-scheme`(フォーム部品・スクロールバー。R-912-1)とタイトルバーの明暗(R-918)はプリセットの明暗に連動させる必要がある。今は `prefers-color-scheme` で決まる。プリセットが明るいか暗いかの判定(プリセットごとの固定の印、または `bg` の輝度)が要る。tuif にはその情報がない(推測)。
- 実装面(推測): 変数の切替が `@media (prefers-color-scheme)` に依存しているので、プリセット方式にするなら、起動時に Rust が `config.toml` を読み、フロントが `:root` の変数を設定する(または `<style>` を差し込む)仕組みになる。ちらつき防止の背景色(`window_theme.rs`)も同じ値を使う必要がある(R-919-1)。

### 5.4 ビューア

- tuif のビューアは `Theme` の枠・背景・案内帯の色と、bat の ANSI を使う。guif のビューアは `--vw-*` の24色を持つ。決定は「ビューアにも使う」だけ。`bg` / `file`(本文)/ `border` / `cursor_*` / `status_bar_*` をどの `--vw-*` に当てるか、ハイライトの13色(キーワード、文字列など)を `Theme` からどう決めるか(今の GitHub 配色のまま、`Theme` に項目を足さない、など)は決めごと。
- ライト/ダークに分かれた GitHub 配色は、プリセットの明暗に合わせる必要がある(5.3 の明暗の判定)。SPEC-0300-0017 R-913-1-1 はハイライトの色のコントラスト(4.5:1)を表で固定している。

### 5.5 フォントの大きさと行の高さの換算(推測を多く含む)

- 発注者の端末の文字: JetBrainsMono Nerd Font、サイズは設定になく既定(Windows Terminal の既定は12pt)。`lineHeight` / `cellWidth` の指定もない(`settings.json` で grep 0件)。
- 12pt は 96 DPI で 16px(1pt = 4/3 px)。JetBrains Mono の行の送りは約 1.32 em(外部知識)なので、端末の1行は約 21px(推測)。文字幅は約 0.6 em ≈ 9.6〜10px(推測)。表示倍率が100%でないと実ピクセルは変わる。
- guif は 28px / 12px(約2.3倍)。**tuif の行は約1.3倍で、同じ文字サイズなら guif の行はかなり広い**(推測を含む)。発注者が「行間が優れている」と言う理由はおそらくここ。行の高さを寄せるなら 12px の字で 16〜22px 付近になるが、具体値は推測であり、スクリーンショット(または端末の実測)が要る。
- `--list-row-height` は一覧とツリーで共有され(R-924)、`rows = floor(H / 行高)`、ページ移動量(R-59-1 / R-59-2)、ツリーの `computeFullyVisibleRows` が使う。計算式は変数から取るので追従するが、**SPEC-0300-0017 の寸法(`minCol`、R-991-1 の最小ウィンドウ 640×480 の検算、AC の期待値の 28)と E2E の期待値は書き換えが要る**。
- フォントを選ぶ設定: 「JetBrains Mono 系 → Cascadia Mono → Consolas」の入っているもの。CSS の `font-family` の並びで表現できる(入っていなければ次へ)。「JetBrains Mono 系」は Windows 上の家族名が複数ある(`JetBrainsMono Nerd Font`〈発注者の端末の `face`〉、`JetBrainsMono NF`、`JetBrains Mono` など。名前の列挙は推測で、実機のインストール名の確認が要る)。
- 日本語の字形の代わり: JetBrains Mono / Cascadia Mono / Consolas は日本語の字を持たない(外部知識)。今の等幅リストも日本語は OS のフォールバック任せ(R-921)。発注者の端末も、PowerShell プロファイルの `face` は1つで日本語用の指定はない(`defaults` に `Ricty Diminished` がある〈`settings.json:61-63`〉が、プロファイルの `face` が上書きする。実際にどの字形で描かれているかは未確認)。guif で日本語の字形を決めるなら、等幅リストの末尾に `"BIZ UDGothic"` `"Yu Gothic"` `"Meiryo"` 等を足すか、OS 任せにするか(名前は例示)。tuif の列そろえは `unicode-width`(全角=2マス)に依存するが、GUI では字幅がフォント次第。guif の名前の省略は `canvas.measureText` の実測なので影響は小さい。
- 絵文字(📁 📄)は等幅フォントにない。tuif に合わせる(アイコンなし)なら絵文字を外すかも決めごと(決定(3)に含まれるか不明)。
- tuif が使う記号は `▸ ▾ ◀ ▶ │ ✓ ☁ █` など標準の Unicode のみで、Nerd Font の私用領域のアイコンは使わない(`T:src/tui/mod.rs` を読んだ範囲)。`▸ ▾` が Cascadia Mono / Consolas にあるかは未確認(無ければフォールバックで別のフォントになる)。

### 5.6 罫線・枠・見出し

- `Borders::ALL` の既定の罫線は CSS では `border: 1px solid` で近似できる(角は直角)。端末の枠は文字のマス目の中央に引かれ、GUI では領域の外縁になる。
- 見出しは枠の上辺の中に埋め込まれる(左寄せ、前後に空白)。CSS では `<fieldset>`/`<legend>`、または枠線の上に背景色を塗ったラベルを絶対配置する。名前の付け方は SPEC-0300-0017 R-950・R-972 とのかね合い。
- 見出しの文言は英語。guif は日本語統一済み(SPEC-0300-0019 R-1200)。「ファイル (78 件) [並び替え: 種類 ↑]」のように日本語にするか、英語のままにするか(例外の扱い)。ステータスバーの「並び替え: 種類 ↑」との重複の整理も要る。
- 並び順の表記: tuif は内部キーの生の文字(`type asc`)。guif は日本語+矢印(`種類 ↑`)。

### 5.7 2列表示・列の扱い

- 既に縦優先の多列グリッドなので、**新しく作るのは縦線と(合わせるなら)列数・列幅の決め方**。tuif は列数を `内側の幅 ÷ (min_col_width + 10 + 20)` で決めて等分する。guif の `minCol`(172〜400px)・上限720px は R-956 で承認済み。スクリーンショットで2列に見えた理由は、端末の幅と項目数による(推測。発注者の端末は `initialCols: 120`〈`settings.json:35`〉で、1列の最小幅は24+10=34マス。実際の幅は不明)。
- `min_col_width` の単位は「文字数(マス)」。GUI では px か、フォントの文字幅×文字数か。

### 5.8 その他

- 太字: tuif はフォルダー・選択・カーソル行を太字にする。GUI の太字は字幅を変えうる(名前の省略の実測の font に影響)。
- 文字色だけでフォルダーを示す場合の色覚への配慮(guif は絵文字でも示している)。
- 色の上書きが効く範囲に、メニューバー・右クリックメニュー・ダイアログ・検索バー・履歴一覧を含めるか(tuif のモーダルは `bg` / `border` / `cursor_*` / `file` だけを使う。`:583-600, 744-787`)。

## 6. 承認済みの guif の仕様のうち、この変更で改める必要がありそうな条文(候補。判断は人間)

SPEC-0300-0017(第10版 APPROVED):
- §1 対象外(`:224`)の「ライト / ダーク以外のテーマ」「テーマを切り替える UI」: プリセット6つの追加はこれに当たる。
- R-910(色は CSS 変数)、R-911 / R-911-1(変数名と値。ライト/ダークの19色の表)、R-912(テーマはライトとダークの2つ)、R-912-1(`color-scheme`)、R-913 / R-913-1 / R-913-1-1 / R-913-2(ビューアの色。`--vw-*` とコントラストの表)、R-916 / R-916-1(コントラスト比)。
- R-917〜R-917-8(`ui_theme` の決め方・不正値・読込時期)、R-918 / R-918-1(タイトルバーの明暗)、R-919 / R-919-1(テーマの変化の反映・Rust の背景色の4定数)、R-919-2(新しい外部依存を足さない)。AC-904 / AC-905(色の文字列の完全一致)、AC-948〜AC-962、§18.1。
- R-903(各領域の枠)、R-904(背景の割り当て)、R-920〜R-922(フォントと大きさ。等幅を使う場所は「一覧の行、ツリーのノード、パスバーの入力欄、履歴一覧のパス」→ 決定は「一覧とツリーだけ」)、R-923、R-924(`--list-row-height: 28px`)。
- R-935〜R-937(ツリーの寸法・字下げ・印 `▼` `▶`・子なしの印を隠す)、R-938(ドライブ名 `C:`)。
- R-945〜R-949(一覧の行。列構成、サイズ64px、名前の省略)、R-946-1、R-950。
- R-955〜R-959(列の寸法・縦スクロールなし・端マーカー)、R-956-2、R-957(`rows` が移動量と同じ値)。
- R-965〜R-968(選択・フォーカスの見た目)。
- R-970〜R-976(ステータスバーの項目と文言。件数・並び順を見出しに移すなら重複)。
- R-991-1(最小ウィンドウ 640×480 の検算。行の高さと列の幅に依存)。

SPEC-0300-0009(第19版): R-16-1(行数 = 高さ ÷ 行高。フォールバック32px)、R-16-3(1列の最小幅 140 / +72 / +140)、R-18(スナップ)、R-19(端マーカー)、R-20-11 / R-20-12(サイズ・日時の書式。`<DIR>` を出すなら)、R-26(項目なし)、R-58 / R-59-1 / R-59-2(←→、ページ移動の量)、R-77(ui-state の保存)。AC-02〜AC-06、AC-11 / AC-12。

SPEC-0300-0010: R-15、§4.2(`move_left` / `move_right`)。←→の挙動を合わせる場合のみ。

SPEC-0300-0015(ビューア): R-466-7 / R-466-8(ハイライトの色)、R-511 / R-511-1(配色と `color-scheme`)、R-462(フォント)、R-510-2。

SPEC-0300-0019(日本語統一): R-1200 / R-1202(画面の文言は日本語)、§4 の W-08(`PATH`)、W-16(項目なし)、ステータスバーの文言。tuif と同じ英語の見出し(`Files (78 items) [sort: type asc]`、`Drives / Tree ...`、`<DIR>`)を入れるなら例外の明記が要る。

SPEC-0300-0022(設定ファイルを開く・チェック): R-1610 / R-1631 / R-1631-1(雛形の書き方。表の位置)、R-1620〜R-1623(見本ファイル)、R-1641〜R-1643(読む設定のキーの一覧・不明な設定の通知。`[theme]` / `[colors]` を既知にする)、R-1654(`ui_theme` の通知文)、W-A0〜W-AD。雛形・見本に `[theme]` / `[colors]` / フォントの説明(取り得る値、既定の値、色の書式)が要る。`config.sample.toml` と `config.toml` 雛形、`template_consistency_tests`、`settings-template-static.test.ts`、E2E の `settings-template.mjs` も同期が要る。

その他: SPEC-0300-0020 §10(メニューバーの色)、SPEC-0300-0018 §8(右クリックメニュー)、SPEC-0300-0012(検索バー)、SPEC-0300-0013(履歴一覧)、SPEC-0300-0011(ダイアログ): 色変数の使い方。SPEC-0200-0001(設計 §3.8 / §3.11)、SPEC-0400-0001(テスト)、SPEC-0500-0001(マニュアル §6.2 画面のテーマ)。

実装側の影響(参考): `G:app/src/app.css`、`G:app/src/routes/viewer/viewer-theme.css`、`G:app/src-tauri/src/shared/window_theme.rs`(背景色の定数と drift テスト)、`G:app/src-tauri/src/config/config_toml.rs`(`KNOWN`、`[theme]` / `[colors]` の読み)、`config_toml_lines.rs`、`G:app/src/ui-colors-static.test.ts`、`G:app/src/viewer-font-values.test.ts`、`viewer-theme-static.test.ts`、`viewer-theme-highlight.test.ts`、`G:app/e2e/specs/color-font.mjs` ほか(AC-904 などの文字列比較)。

## 7. 未確認・不明な点

- スクリーンショットで `.` で始まるフォルダーが薄く見えた理由(第0節の4)。
- tuif の `Table` のセルの寄せ・列の間隔の実際の描画(ratatui 0.29 の既定に基づく推測。実機の画面は確認していない)。
- 端末の行の高さ・文字幅の実ピクセル(第5.5節。推測)。実測には Windows Terminal 上の tuif のスクリーンショットが要る。
- ANSI 番号と ratatui の色名の対応、Campbell の RGB(外部知識。第5.1節)。
- tuif の作業ツリーの未コミット変更(`git status` は実行していない)。
- tuif の `symlink` が将来使われる予定か(コードからは不明。`T:PLAN.md` などは未読)。
- `JetBrains Mono` 系フォントの Windows 上の家族名の一覧(推測。実機のインストール名が要る)。
- プリセットの明暗の判定、`ui_theme` との共存(第5.3節の選択肢は推測)。
- SPEC-0300-0017 の §12 以降の受入基準(AC-9xx)の個別の期待値は一部のみ確認。

## 8. 読んだ主なファイル

- tuif: `src/theme/mod.rs`(全体)、`src/config/config_toml.rs:60-335`、`src/tui/mod.rs:1-800, 880-950`、`src/app.rs:350, 432-445, 555-700, 1150-1180, 1255-1500`、`src/shared/schema/ui_state.rs:1-75`、`src/shared/schema/ui_theme.rs`、`src/viewer/highlight.rs:1-60`、`docs/user_manual.md:460-560`、`Cargo.toml`、`C:\Users\toshi\AppData\Roaming\tuif\config.toml`、Windows Terminal の `settings.json`。
- guif: `specs/features/SPEC-0300-0017-visual-design.md`(冒頭〜§11 を読んだ。§12 以降は未読に近い)、SPEC-0300-0009 / 0010 / 0015 / 0019 / 0022(条文を grep)、`app/src/app.css`、`app/src/routes/_components/FileListPanel.svelte` / `FileListRow.svelte` / `StatusBar.svelte`、`app/src/lib/features/file-list/TreePanel.svelte` / `list-layout.ts` / `format.ts` / `navigation.ts`、`app/src/lib/features/path-bar/PathBar.svelte`、`app/src/lib/features/menu-bar/MenuBar.svelte`、`app/src/routes/viewer/viewer-theme.css` / `+page.svelte` / `_components/TextView.svelte`、`app/src-tauri/src/shared/window_theme.rs`、`app/src-tauri/src/config/config_toml.rs`、`app/src-tauri/templates/config.sample.toml`。
