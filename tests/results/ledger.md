# テスト結果台帳

| 実行日時 | Case ID | 結果(PASS/FAIL/NOT_RUN) | 証跡(ログ/スクショへのリンク) | 実行者(subagent/人間) |
|---|---|---|---|---|
| 2026-09-22 | 未採番(SPEC-0300-0009) | PASS(フロント・バック双方) | `docs/architecture/traceability.md` L42 | unit-test-writer → code-generator → code-reviewer → 発注者(rustup導入後、`cargo test --lib`実行) |
| 2026-09-22 | 未採番(SPEC-0300-0010) | PASS(フロント・バック双方) | `docs/architecture/traceability.md` L43 | unit-test-writer → code-generator → code-reviewer → 発注者(rustup導入後、`cargo test --lib`実行) |
| 2026-09-23 | 未採番(SPEC-0300-0011) | PASS(フロント・バック双方) | 以下「## 2026-09-23 MVP Phase 2」セクション参照 | unit-test-writer → code-generator → code-reviewer(4回) → オーケストレーター(blocker修正・回帰テスト追加) → 最終判定「PR作成可」 |
| 2026-09-24 | 未採番(SPEC-0300-0012) | PASS(フロントのみ。Rust変更なし) | 以下「## 2026-09-24 MVP Phase 3」セクション参照 | unit-test-writer → code-generator → code-reviewer → オーケストレーター(IME/修飾キー/空選択の修正・回帰テスト追加) → 判定「PR作成可」 |
| 2026-09-26 | 未採番(SPEC-0300-0013) | PASS(フロント・バック双方) | 以下「## 2026-09-26 MVP Phase 4」セクション参照 | unit-test-writer → code-generator → code-reviewer → オーケストレーター(flush並行呼び出しの修正・回帰テスト、ヘッドレスブラウザでの動作確認) → 判定「PR作成可」 |
| 2026-09-27 | 未採番(SPEC-0300-0011 第4版 画面配線 + ISS-0105 vim削除) | PASS(フロント・バック双方) | 以下「## 2026-09-27 Phase 2 画面配線」セクション参照 | unit-test-writer(Rust/TS並行) → code-generator(Rust/TS並行) → code-reviewer → code-generator(指摘修正) → オーケストレーター(ヘッドレスブラウザで動作確認) → 判定「PR作成可」 |
| 2026-09-27 | 未採番(SPEC-0300-0014 第3版 ZIP作成/展開) | PASS(フロント・バック双方) | 以下「## 2026-09-27 Phase 5 ZIP」セクション参照 | unit-test-writer(Rust/TS並行) → code-generator(Rust/TS並行、CP932等の実験含む) → code-reviewer(セキュリティ重点) → code-generator(指摘修正) → オーケストレーター(ヘッドレスブラウザで動作確認) → 判定「PR作成可」 |
| 2026-09-27 | 未採番(SPEC-0300-0015 ReflexViewer統合) | PASS(フロント・バック双方) | 以下「## 2026-09-27 Phase 6 ReflexViewer」セクション参照 | unit-test-writer(Rust/TS) → code-generator → オーケストレーター(設計MUST未達3点を差し戻し) → code-reviewer(差し戻し: DPI単位混在・listen/take順) → code-generator(修正) → オーケストレーター(複数モニタ座標を物理px統一へ修正、ヘッドレスブラウザで動作確認) |
| 2026-09-29 | 未採番(SPEC-0300-0009 第8版 / SPEC-0300-0010 第11版、Phase 7) | PASS(フロント・バック双方) | 以下「## 2026-09-29 Phase 7」セクション参照 | unit-test-writer → code-generator → オーケストレーター(400行超過・ページ移動量を差し戻し) → code-reviewer(差し戻し: ソートメニュー再押下がキーマップ非経由、ツリーのページ移動量) → オーケストレーター(実Tauriで不具合2件を検出) → code-generator(修正) → オーケストレーター(ツリー再描画漏れを修正し実Tauriで確認) |
| 2026-10-01 | 未採番(SPEC-0300-0016 第2版 ほか連動新版、Phase 8) | PASS(フロント・バック双方) | 以下「## 2026-10-01 Phase 8」セクション参照 | unit-test-writer → code-generator → code-reviewer(PR作成可、SHOULD 3件) → オーケストレーター(実Tauriで確認) |
| 2026-10-03 | 未採番(SPEC-0300-0017 第3版・SPEC-0400-0001 第2版ほか、Phase 9) | PASS(フロント・バック・E2E) | 以下「## 2026-10-03 Phase 9」セクション参照 | unit-test-writer → code-generator(E2E 作成・実行含む) → code-reviewer(PR作成可、SHOULD 4件) → code-generator(E2E 安全策 S-1/S-2/S-4 修正) → オーケストレーター(実アプリで画面確認) |

