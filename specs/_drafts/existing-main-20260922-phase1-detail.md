# 既存仕様調査(main基準): Phase1機能詳細

- 調査日: 2026-09-22
- 対象リポジトリ: `C:\Users\toshi\git\ReflexFiles`
- 調査基準: **`main`ブランチのコミット時点の内容のみ**(`git -C ... show main:<path>` で取得。作業ツリーは `new-feature-experiment` + 未コミット29ファイルの状態であり、本調査では一切参照していない)
- `main` の HEAD: `a62954e89d5c5b6d57248585bb53068088399822`("test", 2026-02-18 19:42:19 +0900)。`app/package.json` の `version` は `0.2.0`(main:app/package.json:3)。
- 参考: `specs/_drafts/existing-20260922-reflexfiles-overview.md` は調査時に`new-feature-experiment`(mainから107コミット進み、HEAD `e424b11`, version 0.5.0)を対象としていたことが同ファイル内で訂正されている。本ファイルはその反省を踏まえ、`main`のみを対象に独立して再調査した結果である。
- 方針: コード(`git show main:<path>`で取得した内容)を一次情報とし、ドキュメント(user_manual.md等)との食い違いは両方を併記する。コードから読み取れない意図は「不明」と明記する。すべての引用は `main:<repo相対パス>:<行番号>` の形式で示す。

---

## 1. ファイル一覧/ツリービュー(SPEC-0300-0002)

### 1.1 関連ファイル一覧(mainブランチ、行数)

| ファイル | 行数(main) |
| --- | --- |
| `app/src/lib/components/FileList.svelte` | 149 |
| `app/src/lib/components/ListRow.svelte` | 145 |
| `app/src/lib/components/TreePanel.svelte` | 147 |
| `app/src/lib/components/SortMenu.svelte` | 66 |
| `app/src/lib/utils/list_layout.ts` | 218 |
| `app/src/lib/effects/list_layout.ts` | 74 |
| `app/src/lib/page_list_layout.ts` | 153 |
| `app/src/lib/utils/tree.ts` | 167 |
| `app/src/lib/page_tree.ts` | 190 |
| `app/src/lib/page_init_sections/init_list_layout.ts` | 48 |
| `app/src/lib/page_init_sections/init_tree.ts` | 48 |
| `app/src/lib/utils/selection.ts` | 86 |
| `app/src/lib/actions/selection.ts` | 69 |
| `app/src/lib/page_list_focus.ts` | 69 |
| `app/src/lib/utils/navigation.ts` | 67 |
| `app/src/lib/page_sort_menu.ts` | 110 |
| `app/src/lib/page_dir.ts` | 84 |
| `app/src-tauri/src/fs_query.rs` | 840 |
| `app/src-tauri/src/fs_query_cmds.rs` | 63 |
| `app/src-tauri/src/types/files.rs` | 117 |

(取得コマンド: `git -C "C:\Users\toshi\git\ReflexFiles" show main:<path>` を各ファイルに実行し `wc -l` で行数取得)

### 1.2 画面構成

- レイアウトは「ツリーパネル(左) + マルチカラムのファイルリスト(右)」の2ペイン構成。`TreePanel.svelte`は固定幅パネル(`main:app/src/lib/components/TreePanel.svelte:72-74` で `width: 220px; min-width: 200px; max-width: 320px;`)。
- ファイルリスト(`FileList.svelte`)は「複数列のカード状グリッド」であり、一般的な表形式(固定列ヘッダー)ではない。`list-body` は CSS Grid の `grid-auto-flow: column` を用い、画面の高さに収まる行数(`--list-rows`)を計算し、それを超える件数は右方向へ新しい列を追加していく「縦優先・列送り」のレイアウト(`main:app/src/lib/components/FileList.svelte:130-136`)。
- 列幅・行数・折返しはJS側で動的計算される。ロジック本体は `computeListLayout`(`main:app/src/lib/utils/list_layout.ts:28-80`)。
  - 行数 `rows` = コンテナ高さ ÷ `--list-row-height`(CSS変数、フォールバック32px)。
  - 列数 `cols` は「コンテナ幅に収まる最大列数」と「全件数 ÷ rows の必要列数」の小さい方(`main:app/src/lib/utils/list_layout.ts:55-57`)。
  - 列幅は `showSize`/`showTime` の有無で最小幅(`minCol`)が変わり、`nameMin=140px, sizeWidth=72px, timeWidth=140px` を積み上げて算出(`main:app/src/lib/utils/list_layout.ts:40-51`)。
  - 表示しきれない列がある場合は水平スクロールで「列単位」にスナップする(`main:app/src/lib/effects/list_layout.ts:36-58` の `onScroll`/`snapTimer`、`ResizeObserver`で再計算: `main:app/src/lib/effects/list_layout.ts:22-35`)。
  - 画面外に隠れている列があるときは、リスト先頭/末尾セルに矢印のオーバーフローマーカーを表示する(`main:app/src/lib/components/ListRow.svelte:47-52`, ロジックは `computeOverflowMarkers`: `main:app/src/lib/utils/list_layout.ts:107-118`)。
