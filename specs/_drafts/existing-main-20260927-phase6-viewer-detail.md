# 既存仕様調査(main基準): Phase6 ReflexViewer統合(ファイルビューア)詳細

- 調査日: 2026-09-27
- 対象リポジトリ: `C:\Users\toshi\git\ReflexFiles`
- 調査基準: `main` ブランチのみ(`git show main:<path>` / `git grep ... main`)。作業ツリーは参照していない。
- 引用形式: `main:<repo相対パス>:<行番号>`。「不明」はコードから読めない事項、「(コード読解)」は実行していない推論。
- 作成: codebase-researcher(本文)。Write不可のためオーケストレーターがファイル化(要点を保持して整理)。**オーケストレーター直接確認済みの項目は末尾「Evaluator所見」**。

## 0. 対象ファイル(main)
| 区分 | パス | 備考 |
|---|---|---|
| ビューア画面 | `app/src/routes/viewer/+page.svelte` | **2626行**(単一ファイル。script約2012行+テンプレート+CSS) |
| ルートガード | `app/src/routes/+layout.svelte`(34行) | viewerウィンドウ判定 |
| 起動/連携(FE) | `app/src/lib/actions/external_open.ts`(339行) | `openEntry`、`openViewerWindow`、`closeViewer` |
| Rust(ウィンドウ) | `app/src-tauri/src/viewer_cmds.rs`(245行) | `open_viewer`ほか4コマンド |
| Rust(ファイル読込) | `fs_query.rs`、`fs_query_cmds.rs` | テキスト/画像/プロパティ |
| 設定/権限 | `types/config.rs:53-62`、`config_defaults.rs:29-33`、`config_io.rs:346-358`、`capabilities/default.json`、`tauri.conf.json` | viewer_window_* |
| テスト | `app/e2e/tauri/viewer_flow.mjs`、`fs_query.rs`内`#[cfg(test)]` | |

### 0.1 骨組み仕様との最重要ポイント
- mainのビューアは**別Tauriウィンドウ(label `viewer`)**(`viewer_cmds.rs:9`)。同一ウィンドウ内ペインではない。
- 対応は**テキスト/Markdown/画像(PNG・JPEG・BMP)のみ**。ヘックスダンプ、EXIF、回転、**検索**、文字コード判定/切替、折り返し、PDF/動画/音声/HTMLレンダリングは**実装なし**。
- ユーザーマニュアルが記載する**Ctrl+F(検索)とCtrl+O(ファイル選択)はコードに存在しない**。`docs/VIEWER_SPEC.md`は**mainに存在しない**(README等がリンク切れ)。ビューアの正式仕様書は無く、コードが唯一の一次情報。

