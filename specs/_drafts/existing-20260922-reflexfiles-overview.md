# 既存仕様調査: ReflexFiles

- 調査日: 2026-09-22
- 対象リポジトリ: `C:\Users\toshi\git\ReflexFiles`
- 調査時のHEAD: `e424b11` ("0.5.0 release", 2026-04-11 09:20:34 +0900)
- 注記: 調査時点でワーキングツリーには未コミットの変更が存在した(git statusで app/src-tauri/src/bootstrap.rs 等29ファイルがModified)。本調査はコミット済みコードとワーキングツリーの両方を確認したが、原則コミット済み内容を基準にし、ワーキングツリー差分がある箇所は明記する。
- **【重要・research-verifierによる追記, 2026-09-22】ブランチに関する前提の訂正**: 調査時にチェックアウトされていたブランチは `main` ではなく `new-feature-experiment` であった。`main` は `a62954e`("test", 2026-02-18)で以降更新が止まっており、`new-feature-experiment` はそこから107コミット進んでいる(mainからの分岐点=`a62954e`)。本調査で「1.2 README/user_manual.mdに明記されていないが、コード上に存在する機能」として挙げたGit連携パネル・WinMerge連携・デュアルペインモードは、**いずれも`main`には存在せず**、`new-feature-experiment`ブランチにのみ存在することを確認した(`git show main:<path>`で3ファイルともNOT FOUND)。したがって「実装済みだが未文書化の隠れ機能」という表現は、正確には「mainに未統合の実験的機能」である。要件確定時は「既存ReflexFiles(=main)」と「実験ブランチで開発中の機能」を区別すること。
- 方針: コードを一次情報とし、ドキュメントとの食い違いは両方を併記。コードから読み取れない意図は「不明」と明記する。推測はしない。

---

## 0. リポジトリ構成の概観

- README.md, CHANGELOG.md, LICENSE, user_manual.md … ルートの公開ドキュメント
- app/ … Tauriアプリ本体(唯一のプロダクトコード)。app/src がSvelteKitフロントエンド、app/src-tauri がRust/Tauriバックエンド
- app/static … ビルド用静的ファイル(マニュアルHTML/MD等の複製含む)
- app/scripts … ビルド補助・簡易テストランナー
- app/tests/keys … 空ディレクトリ(内容なし)
- docs/ … 公開ドキュメント(README/CHANGELOG/CONTRIBUTING/SECURITY等、ja/含む)
- development_documents/ … 内部向け設計メモ・ADR・要件定義・改善計画(リリース非対象、日本語中心)
- testdata/ … 動作確認用サンプルファイル
- e2e_artifacts/ … ローカルのスモークテスト実行時生成物(.gitignoreで除外、Git管理外)
- msedgedriver.exe … ルート直下の実行ファイル(.gitignoreで除外、Git管理外)

根拠:
- C:\Users\toshi\git\ReflexFiles\README.md
- C:\Users\toshi\git\ReflexFiles\.gitignore の1-2行目, 20-21行目 (e2e_artifacts/, app/e2e_artifacts/, msedgedriver.exe, docs/msedgedriver.exe を除外)
- git ls-files | grep -i msedgedriver の結果が0件、git ls-files | grep -c "^.claude/worktrees" の結果が0件(いずれも未追跡であることを確認)

---

## 1. ユーザー向け機能の一覧と実装場所

### 1.1 README記載の機能とコード上の実装箇所

README (README.md の6-13行目) は以下を機能として列挙している。各項目の実装箇所を突き止めた結果を示す。

1. Multi-column file list / tree view
   - フロントエンド: app/src/lib/components/FileList.svelte(332行), app/src/lib/components/TreePanel.svelte(152行), app/src/lib/utils/list_layout.ts(218行), app/src/lib/page_list_layout.ts(153行), app/src/lib/utils/tree.ts(167行)
   - バックエンド: app/src-tauri/src/fs_query.rs(1001行, fs_list_dir等), app/src-tauri/src/fs_query_cmds.rs

2. キーボードナビ・configurable keymap
   - フロントエンド: app/src/lib/utils/keyboard_list.ts(482行), keyboard_tree.ts(17行), keyboard_overlay.ts(165行), app/src/lib/page_dom_handlers_keydown.ts(503行)
   - バックエンド: app/src-tauri/src/types/config.rs(262行, keymapプロファイル型), config_defaults.rs(188行)