- 行として表示される列(カラム内の項目)は最大3種類:
  1. ファイル名(アイコン + 名前、常時表示) — `main:app/src/lib/components/ListRow.svelte:42-53`
  2. サイズ(`showSize`がtrueの時のみ、ディレクトリは空文字) — `main:app/src/lib/components/ListRow.svelte:54-56`
  3. 更新日時(`showTime`がtrueの時のみ) — `main:app/src/lib/components/ListRow.svelte:57-59`
  - `showSize`/`showTime`はCSSクラス(`.list.show-size`/`.list.show-time`)でグリッド列テンプレートを切り替える(`main:app/src/lib/components/ListRow.svelte:63-73`)。作成日時・所有者・属性等は一覧には表示されない(プロパティダイアログ側のみ、`types/files.rs`の`Properties`構造体に created/accessed/hidden/readonly/system等のフィールドがあるが、一覧APIの`Entry`構造体には含まれない。`main:app/src-tauri/src/types/files.rs:80-117`)。
  - デフォルト値: `ui_show_size: true`, `ui_show_time: false`, `ui_show_tree: true`(`main:app/src-tauri/src/config_defaults.rs:11-14`)。

### 1.3 ソート機能

- ソート対象は4種類: `name` / `size` / `type` / `modified`(`SORT_MENU_KEYS`, `main:app/src/lib/ui_constants.ts:1`、`SortMenu.svelte`のボタン4つ: `main:app/src/lib/components/SortMenu.svelte:17-40`)。
- ソートは昇順/降順のトグル式: 同じキーを再選択すると `asc`⇔`desc` が反転し、別キーを選ぶと `asc` にリセットされる(`setSort`, `main:app/src/lib/page_sort_menu.ts:36-47`)。
- ソートの実処理はフロントエンドではなくRust側(`fs_list_dir_impl`)。ソート後の配列がそのままフロントに返る(`main:app/src-tauri/src/fs_query.rs:194-224`)。
  - `name`: 大小文字を無視した名前比較(`to_lowercase().cmp`)
  - `size`: バイト数比較
  - `type`: まずディレクトリを先頭にグループ化、次に拡張子(小文字)比較、最後に名前(小文字)比較の3段階(`main:app/src-tauri/src/fs_query.rs:200-215`)
  - `modified`: 文字列としての比較(フォーマットの明示箇所は`entry_from_path`実装側にあり、今回は詳細まで読み込んでいない。不明点として記録)
- ソートメニューはキーボード操作可能なポップアップ(`role="menu"`、矢印キーで項目移動、`Enter`で確定、`Escape`で閉じる。`main:app/src/lib/page_sort_menu.ts:62-102`)。開閉は`sort_menu`アクション(既定キー `S`)でトグル(`main:app/src/lib/utils/keyboard_list.ts:358-366`)。

### 1.4 ツリービューとリストの連動

- ツリーはルートパスから開始し、`fs_list_dir`コマンドで子ディレクトリのみをオンデマンド取得する(`expandTreeNode`, `main:app/src/lib/page_tree.ts:72-114`)。取得時は `sortKey: "name", sortOrder: "asc"` 固定でディレクトリのみフィルタする(`main:app/src/lib/page_tree.ts:77-89`)。
- 初回構築時は「自動展開」が働き、`autoExpandDepth`未満かつ子要素数が`autoExpandEntryLimit`を超えないノードを再帰的に自動展開する(`main:app/src/lib/page_tree.ts:106-113`、`autoExpandBlocked`フラグは`items.length > autoExpandEntryLimit`で判定: `main:app/src/lib/page_tree.ts:90`)。実際の閾値定数の値は今回確認していない(不明)。
- ツリーノードをクリック/Enterで選択すると、そのパスが現在パスと異なる場合に `loadDir(node.path)` を呼び出し、右側のリストを更新する(`selectTreeNode`, `main:app/src/lib/page_tree.ts:142-149`)。すなわち「ツリー選択 → リスト側の`loadDir`をトリガー」という一方向の連動。
- 逆方向(リスト側でディレクトリを開いた際にツリーが追従するか)は `page_dir.ts` の `loadDir` 内で `getShowTree()` が真なら毎回 `buildTreeRoot(path)` を呼び出しており、ツリー全体を対象パスから再構築する形で追従する(`main:app/src/lib/page_dir.ts:71-75`)。ツリー非表示時は `clearTree()` のみ呼ばれる。
- ツリー表示のトグルは `toggle_tree` アクション(既定 `Ctrl+Shift+B`)。非表示化時にフォーカスがツリー内にあればリストへフォーカス移動する(`main:app/src/lib/utils/keyboard_list.ts:81-96`)。

### 1.5 操作仕様(選択・フォーカス・展開/折りたたみ)