## 1. 起動・連携
- 起動経路: Enter(`open`アクション)、ダブルクリック、右クリック「開く」(**選択が1件のときのみ**)、メニュー等の「開く」、Help>キー一覧/ユーザーマニュアル(同梱user_manual.mdをビューアで開く)。**ビューア専用のキー/メニューは無い**(`KEYMAP_ACTIONS`にviewer系アクション無し)。Shift+Enterは`keyboard_list.ts`でハードコードで、ビューアを使わずOS関連付けアプリで開く。
- 既定キー(`ui_constants.ts`を確認): `open: "Enter"`(windows :65 / vim :113)。ビューア起動に使われるのは`open`のみ。
- 対象の決め方: 一覧のキー操作=フォーカス行。`openFocusedOrSelected`=選択がちょうど1件ならその選択、それ以外はフォーカス行。**複数選択でも開くのは1件のみ**。
- 開く/開かない判定(`openEntry`、`external_open.ts:117-150`): ①ディレクトリ→フォルダ移動(ビューアなし) ②拡張子が`VIEWER_SUPPORTED_EXTS`(md, markdown, png, jpg, jpeg, bmp, txt, log, json, c, h, cpp, cc, cxx, hpp, hh, hxx, rs, js, ts, py の21種、`:4-8`)→`open_viewer` ③拡張子対象外でも`fs_is_probably_text`(サンプル65536B)が真→`open_viewer` ④それ以外→OS関連付けアプリ(`plugin-opener`)。判定の例外は握りつぶして偽(=黙って関連付けアプリへ)。`.mjs/.cjs/.tsx/.html`はビューア側に言語判定はあるが拡張子リスト外(不整合)。
- ウィンドウ仕組み(`viewer_cmds.rs`): `open_viewer(path, jump_hint?)`(存在・ファイル確認・canonicalize→pendingに保存→既存`viewer`ウィンドウがあれば`show`+`set_focus`+`emit_to("viewer","viewer:open-path")`で**ファイル切替**、無ければ新規作成:1024x768、`visible(false)`、initスクリプトでsessionStorageを設定し`/viewer`へ`replaceState`)、`close_viewer`、`viewer_take_pending_open`、`viewer_take_pending_path`(旧互換)。**メインと同じ`index.html`(同一SvelteKitアプリ)**を読み込み、`+layout.svelte`がviewerウィンドウかどうかで遷移をガード。**単一ウィンドウを再利用**。既存時はpendingが残り、×ボタンで閉じた場合(`close_viewer`を通らない)に古いpendingが残りうる(軽微)。
- `jump_hint`: `"keymap"`でMarkdownの「キー操作」見出しへスクロール(ヘルプ用)。
- ウィンドウ位置・サイズ・最大化の保存: **あり**(`config.toml`の`viewer_window_x/y/width/height/maximized`)。最小640x480、作業領域へクランプ。保存契機は`CloseRequested`/`Destroyed`と`close_viewer`(毎回`load_config`→`save_config`で全設定を再書込。メインの設定と競合しうる)。
- 閉じる: ビューア内の**Escape**(どこにフォーカスがあっても)または**Ctrl(Meta)+Q**で`close_viewer`。メインウィンドウを閉じたときのviewerの扱いは明示処理が見つからず**不明**。
- capabilities: `windows: ["main","viewer"]`で同一capability(専用の絞り込みなし)。`tauri.conf.json`の`security.csp: null`。**asset protocolの設定・featureは見つからない**(`git grep`0件)ため、`convertFileSrc`直接ロードが成功するかは**不明**(失敗時にdata URLへフォールバックする設計)。

## 2. 対応形式と機能
- 種別判定(`detectKind`): `.md/.markdown`→markdown、`.png/.jpg/.jpeg/.bmp`→image、**それ以外はすべてtext**(拡張子のみ)。ビューア内にバイナリ判定は無く、バイナリでもtextとして読む。言語判定は c/cpp/rs/js/ts/py/json/md。highlight.jsはcore+8言語、テーマは固定。
- **テキスト**: エンコーディング**判定なし**(Rustは常に`String::from_utf8_lossy`、BOMも除去しない。Shift_JIS等は文字化け、UTF-16も表示は文字化け)。文字コード切替UIなし。行番号あり。**折り返しなし**(`white-space: pre`)。**検索なし**。通常読込は`fs_read_text(maxBytes=2 MiB)`。**大容量(仮想スクロール)へ切替は10 MiB以上または12万行以上**(`+page.svelte:7-10`)。Markdownは`markdown-it`(`html:false`)でHTML/Text切替とズーム。
- **大容量の仮想スクロール**: `fs_text_viewport_info`/`fs_read_text_viewport_lines`(1回最大4000行)。疎な行インデックス(1024行ごと)を**初回に全ファイル同期走査**で構築、キャッシュ最大16件。FE側プリフェッチ3プロファイル(localStorage保存)。テストデータ生成スクリプト(10MB/100MB/1GB)あり。
- **画像**: **PNG/JPEG/BMPのみ**(`image`クレート、feature=png,jpeg,bmp)。GIF/WebP/SVG等はtext扱い(文字化け)。表示は`convertFileSrc`直接ロード→失敗時に`fs_read_image_data_url`(生バイトのbase64)→PNG再エンコード(一時ディレクトリ`%TEMP%\reflexfiles-viewer-image-cache`、7日/400ファイル/512MiBで削除)へフォールバック。ズーム0.01〜8倍、Fit/100%/200%、Ctrl+ホイール、ドラッグでパン。**回転なし、EXIFなし**。前後画像プリフェッチと多層キャッシュ(約450行)。**画像サイズ上限なし**(全読込→base64→IPC)。
- ヘックスダンプ/PDF/動画/音声: **なし**。プロパティ(`fs_get_properties`等)はビューアから呼ばれない。
- **ビューア内キー(すべてハードコード、キーマップ化なし)**: ↑↓←→でスクロール(72px、Shiftで240px)、PageUp/PageDown、**Home/End未実装**、Alt+←/→と Ctrl(Meta)+PageUp/PageDownで同一フォルダの前/次ファイル、Ctrl+Shift+1/2/3でプリフェッチ切替(仮想テキスト時)、Ctrl(Meta)+`+`/`-`/`0`でMarkdownズーム、画像はCtrl+`+`/`-`/`0`/`9`(Fit)/`2`(200%)、Escapeで閉じる、Ctrl+Qで閉じる。
- 前/次ファイル: 表示中ファイルの親フォルダを名前昇順で取得し**type=fileのみ**(隠しファイル含む、種別問わず全ファイル)を順送り。ラップなし。一覧の並び順(ファイラー側ソート)とは無関係。