3. Search (substring + regex)
   - フロントエンド: app/src/lib/page_search.ts, app/src/lib/components/SearchBar.svelte, app/src/lib/effects/search.ts(17行, effect登録のみ)
   - バックエンド: クライアント側処理と見られ、対応する専用バックエンドコマンドは見当たらない

4. Copy / Move / Delete / Rename / Create
   - フロントエンド: app/src/lib/actions/file_ops.ts(151行), app/src/lib/actions/clipboard.ts(228行), app/src/lib/utils/tauri_fs.ts
   - バックエンド: fs_ops_transfer_copy.rs(367行, fs_copy/fs_copy_pairs), fs_ops_transfer_move.rs(192行, fs_move), fs_ops_delete.rs(156行, fs_delete_trash/fs_delete_with_undo), fs_ops_rename.rs(51行, fs_rename), fs_ops_create.rs(56行, fs_create)

5. ZIP create / extract
   - フロントエンド: app/src/lib/actions/zip.ts(136行)
   - バックエンド: fs_ops_archive.rs(273行, zip_create/zip_extract/zip_extract_list_conflicts)

6. Jump list and history
   - フロントエンド: app/src/lib/actions/history.ts(162行), app/src/lib/utils/history.ts, app/src/lib/page_jump_setup.ts(9行)
   - バックエンド: 専用のJump list保存コマンドは bootstrap.rs の invoke_handler 一覧からは特定できなかった。config_cmds.rs/config_io.rs 経由の可能性があるが未確認(不明)。history/jump listファイルの保存場所自体は user_manual.md の211-214行目に記載がある

7. Integrated ReflexViewer
   - フロントエンド: app/src/routes/viewer/+page.svelte(2675行)
   - バックエンド: viewer_cmds.rs(304行, open_viewer/close_viewer/viewer_take_pending_path/viewer_take_pending_open)。ビューアは別Tauri Webviewウィンドウ(label "viewer")として起動される(viewer_cmds.rs 11行目 VIEWER_LABEL)

補足: ReflexViewerの仕様書としてREADMEは docs/VIEWER_SPEC.md を参照している(README.md 47行目)が、このパスにファイルは存在しない。実体は development_documents/VIEWER_SPEC.md(内部文書ディレクトリ)にある。詳細は「3.1」で後述する。

### 1.2 README/user_manual.mdに明記されていないが、コード上に存在する機能

調査の結果、以下の機能はREADMEの機能一覧(README.md 6-13行目)にも、ルート user_manual.md の「Feature List (Detailed)」節(user_manual.md 106-142行目)にも記載がないが、実装されており実際にメインUIへ配線されていることを確認した。

1. Git連携パネル(ビルトイン)
   - app/src/lib/components/GitPanel.svelte(938行) — status表示、branch一覧、checkout、create branch、stage/unstage、commit、clone、worktree一覧・追加・削除、log graphのUIを持つ
   - app/src-tauri/src/git_ops.rs(318行)、git_cmds.rs(59行) — いずれも std::process::Command でシステムのgit CLIをサブプロセス実行する実装(git_ops.rs 1-4行目)。Rust用gitライブラリ(git2等)はCargo.tomlに依存追加されていない
   - app/src/lib/utils/tauri_git.ts(171行) — git_get_status, git_list_branches, git_checkout, git_create_branch, git_stage, git_unstage, git_commit, git_clone, git_log_graph, git_list_worktrees, git_add_worktree, git_remove_worktree を invoke している
   - トグルキー: Ctrl+G(app/src/lib/page_git_panel_logic.ts 56-71行目)。実UIへの配線: app/src/routes/+page.svelte 72,93,314-322,891,1089-1093行目
   - user_manual.md に記載があるのは「外部Gitクライアントを開く(Ctrl+Alt+Shift+G)」という別機能のみ(user_manual.md 135,197行目)。ビルトインGitPanelおよびCtrl+Gはマニュアルに記載なし
   - development_documents/ には本機能の設計文書が別途存在する: 「2画面Gitファイラー仕様案.md」(43,543バイト)、「2画面Gitファイラー_影響調査.md」、「2画面Gitファイラー実装タスク.md」