- **単一選択**: クリックで`setSelected([entry.path])`、アンカーを更新(`main:app/src/lib/components/FileList.svelte:83-97`)。
- **範囲選択**: `Shift+クリック`でアンカーから対象までの`selectRange`(`main:app/src/lib/components/FileList.svelte:87-90`, ロジック本体 `selectRangeByIndex`: `main:app/src/lib/utils/selection.ts:35-48`)。
- **トグル選択**: `Ctrl/Cmd+クリック`で`toggleSelection`(`main:app/src/lib/components/FileList.svelte:91-95`, `toggleSelectionAtIndex`: `main:app/src/lib/utils/selection.ts:14-28`)。
- **全選択/選択解除/反転選択**: `selectAllEntries`/`clearSelectionState`/`invertSelectionPaths`(`main:app/src/lib/utils/selection.ts:54-86`)。既定キー: 全選択`Ctrl+A`、選択解除`Escape`(2.2節参照)。
- **フォーカス移動**(キーボード): 上下は「表示上のインデックス(visualIndex、フィルタ後の並び順)」ベースで移動し、実配列上の`focusedIndex`に変換する(`getNextIndexByRow`, `main:app/src/lib/utils/navigation.ts:21-33`)。左右移動は列単位のジャンプ(`getNextIndexByColumn`, `main:app/src/lib/utils/navigation.ts:43-67`、1列あたりの行数`rowsPerColumn`を用いて列→インデックス変換)。Shift押下時は移動と同時に`selectRange`が呼ばれ、範囲選択になる(`main:app/src/lib/page_list_focus.ts:36-43,60-65`)。
- **マウス操作+キーボード操作のトグル選択(Space)**: リストにフォーカスがある状態で`Space`を押すと現在フォーカス行を選択トグルし、フォーカスを1行下へ進める(`main:app/src/lib/utils/keyboard_list.ts:44-56`、`toggleSelection(focusedIndex, true)`で`advance=true`)。
- **開く**: `Enter`でエントリを開く(`open`アクション)。ファイルはビューア対応拡張子/テキストらしきファイルはReflexViewerで開き、それ以外はOS関連付けアプリで開く。`Shift+Enter`は常にOS関連付けアプリで開く(`main:user_manual.md:40-46`。コード側は`openEntry(entry, { forceAssociatedApp: true })`, `main:app/src/lib/utils/keyboard_list.ts:225-243`)。
- **ツリーの展開/折りたたみ**: キャレットボタンクリックで`toggleTreeNode`(`main:app/src/lib/components/TreePanel.svelte:55-62`)。キーボードでは`move_right`(既定右矢印/vim `L`)で展開(未ロード時は`expandTreeNode`、既に展開済みで子がある場合は最初の子へフォーカス移動)、`move_left`(既定左矢印/vim `H`)で「展開中なら折りたたみ、そうでなければ親ノードへフォーカス移動」(`main:app/src/lib/utils/tree.ts:139-159`)。
- **アクセシビリティ属性**: リストは`role="listbox"`+`aria-multiselectable="true"`+`aria-activedescendant`(`main:app/src/lib/components/FileList.svelte:49-56`)。各行は`role="option"`+`aria-selected`(`main:app/src/lib/components/ListRow.svelte:26-31`)。ツリーは`role="tree"`、各ノードは`role="treeitem"`+`aria-level`+`aria-expanded`(`main:app/src/lib/components/TreePanel.svelte:19-24,38-42`)。

### 1.6 バックエンドとのデータ授受

- リスト取得: Tauriコマンド `fs_list_dir(path, show_hidden, sort_key, sort_order) -> Vec<Entry>`(`main:app/src-tauri/src/fs_query_cmds.rs:9-17`、実装は`fs_list_dir_impl`: `main:app/src-tauri/src/fs_query.rs:176-227`)。フロントは`invoke("fs_list_dir", { path, showHidden, sortKey, sortOrder })`で呼び出し、結果をそのまま`entries`ステートへ格納(`main:app/src/lib/page_dir.ts:53-59`)。
- `Entry`型(Rust): `name, path, type(File|Dir), size:u64, modified:String, hidden:bool, ext:String`(`main:app/src-tauri/src/types/files.rs:80-90`)。TS側の型定義(`main:app/src/lib/types.ts:18-26`)と1:1対応。
- ディレクトリを開くたびに、選択状態・フォーカス・アンカーはリセットされる(`setSelectedPaths([])`, `setFocusedIndex(0)`, `setAnchorIndex(null)`: `main:app/src/lib/page_dir.ts:63-65`)。同時に履歴(`pathHistory`)へ先頭追加(最大50件、`main:app/src/lib/page_dir.ts:66-70`)、ファイル監視(`scheduleWatch`)を再スケジュール。
- ツリーの子ノード取得も同じ`fs_list_dir`コマンドを使用(ソート固定`name/asc`、ディレクトリのみ抽出、`main:app/src/lib/page_tree.ts:77-89`)。ツリー専用のバックエンドコマンドは無い。
- 検索/フィルタはクライアント側処理(`computeSearchEffect`/`applySearchFilter`を`entries`に適用して`filteredEntries`を作る、`main:app/src/lib/page_search.ts:26-36`)。バックエンド呼び出しは無い。`FileList.svelte`が実際に描画するのは`filteredEntries`(表示順・視覚インデックスの基準)であり、`entries`は選択/フォーカスのインデックス基準として並行して保持される。

### 1.7 受入基準相当の情報(user_manual.md / E2Eスモークテスト)

