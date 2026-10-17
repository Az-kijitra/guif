# 既存仕様調査(main基準): 外部アプリ起動(external apps)

- 調査日: 2026-10-16 / 対象: `C:\Users\toshi\git\ReflexFiles` のコミット `a62954e`(main)のみ(`git show a62954e:` / `git grep a62954e`)。作業ツリーは読んでいない。
- 以下、パスは `a62954e:` を省略。`ext.rs` = `app/src-tauri/src/external_apps.rs`、`ext_ts` = `app/src/lib/actions/external_open.ts`。
- 方針: コードを一次情報とし、読み取れない意図は「不明」と書く。

## 1. 対応アプリと挙動
- **対象パス(重要)**: Explorer / ターミナル各種 / VS Code / Git クライアントの5系統は、選択や右クリック対象に関係なく**常に「現在開いているフォルダ」(`ctx.getCurrentPath()`)を渡す**(`ext_ts:180-240`)。現在フォルダが空なら何もせず戻る(エラー表示なし。`:182,192,202,224,234`)。バックエンドは文字列をそのまま使い、存在・フォルダ判定をしない(`ext.rs:241-248` ほか)。
- 右クリックメニューの同名項目(`context_menu_items.ts:73-91, 255-275`)も、押して渡すのは現在フォルダで、右クリックした項目のパスではない(→7)。
- 起動は `Command::spawn` のみで終了を待たない。cwd・環境変数・ウィンドウ指定は一切しない(`ext.rs:17-28`)。

| アプリ | 実行ファイルの探し方 | 引数 | 備考 |
|---|---|---|---|
| Explorer | 固定名 `explorer.exe`(PATH 解決任せ)`ext.rs:246-248` | `[path]` | |
| ターミナル(既定 `open_cmd`) | `wt.exe`、失敗時 `cmd.exe` `ext.rs:250-260` | wt: `-d <path>`。設定 `external_terminal_profile` が非空なら `-p <profile>` を付け、spawn 失敗なら `-p` なしで再試行(`:188-202`)。cmd: `/K` と `cd /d "<path>"`(`:258-259`) | cmd.exe のコンソール表示形態はコードに指定なし(不明) |
| ターミナル種別(`open_terminal_cmd/powershell/wsl`) | 同上 `ext.rs:273-283` | プロファイル = 種別別設定 → 空なら `external_terminal_profile`(`:203-221`)。種別が cmd/powershell/wsl 以外は InvalidPath(`:208-213`) | プロファイル名の存在確認なし |
| ターミナル(プロファイル指定。設定画面の診断だけが使用) | 同上 `ext.rs:263-272` | profile 空は InvalidPath(`:36-45`) | |
| VS Code | 候補を順に `exists()` 確認: 設定 `external_vscode_path` → LOCALAPPDATA 配下 `Programs\Microsoft VS Code\Code.exe` → ProgramFiles 配下 `Microsoft VS Code\Code.exe` → ProgramFiles(x86) 配下(`ext.rs:47-68, 284-291`)。無ければ PATH の `code`(`:292`)。失敗は NotFound "program not found (set external_vscode_path)"(`:292-297`) | `[path]` | レジストリは参照しない |
| Git クライアント | **GitHub Desktop 前提**。候補: 設定値、拡張子なしなら `.exe` 付与、ディレクトリなら `GitHubDesktop.exe` / `github.exe`、LOCALAPPDATA 配下 `GitHubDesktop\GitHubDesktop.exe`、ProgramFiles 配下 `GitHub Desktop\...`、(x86)(`ext.rs:70-101`)。存在する候補を順に spawn、全滅なら PATH の `github`、`github-desktop`(`:305-319`) | `[path]` | |
| カスタム(`external_apps`) | `command` をそのまま `Command::new`(PATH 任せ、`ext.rs:338-341`)。空は InvalidPath | `args` 各要素の `{path}` `{cwd}` をフロントで文字列置換(`ext_ts:36-42`) | |
| 汎用 `external_open_with_app(path, app)` | `app` をそのまま実行(`ext.rs:241-244`) | `[path]` | フロントからの呼び出しは見つからない(登録のみ `bootstrap.rs:62`) |