2. WinMerge連携(外部差分ツール起動)
   - app/src-tauri/src/winmerge_ops.rs(88行)、winmerge_cmds.rs(13行) — winmerge_compare_files, winmerge_compare_git_head
   - app/src/lib/utils/tauri_winmerge.ts(9行)
   - デュアルペイン時のCtrl+W(クロスペイン比較)として配線: app/src/routes/+page.svelte 920-926行目
   - user_manual.mdに記載なし

3. デュアルペイン(2画面)モード
   - app/src/lib/page_dual_pane_handlers.ts(210行) — F3キーでシングル/デュアルペイン切替(page_dual_pane_handlers.ts 130,152-155行目)、Ctrl+Tabでアクティブペイン切替
   - app/src/routes/+page.svelte 346-350,505-511,680-691,906-956,1089-1095行目でstate.activePaneId, state.rightPaneを用いて配線
   - README・user_manual.md(ルート、英語)には記載なし。docs/CHANGELOG.md 8-11行目(Unreleased節)には記載あり:「Dual-pane layout: press F3 to toggle single/dual pane, Ctrl+Tab to switch active pane. Each pane navigates independently.」
   - **【research-verifierによる訂正】** 日本語マニュアル(`docs/ja/user_manual.ja.md` 30,80,121-122,125,207,366-367行目、および配布用`app/src-tauri/resources/user_manual.ja.md`)には「デュアルペインモード(F3で切替)」として複数箇所に記載があることを確認した。「ユーザー向けドキュメント全般に未記載」という記述は英語版に限っては正しいが、日本語版も含めた一般化は誤り。GitPanel(Ctrl+G)・WinMerge(Ctrl+W)については日本語マニュアルにも記載がないことを確認済みで、この2つについては「未文書化」の主張は日英とも正しい。

4. ドラッグ&ドロップ(OSネイティブ、ローカルのみ)
   - app/src-tauri/src/dragdrop_cmds.rs(468行) — shell_start_file_drag, shell_start_file_drag_debug, shell_start_file_drag_with_effects, shell_start_file_drag_debug_with_effects
   - app/src/lib/page_lifecycle.ts 82-88行目, app/src/lib/utils/tauri_fs.ts 19-26行目
   - user_manual.mdでは「Feature List (Detailed)」の一項目として記載あり(user_manual.md 128-131行目)。READMEのトップレベル機能一覧には記載なし

5. Undo/Redo(操作の取り消し/やり直し)
   - app/src-tauri/src/config_cmds.rs 244-305行目(undo_redo_load_session, undo_redo_save_session)、fs_ops_delete.rs 67行目(fs_delete_with_undo)
   - app/src/lib/actions/undo_redo.ts(267行)
   - user_manual.mdの「Feature List (Detailed)」には記載あり(user_manual.md 137-138行目)。READMEのトップレベル機能一覧には記載なし

6. 設定の診断レポート生成・バックアップ/リストア
   - config_cmds.rs 329-401行目(config_create_backup, config_restore_latest_backup)、config_cmds.rs 456-623行目(config_generate_diagnostic_report、160行規模の実装)
   - app/src/lib/page_settings_actions.ts 193-247行目
   - user_manual.mdには記載あり(user_manual.md 231-248行目)。READMEには記載なし

7. 外部アプリ起動(Explorer/cmd/VSCode/Gitクライアント/カスタム/ターミナルプロファイル)
   - app/src-tauri/src/external_apps.rs(344行)、external_apps_cmds.rs(52行) — external_open_with_app, external_open_explorer, external_open_cmd, external_open_terminal_profile, external_open_terminal_kind, external_open_vscode, external_open_git_client, external_open_custom, external_list_terminal_profiles
   - app/src/lib/actions/external_open.ts(361行)
   - README本文には機能一覧としての記載なし(ターミナルプロファイルのキー割当てのみREADME.md 46行目で言及)。user_manual.mdには「External Apps」として記載あり(user_manual.md 134-136行目)