- `main:user_manual.md:21-26`(Screen Layout): 「1. Menu bar / 2. Path bar / 3. Tree view (left panel) / 4. File list (multi-column) / 5. Status bar」という5ブロック構成が明記されている。
- `main:user_manual.md:161`(Known Limitations): 権限で見えないフォルダがツリービューにある旨の既知の制約が明記されている。
- `main:user_manual.md:162`: 「Drag-and-drop is not supported.」— **重要な差異**: `existing-20260922-reflexfiles-overview.md`(new-feature-experiment基準)ではネイティブD&D機能(`dragdrop_cmds.rs`, 468行)の存在を報告しているが、mainブランチのマニュアルは明確に「非対応」と記載している。`git ls-tree -r main --name-only`の結果に`dragdrop_cmds.rs`は含まれておらず、mainには当該ファイル自体が存在しない。ドキュメントとコードは一致しており、new-feature-experimentとの機能差分であることを確認した。
- E2Eスモークテスト(`main:app/e2e/tauri/smoke.mjs`, 973行、`npm run e2e:tauri`から実行: `main:app/package.json:16`)には、クリックによる単一選択→Ctrl+クリックによる複数選択→右クリックのコンテキストメニューからZIP圧縮を実行、という一連の操作フローが実装されている(`main:app/e2e/tauri/smoke.mjs:660-667`)。これは複数選択機能に対する実質的な受入テストとして機能している(専用のユニットテストではなくE2Eスモークの一部)。
- ファイル一覧/ツリー専用の受入基準文書(仕様書・テスト仕様)は`main`上には見当たらない。`docs/`配下にも該当ファイルなし(`git ls-tree -r main --name-only`で確認)。

---

## 2. キーボードナビゲーション/キーマップ(SPEC-0300-0003)

### 2.1 関連ファイル一覧(mainブランチ、行数)

| ファイル | 行数(main) |
| --- | --- |
| `app/src/lib/utils/keyboard_list.ts` | 368 |
| `app/src/lib/utils/keyboard_tree.ts` | 17 |
| `app/src/lib/utils/keyboard_overlay.ts` | 131 |
| `app/src/lib/utils/keyboard_global.ts` | 51 |
| `app/src/lib/utils/keyboard_menu.ts` | 54 |
| `app/src/lib/utils/keymap.ts` | 61 |
| `app/src/lib/utils/modal_keyboard.ts` | 74 |
| `app/src/lib/utils/dropdown_keyboard.ts` | 130 |
| `app/src/lib/page_keymap.ts` | 118 |
| `app/src/lib/page_keymap_bindings_state.ts` | 59 |
| `app/src/lib/page_init_sections/init_keymap.ts` | 43 |
| `app/src/lib/page_init_section_inputs/keymap.ts` | 30 |
| `app/src/lib/page_dom_handlers_keydown.ts` | 119 |
| `app/src/lib/page_lifecycle.ts` | 216 |
| `app/src-tauri/src/types/config.rs` | 255 |
| `app/src-tauri/src/config_defaults.rs` | 182 |
| `app/src-tauri/src/config.rs` | 119 |
| `app/src-tauri/src/config_types.rs` | 4 |
| `app/src-tauri/src/config_cmds.rs` | 646 |
| `app/src-tauri/src/config_io.rs` | 489 |
| `app/src/lib/dto/config.ts` | 56 |

### 2.2 デフォルトのキー割当一覧

- 既定プロファイルは2種類: `windows`(既定)と`vim`(`KeymapProfile::Windows`が`Default`: `main:app/src-tauri/src/types/config.rs:218-221`、フロント側定数`KEYMAP_DEFAULTS`: `main:app/src/lib/ui_constants.ts:52-149`)。
- アクション一覧は`KEYMAP_ACTIONS`として46種類定義されている(`main:app/src/lib/ui_constants.ts:3-50`)。
- `windows`プロファイルの既定値(抜粋、`main:app/src/lib/ui_constants.ts:53-99`):

| アクション | キー |
| --- | --- |
| move_up / move_down / move_left / move_right | ArrowUp / ArrowDown / ArrowLeft / ArrowRight |
| page_up / page_down | PageUp / PageDown |
| undo / redo | Ctrl+Z / Ctrl+Shift+Z |
| select_toggle | Space |
| select_all | Ctrl+A |
| clear_selection | Escape |
| open | Enter |
| go_parent | Backspace |
| exit | Ctrl+Q |
| settings | Ctrl+, |
| help_keymap | F1 |
| focus_path | Ctrl+L |
| toggle_hidden | Ctrl+H |
| toggle_tree | Ctrl+Shift+B |
| copy / cut / paste | Ctrl+C / Ctrl+X / Ctrl+V |
| duplicate | Ctrl+D |
| prefix_date | Ctrl+Shift+D |
| delete | Delete |
| rename | F2 |
| new_file | Ctrl+N |
| properties | Alt+Enter |
| refresh | F5 |
| search | / |
| sort_menu | S |
| history_jump_list | Ctrl+J |
| jump_add / jump_add_url | Ctrl+Shift+J / Ctrl+Shift+U |
| history | Ctrl+Y |
| toggle_size / toggle_time | Ctrl+Shift+S / Ctrl+Shift+T |
| open_explorer | Ctrl+Alt+E |
| open_cmd | Ctrl+Alt+C |
| open_terminal_cmd/powershell/wsl | Ctrl+Alt+1 / 2 / 3 |
| open_vscode | Ctrl+Alt+V |
| open_git_client | Ctrl+Alt+Shift+G |
| zip_create / zip_extract | Ctrl+Alt+Z / Ctrl+Alt+X |

