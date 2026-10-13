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
| 2026-10-03 | 未採番(SPEC-0300-0018 右クリックメニュー、0010第13版/0011第7版/0015第4版/0017第4版/0009第12版/0014第4版/SPEC-0400-0001第3版、Phase 10) | PASS(フロント・バック・E2E) | 以下「## 2026-10-03 Phase 10」セクション参照 | unit-test-writer → code-generator(実機確認・E2E含む) → code-reviewer(PR作成可、SHOULD 3件) → オーケストレーター(SHOULD対応、実アプリで画面確認) |
| 2026-10-04 | 未採番(SPEC-0300-0011 第8版 / SPEC-0300-0018 第2版 / SPEC-0400-0001 第4版、Phase 11) | PASS(フロント・バック・E2E。ISS-0200 は 2026-10-04 に再実行して解消) | 以下「## 2026-10-04 Phase 11」セクション参照 | code-generator(先行作業: 既存E2Eのfail-closed化・+page.svelte分割・実機最小確認) → unit-test-writer → code-generator → code-reviewer(PR作成可、SHOULD 4件) → code-generator(S-1〜S-3等修正) → オーケストレーター(実アプリでレイアウト確認) |
| 2026-10-06 | 未採番(SPEC-0300-0017 第5版 / SPEC-0300-0015 第5版 / SPEC-0300-0018 第3版 / SPEC-0300-0010 第14版・第15版 / SPEC-0300-0009 第13版・第14版 / SPEC-0900-0001 追補・第3版、Phase 12) | PASS(フロント・バック・E2E) | 以下「## 2026-10-06 Phase 12」セクション参照 | unit-test-writer → code-generator → code-reviewer(PR作成可、MUST なし、S-1 ～ S-2・M-1 ～ M-4 修正済み) → オーケストレーター(実アプリでテーマ確認) |
| 2026-10-07 | 未採番(SPEC-0300-0011 第9版 / 0016 第4版 / 0009 第14版 / 0013 第6版 / 0014 第5版 / 0015 第6版、絶対パス検査の二重防御・ISS-0204〜0206) | PASS(フロント・バック・E2E) | 以下「## 2026-10-07 絶対パス検査の二重防御」セクション参照 | unit-test-writer → code-generator → code-reviewer(PR作成可) → test-automation-engineer → オーケストレーター |
| 2026-10-08 | 未採番(SPEC-0300-0017 第6版、ISS-0203 (b)(c)(d)) | PASS(フロント・E2E) | 以下「## 2026-10-08 ISS-0203 の片付け」セクション参照 | オーケストレーター(調査・実装・実アプリ確認) → spec-writer / spec-reviewer(第6版) |
| 2026-10-09 | 未採番(SPEC-0300-0019 第1版 画面文言の日本語統一、SPEC-0300-0009 第16版 空の一覧の「項目なし」ほか関連7本、ISS-0176 / 0207〜0210) | PASS(フロント・バック・E2E) | 以下「## 2026-10-09 画面文言の日本語統一」セクション参照 | code-generator(段階 A / C) → unit-test-writer(段階 B) → code-reviewer(PR作成可) → test-automation-engineer → オーケストレーター |
| 2026-10-13 | 未採番(Phase 13 単体。SPEC-0300-0020 第1版 / 0015 第10版 / 0017 第8版 / 0019 第2版 / 0009 第17版 / 0010 第16版 / 0012 第7版 / 0013 第8版 / 0014 第7版 / SPEC-0400-0001 第5版) | PASS(vitest 165 ファイル / 3550 件、cargo test --lib 1050 件、svelte-check 0 エラー〈警告 6、既存 a11y〉) | `C:\Users\toshi\AppData\Local\Temp\claude\c--Users-toshi-git-project\c0cc5542-e889-4852-8057-9725a10ee58e\tasks\a1ec42cddc4384825.output`(21:28 時点。以下「## 2026-10-13 Phase 13」セクション参照) | オーケストレーター(実行・確認)。unit-test-writer → code-generator → code-reviewer の経緯は同セクション |
| 2026-10-13 | 未採番(Phase 13 E2E 1回目。R-08 を含む) | 199 PASS / 1 FAIL / 12 SKIP(R-08 PASS) | `C:\Users\toshi\AppData\Local\Temp\claude\c--Users-toshi-git-project\c0cc5542-e889-4852-8057-9725a10ee58e\scratchpad\e2e-1013.txt`(20:40。末尾に集計と SKIP 一覧) | オーケストレーター(実行) |
| 2026-10-13 | AC-1321(E2E 1回目の FAIL) | FAIL(`コピー: expected "Ctrl+Insert", got "Ctrl+C"`)。仕様の例を承認後の追補で `Ctrl+Shift+C,Ctrl+C` に訂正(ISS-0215 (1)) | `e2e-1013.txt`(同上の FAIL 行) | オーケストレーター |
| 2026-10-13 | 未採番(Phase 13 E2E 2回目。修正後の全体実行) | 183 PASS / 0 FAIL / 30 SKIP(EXIT 0) | `C:\Users\toshi\AppData\Local\Temp\claude\c--Users-toshi-git-project\c0cc5542-e889-4852-8057-9725a10ee58e\tasks\afc11c8f677b2f1f5.output`(21:17。集計行はバイト位置 2321173 付近) | E2E 担当(サブエージェント) |
| 2026-10-13 | AC-1321(E2E 2回目) | 同じ証跡内に PASS 行あり(`PASS  AC-1321 ... Ctrl+Shift+C`)。2回目の集計は FAIL 0 件 | `afc11c8f677b2f1f5.output`(バイト位置 2257770 付近。集計行〈183 件〉との個別の対応は未確認) | E2E 担当 |
| 2026-10-13 | AC-520 の CDP 側(ビューアのフォーカス・Enter 後 1 秒以内) | PASS(1回目。2回目の個別の結果は証跡の抜粋から確認できなかった) | `e2e-1013.txt`(PASS 行) | オーケストレーター |
| 2026-10-13 | AC-520-os(OS 入力で ↓ を押し本文が 72px 動く) | NOT_RUN(OS 入力の E2E は無効。`REFLEXFILES_E2E_OS_INPUT` 未設定。1回目・2回目とも SKIP) | `e2e-1013.txt`(SKIP 行)、`afc11c8f677b2f1f5.output`(SKIP 2 件の内訳) | 未実施(発注者の了承待ち。チェックリスト VWR-01) |
| 2026-10-13 | AC-520(後半: メインを前面にして再利用したとき、OS のキーでスクロール) | NOT_RUN([目視]) | なし(目視項目) | 未実施(チェックリスト VWR-02) |
| 2026-10-13 | AC-1348(OS 入力: F10 → → ↓、Alt+F、Esc。Alt 単独を含む) | NOT_RUN(OS 入力。1回目・2回目とも SKIP。Alt 単独は未実装〈保留〉) | `e2e-1013.txt`(SKIP 行)、`afc11c8f677b2f1f5.output`(SKIP 2 件の内訳) | 未実施(発注者の了承待ち。チェックリスト MBR-14、MBR-13) |
| 2026-10-13 | AC-1341(Alt 単独で「ファイル」を強調する部分) | NOT_RUN(Alt 単独は未実装〈保留〉)。同じ AC の Ctrl+Alt+Z の部分は PASS | `e2e-1013.txt`(`PASS  AC-1341 Ctrl+Alt+Z ...`)、`afc11c8f677b2f1f5.output`(PASS 行) | 未実施(保留。ISS-0212 (1)、チェックリスト MBR-13) |
| 2026-10-13 | AC-1365(R-1395 ユーザーマニュアル、[目視]) | NOT_RUN | なし(目視項目) | 未実施(チェックリスト MBR-17) |
| 2026-10-13 | AC-942-title / AC-927-1 / AC-945-shrink / AC-946-restore / AC-931 / AC-1027 / AC-1040 / AC-1041 / AC-1042 / AC-06-8(1回目の SKIP のうち、上記以外の 10 件) | NOT_RUN(理由は各 SKIP 行のとおり: [目視]、[単体]で担保、リストの再読込が無い、ウィンドウのタイトルバーに CDP で届かない、等) | `e2e-1013.txt`(SKIP 一覧) | 未実施(目視・単体扱い) |
| 2026-10-13 | 2回目の SKIP 30 件のうち、クリップボード系 20 件 | NOT_RUN(ユーザーの OS クリップボードが復元不能な形式のため。個別の AC の一覧は証跡の抜粋から確定できなかった) | `afc11c8f677b2f1f5.output`(集計 `30 skipped`)。1回目では同系統が PASS(例: `PASS  AC-04`、`PASS  AC-1051`、`PASS  AC-1311`〈`e2e-1013.txt`〉) | 環境起因(E2E 担当の報告) |
| 2026-10-13 | 2回目の SKIP 30 件のうち、目視・単体扱い 8 件 | NOT_RUN(個別の AC の一覧は証跡の抜粋から確定できなかった) | `afc11c8f677b2f1f5.output`(集計 `30 skipped`) | 未実施(目視・単体扱い) |
| 2026-10-13 | 1,000,000 文字のファイルを開く時間(release ビルド、チェックリスト PRF-01) | NOT_RUN(release 未計測)。dev 計測の初回は約 28 秒(オーケストレーター計測。計測出力の保存先は本台帳の作成時点で特定できなかった) | なし(本台帳作成時点で証跡ファイル未特定。ISS-0216 に記録) | 未実施 |

## 2026-10-13 Phase 13 メニューバー・ビューアのキー・スクロール・見た目・シンタックスハイライト・Fit の拡大 テスト実行結果

- 対象: SPEC-0300-0020 第1版(メニューバー)、SPEC-0300-0015 第8版〜第10版(ビューア。第9版: Fit の拡大・上限 800%、第10版: 最長の行が 10,000 文字を超えるファイルは色分けしない)、SPEC-0300-0017 第8版、SPEC-0300-0019 第2版、SPEC-0300-0009 第17版、SPEC-0300-0010 第16版、SPEC-0300-0012 第7版、SPEC-0300-0013 第8版、SPEC-0300-0014 第7版、SPEC-0400-0001 第5版(OS キー入力 E2E の仕様)。
- 手動確認チェックリスト: `tests/manual/phase13-menu-viewer-checklist.md`(2026-10-13 作成。全項目 未実施)。
- **単体**: vitest 165 ファイル / 3550 件すべて成功(`Test Files 165 passed (165)`、`Tests 3550 passed (3550)`。OS キー入力ヘルパーのテストを含む)。cargo test --lib 1050 件成功(0 failed)。svelte-check 694 ファイル 0 エラー・警告 6(既存 a11y)。証跡: `C:\Users\toshi\AppData\Local\Temp\claude\c--Users-toshi-git-project\c0cc5542-e889-4852-8057-9725a10ee58e\tasks\a1ec42cddc4384825.output`。
- **静的計測(wc -l、2026-10-13)**: `app/src/routes/+page.svelte` 388 行、`app/src/routes/viewer/+page.svelte` 366 行(上限 400 行)。
- **E2E 1回目**(`npm run e2e` 相当、`scratchpad/e2e-1013.txt`): 199 PASS / 1 FAIL / 12 SKIP、R-08 PASS。FAIL は AC-1321 のみ(例の `Ctrl+Insert` が、キーマップの認めるキー名に無い。`keymap-validate.ts` が上書きを捨てるため)。この FAIL の後、仕様の例を `Ctrl+Shift+C,Ctrl+C` に訂正した(SPEC-0300-0020 AC-1321 の承認後の追補、ISS-0215 (1))。
- **E2E 2回目**(修正後の全体実行、`tasks/afc11c8f677b2f1f5.output`): 183 PASS / 0 FAIL / 30 SKIP(EXIT 0)。SKIP の内訳は E2E 担当の報告による: クリップボード系 20 件(ユーザーの OS クリップボードが復元不能な形式)、OS キー入力 2 件(AC-1348 / AC-520-os。`REFLEXFILES_E2E_OS_INPUT` 未設定)、目視・単体扱い 8 件。
- 件数の差(1回目 212 件 / 2回目 213 件)の理由は、この台帳では判定しない。1回目で PASS だったクリップボード系(例: AC-04、AC-1051、AC-1311)が 2回目の SKIP 20 件に含まれるかは、2回目の個別の一覧が証跡から確定できないため確認していない(上の表の 2 行を参照)。
- **code-reviewer**(レビュー報告の記録。判定は人間): PR作成可(MUST なし)。SHOULD 3 件(Fit の安全網の CSS 削除、+page.svelte の行数、ハイライト Worker の cancel)と MINOR は修正済み(オーケストレーターの報告)。
- **観察(テストの判定ではない。ISS-0216 に記録)**: 1,000,000 文字のスクリプト風ファイルを、テストが書いた直後に初めてビューアで開くと、dev ビルドで約 28 秒かかった(250k 約 1.8 秒 / 500k 約 7.2 秒 / 1M 約 28.2 秒。時間は文字数の 2 乗に比例)。アプリ側の処理は decode 9 ms、転送 0.3 秒、表示と色付け約 1.5 秒。同じファイルの 2 回目は約 3 ms。署名の無いプロセスが新しいファイルを開くときのウイルス対策のスキャンと推定(未確認)。計測の出力は本台帳の作成時点で証跡ファイルを特定できなかった(オーケストレーターの報告による)。
- **保留(テストとして未実行)**: Alt 単独でのメニュー起動と、Windows のメニュー モードへの対策(案 A、`win_keymenu.rs` は未作成、REQUIRES_HUMAN_APPROVAL)は、実機スパイク後の人間判断待ち(ISS-0212 (1)、SPEC-0300-0020 R-1350-3)。OS キー入力の E2E(AC-520-os / AC-1348)は発注者の了承待ち。
- **未実施**: チェックリスト `tests/manual/phase13-menu-viewer-checklist.md` の全項目(MBR-01〜17、VWR-01〜08、HL-01〜06、PRF-01)。release ビルドでの計測(AC-527 の 1,000,000 文字の時間、PRF-01)。リリース判定は人間が行う。

## 2026-10-09 画面文言の日本語統一(SPEC-0300-0019 第1版、SPEC-0300-0009 第16版ほか)テスト実行結果

- 段階 A(文字列不変の移設 → messages.ts 11 本)、段階 B(新しい期待値の単体テスト)、段階 C(値の置換・空の一覧の「項目なし」・aria-label・lang="ja"・Rust の未使用 translate_error_code 削除)。
- 単体: vitest 130 ファイル 2510 件すべて成功、svelte-check 0 エラー(既存 a11y 警告 6)、cargo test 1050 件成功。オーケストレーターが archive の途中キャンセルの期待値(旧「途中まで」)を W-49「ZIPの展開を途中でキャンセルしました」に修正。
- code-reviewer: PR作成可(MUST なし)。SHOULD-1(パスバーの読み上げ名を REGION_NAMES.path から引く)・MINOR(段階 A のコメント残り、同値の別キー extractFailedHeading の統合)をオーケストレーターが修正。SHOULD-2(file-ops と archive のエラーコード表の同文)は設計 H-5 どおり残置。
- E2E で発見・修正: ビューアの「読み込み中…」(R-512 / AC-505 / AC-1210 (ii))が到達不能だった(fileName は内容と同時にしか入らないため、初回読み込み中も「ファイルが選択されていません」)。ローダーに onTaken を追加し、受け渡し後は「読み込み中…」を表示。単体 viewer-content-loader.test.ts を新設、E2E を note から必須の検査に変更。
- E2E `npm run e2e` 全体: 135 PASS / 0 FAIL / 10 SKIP、R-08 PASS。新設 specs/wording.mjs 17 件(AC-646〜648・650〜652、AC-1200〜1208・1210)すべて PASS。クリップボード系もすべて PASS。

## 2026-10-08 ISS-0203 の片付け(ビューア初回表示・AC-949 文言・ビューアの縦スクロールバー)

- (b) ビューア初回表示で本文が出ない: 原因は dev の vite が初回に依存(markdown-it)を見つけてページを強制再読み込みし、一度きりの pending(R-430)を消費した後に読み直したこと(2026-10-06 の p12dev.log 20:30:37「optimized dependencies changed. reloading」)。`app/vite.config.ts` の `optimizeDeps.include` に実行時の依存を列挙して解消。`node_modules/.vite` を消した初回起動でビューアを最初に開き、再読み込みが起きず本文が表示されることを確認。
- (c) AC-949 の文字色の検査対象を画面全体のコンテナに限定(SPEC-0300-0017 第6版。実装・E2E は不変)。
- (d) ビューアの縦スクロールバー: `viewer-theme.css` の `html, body` に `margin: 0`(R-913-3)。実アプリで scrollHeight 768 = clientHeight 768(修正前 784 / 768)。
- vitest 118 ファイル 2383 件成功(R-913-3 の静的テスト1件追加)、svelte-check 0 エラー。E2E `npm run e2e` 全体: 119 PASS / 0 FAIL / 10 SKIP(AC-907 / AC-907-ii は margin 0 と文書のスクロールなしを確認)、R-08 PASS。

## 2026-10-07 絶対パス検査の二重防御(SPEC-0300-0011 第9版ほか5本、ISS-0204〜0206)テスト実行結果

- 発端: ユーザー報告(2026-10-06)。ドライブ直下で Backspace を押すと親を「C:」と計算し、Windows がプロセスのカレントフォルダとして解決 →「C:src」に入り込み上へ戻れない。フロントは fd0f15f で修正。
- 単体: cargo test 1054 件すべて成功(abs_path_tdd ゲート除去済み)、vitest 118 ファイル 2382 件すべて成功、svelte-check 0 エラー(既存 a11y 警告 6)。viewer/guarded_tests.rs の ac514_classify の期待値をオーケストレーターが既存挙動(R-410: 既知拡張子は読まずに判定)に合わせて修正。
- code-reviewer: PR作成可(MUST なし)。SHOULD-1(traceability の状態)対応済み。SHOULD-2(copy/move/archive の取消登録が拒否より前)は設計 §3.12 MINOR-14 どおりとして記録。MINOR の空行は修正。
- E2E npm run e2e 全体: 106 PASS / 0 FAIL / 23 SKIP、R-08 PASS。AC-642(ドライブ直下の Backspace → `C:\`、ルートでは移動しない)PASS、AC-256(履歴先頭の C:src → ホームへフォールバック、項目は残る)PASS、AC-257(履歴・ジャンプリストの不正項目 →「パスが正しくありません。」、移動しない、一覧不変)PASS。SKIP のうち 18 件はクリップボード系で、実行時のユーザーのクリップボードが復元できない画像(Bitmap/PNG)だったため R-09 により SKIP(保護は不変)。
- オーケストレーター実アプリ確認(2026-10-06、fd0f15f): `C:\Users\toshi` → BS → `C:\Users` → BS → `C:\` → BS で移動しない。

## 2026-10-06 Phase 12 ダークテーマ(SPEC-0300-0017 第5版ほか、ISS-0201/0202 承認)テスト実行結果

- `cargo test`: 930件全成功。`npx vitest run`: 117ファイル/2297件全成功。`npx tsc --noEmit`・`npx svelte-check`エラー0(警告6、既存a11y)、`npx vite build`・`cargo build --release`成功。
- code-reviewer(PR作成可、MUST なし): S-1(viewer の背景色テストの強化、変異テストで確認)・S-2(記述の整理)・M-1(トレーサビリティの更新)・M-2(AC 検証区分)・M-4(注記の整理)は修正済み。
- **E2E(`npm run e2e`、3回目実行)**: 108 PASS / 8 FAIL / 10 SKIP / ABORT なし。R-08 PASS。テーマ系はすべて PASS。実行ライト固定(AC-904/906/907/955/1062/1063)、S1 dark 固定(AC-948/906-ii/949/907-ii/955-ii/957-reverse/960)、S2 config なし(AC-959-i/951/953/953-1/957)、S3 AC-917-system、S4 ～ S7 (AC-958-i/ii/iii/tail)、S8 AC-959-ii、S9 AC-959-iii)。
- FAIL 8件は既存クリップボード系(AC-04/05/06/06-4/06-9/1024-1/1052-1/1077)で `Set-Clipboard : Requested Clipboard operation did not succeed`。実行ごとに失敗 ID が変わる(7/5/8件)。単独実行では PASS、クリップボードの内容は保持。環境起因の FLAKY として ISS-0203 を起票(クリップボード操作の競合。リトライ/判定の見直しを test-debugger で検討、ブロッカーではない)。
- SKIP 10件は従来どおり。
- 判別力の注記: この PC の OS はライトのため、ライト固定側の AC(AC-904/906/907/955/1062/1063)は判別力なし(ダーク固定・追従の機能部分で担保。`docs/architecture/traceability.md` に note 記録済み)。
- オーケストレーターによる実アプリ確認(tauri dev、OS ライト、テスト用設定フォルダに ui_theme="dark"): メインはダーク値(body rgb(30,31,34)、文字 rgb(230,230,230)、color-scheme dark、html normal)、ビューアもダーク(rgb(30,30,30)/rgb(221,221,221))、Emulation でライトにすると両方ライト値。ビューアを新規に開く操作3回とも本文表示。起動直後の最初の1回だけ "No file selected" のまま本文が出なかったことがあり、E2E 3回の全体実行では再現せず(本文表示を待つ検査を追加済み、再現時は REPRODUCED と出る)。観察事項として ISS-0203 に追記。
- 仕様への申し送り: SPEC-0300-0017 AC-949 の「body と画面全体のコンテナの…文字色 = rgb(230,230,230)」は、実装・既存規約(body に color を書かない)ではコンテナのみ。E2E はコンテナで検査。表現の確認を ISS-0203 に記録。
- 未実施: `tests/manual/phase12-dark-theme-checklist.md` の目視確認。

## 2026-10-04 Phase 11 OS クリップボード連携(SPEC-0300-0011 第8版ほか)テスト実行結果

- `cargo test`: 864件全成功(AC-06-8 の not_found 項目ごと失敗のバックエンドテスト4件を含む)。`cargo check --release`・`cargo clippy`(clipboard 関連の警告0)成功。`npx vitest run`: 113ファイル/2236件全成功。`npx tsc --noEmit`・`npx svelte-check` エラー0。`+page.svelte` 380行。
- 実装: OS クリップボード(CF_HDROP + Preferred DropEffect)の読み書き。unsafe は `fs_ops/clipboard/clipboard_win.rs` のみ(19ブロック、全てに SAFETY)。新しい外部ライブラリなし(windows-sys の features を3つ追加)。外部由来は常にコピー、切り取りが移動になるのは自分が書いた内容が残っているときだけ(更新番号、0は不明)。
- 実機確認(code-generator): メインウィンドウ HWND を所有者として SetClipboardData 成功、エクスプローラーの貼り付けでアプリのコピーはコピー・切り取りは移動(日本語名・フォルダ含む)、他アプリが書いたファイル一覧の貼り付けは DropEffect の値によらず常にコピー、.lnk は .lnk 自体をコピー、更新番号は CloseClipboard の前後で不変、IsClipboardFormatAvailable で開かずに有無を確認可。
- E2E の安全策(既存の穴の修正を含む): ページ内 IPC スタブを fail-closed 化し、postMessage 経路への切り替わりを検出したら中止(Phase 9/10 の E2E にあった穴)。二重防御として debug 限定の `REFLEXFILES_E2E_FS_SCOPE` でバックエンドがテスト用フォルダ外へのファイル変更9コマンドを拒否。OS クリップボードは FileDrop と DropEffect も退避・復元し、退避後に空にしてから開始。
- E2E: レビュー指摘の修正前の通しで 96 PASS / 0 FAIL / 10 SKIP。修正後の通しは 83 PASS / 0 FAIL / 23 SKIP(利用者のクリップボードに退避・復元できない HTML 形式が入っていたためクリップボード系13件が SKIP)。発注者決定(2026-10-04)により再実行を待たずにコミット。再実行は ISS-0200。AC-06-8 の E2E SKIP は ISS-0199。
- オーケストレーターが実アプリで確認: `+page.svelte` 分割後の配線(ウィンドウ幅の変更で列幅が 720→471→720 に追従、PageDown でフォーカス移動、例外なし)。
- 2026-10-04 追記(ISS-0200 解消): レビュー指摘修正後に再実行。clipboard.mjs の selftest は S-1・S-2 の新ケースを含め全 PASS、`npm run e2e` は 96 PASS / 0 FAIL / 10 SKIP(クリップボード系 11 件すべて PASS)。
- 未実施: `tests/manual/phase11-clipboard-checklist.md` の目視確認。

## 2026-10-03 Phase 10 右クリックメニュー(SPEC-0300-0018)テスト実行結果

- `npx vitest run`: 109ファイル/2113件全成功。`cargo test`: 727件成功。`npx tsc --noEmit`・`npx svelte-check`エラー0(警告6、既存a11y)、`npx vite build`・`cargo build`成功。`+page.svelte` 399行(上限400、次フェーズ前に分割の検討が必要)。
- E2E(`npm run e2e`): 85 PASS / 0 FAIL / 9 SKIP(SPEC-0300-0018 分は 33 PASS / 4 SKIP)。SKIP の AC-1027/1040/1041/1042 は一覧の再読込をテストから起こせない(ファイル監視なし・変更系 IPC はスタブ)ため単体テストで担保。R-08(実設定フォルダ無変更)PASS。パスのコピーは SPEC-0400-0001 R-09 どおり OS クリップボードを退避・復元し、実行後も元のテキストのまま。
- 実機確認(ISS-0191、code-generator): preventDefault で WebView2 標準メニューが止まる(入力欄では出る)、CDP の右クリックで pointerdown(2) が届き contextmenu は右ボタンを離した時に発火、Shift+F10/ContextMenu キー由来は pointerdown が無いことで判別可能(pointerType は mouse のため使えない)、メニューを閉じた後の navigator.clipboard.writeText が成功(外部依存・WebView2設定の追加なし)、ダブルクリック2回目の detail は CDP では検証不可([目視])。
- オーケストレーターが実アプリ(通常起動)で確認: 行の右クリックでその行を選択してメニュー表示、項目と並び順・区切り・無効項目の理由表示(クリップボードが空です、ZIPファイルではありません)、ステータスバー「フォーカス: 右クリックメニュー」、Escape で閉じて一覧へフォーカス。例外なし。
- code-reviewer SHOULD(対応済み): traceability の状態更新、AC-1078 の前提と R-958 の食い違いを ISS-0192 に起票、スタブ時代のコメント削除。
- 未実施: `tests/manual/phase10-context-menu-checklist.md` の目視確認。

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

