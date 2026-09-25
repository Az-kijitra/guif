# 既存仕様調査(main基準): Phase4 ジャンプリストと履歴 詳細

- 調査日: 2026-09-25
- 対象リポジトリ: `C:\Users\toshi\git\ReflexFiles`
- 調査基準: `main` ブランチの内容のみ(`git -C ... show main:<path>` / `git grep ... main`)。作業ツリー(`new-feature-experiment`)は参照していない。
- 引用形式: `main:<repo相対パス>:<行番号>`。「不明」はコードから読み取れない事項。
- 作成: codebase-researcher(本文)。書き込み権限が無かったためオーケストレーターがファイル化。**オーケストレーター直接確認済みの項目は末尾「Evaluator所見」に記載**。

## 0. 対象ファイル(main)

| 領域 | ファイル |
|---|---|
| 純関数 | `app/src/lib/utils/history.ts`(`addJumpPath`/`addJumpUrl`/`removeJumpValue`/`removeHistoryValue`/`buildDropdownItems`/`updateSearchHistory`/`isLikelyUrl`) |
| アクション | `app/src/lib/actions/history.ts`(`addJumpCurrent`/`addJumpUrl`/`openJumpUrlModal`/`confirmJumpUrl`/`removeJump`/`removeHistory`/`selectDropdown`。検索系も同居) |
| 訪問履歴の記録 | `app/src/lib/page_dir.ts`(`loadDir`) |
| UI | `components/DropdownList.svelte`、`DropdownItem.svelte`、`PathBar.svelte`、`modals/JumpUrlModal.svelte`、`PageOverlays.svelte`、`PageShell.svelte` |
| キー処理 | `utils/dropdown_keyboard.ts`、`keyboard_list.ts`、`keyboard_menu.ts`、`keyboard_overlay.ts`、`keyboard_global.ts` |
| キーマップ・文言 | `app/src/lib/ui_constants.ts` |
| メニュー | `app/src/lib/menus/navigate.ts`(「移動」メニュー。Editメニューではない) |
| 永続化(フロント) | `page_ui_save.ts`、`utils/ui_state.ts`、`page_unload.ts`、`page_lifecycle.ts`、`dto/config.ts` |
| 永続化(Rust) | `config_io.rs`、`config_cmds.rs`、`config_defaults.rs`、`config.rs`、`types/config.rs`、`bootstrap.rs`、`system_cmds.rs` |
| URL起動 | `tauri_client.ts`、`app/src-tauri/capabilities/default.json` |

### 0.5 Phase 3 調査の訂正
Phase 3 調査 §2.2「検索バーはMenuBarとPathBarの間」は誤り。mainの実物は MenuBar(`PageShell.svelte:28`)→ PathBar(`:30-36`)→ PageOverlaysBindings(検索バー/ドロップダウンはここ、`PageOverlays.svelte:144-175`)→ `.content`(`:43`)→ StatusBar(`:57`)。検索バー・ドロップダウンは**PathBarの下**。(→ SPEC-0300-0012 R-104 に影響。ISS化)

## 1. ディレクトリ履歴(訪問履歴)

- 記録は `loadDir` 成功時のみ(`page_dir.ts:66-70`): `next = [path, ...history.filter(p => p !== path)]; slice(0, 50); scheduleUiSave()`。重複は生文字列の完全一致で除去し先頭へ(MRU)。`normalizePathValue`(`utils/normalize.ts:2-5`)は未使用。**上限50件**(フロントのみ)。失敗時は履歴に追加されない。
- 記録契機は `loadDir` 成功すべて: 起動時初期パス(`page_lifecycle.ts:119-120`)、ディレクトリを開く、親へ移動、パスバーEnter、履歴/ジャンプ確定(`actions/history.ts:153`)、F5・隠しファイル切替(`keyboard_list.ts:153-164`)、**ファイル監視による自動再読込(`page_lifecycle.ts:127-140`、300ms遅延)**。「訪問」ではなく「loadDir成功」が意味。
- **戻る/進む機能はない**。文言のみ(`ui_constants.ts:184-185`/`565-566`)、アクション・配線なし。
- UI: モーダルではなくPathBar下のインライン `role="listbox"`(`DropdownList.svelte:37-45`、max-height 240px)。各行=アイコン(URL🌐/他📁)+値+削除ボタン(`DropdownItem.svelte:19-27`)。空なら一覧を開かず状態メッセージ `no_items`。確定=Enterまたはクリック。
- 起動経路: 一覧フォーカス時の `history` キー(`keyboard_list.ts:343-352`)、PathBar INPUT時(`keyboard_menu.ts:35-44`)、PathBarでArrowDown(`PathBar.svelte:45-53`)、メニュー「移動」→「履歴...」(`menus/navigate.ts:51-62`)。`openHistoryList` は `tick().then(focus)`(`page_dropdown.ts:36-44`)。
- **既定キー(windows/vim 同値、`ui_constants.ts` 85-88 / 133-136)**: `history_jump_list`=`Ctrl+J`、`jump_add`=`Ctrl+Shift+J`、`jump_add_url`=`Ctrl+Shift+U`、`history`=`Ctrl+Y`。
- 履歴クリアは keymap外のハードコード **Ctrl+Delete / Ctrl+Shift+Delete**(確認ダイアログ付き、**訪問履歴のみ**クリア、`keyboard_list.ts:23-36`)。ドキュメント記載なし。