- `vim`プロファイルでは移動系がHJKL、`undo/redo`がU/Ctrl+R、`copy/cut/paste`がY/X/P、`delete`がD、`focus_path`がコロンキー等、vim的な割当に変更される(全量は`main:app/src/lib/ui_constants.ts:101-148`)。両プロファイルとも `select_toggle=Space`, `select_all=Ctrl+A`, `clear_selection=Escape`, `open=Enter`, `go_parent=Backspace`, `exit=Ctrl+Q`, `settings=Ctrl+,`, `help_keymap=F1`, `toggle_hidden=Ctrl+H`, `toggle_tree=Ctrl+Shift+B`, `rename=F2`, `new_file=Ctrl+N`, `refresh`(windowsは`F5`、vimは`R`), `search=/`, `sort_menu=S` など多数が共通/類似している。
- `Ctrl+Q`(終了)と `Ctrl+,`(設定)は、`matchesAction`による判定とは別に、`handleGlobalKey`冒頭でハードコードされたショートカットとしても判定される(`main:app/src/lib/utils/keyboard_global.ts:11-32`)。これはユーザーがこれら2アクションを空文字列(未割当)に上書きしても、`Ctrl+Q`/`Ctrl+,`のイベント自体はここで先取りされ、無効化できない可能性がある実装になっている(意図は不明、コードからはこの重複判定の理由を読み取れない)。

### 2.3 キーマップのカスタマイズ機構

- **設定ファイル形式**: `%APPDATA%\ReflexFIles\config.toml`(TOML形式。パス生成は`main:app/src-tauri/src/config_io.rs:16-17`)。旧形式`config.json`への互換読み込みパスも定義されている(`legacy_config_path`, `main:app/src-tauri/src/config_io.rs:20-22`)。
- `AppConfig`構造体に以下2フィールドがある(`main:app/src-tauri/src/types/config.rs:63-66`):
  - `input_keymap_profile: KeymapProfile`(`windows` | `vim`)
  - `input_keymap_custom: HashMap<String, String>`(アクションID→キー文字列の上書きマップ)
  - 旧キー名`keymap_profile`/`keymap_custom`もserdeの`alias`で読み込み可能(後方互換、`main:app/src-tauri/src/types/config.rs:63,65`)。
  - 既定値: `input_keymap_profile: KeymapProfile::Windows`, `input_keymap_custom: HashMap::new()`(`main:app/src-tauri/src/config_defaults.rs:34-35`)。
- **フロント側の解決ロジック**(`createKeymapHelpers`, `main:app/src/lib/page_keymap.ts:12-118`):
  - `getActionBindings(actionId)`: `input_keymap_custom`にそのアクションのキーが存在すればそれを使う。値が空文字列で明示的に上書きされている場合は「バインドなし(空配列)」として扱われる=そのアクションを無効化できる(`main:app/src/lib/page_keymap.ts:38-47`)。上書きが無ければプロファイル既定値(`KEYMAP_DEFAULTS[profile][actionId]`)を使用。
  - 1アクションに複数キーをカンマ区切りで割り当てられる(`splitBindings`, `main:app/src/lib/utils/keymap.ts:54-61`)。
  - `matchesAction(event, actionId)`はイベントを正規化した文字列(修飾キーをCtrl/Alt/Shift/Metaの順で並べ、最後にキー本体)と比較する(`main:app/src/lib/utils/keymap.ts:39-52`, `main:app/src/lib/page_keymap.ts:53-63`)。Shift単独修飾のケースは`Shift+`を外したバインドとも二重照合する救済ロジックがある(`main:app/src/lib/page_keymap.ts:58-61`)。
  - `setCustomBinding`/`resetCustomBinding`/`captureBinding`という「キー入力を1つ捕捉してカスタムバインドとして保存する」ための関数群が実装されている(`main:app/src/lib/page_keymap.ts:69-99`)。`captureBinding`はTabキーを無視し、Escapeでフォーカスを外し、それ以外のキーで`setCustomBinding`を呼ぶ設計。
- **UIからのカスタマイズ手段の有無(重要な調査結果)**: mainブランチには、上記`setCustomBinding`/`resetCustomBinding`/`captureBinding`を呼び出すUIコンポーネントが存在しない。
  - `git grep -n "setCustomBinding|resetCustomBinding" main -- app/src`の結果は、定義・配線用ヘルパファイル(`page_keymap.ts`, `page_keymap_bindings_state.ts`, `page_init_sections/init_keymap.ts`等)以外に一切ヒットしなかった。
  - `SettingsModal.svelte`(620行、`main:app/src/lib/components/modals/SettingsModal.svelte`)の編集可能フィールド(`draft`オブジェクト、`main:app/src/lib/components/modals/SettingsModal.svelte:38-52`)は `ui_theme, ui_language, ui_file_icon_mode, perf_dir_stats_timeout_ms, external_vscode_path, external_git_client_path, external_terminal_profile*` のみで、キーマッププロファイルや個別キー割当の編集項目は存在しない。
  - バックエンド側の設定保存コマンド`config_save_preferences`(`main:app/src-tauri/src/config_cmds.rs:379-426`)および`config_save_ui_state`(`main:app/src-tauri/src/config_cmds.rs:594-631`)のいずれの引数にも`input_keymap_profile`/`input_keymap_custom`は含まれていない。すなわちアプリ内のどの保存経路からも、これら2フィールドを書き込む手段が無い。
  - `ui_constants.ts`には設定画面のキーマップ関連の翻訳文字列(英日両方、例: キーマップ、キー割り当て(カスタム)、フィルタ等)が定義されている(`main:app/src/lib/ui_constants.ts:325-330,705-710`)が、`git grep -n 't("settings.keymap' main -- app/src`はヒット0件であり、これらの文字列を実際に表示するUIコードは存在しない。**キーマップ編集UIが過去に存在した、または計画されたが未実装/削除された痕跡(未使用の国際化文字列)**と客観的に言える。
  - 以上から、mainブランチにおけるキーマップのカスタマイズは「`%APPDATA%\ReflexFIles\config.toml`を直接テキストエディタで編集し、`input_keymap_profile`や`input_keymap_custom`テーブルを手書きする」以外に手段が無い。