- 「CMD / PowerShell / WSL」(Ctrl+Alt+1/2/3)の違いは**プロファイル名の設定だけ**。cmd.exe / powershell.exe / wsl.exe を直接起動する経路は無く、wt が無い場合はどの種別でも cmd.exe にフォールバックする(`ext.rs:273-283`)。
- OS 関連付けで開く(`openPath`)・内蔵ビューアは別系統(`ext_ts:108-150`)。

### カスタムアプリの対象パス(`ext_ts:23-29, 48-64`)
- 起動契機はキー(`keyboard_list.ts:329-340`)または右クリックメニュー。
- 対象エントリ: 選択がちょうど1件ならそれ、それ以外(0件・複数)は**フォーカス行**。エントリ無しなら `error.no_associated_app`「このファイルに関連付けられた外部アプリがありません」相当を表示(`:49-52`)。
- `{path}`: フォルダならそのパス、**ファイルなら現在フォルダ**(ファイル自身ではない。`:54-57`)。`{cwd}`: 現在フォルダ(空なら空文字)。ファイルのパスを渡す手段が無い(→7)。
- 複数選択でも1件分のみ。右クリックメニューは複数選択時は非表示。

## 2. 設定
- ファイル: APPDATA 配下 `ReflexFIles\config.toml`(`docs/ja/user_manual.ja.md:195-197`)。TOML。読み込み→正規化→書き戻し(`config.rs:55-65`)。
- キー(`types/config.rs:67-84`、既定値は `config_defaults.rs:36-43` ですべて空文字/空配列):
  - `external_apps`: 配列。要素 `{name, command, args[], shortcut}`(`types/config.rs:239-245`)。
  - `external_associations`: 拡張子→アプリ。読み込まれるが(`page_lifecycle.ts:88-89`)外部アプリ起動での使用は見つからない。
  - `external_git_client_path`(旧別名 `git_client`)、`external_vscode_path`(`vscode_path`)、`external_terminal_profile`(`terminal_profile`)、`external_terminal_profile_cmd` / `_powershell` / `_wsl`(各 `terminal_profile_*`)。
- 検証・正規化: パス系は制御文字除去・最大1024・前後の引用符除去(`config_defaults.rs:67-97, 134-135`)。プロファイル名は制御文字除去・最大256(`truncate` はバイト長基準、`:67-78`)。`external_apps` はバックエンドでは実質無処理(`:144-146`)。フロントの `normalizeExternalApps` は name と command がともに非空の項目だけ採用(`normalize.ts:13-23`)。重複 shortcut・不正 shortcut の検証は見つからない。
- カスタムアプリ数の上限: コード上なし。
- 登録手段: **設定画面からは追加できない**。「外部ツール」にはプロファイル4つ・VS Code パス・Git クライアントパス・診断ボタンのみ(`SettingsModal.svelte:196-290`)。`external_apps` は config.toml の直接編集のみ(設定保存パッチにも無い: `config_cmds.rs:384-421`)。config.toml のコメントは「外部アプリ定義。」のみ(`config_io.rs:209, 453-457`)。
- Windows Terminal プロファイルの検出: 次を順に探し、最初に存在し解析できたものを採用(`ext.rs:103-121, 223-239`): LOCALAPPDATA 配下の `Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json` → `Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState\settings.json` → `Microsoft\Windows Terminal\settings.json`。JSON5 で解析し `profiles.list[]` の `name` / `guid` / `source`、`defaultProfile` と guid 一致で `is_default`(`:123-176`)。`profiles` が配列そのものの旧形式は読めず空になる(`:138-142`)。
  - 用途: 設定画面を開くとき取得し(`routes/+page.svelte:680-684`)「検出されたプロファイル」を表示(`SettingsModal.svelte:338-351`)。取得失敗は空扱い。config.toml 保存時にも名前一覧をコメントで書き出す(`config_io.rs:95-133, 385-415`)。同じ検出ロジックが2か所に重複。
  - 一覧は参考表示のみ。選択 UI はなく、プロファイル名は手入力。