## 2. ジャンプリスト

- データ: `JumpItem { type: "path"|"url"; value: string }`(`dto/config.ts:8-13`、Rust `types/config.rs:224-236`)。ラベル等は無い。
- 登録: (1) 現在ディレクトリ追加(`addJumpPath(currentPath, list, 20)`、先頭追加・同一value除去、`actions/history.ts:29-36`)。(2) URL追加モーダル(クリップボードがURLなら自動入力、trim後空/`isLikelyUrl`偽なら `error.url_invalid` を表示し閉じない、`actions/history.ts:46-71`)。URL検証は `/^https?:\/\/\S+$/i`(`utils/history.ts:4-7`)。**上限20件**、超過は最古が落ちる。重複判定は `value` のみ(typeを見ない)。
- **パスの手入力追加はない**(パス追加は「現在ディレクトリ」のみ。入力モーダルはURL専用)。
- キー経路差: `jump_add` は一覧フォーカス時のみ有効でPathBar INPUT時は無効。`jump_add_url`/`history_jump_list` は両方有効(`keyboard_list.ts:309-328`、`keyboard_menu.ts:25-49`)。
- 削除: 各行の削除ボタン(両モード有効)。**キーボードDeleteは履歴モードのみ**(`dropdown_keyboard.ts:120`)。削除後の選択位置はクランプ、全件削除後もドロップダウンは開いたまま。
- **並べ替え・編集・一括クリアはない**。並びは新着先頭。
- 表示・確定: 訪問履歴と同一の `DropdownList`(モードだけ切替)。確定(`selectDropdown`、`actions/history.ts:147-154`)は、閉じてから URL項目→`openUrl`(await/catchなし)、パス項目→`loadDir`。確定でジャンプの順序は変わらない。
- 存在確認: 登録時・表示時・確定時ともなし。無効項目の色分け・自動除去なし。

## 3. 検索履歴との関係

- 状態は別配列(`searchHistory`/`pathHistory`/`jumpList`、`page_state_defaults.ts`)。ドロップダウンは検索履歴を扱わない。
- 検索履歴の更新は `applySearch`(Enter/Apply・非空)のみ。上限**20**(`actions/history.ts:86`)。config.tomlコメントは「最大100」(`config_io.rs:362`)で食い違い。Rust側に上限強制なし。ArrowUpで直近1件のみ呼び出し、ArrowDownで空に(新プロダクトSPEC-0300-0012 R-121/R-122と一致)。
- **保存パイプラインは共用**: `buildUiSnapshot` が3種を1スナップショットにまとめ、1つのデバウンス(400ms)と1つの `config_save_ui_state` で保存(`ui_state.ts:27-58`、`page_ui_save.ts:57-72`)。保存先ファイルは別。
- mainでは検索履歴も永続化・起動時復元される(`page_lifecycle.ts:109-111`)。

## 4. 永続化

| データ | ファイル | 形式 | 根拠 |
|---|---|---|---|
| 訪問履歴 | `%APPDATA%\ReflexFIles\history.toml` | `history = [...]` | `config_io.rs:24-26,238-246` |
| ジャンプ | `%APPDATA%\ReflexFIles\jump_list.toml` | `jump_list = [{type,value}]` | `config_io.rs:28-30,255-267` |
| 検索履歴 | `config.toml` の `history_search` | 文字列配列 | `config_io.rs:361-372` |