- **【追加検証・オーケストレーター、2026-09-22】**: `setCustomBinding`/`resetCustomBinding`/`captureBinding`は`page_init_*`系の状態配線ファイル群(.tsのみ)を経由して`page_keymap.ts`まで到達していることを確認したが、これらを呼び出す`.svelte`コンポーネントは1件も存在しないことを独立に確認した(該当ファイルは全て`.ts`のstate配線・型定義ファイルであり、UIコンポーネントは含まれない)。研究結果を裏付ける。
- **【発注者確認 2026-09-22・SPEC-0300-0003詳細仕様への方針確定】**: 新プロダクトでも**mainと同様、`config.toml`の手動編集のみを維持する**(キーマップ編集UIは新規に作らない)。README表現上の「configurable keymap」は「設定ファイル編集によるカスタマイズが可能」という意味で維持し、UIからの編集機能は今回のスコープに含めない。

## Evaluator所見(research-verifier + オーケストレーター、2026-09-22)

research-verifierはBash(git)実行環境を持たず、`main`への直接照合ができなかったため、`existing-20260922-reflexfiles-overview.md`(new-feature-experiment基準)および作業ツリーとのクロスチェックに留まった。特に「デフォルトキーマップ表で6項目以上windows/vim列を取り違えている疑い」を最重要指摘としてPENDING_HUMAN_REVIEWとした。

オーケストレーターが`git -C "C:\Users\toshi\git\ReflexFiles" show main:app/src/lib/ui_constants.ts`で`main`のKEYMAP_DEFAULTSを直接取得し検証した結果:
- 指摘された7項目(toggle_hidden/search/sort_menu/history_jump_list/jump_add/jump_add_url/history)は、**main上ではwindows値とvim値が偶然すべて同一**(例: `toggle_hidden: "Ctrl+H"`がwindows/vim共通)であり、ドラフトの記載は正確だった。research-verifierが比較に用いた作業ツリー(new-feature-experiment、mainから107コミット進行)ではこれらの値がwindows側のみ変更されており分岐していたため、誤って「取り違え」に見えただけと判明(解釈A: ドラフトは正確、で確定)。
- windows既定値のアクション数はmain上で46件(手動カウントで確認)。ドラフトの「46件」という記載も正確。
- キーマップ編集UI不在の結論も、`git ls-tree main`で全`.svelte`ファイルを走査し`setCustomBinding`/`captureBinding`を検索した結果0件で、main上で直接確認できた。
- `FileList.svelte`(main、149行)の`role="listbox"`(51行目付近)・`aria-multiselectable`(55行目付近)・`aria-activedescendant`(56行目付近)もmain上で直接確認し、ドラフトの記載(49-56行目)と整合。

**結論: 本ドラフトの調査内容はmain基準として正確であることを確認した。PENDING_HUMAN_REVIEW指摘は全て解消。** spec-writerはこのドラフトをそのまま実装仕様の根拠として使用してよい。
  - `Ctrl+,`(settings既定キー)は「設定ファイルを直接開く」動作ではなく、Settingsモーダルを開くイベント(`window.dispatchEvent(new CustomEvent("rf:open-settings"))`, `main:app/src/lib/actions/external_open.ts:242-245`, 受信側 `main:app/src/routes/+page.svelte:965-971`)を発火する。config.tomlをOS既定のテキストエディタで直接開くのは、Settingsモーダル内の別ボタン(`onOpenConfig`→`config_open_in_editor`コマンド、`main:app/src/lib/components/modals/SettingsModal.svelte:298-299`, `main:app/src/routes/+page.svelte:741-747`, バックエンド`main:app/src-tauri/src/config_cmds.rs:298-306`)を押す必要がある。
    - **ドキュメントとの差異**: `main:user_manual.md:108-113`には「Open settings from menu or with `Ctrl+,`」「The config is opened by the default text editor」と続けて記載されており、`Ctrl+,`を押すとテキストエディタでconfig.tomlが開くかのように読める。しかし実際のコード動作は「`Ctrl+,`→Settingsモーダルが開く」「モーダル内の別ボタン→テキストエディタでconfig.tomlが開く」という2段階の別動作であり、マニュアルの記述は正確には誤解を招く表現になっている。
- `help_keymap`アクション(既定`F1`)は、キーマップ編集UIではなく、ユーザーマニュアル(`user_manual.md`)を`keymap`セクションへのジャンプ指定付きでビューアウィンドウに開くだけの機能である(`openKeymapHelp`, `main:app/src/lib/actions/external_open.ts:283-289`)。

### 2.4 キー入力処理の実装構造