## 3. UI構成
- 単一の`<main class="viewer-root">`。左上に固定の`Prev / N / M / Next`。画像はFit/100%/200%ボタン、Markdownは切替とズーム。**メニューバー/ツールバー/ステータスバーは無い**。タイトルは`ReflexViewer - <ファイル名>`。
- 読み込み中`Loading...`、空`No file selected`、エラーは`<pre class="error">`(コード付き文字列が生で出る)。**i18n未対応**(ラベルは英語固定、エラーは日本語固定)、**テーマ固定のダーク**(メインのテーマ設定と非連動)、フォント固定、ユーザー設定なし。
- 永続化: ウィンドウ位置等は`config.toml`。プリフェッチプロファイルとMarkdownズームはWebView localStorage。

## 4. バックエンド(Rust)
- コマンド: `open_viewer`/`close_viewer`/`viewer_take_pending_open`/`viewer_take_pending_path`、`fs_read_text(path, max_bytes)`(先頭maxバイトを`from_utf8_lossy`、**切り詰め通知なし**、UTF-8の途中で切れうる)、`fs_text_viewport_info`、`fs_read_text_viewport_lines`、`fs_is_probably_text`(空=真、UTF BOM=真、NULを含む=偽、制御文字比率>10%=偽)、`fs_read_image_data_url(path, normalize?)`、`fs_read_image_normalized_temp_path`、`fs_list_dir`(前後移動用)。エラーは`"code=<code>; <message>"`。
- `_by_ref`系/Storage Providerは**mainに存在しない**。使用クレート: `image 0.25`、`base64`、`notify 6`。**文字コード判定クレートなし**。
- セキュリティ: `open_viewer`は存在・ファイル・canonicalizeのみ。**`fs_read_*`は検証なしの任意パス読み**(許可ディレクトリ制限、シンボリックリンク/UNC制限なし。capabilityも`path:"**"`)。ローカルファイラー用途で意図的と推測されるが記述なし。画像はサイズ上限なし。XSS: Markdownは`html:false`だが`{@html}`で描画、CSP `null`。

## 5. ファイラー側の連携
- ビューアを開いた後のフォーカス: Rust側で`show`+`set_focus`。閉じた後にメインへフォーカスを戻す処理は無く(OS任せ、実挙動は不明)。**ビューアはファイル変更を監視せず自動再読込しない**。前後移動用フォルダ一覧も開いた時点のスナップショット。ビューア→ファイラーへの通知(開いているファイルを一覧でフォーカス等)は無い。

## 6. ドキュメントとコードの食い違い
- **Ctrl+F検索、Ctrl+Oファイル選択**: マニュアル(ja/en/resources)に記載があるが**コードに無い**。`docs/VIEWER_SPEC.md`はREADME/development_guide/maintenance_guideが参照するが**mainに存在しない**。
- テスト: Rust単体(`fs_query.rs`に9件程度)、e2e 3ケース(txt/md/pngの表示とEscapeで閉じる。**前後移動・仮想スクロール・Ctrl系キー・ウィンドウ状態保存・jump_hintはテストなし**)。`viewer_cmds.rs`に単体テストなし。

## 7. 不整合・バグ・未配線(要点)
1. **2MiB超〜10MiB未満(かつ12万行未満)のテキストが黙って先頭2MiBだけ表示される**(切り詰め通知なし)。
2. Ctrl+F/Ctrl+Oは文書のみで未実装。Home/End未実装。
3. 文字コード判定なし(Shift_JIS/UTF-16は文字化け)。
4. 画像形式の不一致(GIF/WebP/SVGはtext扱い)、拡張子リストと言語判定の不整合、ビューア内でバイナリがtext表示される。
5. 画像サイズ上限なし、パス検証なし。
6. 既存viewer時のpending残り、エラー握りつぶし、ウィンドウ状態保存の全設定再書込による競合。
7. asset protocol未設定(直接ロードの成否が不明)、i18n/テーマ非連動、2626行の単一ファイルへの肥大、VIEWER_SPEC.md不在。