## 3. UI
- 既定キー(`ui_constants.ts:91-97`、139-145 の別プロファイルも同値): エクスプローラー Ctrl+Alt+E / ターミナル(既定) Ctrl+Alt+C / CMD Ctrl+Alt+1 / PowerShell Ctrl+Alt+2 / WSL Ctrl+Alt+3 / VS Code Ctrl+Alt+V / Git クライアント Ctrl+Alt+Shift+G。アクション id は `open_explorer` `open_cmd` `open_terminal_cmd` `open_terminal_powershell` `open_terminal_wsl` `open_vscode` `open_git_client`(`:41-47`)。処理は `keyboard_list.ts:96-127`。
- カスタムアプリのキー: `external_apps[].shortcut` を正規化して一致比較(`keyboard_list.ts:329-340`)。組み込みキーの判定より**後**のため、組み込みと同じキーは組み込みが先に処理される。マニュアルの例(`user_manual.ja.md:345-347`)の `Ctrl+Alt+E` はこの衝突に当たる。
- メニューバー「ファイル」: 開く / 親フォルダを開く / エクスプローラーで開く / ターミナルを開く / VS Codeで開く / Gitクライアントで開く / 区切り / 設定 / 区切り / 終了(`menus/file.ts:34-83`)。ショートカット表示つき。CMD/PowerShell/WSL とカスタムアプリはメニューバーに無い。ラベル(ja、`ui_constants.ts:541-544`)は上記のとおり。キー設定画面のラベル: CMDで開く / PowerShellで開く / WSLで開く(`:621-623`)。
- 右クリックメニュー(行、単一選択時のみ。`context_menu_items.ts:245-283`): 開く → エクスプローラーで開く → ターミナルを開く → VS Codeで開く → Gitクライアントで開く → (`external_apps` の `name` を表示名として、**ファイルのときだけ**) → 親フォルダを開く。ショートカット表示なし。余白メニューに外部アプリ項目なし(`:215-240`)。フォルダ向けのエラー分岐(`:94-103`)は、項目が非表示のため到達しない。
- ダイアログ: 起動前の確認なし。設定画面「起動診断」に3ボタン(ターミナル / VS Code / Gitクライアント)があり、現在フォルダを渡して起動し「起動コマンドを送信しました。」または失敗内容を表示(`routes/+page.svelte:835-910`、`SettingsModal.svelte:262-290`)。現在フォルダ無しは `settings.test_path_missing`(`:845-850`)。診断では、入力中(未保存)のパスを `external_open_custom` で試し、失敗したら保存済み設定の通常経路にフォールバック(`:869-896`)。ターミナル診断はプロファイル入力が空なら kind "cmd"(`:855-865`)。
- エラー表示: バックエンドは `code=<code>; <message>` 形式の文字列で返す(`external_apps_cmds.rs:8-52`)。フロントは `formatError` で `failure.code.*` に翻訳(`error_format.ts:6-30`。not_found「見つかりません」、invalid_path「パスが不正です」、permission_denied「アクセスが拒否されました」。`ui_constants.ts:815-825`)し、`error.open_*_failed` に埋め込む(ja: 「エクスプローラーで開けませんでした: {error}」「ターミナルを開けませんでした: …」「VS Codeで開けませんでした: …」「Gitクライアントで開けませんでした: …」。`:897-900`)。表示は `showError` → エラー状態+ステータスメッセージ(`feedback.ts:25-35`。見た目の詳細は未確認)。カスタムアプリは生のエラーをそのまま `showError`(`ext_ts:59-63`)。
- 「見つからない」場合のエラー種別: VS Code は NotFound 固定(`ext.rs:292-297`)。Git は最後の spawn エラー(io 種別由来)を優先し、無ければ NotFound(`:321-335`)。Explorer・カスタムは io エラー種別そのまま。

## 4. Git クライアント
- 対象は **GitHub Desktop**(既定候補・コマンド名がすべて GitHub Desktop 系。`ext.rs:70-101, 314`)。他のクライアントも `external_git_client_path` に実行ファイルを指定すれば起動できるが、引数は常に `[path]` のみ(`:307`)。
- 選択: 設定パス → 既定インストール先 → PATH(1節の表)。マニュアルは「空なら既定を使用」(`user_manual.ja.md:335`)と「未設定の場合起動できません」(`:266-267`)で食い違い、設定画面は「Gitクライアント起動に必要です」(`ui_constants.ts:748`)。
- リポジトリ判定は**しない**(`.git` 確認や git 実行なし)。非リポジトリでもそのまま起動し、その後の挙動はクライアント依存(不明)。