- **捕捉場所**: `window`オブジェクトに対して`capture: true`(キャプチャフェーズ)で`keydown`イベントリスナーを1つだけ登録している(`main:app/src/lib/page_lifecycle.ts:164`, `window.addEventListener("keydown", ctx.onKeyDown, { capture: true })`)。ハンドラ関数は`createPageKeydownHandler`(`main:app/src/lib/page_dom_handlers_keydown.ts:3-118`)。
- **除外条件**: グローバルフラグ`window.__rf_settings_open === true`の場合はハンドラ全体が即座にreturnし、キー処理を行わない(`main:app/src/lib/page_dom_handlers_keydown.ts:5-7`)。Settingsモーダル表示中は別のキー処理系に委ねる設計と見られる(委譲先の詳細は本調査では未確認、不明)。
- **ディスパッチ構造**(`handleGlobalKey`, `main:app/src/lib/utils/keyboard_global.ts:10-51`): 以下の優先順で最初にtrueを返したハンドラで処理を終える。
  1. `Ctrl+Q`固定判定(終了) / `Ctrl+,`固定判定(設定を開く) — `main:app/src/lib/utils/keyboard_global.ts:11-32`
  2. `matchesAction(event, "exit")` — `main:app/src/lib/utils/keyboard_global.ts:33-37`
  3. `handleOverlayKey`(モーダル/ドロップダウン/ソートメニュー/コンテキストメニュー/Tabフォーカストラップ等) — `main:app/src/lib/utils/keyboard_overlay.ts:5-131`
  4. `handleMenuKey`(メニューバー用、今回詳細未読) — `main:app/src/lib/utils/keyboard_menu.ts`
  5. `handleTreeKeyBlock`(ツリーにフォーカスがある場合のみ`handleTreeKey`に委譲) — `main:app/src/lib/utils/keyboard_tree.ts:5-17`
  6. `handleListKey`(リスト操作全般、368行中の大半を占める) — `main:app/src/lib/utils/keyboard_list.ts:5-368`
  - この順序により、「オーバーレイ(モーダル等)が開いている間はリスト/ツリーのキー操作は発火しない」設計になっている。`handleOverlayKey`は`pasteConfirmOpen || deleteConfirmOpen || jumpUrlOpen`等が真なら即trueを返して後続処理を止める(`main:app/src/lib/utils/keyboard_overlay.ts:7-9`)。
- **ツリー側の分岐**: `handleTreeKeyBlock`はアクティブ要素がツリーパネル内かどうかを見て、真なら`ctx.handleTreeKey(event)`(実体は`handleTreeKey`, `main:app/src/lib/utils/tree.ts:114-167`)に委譲する。ツリー用ハンドラは`move_up/move_down/page_up/page_down/move_right/move_left/open`の7アクションのみを扱う(`main:app/src/lib/utils/tree.ts:123-165`)。
- **リスト側ハンドラ(`handleListKey`)の主な分岐**(`main:app/src/lib/utils/keyboard_list.ts`):
  - undo/redo(7-16行)、履歴クリア(Ctrl+Delete系、23-36行、`matchesAction`ではなくハードコード判定)、全選択(37-43行)、Space=トグル選択(44-57行)、選択解除(58-66行)、サイズ/時刻列トグル(67-80行)、ツリー表示トグル(81-96行)、外部アプリ起動系(97-131行)、ZIP作成/展開(132-144行)、パス入力へフォーカス(145-152行)、隠しファイル表示トグル(153-159行)、リフレッシュ(160-164行)、プロパティ(165-172行)、空リスト時のpaste/go_parent特別扱い(173-189行)、上下左右/ページ移動(190-219行)、選択トグル(220-224行)、Shift+Enter固定判定での関連付けアプリオープン(225-237行)、Enter=open(238-244行)、rename(245-251行)、new_file(252-256行)、go_parent(257-266行)、copy/duplicate/prefix_date/cut/paste(267-291行)、delete(292-308行、選択中の場合は選択セット全体、そうでなければフォーカス行のみを削除対象にする分岐あり: `main:app/src/lib/utils/keyboard_list.ts:295-300`)、ジャンプリスト/履歴ドロップダウン(309-352行)、外部アプリのショートカットキー動的一致判定(329-342行、`ctx.getExternalApps()`から取得したカスタムアプリの`shortcut`文字列と比較)、検索起動(353-357行)、ソートメニュー開閉(358-366行)。
  - 各分岐は`ctx.matchesAction(event, "<actionId>")`によるキーマップ経由の判定が大半だが、一部(履歴クリア、Shift+Enter、外部アプリの動的ショートカット)はキーマップを介さないハードコード判定になっている。
- **アクション実行への委譲方法**: `handleListKey`/`handleTreeKey`等はDOM要素やビジネスロジック関数への参照を`ctx`(コンテキストオブジェクト)として受け取り、そこに生えた関数(`ctx.loadDir`, `ctx.toggleSelection`, `ctx.openEntry`等)を直接呼び出す、いわゆる「関数注入によるDI」方式。`ctx`の組み立ては`createPageKeydownHandler`内で行われ、実体は`+page.svelte`側の状態・アクション群から`page_dom_handlers_keydown.ts`経由で渡される(`main:app/src/lib/page_dom_handlers_keydown.ts:8-115`に全パラメータの列挙がある)。Reduxのようなアクションディスパッチャは存在せず、単純な関数呼び出しチェーンである。

### 2.5 受入基準相当の情報