## 2026-10-03 Phase 9 見た目(SPEC-0300-0017 第3版、SPEC-0400-0001 第2版、0016第3版/0009第10・11版/0012第5版/0015第3版)テスト実行結果

- `cargo test`: 727件全成功。`npx vitest run`: 93ファイル/1805件全成功。`npx tsc --noEmit`・`npx svelte-check`エラー0(警告6、既存a11yパターン)、`npx vite build`・`cargo build`・`cargo check --release`成功。`+page.svelte` 396行。
- **E2E(新設、`app/e2e/`、`npm run e2e`)**: 49 PASS / 0 FAIL / 5 SKIP。SKIP は目視指定の4件(タイトルバー、Ctrl+ホイールのズーム抑止、最小サイズ未満へのドラッグ、旧ビルドの設定からの復元)と単体テストで担保の1件(AC-931 コントラスト)。
- E2E の安全策: テスト用の一時設定フォルダを `REFLEXFILES_CONFIG_DIR`(debug ビルドのみ有効)で渡し、起動時の `[config] override dir:` 行を確認してから入力。終了後に実データ(`%APPDATA%\dev.reflexfiles.successor\`)の更新日時が不変であることを検査(R-08 PASS)。ファイル変更・外部起動の9コマンドは拒否スタブ、スタブが効いていることを起動時に確認、テスト用フォルダ外ではキー送信を拒否、パスバーにフォーカスが入らなければ中止。不正な `REFLEXFILES_CONFIG_DIR`(空・空白・相対)では起動が止まり実データに触れないことを確認。
- 実アプリでの目視確認(オーケストレーター、通常起動): PATH ラベル付きパスバー、ツリー(C: / F: の表示名、▼▶、選択行の薄青)、一覧(等幅・区切り線・サイズ右寄せ・28px 行)、ステータスバー(フォーカス・並び替え・選択・隠し)がオリジナル(main)の画面構成に近いことを確認。
- code-reviewer SHOULD(対応済み): E2E の初回移動でパスバーのフォーカス確認、IPC スタブが効いているかの自己検査、`--attach` の接続先確認。S-3(AC-935 と SPEC-0300-0012 AC-113-1 の文言の食い違い)は ISS-0184 に起票。
- 未実施: `tests/manual/phase9-visual-checklist.md` の目視確認。

## 2026-10-01 Phase 8 パスバー+ドライブ切替(SPEC-0300-0016 第2版、0009第9版/0010第12版/0012第4版/0013第5版)テスト実行結果

- `cargo test`: 708件全成功。`npx vitest run`: 84ファイル/1614件全成功。`npx tsc --noEmit`・`npx svelte-check`エラー0(警告6、既存a11y)、`npx vite build`・`cargo build`成功。`+page.svelte` 396行。
- 設計監査(guardian第16・17回)で検出・設計段階で解消: 移動の競合が既存loadSequenceだけでは満たされない(起動時ロードと再表示の2経路)、MUST-105(ホームへのフォールバック中の利用者移動)、MUST-106(staleな移動がCtrl+Hを数十秒塞ぐ)、MUST-107(履歴一覧表示中のEnterがパスバー確定になる)ほか。
- 実Tauri(WebView2リモートデバッグ)で確認: Ctrl+Lで全選択、`C:\Win`+Tabで`C:\Windows\`に補完、Enterで移動し一覧へ・ツリー追従、存在しないパスは入力を残し「対象が見つかりません。」、ファイルパスは「フォルダーではありません。」、`c:/users/../users`の正規化、パスバーで↓→履歴一覧、`F:`入力・ツリーの`F:\`選択でドライブ切替(ツリー最上位にC:\とF:\、現在ドライブのみ展開)、検索バー表示中に一覧フォーカスでCtrl+L→検索バーを閉じてパスバーへ、編集中のステータスバークリック→編集破棄し一覧へ。例外なし。
- 観察(Phase 8範囲外、既存): 検索入力欄にフォーカスがある間のCtrl+Lは何もしない(SPEC-0300-0010 R-14-2-1どおり、mainも同じ)。検索入力欄で入力中にステータスバー等をクリックするとフォーカスがbodyへ落ちる。
- code-reviewer SHOULD(未対応、非blocker): path-bar-wiringのblur/focus分岐(R-704/R-704-1)の単体テスト不足(実機では確認済み)、path-bar-stateの未使用deps(onOpenHistory/onAddJump)、reload延期時のnull戻り値が失敗と区別できない。
- 未実施: `tests/manual/phase8-path-bar-checklist.md` の実機確認(切断中ネットワークドライブ、UNC、IME、WebView2既定キー、DPI等)。

## 2026-09-29 Phase 7 ツリー・一覧アクション・キーマップ読込・表示状態保存(SPEC-0300-0009 第8版 / 0010 第11版)テスト実行結果

- `cd app && npx vitest run`: 77ファイル/1442件全成功。`cargo test`: 696件全成功。`npx tsc --noEmit`エラー0、`npx svelte-check`エラー0(警告6、既存a11y)、`npx vite build`・`cargo build`成功。`+page.svelte` 400行。
- 実Tauri(WebView2リモートデバッグ)で検出・修正: (1) Tab処理が`focus.list/search`を呼ぶが画面側は`container/searchInput`で毎回TypeError、Tab移動はブラウザ標準動作によるもので回り込み・抑止が効いていなかった(tscは.svelteを検査しないため未検出→svelte-checkを確認手順に追加)。(2) ツリーの祖先展開で最後の祖先(toshi)を展開済みにしても再描画の合図(touch)が無く、画面では折りたたまれたまま(状態テストは通るが描画されない)。読込中表示も同種の漏れ。runesの反応性を検証するテストは現行のNode/サーバー側コンパイル環境では書けない(jsdom等の依存追加が必要)ため、実アプリでの確認で代替。
- 実アプリ確認結果: 起動時フォーカスは一覧、ツリーはC:→Users→toshiを展開し現在地gitを選択表示、Tab/Shift+Tabで回り込み、ソートメニュー表示中はTab抑止・Escで一覧へ、Ctrl+Shift+Bで表示切替、ツリーのPageDown、例外なし。
- code-reviewerで検出・修正: ソートメニュー再押下がキーマップ非経由(`S`決め打ち)、ツリーのPageUp/Downが1行多い(テストが誤値10を固定していた→9)、起動通知が後続通知で上書きされる、フォーカス判定の二重実装。
- テスト変更(理由付き): list-action-wiringのtoggle_hidden(Phase 7で実装済みになった)、fs/commandsのcanary(rustc 1.98でERROR_BAD_NETPATHがNotFoundに写像)、tree-stateのMUST-90(b)前提、sort-menu-wiring AC-619(iv)、tree-action-wiring期待値10→9、import-boundaryにfile-list例外、tree-state 206行を厳密化。
- 未実施: `tests/manual/phase7-tree-keymap-checklist.md` の実機確認(config.toml手動編集、ui-state.toml破損、UNC、DPI等)。
- 残課題(非blocker): ISS-0155(config.toml作成者)、ISS-0057(c)残り、ISS-0044(a)、ISS-0022(e/g)。runes反応性テスト環境の整備(jsdom/happy-dom導入の要否)。

## 2026-09-27 Phase 6 ReflexViewer統合(SPEC-0300-0015)テスト実行結果

- `cd app && npx vitest run`: 62ファイル/1183件全成功。`cd app/src-tauri && cargo test`: 667件全成功。`npx tsc --noEmit`エラー0、`npx vite build`・`cargo build`成功。
- テストの修正(前提の誤り): CP932未定義バイト例を0x80→0xFD(WHATWG Shift_JISでは0x80はU+0080)、NTFSで大小違い同名ファイルを作れないため統合テストを2件に縮小(タイブレークは純関数テストで検証)、ACL整合テストを複数capabilityの和集合で判定、import境界§3.4.7の例外をfeatures/viewerに限定。
- 差し戻しで解消した問題: +page.svelte 400行超過(行操作をrow-interaction-wiring.tsへ)、最新要求優先がFEのみ(バックエンドでepoch/seq判定)、世代番号の未配線、ウィンドウ位置の論理/物理px混在(高DPIでサイズがずれる)と複数モニタ(拡大率が異なる)で座標が重なる件(物理px統一・非表示で生成後にset_position/set_size)、listen前にtakeして切替を取りこぼす件、ViewerWindowIoLock未使用、画像のJSON数値配列転送(ipc::Response+Blob URL)。
- 依存: tauri-plugin-opener 2.5.5(プラグイン未登録、自由関数open_pathのみ。tauri 2.11.6のまま)、markdown-it 15.0.2。
- 動作確認(Tauri IPCモックのヘッドレスEdge): ビューアでテキスト表示(文字コード名・切り詰め通知・行番号)、listen→takeの順、Alt+→で画像(Blob URL)へ切替、Escでclose。メインで/viewerは/へリダイレクト、Enterでclassify→viewer_open(seq付き)、Shift+Enterでviewer_os_open_path。
- 未実施: 実Tauriでの手動確認(`tests/manual/phase6-viewer-checklist.md`)。code-reviewerの再レビュー報告は受信できず、再レビュー観点(複数モニタ座標・Blob URL解放・生バイト受信・ロック)はオーケストレーターが直接確認。
- 2026-09-27 実機報告「画像を選ぶとウィンドウだけ出て何も表示されない」: `on_navigation(|_| false)`がビューア自身の初回読込(/viewer)まで拒否しwebviewがabout:blankのまま(テキストも同様)。アプリのオリジン(tauri://localhost、tauri.localhost、デバッグ時のdevUrl)のみ許可する`viewer/nav_guard.rs`に修正(テスト3件、cargo test 670件成功)。実Tauri(WebView2リモートデバッグ)でPNGがBlob URLで表示されること、テキストがUTF-8判定で表示されることを確認。IPCモックのヘッドレス確認では検出できない種類の不具合。
- 残課題(非blocker): ISS-0126(b) 画素数上限は未決(上限なしで実装)、ISS-0135 ユーザー文書の置き場所なし、右クリックメニューは後続フェーズ。

## 2026-09-27 Phase 5 ZIP作成/展開(SPEC-0300-0014 第3版)テスト実行結果

- `cd app && npx vitest run`: 55ファイル/1117件全成功。`cargo test --lib`: 535件全成功。`npx tsc --noEmit`エラー0、`npx vite build`成功。
- 設計監査で検出・解消した主な問題: 展開先の既存ファイルを名前解決の窓で無断置換しうる件(→`MoveFileExW`をREPLACE_EXISTINGなしで呼ぶ`move_no_replace`)、書き出し先が未存在だと全エントリが拒否されるバグ(同一性判定`None`の扱い)、ディレクトリを`.zip`として展開対象にしうる件(entryType)、進捗ダイアログが開く前にキー入力が一覧へ届く件(showProgress→listen→invoke)、名前の長い正当ファイルが一時名の長さで失敗する件、エントリ数上限判定が遅くメモリを使い切られる件。
- 実験で判明したzip crate 7.2の挙動(自前で補った点): 完全一致の重複名を黙って1件に潰す(中央ディレクトリを自前走査)、AES(方式99・ビット0なし)を暗号化と認識しない、宣言サイズと実データの食い違いを検出しない、サイズ0のDeflateで`UnexpectedEof`、複数ディスクを開けてしまう、名前はCP437として化ける(UTF-8として妥当ならUTF-8、そうでなければ`name_raw`+`encoding_rs`でCP932)。
- code-reviewerで検出・修正: ZIPのDOS日時をUTC扱いで読み書きしていた(他ツールと日本で9時間ずれる)→`time`の`local-offset`でローカル時刻へ、計画中のキャンセルで空の展開先が作られる、作成時のIOエラーが`zip_corrupt`扱い、`__proto__`エントリ名、EOCD不一致検査、名前の防御的検査。攻撃名約40件(`..`、絶対パス、UNC、ADS、予約名、8.3等)はレビューで全て拒否を確認。
- 動作確認(Tauri IPCモックのヘッドレスEdge): Ctrl+Alt+Zで作成フォーム(入力欄にフォーカス、対象件数表示)→Escapeで閉じて一覧へ、Enterで事前検査→作成、Ctrl+Alt+Xで展開フォーム(展開先=ZIP名のサブフォルダ)→衝突ダイアログ(既定=キャンセル)→Escapeで展開せず。
- 未実施: 実Tauriでの手動確認(`tests/manual/phase5-zip-checklist.md` MZ-01〜MZ-28。実ZIP作成・展開、エクスプローラーとの相互運用〈日時・日本語名〉、進捗・キャンセル、空き容量、AltGr配列等)。
- 残課題(非blocker): minor 5(BufWriter)、6(TOCTOU窓、ハンドルベース操作でないと閉じられない)、9(読み取り専用ファイルの上書きで中断)、SHOULD-89(計画中のキャンセルボタン不応答)、ISS-0099(CP932は実装済み、実ZIPでの手動確認)。

## 2026-09-27 Phase 2 画面配線(SPEC-0300-0011 第4版)+ ISS-0105 テスト実行結果

- `cd app && npx vitest run`: 42ファイル/787件全成功。`cargo test --lib`: 187件全成功。`npx tsc --noEmit`エラー0、`npx vite build`成功。
- 検出・修正した主な問題: (設計監査で)コピー/移動がメインスレッドで動き進捗・キャンセルが機能しない件→`#[tauri::command(async)]`、上書き選択でコピー元自身を削除しうる件→canonicalize同一性判定・祖先拒否(`overwrite_ancestor`)、`fs_ops_*`がTauri ACLに未登録で画面から全て拒否される件→3者(generate_handler/build.rs/capabilities)登録+整合テスト、検索で非表示の項目が操作対象になる件→表示中のみ。(レビューで)`Reject`時に祖先の失敗理由が出ない件、`create`の既存ファイル切り詰め(TOCTOU)→`create_new`、大文字小文字のみのrename不可、移動フォールバックの競合迂回、cut部分失敗時のクリップボード、paste失敗時の再読込。
- 動作確認(Tauri IPCモックのヘッドレスEdge): Deleteで確認ダイアログ(既定フォーカス=キャンセル、背景inert)→Escapeで閉じて一覧へフォーカス復帰・削除IPC未呼出、Ctrl+C→Ctrl+Vで衝突ダイアログ(フォルダはマージの文言、既定=キャンセル)、F2で名前入力欄にフォーカス、Tabでボタン移動→Enterで削除実行(ごみ箱)。
- 未実施: 実Tauriでの手動確認(`tests/manual/phase2-file-ops-checklist.md`。実ファイルのコピー/移動/削除/上書きマージ、進捗・キャンセル、実ごみ箱)。OSクリップボード連携(R-15〜R-18、AC-04〜06)はGAP(発注者決定で次段階)。
- 残課題(非blocker): code-reviewer minor 3,4,7,8,9,10,12,13,14,15(reloadの進行中ナビ破棄、Ctrl+Q実行中の中断、CancelRegistryの先置きリーク等)。

## 2026-09-26 MVP Phase 4(SPEC-0300-0013 ジャンプリスト・訪問履歴・検索履歴永続化) テスト実行結果

- `cd app && npx vitest run`: 30ファイル/503件全成功。`cargo test --lib`: 101件全成功(Phase 2の75件+Phase 4)。`npx tsc --noEmit`エラーなし、`npx vite build`成功。
- レビューで検出・修正: `flush()`が並行呼び出し時(デバウンス保存中にCtrl+Q)に後続の保存完了を待たず最新の変更を失う問題(MUST-55の穴)を、「in-flightも未保存もなくなるまで継続」に修正し回帰テストを追加。`requestAppExit`の`close()`のreject未処理も修正。
- 動作確認(Tauri IPCをモックしたヘッドレスEdge): 起動時の履歴読込・初期パス記録・保存、Ctrl+Shift+Jでジャンプ登録、Ctrl+J/Ctrl+Yで一覧表示(フォーカスが一覧へ)、Escapeで閉じて一覧へフォーカス復帰、履歴選択での移動と履歴先頭化・保存を確認。
- 残課題(非blocker): ISS-0076/0077/0080/0081/0082/0085/0086残課題、code-reviewer minor(初期パス失敗時のメッセージ、`hydrate`例外時のリスナー未登録、同期コマンドのメインスレッド実行 等)、SPEC-0300-0013 R-252-2の正式訂正。
- 未実施: 実Tauriでの`onCloseRequested`による終了時フラッシュ(×ボタン・Ctrl+Q)と実際の`navigation.toml`書込の目視確認。

## 2026-09-24 MVP Phase 3(SPEC-0300-0012 検索) テスト実行結果

- `cd app && npx vitest run`: 23ファイル/326件全成功(既存255件は無回帰、Phase 3で71件追加)。
- `npx tsc --noEmit`: エラーなし。`npx vite build`: 成功(`.svelte`ファイルのコンパイル確認。svelte-checkは未導入)。
- レビューで検出・修正: IME変換中のEnter/矢印が検索アクションとして誤発火(`isComposing`を`KeydownLikeEvent`に追加し通過させる)、修飾キー付きキーの誤発火、0件絞り込み時の全選択による選択全消し。いずれも回帰テストを追加。
- 残課題(非blocker): ISS-0065(`openFocused`の非表示エントリ対応、`invert_selection`のキー未定義、AC-101/AC-113-3のUI未実装等)。
- 未実施: 実アプリ上での目視確認(Tauri起動)。

## 2026-09-22 MVP Phase 1(SPEC-0300-0009/0010) テスト実行結果

### フロントエンド(vitest): PASS

**対象ファイル** (10ファイル / 181件テスト)
- `app/src/lib/features/file-list/{list-layout,sort,selection,navigation,tree,dir-load,aria}.test.ts`
- `app/src/lib/features/keyboard/{keymap-defaults,keymap-resolve,key-dispatch}.test.ts`

**実行コマンド・結果**
- `cd app && npx vitest run`: 181件全て成功
- `npx tsc --noEmit -p tsconfig.json`: エラーなし

**実行プロセス**
1. unit-test-writer: テストコード作成(TDD)
2. code-generator: 実装コード作成 + vitest実行で全件成功を確認
3. code-reviewer: 独立してvitest再実行し同じ結果を確認。合わせてStorage Provider再導入・feature間直接importがないことをgrep監査で確認。「PR作成可」と判定

### バックエンド(Rust): PASS【2026-09-22 更新・実行検証済み】

**経緯**: 当初は本実行環境にcargo/rustcが無くNOT_RUNだったが、発注者がrustupでRustツールチェインを導入。`export PATH="$HOME/.cargo/bin:$PATH"`の上で`cd app/src-tauri && cargo test --lib`を実行し、実際にコンパイル・実行して検証した。

**実行結果**
```
running 16 tests
test shared::schema::keymap::tests::r20_default_profile_is_windows ... ok
test keymap::defaults::tests::default_keymap_config_matches_schema_default ... ok
test shared::schema::keymap::tests::r41_default_custom_overrides_are_empty ... ok
test shared::schema::keymap::tests::r42_legacy_field_names_are_not_treated_as_aliases ... ok
test shared::schema::keymap::tests::r41_toml_field_names_are_input_keymap_profile_and_input_keymap_custom ... ok
test config::io::tests::load_missing_file_returns_defaults ... ok
test fs::query::tests::ac13_directory_size_is_empty ... ok
test fs::query::tests::ac56_entry_has_the_seven_specified_fields ... ok
test fs::query::tests::ac56_ext_is_extracted_without_the_leading_dot ... ok
test fs::query::tests::ac20_name_sort_desc_reverses_the_case_insensitive_order ... ok
test fs::query::tests::show_hidden_false_excludes_dotfiles ... ok
test fs::query::tests::show_hidden_true_includes_dotfiles_and_marks_hidden_flag ... ok
test fs::query::tests::ac21_size_sort_is_numeric_not_lexicographic ... ok
test fs::query::tests::ac20_name_sort_is_case_insensitive ... ok
test fs::query::tests::ac22_type_sort_groups_dirs_first_then_ext_then_name ... ok
test config::io::tests::ac33_saving_unrelated_settings_preserves_manually_edited_keymap_fields ... ok

test result: ok. 16 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
```

**対象ファイル**
- `app/src-tauri/src/fs/query.rs`
- `app/src-tauri/src/shared/schema/keymap.rs`
- `app/src-tauri/src/keymap/defaults.rs`
- `app/src-tauri/src/config/io.rs`

**既知リスクの解消**: `config/io.rs`の`Config`構造体が`#[serde(flatten)]`を用いており、`toml`クレートとの既知の相性問題(スカラー/テーブルの宣言順序制約)が懸念されていたが、`ac33_saving_unrelated_settings_preserves_manually_edited_keymap_fields`テスト(flatten構造体のTOMLラウンドトリップを直接検証)が成功したことにより、この懸念は解消された。

## 2026-09-23 MVP Phase 2(SPEC-0300-0011) テスト実行結果

### フロントエンド(vitest): PASS

**対象ファイル** (10ファイル(Phase 1) + 9ファイル(Phase 2新規) + 2ファイル(Phase 2変更/新テスト) / Phase 1: 181件 + Phase 2新規: 74件 = 計255件)

**Phase 2新規テスト対象**
- `app/src/lib/features/file-ops/{target-resolution,clipboard-mode,conflict-flow,progress-modal,delete-flow,rename-flow,create-flow,name-validation,error-format}.test.ts` (9ファイル)
- `app/src/lib/features/keyboard/keymap-validate.test.ts` (新規)
- `app/src/lib/features/keyboard/delete-override-validation.test.ts` (新規)

**Phase 1から変更のあるファイル**
- `app/src/lib/features/keyboard/keymap-resolve.test.ts` (追加テスト含む)

**実行コマンド・結果**
- `cd app && npx vitest run`: 255件全て成功
- `npx tsc --noEmit -p tsconfig.json`: エラーなし

**実行プロセス・検証経緯**
1. **初回実装(code-generator)**: フロント252件・バック66件成功と報告
2. **初回レビュー(code-reviewer)**: AC-74テストの自己言及バグを検出(検索対象の禁止文字列リテラル自体がテストファイル内にあり、テストが自分自身を検出してしまう)
   - **修正(オーケストレーター)**: `file!()`マクロで自己ファイルを除外 → 回帰テスト後、バック66件全成功に
3. **2回目レビュー(code-reviewer)**: 実装コードにblocker 2件を検出
   - **B1**: `preflight_transfer`が`copy_batch`/`move_batch`から未配線で、宛先が複製元内部にある場合に自己参照的な無限再帰でスタックオーバーフローする実機クラッシュ(実機再現済み)
   - **B2**: `delete`アクションのカスタムキー割当Shift禁止バリデーション(`validateCustomOverride`)が実際の解決経路(`resolveBinding`)から未呼び出し
   - **修正(オーケストレーター)**: B1(`NotFound`以外の構造的エラーのみ全体拒否)・B2(`resolveBinding`内でvalidateCustomOverride呼び出し追加) → フロント255件・バック68件全成功
4. **発注者確認**: ISS-0052(進捗表示・キャンセル機能、R-40〜R-45)の追加実装指示
   - **追加実装(code-generator)**: フロント255件・バック74件成功
5. **3回目レビュー(code-reviewer)**: 追加実装をレビュー、BLK-1を検出
   - **BLK-1**: `preflight_transfer`が単一パス早期returnのため、複数アイテムのバッチで欠落ファイルが先頭にあると2件目以降の構造的危険が見逃される(B1修正が不完全だった)
   - **修正(オーケストレーター)**: 2パス構成に変更 → 回帰テスト追加 → バック75件全成功
6. **4回目最終レビュー(code-reviewer)**: BLK-1修正のみを再検証 → **「PR作成可」(blockerなし)と判定**
   - **軽微な修正(オーケストレーター)**: 未使用importの削除 → フロント255件・バック75件全成功維持

### バックエンド(Rust): PASS

**対象ファイル** (Phase 1: 4ファイル/16件テスト + Phase 2新規: 8ファイル/59件テスト = 計12ファイル/75件テスト)

**Phase 2新規実装ファイル**
- `app/src-tauri/src/fs_ops/{name_validation,preflight,transfer,delete,rename,create,error,commands}.rs` (8ファイル)

**実行コマンド・結果**
- `cd app/src-tauri && export PATH="$HOME/.cargo/bin:$PATH" && cargo test --lib`: 75件全て成功
  ```
  test result: ok. 75 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
  ```

**実行プロセス・検証経緯**

同フロントエンドと並行実施。以下の検出・修正サイクルを経て、最終的に75件全成功を達成:
- **初回実装**: 66件成功(AC-74テストのfile!()マクロ除外により改善)
- **2回目レビュー後修正**: 68件成功(B1/B2 blocker修正後)
- **追加実装**: 74件成功(ISS-0052進捗表示・キャンセル機能追加)
- **3回目レビュー後修正**: 75件成功(BLK-1修正・2パス構成導入)

詳細なテスト内容・blockersの検出・修正履歴については、フロントエンド項の「実行プロセス・検証経緯」を参照(両者は並行実施、検出・修正サイクルが連動)。

### 既知の残課題(非blocker)

これら課題は最終レビューで「PR作成可」と判定された際に、blockerではなく今後の改善項目として記録されたもの:

**ISS-0052関連(進捗表示・キャンセル機能)**
- (a) イベント名/operation_id方式の仕様追認要
- (b) R-43原文とのグローバル/操作単位キャンセルの差異の追認要
- (c) `features/file-ops/`側の実UI配線は未実装
- (d) `keymap-validate.ts`のShift検出が正規化前の生文字列への大文字小文字区別の完全一致(MIN-1)

**その他仕様未確定項(引き続きGAP)**
- ISS-0039, ISS-0040, ISS-0041-b, ISS-0044(項目a/d), ISS-0046: TBDとして仕様確定待機