## 5. セキュリティ・安全面
- シェルを経由せず `Command::new(program).args(args)`(`ext.rs:17-28`)。引数は配列で渡り、Windows 向けの引数クォートは Rust 標準ライブラリに任せる。例外:
  - cmd.exe フォールバックは `cd /d "<path>"` を1つの引数文字列にして `/K` に渡す(`:258-259`)。環境変数展開(パーセント記号)への対策なし(挙動は未検証)。
  - `explorer.exe` へはパスを1引数で渡すのみ。現在フォルダ以外は渡さない。
- パス検証: バックエンドは空チェックのみ(`ext.rs:36-45`)。存在・種別・正規化なし。`command` / 設定パスは無検証で実行(設定ファイルを信頼する前提と読めるが、意図は不明)。`wt.exe` `explorer.exe` `cmd.exe` `code` `github` は PATH 検索でフルパス固定ではない。
- UNC / 長いパス / ZIP 内パス: 専用処理なし。`currentPath` をそのまま渡す。cmd.exe の `cd /d` が UNC を扱えるかはコードからは判断不可(未検証)。ZIP 内を「現在フォルダ」にできるかはこの経路のコードから不明(ZIP は別機能)。
- `{path}` `{cwd}` の置換は単純な文字列置換で、エスケープ・検証なし。
- 起動に使うのは自前の Tauri コマンド(`bootstrap.rs:62-70` で登録)。`tauri-plugin-shell` は未使用、`tauri-plugin-opener` と `json5` を依存に確認(`Cargo.toml:26,29`)。capability 定義の詳細は未確認。

## 6. テスト
- 外部アプリ起動の自動テストは見つからない。Rust のテスト属性があるのは `error.rs`(5)と `fs_query.rs`(12)のみ(`git grep -c` で確認)で、`external_apps.rs` には無い。`parse_terminal_profiles`・候補列挙などの純粋関数も未テスト。フロントのテストランナー設定・テストファイルも見つからない。

## 7. 曖昧・不整合
1. 右クリックのメニュー項目は単一選択のときだけ出るが、Explorer / ターミナル / VS Code / Git が開くのは右クリックした項目でなく現在フォルダ(`context_menu_items.ts:73-91` → `ext_ts:180-240`)。「選択したフォルダを開く」実装は存在しない。意図は不明。
2. CMD / PowerShell / WSL は実際にはプロファイル名の差だけで、wt が無ければすべて cmd.exe(1節)。ラベルは実態より強い。メニューバー・右クリックには個別項目が無くキーのみ。
3. マニュアルの `external_apps` 例の shortcut `Ctrl+Alt+E` は組み込み `open_explorer` と衝突し、組み込み側が先に処理される。設定画面の衝突検出が外部アプリの shortcut を対象にするかは未確認。
4. カスタムアプリの `{path}` はファイルを選んでも現在フォルダになる(`ext_ts:54-57`)。一方、右クリックの項目表示はファイルのときだけで、設計意図と食い違うように見える。意図は不明。
5. Git クライアントの未設定時の説明がマニュアル内・設定画面で不一致(4節)。
6. `external_open_with_app` と `external_associations` は外部アプリ起動では未使用。
7. VS Code の設定パスが存在しなくても黙って次の候補・PATH の `code` に進む。プロファイル名の誤りは wt 任せで検知しない(`wt -p` は spawn 成功しうる。`ext.rs:197-201`)。
8. プロファイル名の最大長が「バイト」基準で、`truncate` は UTF-8 境界を考慮しない(`config_defaults.rs:67-78`。長い日本語名で panic しうるが未検証)。
9. Windows Terminal 検出が `external_apps.rs` と `config_io.rs` に重複実装。
10. 現在フォルダが空のときは無言で何もしない。
11. レジストリ(App Paths 等)は一切参照しない。VS Code・Git の検出は固定の場所と PATH のみ。