- `main:user_manual.md:78-105`(Default Key Bindings)に、windowsプロファイルの主要キー割当が表形式で記載されている。2.2節の一覧とおおむね一致するが、マニュアル側は簡略版(全46アクションではなく抜粋約20項目)であり、`vim`プロファイルの割当はマニュアルには一切記載がない(コード上にのみ存在)。
- `main:user_manual.md:108-133`(Configuration File)に、`config.toml`のパス・関連ファイル(`history.toml`, `jump_list.toml`)・端末プロファイル固定設定・バックアップ/リストア・診断レポート・ショートカット競合警告についての説明があるが、**キーマップのカスタマイズ方法そのもの(`input_keymap_profile`/`input_keymap_custom`をどう書けばよいか)についての説明はmainのuser_manual.mdには存在しない**。これは2.3節で述べたUI未実装の状況と整合する(機能が無いため説明も無い)。
- キーボード操作専用の自動テストはmainブランチには存在しない。`app/package.json`の`scripts`(`main:app/package.json:6-21`)には`test:keys`のようなスクリプトは無く、`sync:version, dev, build, preview, check, check:watch, audit:*, e2e:tauri, e2e:viewer, e2e:settings, e2e:full, tauri, release:precheck`のみが定義されている。`git ls-tree -r main --name-only`にも`scripts/tests/`ディレクトリは存在しない。E2Eスモークテスト(`app/e2e/tauri/smoke.mjs`)内にはキー入力を使った操作(Escape, Backspace, Ctrl+A, Delete, Enter等)はあるが、これらは他機能(新規作成・削除・検索クリア等)のE2Eフローの一部としてキー入力を使っているに過ぎず、キーボードナビゲーション/キーマップ機能そのものの受入テストとしては作られていない。

---

## 3. `new-feature-experiment`との客観的な差分(参考、ISS-0003判断材料)

`specs/_drafts/existing-20260922-reflexfiles-overview.md`(調査対象=`new-feature-experiment`、HEAD `e424b11`、version 0.5.0)に記載された行数と、本調査で`main`から直接取得した行数を突き合わせた結果、同名ファイルでも内容・規模が大きく異なることを確認した。

| ファイル | main(本調査) | new-feature-experiment(既存ドラフト記載) | 差分 |
| --- | --- | --- | --- |
| `app/src/lib/components/FileList.svelte` | 149行 | 332行 | +183行 |
| `app/src/lib/components/TreePanel.svelte` | 147行 | 152行 | +5行 |
| `app/src/lib/utils/list_layout.ts` | 218行 | 218行 | 差分なし(同一の可能性) |
| `app/src/lib/page_list_layout.ts` | 153行 | 153行 | 差分なし(同一の可能性) |
| `app/src/lib/utils/tree.ts` | 167行 | 167行 | 差分なし(同一の可能性) |
| `app/src-tauri/src/fs_query.rs` | 840行 | 1001行 | +161行 |
| `app/src/lib/utils/keyboard_list.ts` | 368行 | 482行 | +114行 |
| `app/src/lib/utils/keyboard_tree.ts` | 17行 | 17行 | 差分なし(同一の可能性) |
| `app/src/lib/utils/keyboard_overlay.ts` | 131行 | 165行 | +34行 |
| `app/src/lib/page_dom_handlers_keydown.ts` | 119行 | 503行 | 大幅増加(+384行) |
| `app/src-tauri/src/types/config.rs` | 255行 | 262行 | +7行 |
| `app/src-tauri/src/config_defaults.rs` | 182行 | 188行 | +6行 |

特に`page_dom_handlers_keydown.ts`(119行→503行)、`FileList.svelte`(149行→332行)、`fs_query.rs`(840行→1001行)、`keyboard_list.ts`(368行→482行)の増加が大きく、キーボード処理・ファイル一覧表示・クエリ層のいずれも`new-feature-experiment`側で相当な機能追加・改修が行われていることが行数差分から客観的に読み取れる(具体的な追加内容は本調査のスコープ外であり未確認)。

その他、mainブランチには存在しないが`new-feature-experiment`側にのみ存在することを確認したもの(ファイル一覧の差分から):
- `app/src-tauri/src/dragdrop_cmds.rs`(main非存在。`main:user_manual.md:162`も「Drag-and-drop is not supported」と明記しており、ドキュメントとファイル一覧の両方で非存在が裏付けられる)
- `scripts/tests/run-key-tests.mjs`等のキーボード処理専用テストスクリプト(main非存在。`main:app/package.json`のscriptsに`test:keys`は無い)

---

## 4. 本調査の限界・不明点

- `fs_list_dir_impl`が返す`modified`フィールドの具体的な文字列フォーマット(ISO8601か等)は、`entry_from_path`関数の実装箇所(`main:app/src-tauri/src/fs_query.rs`の1-146行付近)を本調査では詳細に読み込んでおらず未確認。
- ツリーの自動展開閾値(`autoExpandDepth`, `autoExpandEntryLimit`)の実際の値は、これらのパラメータがどこから`createTreeHelpers`に注入されているか(`page_init_sections/init_tree.ts`等)まで遡って確認しておらず不明。
- `handleMenuKey`(`main:app/src/lib/utils/keyboard_menu.ts`)、`modal_keyboard.ts`、`dropdown_keyboard.ts`の詳細な内部ロジックは今回読み込んでいない(メニューバー操作やモーダル内のTab移動などは対象2機能の主要範囲外と判断したため)。
- `window.__rf_settings_open`フラグがどこで設定され、Settingsモーダル表示中にキー入力がどう処理されるか(2.4節)は本調査では追っていない。
- `config_open_in_editor`コマンドが実際にどのテキストエディタを起動するか(OS既定アプリ起動の実装詳細)は`main:app/src-tauri/src/config_cmds.rs:298-306`の関数シグネチャのみ確認し、内部実装までは読んでいない。