- ディレクトリ名は `ReflexFIles`(大文字I)。`APPDATA`未設定時は `.`。
- 保存: 400msデバウンス(`page_ui_save.ts:78-96`)、`canSaveUiState` は `uiConfigLoaded && currentPath` が真のときのみ(**currentPathが空の間は一切保存されない**、`ui_state.ts:8-10`)。終了時は `beforeunload`(`page_unload.ts`)だが、Ctrl+Qは `app_exit` → Rust `app.exit(0)` で **beforeunloadが発火するか不明**。Rust側は `load_config()` で読み→上書き→ `persist_config`(history→jump_list→config の順、途中失敗で一部のみ更新)。書込は `fs::write` 直接上書きで非アトミック。
- 復元: 起動時 `load_history()`/`load_jump_list()`、**非空のときのみ**上書き。ファイル欠落・破損は無通知で空リスト扱いとなり、次回保存で上書きされ元の内容が失われる(コードからの帰結)。Rust側で件数上限の検証・切り詰めなし。ドロップダウンの開閉/選択位置は保存しない。
- **履歴/ジャンプ専用のRustコマンドはない**(汎用 `config_save_ui_state`/`config_get_startup` のみ)。

## 5. パス欠落・アクセス不能時

- 確定は `loadDir(path)`。失敗時は `catch → showError`(状態メッセージ2500ms、専用ダイアログなし)。ドロップダウンは確定時に既に閉じ、現在表示は維持、**項目は削除されず**、履歴の先頭移動も起きない。
- 起動時に最終パスが失敗すると `currentPath` は空のまま、フォールバック再試行なし、その間保存不可。
- `openUrl` は失敗が握り潰される。`capabilities/default.json` の `opener:allow-open-url` は `file:///**` のみ許可。**https URLのジャンプが実機で開けるかは不明**。

## 6. フォーカスとキー処理

- ドロップダウン表示中のキー(`dropdown_keyboard.ts`、すべてハードコード・キーマップ非依存): 履歴/ジャンプのモード切替キー(切替+index0、空なら`no_items`のみ)、Escape=閉じる、Home/End、↑↓±1(端で停止・ラップなし)、PageUp/Down±10、Enter=確定、Delete=履歴モードのみ削除。vimの`J`/`K`では移動できない。
- モード切替時のみ `setDropdownIndex(0)`。新規に開くときは前回の選択位置が残る(意図不明)。
- INPUTフォーカス時: `handleMenuKey` はPathBar入力に限り `history_jump_list`/`history`/`jump_add_url` を処理。他のINPUT(検索バー等)は以降を止める。よって検索入力中はCtrl+J/Ctrl+Yが効かない。
- 閉鎖後のフォーカス: Escape・確定・全削除のいずれでも一覧へ明示的にフォーカスを戻す処理なし。外側クリックで閉じる処理もない。`keyboard_overlay.ts:95-107` はデッドコード。
- **空ディレクトリの不具合**: `handleListKey` は `!ctx.entries.length` のとき `paste`/`go_parent` のみ処理して `return true`(`keyboard_list.ts:173-189`)。ジャンプ・履歴・検索の処理(`:309-357`)はその後ろ。よって**エントリ0件のディレクトリでは一覧フォーカス時にCtrl+J/Ctrl+Y/Ctrl+Shift+J/Ctrl+Shift+U//が効かない**。

## 7. ドキュメントとコードの食い違い

- `user_manual.ja.md:44-45` は「フォルダ履歴は **Ctrl+Shift+Y**」と記載(誤り。既定は `Ctrl+Y`。同manualの`:69`/`:163`とも矛盾)。
- `user_manual.ja.md:104-107`「ジャンプリスト: 任意のパスを登録」は、実際は現在ディレクトリのみ。
- ドキュメントにない機能: 上限値、Ctrl+Deleteでの履歴クリア、一覧内キー、履歴モードのみDelete、PathBar ArrowDown、URLはhttp/httpsのみ、削除ボタン、「移動」メニュー。戻る/進むの記載もなし。
- テストは実質なし(履歴/ジャンプの永続化テスト・単体テスト・e2eいずれも見当たらない)。

## 8. 不整合・バグ・未配線