8. Google Drive連携の痕跡(現状は撤去済み、コードは未実装)
   - git log --oneline --all で「ca2f80c Removed Google Drive feature」(2026-03-17)を確認。このコミットで gdrive_auth.rs(1145行)、gdrive_real.rs(1304行)、gdrive_edit.rs(813行)、gdrive_stub.rs(308行)、gdrive_token_store.rs(569行)、gdrive_auth_cmds.rs(83行)、gdrive_edit_cmds.rs(66行)が削除された(合計約4,288行のRustコード削除)。フロントエンド側もtauri_gdrive_auth.ts, tauri_gdrive_edit.ts等が削除された
   - 現在のコードには以下の「残骸」のみが残る:
     - app/src-tauri/Cargo.toml 23行目: gdrive-readonly-stub = [] というfeatureフラグの宣言のみ残存。app/src-tauri/src配下をgdriveで検索しても該当する.rsファイルは0件(このフラグをgateするコードは現存しない)
     - app/src/lib/page_action_placeholders.ts 82行目: refreshGdriveWorkcopyBadges: noopAsync(no-opプレースホルダ)
     - app/src/lib/page_view_actions.ts 57行目, page_view_props.ts 64行目, view_list_inputs.ts 30行目: resolveGdriveWorkcopyBadge という名前のプロパティが配線されているが、実体はno-opプレースホルダに接続されている
   - この機能は「実装済みなのに未文書化」の逆で、「文書化されているが実装が撤去された」ケースであるため、詳細は3.1節で扱う

### 1.3 バックエンドに実装されているが、フロントエンドから呼ばれていないコマンド(Storage Provider抽象化)

app/src-tauri/src/bootstrap.rs 35-116行目のinvoke_handlerに登録された全80個のTauriコマンドと、app/src配下の全invoke(...)呼び出しを突き合わせた結果、以下のby_ref系コマンド群がバックエンドに実装・登録されているにも関わらず、フロントエンドから一度も呼ばれていないことを確認した。

