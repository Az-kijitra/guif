# 既存仕様調査(main基準): Phase 11 OS クリップボード連携

- 調査日: 2026-10-03 / 対象: `C:\Users\toshi\git\ReflexFiles` の `main`(`git show main:` / `git grep main`)のみ
- 作成: codebase-researcher(本文)。Write 不可のためオーケストレーターがファイル化(要点を保持)。オーケストレーターが `main:app/src-tauri/src/clipboard.rs:174-194` と `main:app/src/lib/actions/clipboard.ts:84-108` を直接確認済み。

## 重要な発見(オーケストレーター確認済み)
- **承認済み SPEC-0300-0011 R-19-1 の根拠記述は事実と異なる。** R-19-1 は「main も Preferred DropEffect の読み取り経路を持たず、移動判定はアプリ内部の切り取り状態のみに依拠していた」とするが、main は貼り付け時に `Preferred DropEffect` を読み、値が 2 なら `cut = true` として `fsMove`(移動)していた(`clipboard.rs:176-192`、`clipboard.ts:106`)。エクスプローラーで切り取ったファイルを main で貼り付けると移動になっていた。
- 発注者決定(2026-10-03): 外部で切り取られたファイルは**常にコピー**(2026-09-23 の決定 ISS-0044-e を維持)。根拠の記述だけを「main は読んで移動していたが、元ファイルが消える事故を防ぐため意図的に踏襲しない」に訂正する。
- SPEC-0300-0018 の「R-1033」はペーストの有効条件ではない(ショートカット表示を付けない条項)。有効条件の正本は §5 の表・P-1005・R-1040 / AC-1024。

## A. main の実装
- Rust(`main:app/src-tauri/src/clipboard.rs`、`clipboard_cmds.rs`): `clipboard_set_files(paths, cut, effect)` / `clipboard_get_files() -> {paths, cut}`。`windows` crate 0.61(Win32_Foundation / System_DataExchange / System_Memory / UI_Shell)。書き込みは OpenClipboard → EmptyClipboard → DROPFILES(fWide=1)+ UTF-16 二重 null の CF_HDROP → `Preferred DropEffect`(copy=1、move=2)。読み取りは GetClipboardData(CF_HDROP) + DragQueryFileW、DropEffect==2 なら cut。失敗や CF_HDROP なし・空なら内部クリップボードへフォールバック。unsafe を多用し隔離なし。GlobalAlloc 後の失敗経路で GlobalFree しない、ハンドルをロックせず HDROP として使う、OpenClipboard(None) のリトライなし(いずれも推測、踏襲しない方がよい)。
- フロント(`main:app/src/lib/actions/clipboard.ts`): コピー/カットはアプリ内を先に更新し OS にも書く(OS 失敗はエラー表示、内部は保存済み)。貼り付けは OS にパスがあれば OS、無ければ内部。どちらも空なら「クリップボードにファイルがありません」。カットの貼り付けは移動。**貼り付け後もクリップボードを空にしない**。テキストのパスは解釈しない(CF_HDROP のみ)。UNC の特別扱いなし。衝突は確認ダイアログ(上書き / スキップ / キャンセル)、同一フォルダは除外。
- 右クリックメニューの「ペースト」(`context_menu_state.ts:42-49`): OS にパスがあるか内部が非空なら有効。メニューを開くたびに OS を読む。

## B. 新リポジトリの現状
- 承認済み SPEC-0300-0011 第7版: R-14 / R-14-1、R-15(OS へ CF_HDROP)、R-16(アプリ内カットで DropEffect=MOVE、出力側のみ)、R-17(OS 取得失敗時は内部へフォールバック)、R-18(`clipboard_set_files` / `clipboard_get_files`)、R-19 / R-19-1(外部は常にコピー)、R-15-1(段階導入、R-15〜R-18 と AC-04 / 05 / 06 / 06-1 は GAP)、§12-r(OPEN)。ISS-0108(承認B 外部依存、2026-09-26 見送り)、ISS-0189(b)(テキスト上書き後のペースト)。
- SPEC-0300-0018: ペーストはアプリ内のみで判定(P-1005)、R-1060-4(パスのコピーはアプリ内クリップボードを変えない)、R-1061(GAP を充足しない)。
- 実装: `features/file-ops/clipboard-port.ts`(`ClipboardPort { set, get, clear }`、内部実装のみ、async で差し替え可能)、`clipboard-mode.ts`(`resolvePasteMode`、`ClipboardOrigin` に `"external"` あり)、`file-ops-controller.ts`(カットの移動成功後に clear / 失敗分のみ再 set)、`routes/operations-wiring.ts:41` が差し替え点。Rust 側にクリップボードのコードなし。`windows-sys` 0.61(Win32_Foundation、Win32_Storage_FileSystem)、`#![deny(unsafe_code)]`、unsafe は `archive/win_fs.rs` と `fs/win_drives.rs` のみ(`archive/boundary_tests.rs` の `UNSAFE_ALLOWED_FILES` で固定)。設計書 §3.3 に段階2の方針(`fs_ops::clipboard`、ClipboardPort を OS 優先・内部縮退に差し替え)。
- E2E `app/e2e/lib/clipboard.mjs` はテキストのみ対応(CF_HDROP があれば SKIP)。SPEC-0400-0001 R-09 / AC-09 は「テキスト以外は SKIP」。

## 発注者決定(2026-10-03)
1. 外部で切り取られたファイルを貼り付けたときは**常にコピー**(既決維持)。R-16 / R-19-1 などの根拠の記述を訂正する。
2. 実現方法は導入済みの `windows-sys` に features を追加し、unsafe を専用の1ファイルに隔離する(既存の隔離方式と境界テストを拡張)。新しい外部ライブラリは追加しない。
3. 貼り付け時は OS にファイル(CF_HDROP)があれば OS、無ければアプリ内(main どおり)。「パスのコピー」でテキストが入った後もアプリ内が残っていれば貼り付けられる。アプリ内で切り取った後に OS が別の内容になっていたら安全側(コピー)。
4. その他すべて推奨案を採用: 移動の成功後は自分が書いた内容が残っている場合だけ OS クリップボードを空にする / 切り取り時は DropEffect=MOVE を書く / OS への書き込みに失敗してもアプリ内には保存して通知 / テキストのパスは解釈しない / 絶対パスのみ採用し、存在しないものは貼り付け時に個別失敗 / E2E はファイル形式(FileDrop + DropEffect)も退避・復元に対応する。