## 8. 規模の把握(MVP分類の材料)
| 分類 | 機能 | 規模の目安 |
|---|---|---|
| **基本** | 別ウィンドウ起動(open/close)、テキスト表示(`fs_read_text`+行番号)、画像PNG/JPEG/BMP表示、Escapeで閉じる、エラー/Loading表示 | Rust約245行+fs_query一部。FEは`+page.svelte`の約20%相当 |
| **中程度** | 前後ファイル移動、画像ズーム/Fit/パン、Markdown HTML/Text切替、ウィンドウ位置保存、拡張子/内容テキスト判定、キーによるスクロール、シンタックスハイライト | 依存: markdown-it、highlight.js |
| **拡張(mainに実装済)** | 大容量仮想スクロール、画像プリフェッチ/多層キャッシュ/PNG正規化(約450〜500行)、Markdown見出しジャンプ、ズーム永続化 | 複雑度が高い |
| **拡張(mainに無い)** | 検索、文字コード判定/切替、折り返し、Home/End、ヘックスダンプ、EXIF/回転、GIF/WebP/SVG、PDF/動画/音声、設定UI、i18n | 全て新規実装 |

## 9. 人間判断が必要になりそうな論点
1. 表示方式(別ウィンドウか同一ウィンドウ内ペインか)。別ウィンドウなら単一再利用・位置保存を踏襲するか。
2. 対応形式の範囲(text/markdown/PNG・JPEG・BMPの踏襲か拡張か)。非対応形式はOS関連付けで開くか。拡張子リスト+内容判定の踏襲か。
3. MVPの機能線引き(基本のみか、中程度まで含めるか)。大容量(仮想スクロール)を初期から含めるか、上限拒否/切り詰め警告で代替するか。
4. 検索(mainは未実装)を含めるか。
5. 文字コード(UTF-8 lossy固定の踏襲か、Shift_JIS/UTF-16判定を追加するか。日本語利用では影響大)。
6. 2〜10MiBの切り詰め問題の扱い。
7. シンタックスハイライトの要否と言語範囲。
8. ビューア操作のキーマップ化とEnter/Shift+Enter割当。
9. セキュリティ方針(任意パス読込を許容か、`open_viewer`経由の許可パスに絞るか。画像サイズ上限、シンボリックリンク/UNC)。
10. 画像の直接ロード(asset protocol)とPNG正規化キャッシュの要否。
11. 複数選択・ディレクトリ選択時の挙動。
12. ビューアのUI言語/テーマ連動、フォント・折り返し設定。
13. ファイル更新の追従(ビューア側の再読込/監視)。
14. 仕様書の欠落(VIEWER_SPEC.md不在)に伴い、SPEC-0300-0008にどこまで規定するか。
15. ウィンドウ状態の保存先(全設定書換の競合を避ける設計にするか。Phase 4の`navigation.toml`のような専用ファイルとの整合)。

---

## Evaluator所見(オーケストレーター直接検証、2026-09-27)

`git -C ReflexFiles show main:<path>`で以下を直接確認し、調査本文と一致した。
- ビューアウィンドウのラベル: `viewer_cmds.rs:9` `const VIEWER_LABEL: &str = "viewer";`。
- 拡張子リスト: `external_open.ts:4-8` の21種。`open`の既定キー: `ui_constants.ts` `:65`(windows)、`:113`(vim)= `"Enter"`。
- 閾値: `viewer/+page.svelte:7-10` `MAX_TEXT_BYTES = 2 MiB`、`LARGE_TEXT_THRESHOLD_BYTES = 10 MiB`、`LARGE_TEXT_LINE_THRESHOLD = 120,000`。**2〜10MiBの切り詰めの構造は成立**。
- ビューアに`Ctrl+F`検索の処理は無い(`+page.svelte`内で該当なし。文書のみの記載)。`docs/VIEWER_SPEC.md`は`git ls-tree -r main`に存在しない。asset protocolの設定は`git grep`で0件。ファイル行数は2626行。

未確認(「不明」のまま): メインウィンドウを閉じたときのviewerの扱い、閉じた後のフォーカス、`convertFileSrc`直接ロードの成否。