- fs_list_dir_by_ref, fs_read_text_by_ref, fs_text_viewport_info_by_ref, fs_read_text_viewport_lines_by_ref, fs_is_probably_text_by_ref, fs_read_image_data_url_by_ref, fs_read_image_normalized_temp_path_by_ref, fs_get_properties_by_ref, fs_get_capabilities_by_ref
  (根拠: app/src-tauri/src/fs_query_cmds.rs の各定義、bootstrap.rs 37,45,47,49,51,53,55,60,62行目。app/src配下でby_refを含むinvoke(呼び出しは0件)
- これらはapp/src-tauri/src/storage_provider.rs(303行)で定義されるResourceRef / StorageProviderBackendトレイト抽象化の一部で、現在はLocalStorageProviderのみが実装されている(storage_provider.rs 43-107行目)。ProviderRegistryはLocalとUnknownの2種類のStorageProviderのみを扱う(storage_provider.rs 124-134行目)
- development_documents/ADR-0001-storage-provider-boundary.md、GoogleDrive対応計画.md、Sharepoint対応計画.md の存在から、このAPI群は将来のクラウドストレージ(Google Drive/SharePoint)対応を見据えた抽象化レイヤであったと推測されるが、Google Drive機能自体は前述の通り撤去済みであり、現時点でby_ref API群を利用するプロバイダはローカルファイルシステムのみである。コード上の意図が「将来の拡張ポイント」なのか「使われなくなった移行中コード」なのかは、コードそのものからは断定できない(不明)。

---

## 2. アーキテクチャ概要

### 2.1 フロントエンド(app/src)

- フレームワーク: SvelteKit(Svelte 5, app/package.json 33-38行目)、adapter-static によるSPA的ビルド想定
- ルーティング: app/src/routes/+page.svelte(1141行、メイン画面)、app/src/routes/viewer/+page.svelte(2675行、ReflexViewer専用ルート)の実質2画面構成(app/src/routes/+layout.svelteは33行)
- app/src/lib/ に320個のTS/Svelteファイル(合計27,354行)が存在。ディレクトリ構造:
  - lib/components/ — UIコンポーネント(FileList.svelte, TreePanel.svelte, GitPanel.svelte, PathBar.svelte, ClipboardPreview.svelte, PageShell.svelte, PageOverlays.svelte、および modals/ サブディレクトリにSettingsModal.svelte(648行), PropertiesModal.svelte(139行)等)
  - lib/actions/ — ユーザー操作のドメインロジック(file_ops.ts, clipboard.ts, zip.ts, history.ts, undo_redo.ts, external_open.ts, properties.ts, edit_entries.ts、および context_menu/ サブディレクトリ)
  - lib/utils/ — 汎用ユーティリティ(tauri_fs.ts, tauri_git.ts, tauri_winmerge.ts, keyboard_list.ts, list_layout.ts, tree.ts, path.ts等)
  - lib/effects/ — Svelte の $effect ラッパー(theme.ts, search.ts, context_menu.ts)
  - lib/menus/ — メニュー定義(edit.ts)
  - トップレベル直下にpage_*.tsという命名の大量のファイル群(200個超) — +page.svelteから状態・ロジックを分割したモジュール群。命名パターンから「初期化(page_init_*)」「DOM/キーボードハンドラ(page_dom_handlers_*)」「アクション(page_actions_*)」「ビュー入力(page_view_*)」等のカテゴリに細分化されている

### 2.2 バックエンド(app/src-tauri/src)

Rust/Tauri 2。34個の.rsファイル、合計7,513行。**【research-verifierによる訂正】再カウントの結果、app/src-tauri/src配下(サブディレクトリtypes/含む)には実際には42ファイルが存在する(トップレベル37 + types/5)。「34」は過少カウント。行数合計7,513についても分母の見直しが必要(個別ファイルの行数citation自体は正しいため、大きくは外れていないと推測されるが未再計算)。** 主なモジュールと責務(行数の多い順、抜粋):

- fs_query.rs (1001行): ディレクトリ一覧・プロパティ取得・テキスト/画像読み取りなどのクエリ系ロジック本体
- config_cmds.rs (676行): 設定の取得/保存/バックアップ/診断レポート/undo-redoセッション永続化のコマンド層
- config_io.rs (495行): 設定ファイルのI/O
- dragdrop_cmds.rs (468行): OSネイティブドラッグ&ドロップ
- external_apps.rs (344行): 外部アプリ起動ロジック
- fs_ops_transfer_copy.rs (367行): コピー処理本体
- git_ops.rs (318行): gitのCLIラッパー
- storage_provider.rs (303行): ストレージプロバイダ抽象化(Local実装のみ)
- viewer_cmds.rs (304行): ReflexViewerウィンドウのライフサイクル管理
- types/config.rs (262行): 設定関連の型定義
- fs_ops_archive.rs (273行): ZIP作成/展開
- bootstrap.rs (230行): Tauriアプリ起動処理、コマンド登録(invoke_handler)、Windows向けWebView2設定
- clipboard.rs (230行): クリップボード(ファイルパス)処理
- その他 fs_ops_delete.rs(156), fs_ops_preflight.rs(198), fs_ops_transfer_move.rs(192), config_defaults.rs(188), error.rs(171), types/files.rs(161), fs_query_cmds.rs(163)等
(全ファイルの行数一覧の根拠: app/src-tauri/src配下の各.rsファイルに対するwc -lの実行結果)

app/src-tauri/src/lib.rs 2-39行目のmod宣言より、モジュールはfeature単位(fs_ops系/config系/git系/winmerge系等)に分かれているが、lib.rs自体は44行でモジュール宣言とrun()呼び出しのみ(処理はbootstrap::run()に委譲される)。

### 2.3 IPC(フロントエンド⇔バックエンド)の主要経路

- Tauri v2のinvoke() API(@tauri-apps/api)を介したコマンド呼び出しが唯一のIPC経路。バックエンドの #[tauri::command] 関数(80個。app/src-tauri/src配下を「#[tauri::command]」で検索して確認)が app/src-tauri/src/bootstrap.rs 35-116行目の tauri::generate_handler![...] に登録され、フロントエンドの app/src/lib/utils/tauri_fs.ts, tauri_git.ts, tauri_winmerge.ts などのラッパーモジュールを経由して呼ばれる
- イベント経路: viewer_cmds.rs は tauri::Emitter を用いて viewer:open-path イベントを発火する(viewer_cmds.rs 7,12行目)。ファイル監視(watch.rs, 69行)は fs_watch_start/fs_watch_stop コマンドで開始/停止し、変更をイベントとしてフロントエンドへ通知する設計と見られるが、イベント名の詳細な確認はしていない(不明)
- コマンド呼び出しマッピングの全量は bootstrap.rs 35-116行目に列挙された80コマンド、および app/src配下のinvoke(...)呼び出し(74箇所、複数ファイルに分散。**【research-verifierによる訂正】独立grepでは87件(16ファイル)ヒットしており、カウント方法の相違により数値が一致しない。ただしby_ref系コマンドの呼び出しが0件である点は別途確認済みで、1.3節の結論には影響しない**)で確認済み(本レポート1.3節参照)

---

## 3. 複雑さ・技術的負債の客観的な手がかり

### 3.1 ドキュメントと実装の食い違い(README/CHANGELOG/docs起点)

1. README記載のドキュメントパスが実在しない
   - README.md 43-45,47行目が参照する docs/development_guide.md, docs/maintenance_guide.md, docs/ja/maintenance_guide.ja.md, docs/VIEWER_SPEC.md は、現在のdocs/ディレクトリ実体には存在しない(ls docs, ls docs/jaで確認。VIEWER_SPEC.mdの実体はdevelopment_documents/VIEWER_SPEC.mdにのみ存在)
   - これらのファイル名は .claude/worktrees/agent-*/docs/ という、Gitでは追跡されない(.gitignoreで除外された)ローカルのAIエージェント作業ツリー内にのみ存在する。つまり現在のリポジトリの正規のdocs/には存在しない

2. 2つのCHANGELOG.mdの内容が食い違っている
   - ルートのC:\Users\toshi\git\ReflexFiles\CHANGELOG.mdは0.2.0までの記載で止まっており、「## [Unreleased]」の内容は「- TBD」のまま(CHANGELOG.md 8-9行目)
   - C:\Users\toshi\git\ReflexFiles\docs\CHANGELOG.mdは0.4.0とUnreleased(dual-pane機能等)まで更新されている(docs/CHANGELOG.md 8-21行目)
   - app/package.json 3行目のバージョンは0.5.0。どちらのCHANGELOGにも0.5.0の記載はない
   - READMEはルートのCHANGELOG.mdを明示的に案内しておらず、どちらが「正」のCHANGELOGかはドキュメント間の記述からは判別できない(不明)

3. Google Drive機能: マニュアルに存在するが実装が撤去済み
   - ルートuser_manual.md 131,249-324行目、およびapp/src-tauri/resources/user_manual.en.md 75,131,249-328行目(インストーラに同梱され実際にエンドユーザーへ配布される想定のリソースファイル)は、Google Drive連携(gdrive://パス、OAuthセットアップ、Real/Stubバックエンドモード、Write-back、Settings > AdvancedのGoogle Drive認証ブロック等)を約80行にわたって詳細に説明している
   - しかし前述(1.2の8番)の通り、該当実装はca2f80c(2026-03-17)で完全に削除されている。SettingsModal.svelteの差分(-437行)からも認証UIブロックが削除されたことが確認できる
   - つまり同梱マニュアルが撤去済み機能の使用方法を説明したままになっている状態である(実装より前にドキュメントが進んでしまっているのではなく、逆にドキュメントの削除漏れというケース)

4. ビルトインGitPanel/WinMerge連携/デュアルペインは実装済みだがユーザーマニュアルに記載がない
   - 前述(1.2の1,2,3番)の通り。GitPanel/WinMergeはdocs/CHANGELOG.mdを除き記載がない。デュアルペインはdocs/CHANGELOG.mdおよび日本語マニュアル(docs/ja/user_manual.ja.md, resources/user_manual.ja.md)には記載があるが、README・ルートuser_manual.md・resources/user_manual.en.md(英語)には記載がない(上記1.2-3の訂正参照)

5. development_documents/VIEWER_SPEC.md とdocs/CHANGELOG.md中のViewer関連記述との整合性は個別に確認していない(本調査の範囲外につき不明)

### 3.2 コード規模の粗い感触

- フロントエンドapp/src/lib + app/src/routes: 約320+4ファイル、合計約31,200行(lib 27,354行 + routes 3,854行)
- バックエンドapp/src-tauri/src: 34ファイル、7,513行
- app/src/lib直下の200以上のpage_*.tsファイルのうち、1〜20行程度の極小ファイルが多数存在する(例: page_actions.ts(1行), events.ts(2行), page_dom_handlers.ts(2行), ui_layout.ts(3行), ui_durations.ts(4行)など、20行未満のファイルが約50件確認できた)。一方でui_constants.ts(1001行)、GitPanel.svelte(938行)のような大きいファイルも残っている

### 3.3 ファイル細分化の経緯(SRPリファクタ)

- development_documents/srp_refactor_plan.md(作成日2026-02-07)は、当時page_init_sections.ts, page_init_setup.ts, page_actions.ts, keyboard_global.ts, page_dom_handlers.ts等が「God module」化していたことをSRP(単一責任原則)違反として明記し、優先度付き(P0からP5)でファイル分割することを計画していた(srp_refactor_plan.md 8-29行目)
- Definition of Doneとして「400行を超えるファイルを作らない(純粋なスキーマ/定数ファイルを除く)」という基準が明記されている(srp_refactor_plan.md 42行目)
- git log --onelineで確認できる直近の作業履歴として「7047b94 Refactoring step 5」「5f01b10 Refactoring step 4」「5210e29 Refactoring step 3」「cb74a87 Refactoring step 2」という一連のコミット(Google Drive削除コミットca2f80cより後、HEAD e424b11より前)が存在し、これらのdiffはpage_init_*, page_mount_*, page_setters_*系ファイルの分割・再構成を行っている(git show --statで個別確認)
- 上記の経緯から、現在の極端なファイル細分化(1.2で述べた200以上のpage_*.ts)は事故的な放置ではなく、SRP適用を目的とした意図的なリファクタリング作業の結果であることがコードとドキュメントの両方から確認できる。ただし、結果として生じた「小さすぎるファイルへの過度な分割による見通しの悪さ」自体が新たな複雑性になっているかどうかは、本調査のスコープでは判断しない(客観的事実の記録に留める)

### 3.4 テストの状況

- Rustユニットテスト: #[test]属性の存在するファイルは4つのみ: dragdrop_cmds.rs(7件), error.rs(4件), fs_query.rs(13件), storage_provider.rs(4件)。合計28件。バックエンド全34ファイル7,513行に対し、テストが存在するのは4ファイルのみ
- フロントエンドのテスト: app/package.jsonのdevDependencies(**【research-verifierによる訂正】実際は30-39行目**)にvitest/jest/playwright等の標準テストフレームワークは含まれていない(結論自体は正しい)。代わりに以下の独自Nodeスクリプトが存在する:
  - npm run test:keys → scripts/tests/run-key-tests.mjs(node --experimental-strip-typesで直接実行するアサーションベースの簡易テスト。キーボード処理・PATH補完ロジックを対象。assertモジュールを使った手書きテストランナー)
  - npm run test:dnd → scripts/tests/run-dnd-foundation-tests.mjs(同様の形式でドラッグ&ドロップ基盤を対象)
  - app/tests/keys/ ディレクトリは存在するが空(ファイル0件)
- E2E: docs/CHANGELOG.md 14行目に「Selenium-based E2E test suite (app/e2e/, app/scripts/e2e/, .github/workflows/e2e-tauri.yml) removed」と明記されている。現在のリポジトリにapp/e2e/は存在しない
- ルート直下のe2e_artifacts/(約200件のタイムスタンプ付きディレクトリ: smoke_*, settings_session_*, capability_guard_*, viewer_flow_*, suite_*)は、上記の簡易テストランナーやスモークテスト実行時に生成されたファイル操作の実データ(zip/txt/binファイル等)であり、テストコードそのものではない。かつ.gitignoreにより追跡除外されているため、リポジトリの正式な資産ではなくローカルの実行痕跡である
- svelte-check(型チェック、app/package.json 14-15行目のcheck/check:watch)は実行可能だが、これは静的型検査であり動作テストではない

### 3.5 未使用/デッドコードに見える箇所(事実のみ記録、要否判断はしない)

1. app/src-tauri/Cargo.toml 23行目: gdrive-readonly-stub = [] というfeatureフラグが宣言されているが、app/src-tauri/src配下にgdriveを含む.rsファイルは0件(Google Drive機能削除コミットca2f80cで全て削除済み)。このフラグを条件分岐(#[cfg(feature = "gdrive-readonly-stub")])で参照しているコードは見当たらない
2. app/src/lib/page_action_placeholders.ts 82行目(refreshGdriveWorkcopyBadges: noopAsync)、およびresolveGdriveWorkcopyBadgeという名前のプロパティがpage_view_actions.ts 57行目, page_view_props.ts 64行目, view_list_inputs.ts 30行目の4箇所に渡って配線されているが、実装は常にno-op(page_action_placeholders.tsで定義されるnoopAsync)である
3. by_ref系バックエンドコマンド9個(前述1.3節)は登録済みだがフロントエンドから一度も呼ばれていない
4. ルート直下のmsedgedriver.exe(19.6MB)は.gitignoreで除外されているローカルファイルであり、Selenium E2E撤去(docs/CHANGELOG.md 14行目)後は現在のスクリプト群から参照されていない(msedgedriverでスクリプト内マッチは0件、.gitignore内の記述のみ)
5. app/tests/keys/ ディレクトリは存在するが空

---

## 4. ドキュメント一覧と実体の対応(参考)

- user_manual.md(ルート) → 存在する(C:\Users\toshi\git\ReflexFiles\user_manual.md)
- docs/ja/user_manual.ja.md → 存在する
- docs/development_guide.md → 存在しない(.claude/worktrees/配下にのみ存在、Git管理外)
- docs/maintenance_guide.md → 存在しない(同上)
- docs/ja/maintenance_guide.ja.md → 存在しない(docs/ja配下に同名ファイルなし)
- docs/VIEWER_SPEC.md → 存在しない(実体はdevelopment_documents/VIEWER_SPEC.md)
- docs/ja/README.ja.md → 存在する(docs/ja/README.ja.md)
- docs/CONTRIBUTING.md → 存在する
- docs/SECURITY.md → 存在する

---

## 5. 本調査の限界

- Rustコードの全関数の入出力仕様や、フロントエンドの状態管理(page_state_defaults.ts等)の詳細なデータフローまでは追っていない。今回は「機能の存在場所」「ドキュメントとの整合性」「規模感」「テスト状況」に絞った
- history/jump listの永続化コマンドの有無はbootstrap.rsのコマンド一覧からは特定できなかった(config保存コマンド経由の可能性があるが未確認、不明として記録)
- ファイル監視(watch.rs)が発火するイベント名・データ構造の詳細は未確認
- ワーキングツリーに存在する未コミット差分(29ファイル)の意図(作業中の内容)はコミットログが存在しないため確認できず、不明として扱った

---

## Evaluator所見(research-verifier, 2026-09-22)

- 検証方法: 引用された約45件のファイルパス・行番号・引用文を実ファイルと1件ずつ突き合わせ、行数はGrepによる独立カウントで再計算した。git log依存の記述はBash(git)が実行できない環境のため直接検証できず、`.git/refs`の生データ読み取りで可能な範囲のみ確認した。
- 誤りとして修正した箇所: デュアルペインの日本語マニュアル記載漏れ(1.2-3、3.1-4)、バックエンドファイル数34→42(2.2、3.2)、devDependencies行番号(3.4)、invoke呼び出し数74件と独立カウント87件の不一致(2.3)。上記はいずれも本文に直接反映済み。
- 上記以外(GitPanel/WinMerge/デュアルペインの実装箇所・行番号、Storage Providerのby_ref未使用、テストファイル数・件数、Google Drive撤去の痕跡、ドキュメント実在確認等、約40件)は実ファイルと完全一致し誤りなし。
- **PENDING_HUMAN_REVIEW→解消済み(2026-09-22、git実行可能な環境で再確認)**:
  1. コミット`ca2f80c`「Removed Google Drive feature」— ハッシュ`ca2f80ce9c5fd8e29bf628a2f5c131df0d459b36`、日付 2026-03-17 21:45:59 +0900、gdrive_*.rs各ファイルの削除行数を確認、記述と一致
  2. SettingsModal.svelteの「-437行」— `git show --stat ca2f80c`で437行削除を確認、記述と一致
  3. 「7047b94/5f01b10/5210e29/cb74a87 Refactoring step 2-5」— 全コミット存在確認、加えて`71f9179 Refactoring step 1`も存在(本文未記載だが漏れがあるだけで誤りではない)
  4. 「29ファイルがModified」— `git status --short`で29件を確認、記述と一致
  - 以上4件とも記述に誤りなし。既存調査ドキュメントの正確性は全体として高いと確認できた。
- **調査対象ブランチに関する重要な確認事項**: 調査時のHEADは`main`ではなく`new-feature-experiment`(mainから107コミット進んだブランチ、かつ29ファイルの未コミット変更あり)であった。`main`は2026-02-18のコミット`a62954e`以降更新されておらず、GitPanel/WinMerge連携/デュアルペインはいずれも`main`には存在しない(`git show main:<path>`でNOT FOUND)。本文冒頭に追記済み。要件確定の際は、調査したHEADが「プロダクトの現状」を代表するか、発注者の想定する「既存ReflexFiles」がどちらのブランチを指すかを人間が判断する必要がある。