| # | 内容 |
|---|---|
| A | ジャンプモードでDeleteキーが効かない(履歴のみ)。削除ボタンは両モード有効 |
| B | 空ディレクトリでCtrl+J/Ctrl+Y/Ctrl+Shift+J/Ctrl+Shift+U//が無効 |
| C | 新規に開くとき `dropdownIndex` がリセットされない |
| D | `loadDir`成功のたび(監視/更新含む)に履歴更新・保存が走る |
| E | パス比較が生文字列一致 |
| F | ジャンプの重複判定が`value`のみ(パスとURLを区別しない) |
| G | 上限はフロントのみ。Rustは無検証。`history.toml`ヘッダの「重複排除済み」はRustでは保証されない |
| H | 検索履歴の上限がコメント100・実装20 |
| I | `history.toml`/`jump_list.toml`のパース失敗が無通知で空扱い→次回保存で上書き。非アトミック書込 |
| J | `persist_config`途中失敗で一部ファイルのみ更新 |
| K | `currentPath`空のとき保存不可 |
| L | Ctrl+Qで終了時に保存されるか不明 |
| M | URLジャンプの`openUrl`にawait/catchなし。https許可が不明 |
| N | 無効パスの項目は自動削除されない |
| O | 履歴クリア(Ctrl+Delete)がkeymap外・ドキュメント外・訪問履歴のみ |
| P | 閉鎖後フォーカス復帰なし。外側クリックで閉じない |
| Q | 一覧内キーがハードコード。デッドコードあり |
| R | `menu.back`/`menu.forward`は文言のみで未配線。`focus.dropdown`も未使用 |
| S | `jump_add`だけPathBar INPUT中に無効 |
| T | 旧名エイリアス(`history_paths`/`jump_list`)が残るが`config.toml`には書かれない |
| U | Phase 3調査のPageShell順序の記述が不一致(§0.5) |

## 9. 人間判断が必要になりそうな論点

1. 訪問履歴の記録契機: loadDir成功すべて(main)か、ユーザー操作による移動のみ(更新・監視再読込を除く)か。
2. 上限値(履歴50/ジャンプ20/検索20)の踏襲。Rust側でも検証するか。
3. パスの同一視規則(大小文字・区切り・末尾スラッシュ)。
4. 戻る/進む(back/forward)をPhase 4に含めるか(main未実装)。
5. ジャンプ登録手段(現在ディレクトリ+URLのまま/パス手入力/名前付け)。URL(http/https)を扱うか。
6. ジャンプの編集・並べ替え・一括クリアの要否。並び順(新着先頭/登録順固定)。
7. 既存項目の再追加時に先頭へ移動する挙動。
8. 一覧UIの形態(PathBar下インライン、履歴とジャンプを同一リストでモード切替)、メニュー、PathBar ArrowDown。
9. 一覧内キーのキーマップ化。ジャンプモードでもDeleteを効かせるか。
10. 開いたときの選択初期位置、閉じたときのフォーカス復帰先、外側クリック。
11. 存在しない/アクセス不能パスの扱い(エラーのみ/自動除去/無効表示)。
12. 空ディレクトリでショートカットが効かない挙動(バグと読める)の扱い。
13. 永続化の構成(3ファイル分割か単一か、TOML、ファイル名、`%APPDATA%`配置)。
14. 保存タイミング、終了時の確実な保存、パース失敗時の扱い、アトミック書込。
15. 検索履歴(ISS-0059)の永続化の要否・上限。
16. 履歴クリア機能の要否とキー割当。
17. 既定キー(`Ctrl+J`/`Ctrl+Shift+J`/`Ctrl+Shift+U`/`Ctrl+Y`)の踏襲。
18. 起動時に最終パスが失敗した場合のフォールバックと保存可否。
19. https URLジャンプの可否。
20. Phase 3調査§2.2の訂正(§0.5)を反映するか(SPEC-0300-0012 R-104)。

---

## Evaluator所見(オーケストレーター直接検証、2026-09-25)

`git -C ReflexFiles show main:<path>` で以下を直接確認し、**いずれも調査本文と一致**した。
- 既定キー: `ui_constants.ts` 85-88(windows)/133-136(vim)= `history_jump_list: Ctrl+J`、`jump_add: Ctrl+Shift+J`、`jump_add_url: Ctrl+Shift+U`、`history: Ctrl+Y`。
- 上限: 訪問履歴 `slice(0, 50)`(`page_dir.ts:68`)、ジャンプ `addJumpPath(..., 20)`(`actions/history.ts:32`)、検索履歴 `updateSearchHistory(..., 20)`(`:86`)。
- Delete: `dropdown_keyboard.ts:120` は `dropdownMode === "history"` のときのみ。
- PageShell順序: MenuBar → PathBar → PageOverlaysBindings → `.content`(§0.5の訂正は正しい)。
- 空ディレクトリ: `keyboard_list.ts:173` の `!ctx.entries.length` 分岐が、`history_jump_list`(:309)・`jump_add`(:319)・`jump_add_url`(:324)・`history`(:343)・`search`(:353)の処理より前にある。

未確認(調査本文どおり「不明」のまま): Ctrl+Q終了時の保存、https URLジャンプの可否、`confirm`の実体。
