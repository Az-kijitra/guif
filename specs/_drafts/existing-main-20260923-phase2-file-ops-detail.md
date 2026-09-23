# 既存仕様調査(main基準): Phase2 ファイル操作(コピー/移動/削除/リネーム/新規作成)詳細

- 調査日: 2026-09-23
- 対象リポジトリ: `C:\Users\toshi\git\ReflexFiles`
- 調査基準: 「main」ブランチのコミット時点の内容のみ。すべて `git -C "C:/Users/toshi/git/ReflexFiles" show main:<path>` で取得したBlobを根拠にしている。作業ツリー(new-feature-experiment + 未コミット差分)は一切参照していない。
- `main` の HEAD: `a62954e89d5c5b6d57248585bb53068088399822`(`git log main --oneline -1` = `a62954e test`)。
- 検証: `git -C ... diff main --stat` で作業ツリーとの差分を確認したところ、本調査対象ファイルの多くに差分がある(例: `fs_ops_delete.rs` 79行差, `fs_ops_transfer_move.rs` 75行差, `fs_ops_transfer_copy.rs` 165行差, `clipboard.ts` 39行差, `ui_constants.ts` 148行差, `keyboard_list.ts` 124行差, `tauri_fs.ts` 39行差, `PasteConfirmModal.svelte` 27行差など)。作業ツリーには新規に `app/src-tauri/src/dragdrop_cmds.rs` 等が追加されているため、D&D関連コードはmainには存在しないことも確認済み。
- 一次出典: コード(`git show main:<path>`)。ドキュメント(`app/src-tauri/resources/user_manual.ja.md`)は突き合わせ用に併記し、食い違いは明記する。コードから読み取れない意図は「不明」と記す。
- 引用形式: `main:<repo相対パス>:<行番号>`。

---

## 0. 対象ファイル一覧(main)

| 領域 | ファイル |
| --- | --- |
| バックエンド(Rust, Tauriコマンド) | `app/src-tauri/src/fs_ops_transfer_copy.rs`(`fs_copy`/`fs_copy_pairs`)、`fs_ops_transfer_move.rs`(`fs_move`)、`fs_ops_transfer_helpers.rs`(`copy_recursively`/`remove_recursively`/`op_cancel`/`emit_progress`)、`fs_ops_delete.rs`(`fs_delete_trash`/`fs_delete_with_undo`)、`fs_ops_rename.rs`(`fs_rename`)、`fs_ops_create.rs`(`fs_create`)、`fs_ops_preflight.rs`(事前検証)、`fs_ops_mutate_helpers.rs`(`validate_name`/`move_recursively`/`undo_trash_root`)、`clipboard.rs`/`clipboard_cmds.rs`(OSクリップボード連携)、`error.rs`(エラーコード体系)、`types/dto.rs`・`types/events.rs`(DTO/イベント)、`bootstrap.rs`(コマンド登録) |
| フロントエンド(状態/ロジック) | `app/src/lib/actions/clipboard.ts`、`actions/file_ops.ts`、`actions/delete.ts`、`actions/edit_entries.ts`、`actions/undo_redo.ts`(参考・Undoスコープ外)、`utils/file_ops.ts`、`utils/tauri_fs.ts`、`utils/keyboard_list.ts`、`actions/context_menu/context_menu_items.ts`、`menus/edit.ts`・`menus/file.ts`、`ui_constants.ts`(既定キーマップ・文言)、`page_lifecycle.ts`(進捗イベント購読) |
| UI(モーダル) | `components/modals/DeleteConfirmModal.svelte`、`RenameModal.svelte`、`CreateModal.svelte`、`PasteConfirmModal.svelte`、`FailureModal.svelte` |
| ドキュメント | `app/src-tauri/resources/user_manual.ja.md` |

---

## 1. コピー/移動

### 1.1 実行手段

| 手段 | コピー | カット(移動) | 貼り付け | 複製(同フォルダにコピー) |
| --- | --- | --- | --- | --- |
| 既定キー(Windowsプロファイル) | `Ctrl+C` (`main:app/src/lib/ui_constants.ts:73`) | `Ctrl+X` (`main:app/src/lib/ui_constants.ts:76`) | `Ctrl+V` (`main:app/src/lib/ui_constants.ts:77`) | `Ctrl+D` (`main:app/src/lib/ui_constants.ts:74`, `duplicate`アクション) |
| キーハンドラ | `main:app/src/lib/utils/keyboard_list.ts:267`(`copySelected`) | `main:app/src/lib/utils/keyboard_list.ts:282`(`cutSelected`) | `main:app/src/lib/utils/keyboard_list.ts:174,287`(`pasteItems`) | `main:app/src/lib/utils/keyboard_list.ts:272`(`duplicateSelected`) |
| 編集メニュー(Edit) | `menu.copy`(`main:app/src/lib/menus/edit.ts:52-57`) | `menu.cut`(`main:app/src/lib/menus/edit.ts:64-69`) | `menu.paste`(`main:app/src/lib/menus/edit.ts:70-75`) | `menu.duplicate`(`main:app/src/lib/menus/edit.ts:58-63`) |
| 右クリックコンテキストメニュー | `context.copy`(選択あり時のみ有効) | `context.cut`(同上) | `context.paste`(空白領域でも表示、可否は`canPaste`で判定) | `context.duplicate`(同上) いずれも`main:app/src/lib/actions/context_menu/context_menu_items.ts:205`以降の`getContextMenuItems`内 |
| ドラッグ&ドロップ | 未実装(main上、`app/src`内に`drag`/`drop`関連のファイル操作コードは見つからず。ヒットしたのは無関係な`viewer/+page.svelte:2056`の`draggable="false"`のみ。作業ツリーには別途D&D実装`dragdrop_cmds.rs`が存在するがmainには無い) | 未実装 | 未実装 | 該当なし |

- コピー/カットは自前の状態変数だけでなく、Windowsのシステムクリップボード(`CF_HDROP`)にも書き込む実装(`clipboard_set_files_windows`, `main:app/src-tauri/src/clipboard.rs`)。カット時は`Preferred DropEffect`フォーマットで`MOVE`を設定する(`set_drop_effect`, `main:app/src-tauri/src/clipboard.rs`)。取得失敗時は内部状態(`internal_clipboard`)にフォールバックする。
- コマンド名: `clipboard_set_files` / `clipboard_get_files`(`main:app/src-tauri/src/clipboard_cmds.rs`、登録は`main:app/src-tauri/src/bootstrap.rs:60-61`)。

### 1.2 対象: 単一/複数選択

- `copySelected`/`cutSelected`/`duplicateSelected`はいずれも「選択中パス配列(`getSelectedPaths()`)、無ければフォーカス中1件」を対象にする共通パターン(`main:app/src/lib/actions/clipboard.ts:41-52`(copy)、`:62-73`(cut)、`main:app/src/lib/actions/file_ops.ts:24-33`(duplicate))。選択0件時は`status.no_selection`を表示して終了。
- 貼り付け(`pasteItems`)はクリップボードの内容全件を対象。単一/複数の区別はなく、`fsMove`/`fsCopy`はいずれも`items: string[]`を受け取るバッチAPI(`main:app/src/lib/utils/tauri_fs.ts:16-23`)。

### 1.3 衝突解決(同名ファイルが既に存在する場合)

バックエンドの事前検証(preflight)の非対称性が確認された:

| API | 既存ターゲットの扱い |
| --- | --- |
| `preflight_create`(新規作成) | `target.exists()`なら`already_exists`エラーで必ず拒否(`main:app/src-tauri/src/fs_ops_preflight.rs:41-56`、判定は`:51`) |
| `preflight_rename`(リネーム) | `to.exists()`なら`already_exists`エラーで必ず拒否(`main:app/src-tauri/src/fs_ops_preflight.rs:58-79`、判定は`:74`) |
| `preflight_transfer`(`fs_copy`/`fs_move`が使用) | 同一パス判定(`same_path`, `:126`)・宛先がコピー元の内部になる場合(`destination_inside_source`, `:134`)は拒否するが、宛先に同名の既存ファイルがあるかは一切チェックしていない(`main:app/src-tauri/src/fs_ops_preflight.rs:97-140`全体を確認済み) |
| `preflight_copy_pairs`(`fs_copy_pairs`が使用) | 同様に同名衝突チェックは無し(`main:app/src-tauri/src/fs_ops_preflight.rs:142-169`) |

つまり`fs_copy`/`fs_move`/`fs_copy_pairs`を直接呼んだ場合、既存ファイルは確認なしで上書きされる(`std::fs::copy`と`std::fs::rename`はいずれもOS標準の上書き挙動に従う。`copy_recursively`は`fs::copy`を使用: `main:app/src-tauri/src/fs_ops_transfer_helpers.rs:41-60`)。バックエンド側には「スキップ」や「リネームして両方残す」といった選択肢は実装されていない。

衝突確認・回避は完全にフロントエンド側(貼り付けフロー限定)で行われている:

1. `pasteItems`(`main:app/src/lib/actions/clipboard.ts:83-114`)がクリップボードのパス群と現在ディレクトリの`entries`を比較し、名前が一致するものを`getPasteConflicts`(`main:app/src/lib/utils/file_ops.ts:54-69`、単純に「ファイル名(basename)が現在フォルダのentry名集合に含まれるか」で判定)で検出。
2. 衝突が1件以上あれば`PasteConfirmModal`を開く(`main:app/src/lib/actions/clipboard.ts:97-102`)。選択肢は「上書き(Overwrite)」「スキップ(Skip)」「キャンセル」の3択(`main:app/src/lib/components/modals/PasteConfirmModal.svelte:66-68`)。
   - デフォルトフォーカス(`pasteConfirmIndex`)は`0`=「上書き」(`main:app/src/lib/components/modals/PasteConfirmModal.svelte:11`)。すなわちEnterキーだけ押すと上書きが実行される既定挙動。
3. 「上書き」選択時(`confirmPasteOverwrite`, `main:app/src/lib/actions/clipboard.ts:14-21`)は、衝突有無に関わらず全パスをそのまま`runPaste`に渡す。バックエンド側に上書き専用フラグは無く、単に「preflight_transferが衝突をチェックしないので上書きされる」という前提に依存している。
   - `runPaste`はcut(移動)なら`fsMove`、そうでなければ`fsCopy`を呼ぶ(`main:app/src/lib/actions/clipboard.ts:116-183`)。
4. 「スキップ」選択時(`confirmPasteSkip`, `main:app/src/lib/actions/clipboard.ts:22-33`)は、衝突していた名前を持つパスを貼り付け対象から除外してから`runPaste`を呼ぶ。個々のファイルごとの動的な衝突判定ではなく、貼り付け前に一括で決めた名前リストで静的にフィルタしている。
5. 「キャンセル」時は状態をクリアするのみ(`main:app/src/lib/actions/clipboard.ts:34-39`)。
6. 「すべてに適用」チェックボックス(`pasteApplyAll`)は表示・状態保持のみで、`confirmPasteOverwrite`/`confirmPasteSkip`/`runPaste`のロジックからは一度も参照されていない(`main:app/src/lib/actions/clipboard.ts`全文を確認、`pasteApplyAll`という識別子自体が出現しない。定義箇所は`main:app/src/lib/components/modals/PasteConfirmModal.svelte:10,55`、既定値`true`は`main:app/src/lib/page_state_defaults.ts:57`)。すなわち現行実装では「上書き/スキップは常に全衝突項目に一括適用」であり、チェックボックスをオフにしても挙動は変わらない(不明: 個別確認UIを将来実装する意図だけが名前に残った未完成状態、と読める。仕様上の意図はコードからは断定できない)。

同一ディレクトリへのコピー(複製)は別経路:

- 通常の「コピー→同じフォルダに貼り付け」は、貼り付け処理内で`isSamePathTarget`により元パスと貼り付け先が同一になるものを丸ごとスキップする(`main:app/src/lib/utils/file_ops.ts:71-85`、呼び出しは`main:app/src/lib/actions/clipboard.ts:127-129`)。スキップされた件数はステータスバーに`(skipped N)`として表示(`main:app/src/lib/actions/clipboard.ts:180-183`)。つまり同一フォルダへの通常ペーストでは複製ファイルは作られない。
- 同一フォルダに複製を作るための専用機能が「複製」(`Ctrl+D`, `duplicateSelected`)であり、これが実質的な「衝突時の自動リネームで両方残す」機能を担っている。
  - 命名規則: `makeDuplicateName(name, existingLower, suffix)`(`main:app/src/lib/utils/file_ops.ts:14-24`)。まず`"<stem><suffix><ext>"`(既定suffix文言` - Copy` / 日本語` - コピー`、`main:app/src/lib/ui_constants.ts:508,888`、キー`duplicate.suffix`)を試し、既存名(大文字小文字無視)と衝突する場合は`"<stem><suffix> (2)<ext>"`, `"<stem><suffix> (3)<ext>"` ... と`i=2..9999`まで増やし、それでも衝突するなら`"<stem><suffix> (<Date.now()>)<ext>"`にフォールバック(`main:app/src/lib/utils/file_ops.ts:16-23`)。
  - 実際の複製処理はUI側で生成した`{from, to}`のペア配列を`fs_copy_pairs`に渡す方式(`buildDuplicatePairs`: `main:app/src/lib/utils/file_ops.ts:87-110`、呼び出しは`main:app/src/lib/actions/file_ops.ts:24-49`)。同一処理内で複数選択ファイルの重複名も、直前に生成した名前をSetに追加してから次のファイルの重複判定に使うため、バッチ内での命名衝突も回避される(`main:app/src/lib/utils/file_ops.ts:96-108`)。

### 1.4 進捗表示・キャンセル

- バックエンドは1件処理するたびに`op_progress`イベント(`EVENT_OP_PROGRESS = "op_progress"`, `main:app/src-tauri/src/types/events.rs:1`)を`start`/`fail`/`done`の3状態で発火する(`emit_progress`, `main:app/src-tauri/src/fs_ops_transfer_helpers.rs:72-93`。呼び出しは`fs_copy`/`fs_copy_pairs`/`fs_move`の各ループ内)。
- フロントエンドはこのイベントを購読しているが、反映先はステータスバーのテキストのみ(パーセンテージ表示・プログレスバー・件数バッジ等は無い)。`start`→「コピー中 <ファイル名> (<index>/<total>)」を3秒間表示、`fail`→エラー内容を4秒間表示、`done`→完了メッセージを1.5秒間表示(`main:app/src/lib/page_lifecycle.ts:143-161`)。
- キャンセル用コマンド`op_cancel`(`main:app/src-tauri/src/fs_ops_transfer_helpers.rs:36-39`、登録は`main:app/src-tauri/src/bootstrap.rs:32`)は存在し、`request_cancel`から各処理ループの`cancel_requested()`チェックで処理を中断する仕組みになっている。
  - しかし、フロントエンドに`opCancel()`(`main:app/src/lib/utils/tauri_fs.ts:56-58`)を呼び出す箇所が定義以外に一つも存在しない(`git grep -n "opCancel" main -- app/src`で定義行1件のみヒット)。キャンセルボタンやキーバインドはUIに存在しない。つまりmain時点では「キャンセル機能はバックエンドに実装済みだが、UIから到達不能」という状態。

### 1.5 バックエンドのコマンド名・シグネチャ

| コマンド | シグネチャ | 戻り値 | 定義 | 登録 |
| --- | --- | --- | --- | --- |
| `fs_copy` | `(items: Vec<String>, destination: String)` | `Result<OpSummary, String>` | `main:app/src-tauri/src/fs_ops_transfer_copy.rs:21` | `main:app/src-tauri/src/bootstrap.rs:29` |
| `fs_copy_pairs` | `(pairs: Vec<CopyPair{from,to}>)` | `Result<OpSummary, String>` | `main:app/src-tauri/src/fs_ops_transfer_copy.rs:158`(構造体は`:15-18`) | `main:app/src-tauri/src/bootstrap.rs:30` |
| `fs_move` | `(items: Vec<String>, destination: String)` | `Result<OpSummary, String>` | `main:app/src-tauri/src/fs_ops_transfer_move.rs:15-19` | `main:app/src-tauri/src/bootstrap.rs:31` |
| `op_cancel` | `()` | `()` | `main:app/src-tauri/src/fs_ops_transfer_helpers.rs:37` | `main:app/src-tauri/src/bootstrap.rs:32` |
| `fs_rename` | `(path: String, new_name: String)` | `Result<(), String>` | `main:app/src-tauri/src/fs_ops_rename.rs:7` | `main:app/src-tauri/src/bootstrap.rs:34` |
| `fs_create` | `(parent: String, name: String, kind: String)` | `Result<(), String>` | `main:app/src-tauri/src/fs_ops_create.rs:7` | `main:app/src-tauri/src/bootstrap.rs:33` |
| `fs_delete_trash` | `(items: Vec<String>)` | `Result<(), String>` | `main:app/src-tauri/src/fs_ops_delete.rs:14` | `main:app/src-tauri/src/bootstrap.rs:45` |
| `fs_delete_with_undo` | `(items: Vec<String>)` | `Result<DeleteSummary, String>` | `main:app/src-tauri/src/fs_ops_delete.rs:51` | `main:app/src-tauri/src/bootstrap.rs:46` |

`OpSummary { ok, failed, total, failures: Vec<OpFailure{path, code, error}> }`、`DeleteSummary`はこれに`trashed: Vec<TrashItem{original, trashed}>`を追加した構造(`main:app/src-tauri/src/types/dto.rs:1-30`)。

### 1.6 重要な実装バグ(移動のフォールバック処理)

`fs_move`(main:app/src-tauri/src/fs_ops_transfer_move.rs:90-108)は次のロジック:

    90: let rename_result = fs::rename(&from, &to);
    91: let result = match rename_result {
    92:     Ok(_) => Ok(()),
    93:     Err(err) => {
    94:         if let Err(copy_err) = copy_recursively(&from, &to) {
                 (copy失敗時) Err(copy_err)
    97:         } else if let Err(remove_err) = remove_recursively(&from) {
                 (remove失敗時) Err(remove_err)
             } else {
    106:             Err(err)   (copy+remove両方成功した場合でも、元のrenameエラーをErrとして返してしまう)
             }
     }
    110: if let Err(err) = result { failed += 1; ... }

`fs::rename`が失敗(例: 別ドライブ間の移動でクロスデバイスエラー)した場合に`copy_recursively` + `remove_recursively`でフォールバックする意図は読み取れるが、両方が成功しても最終的に`Err(err)`(元のrenameエラー)を返してしまうため、実際にはファイルの移動自体は成功しているにもかかわらず、呼び出し元には「失敗(failed += 1)」として報告される(main:app/src-tauri/src/fs_ops_transfer_move.rs:106)。この分岐に到達するのが「別ドライブ間の移動」等の限定的なケースかどうかは動作確認していないため、実際の発生頻度は不明。ただしコードの構造上、フォールバック成功時に成功扱いにする分岐が存在しないことは確実なバグと判断できる。Phase 2で移植する場合は要修正点として扱うべき。

---

## 2. 削除

### 2.1 実装は2系統存在し、UIが使うのは「Undo前提」の方

| コマンド | 実装 | 使用箇所(main) |
| --- | --- | --- |
| `fs_delete_trash` | `trash`クレートの`delete()`を呼び、OS標準のごみ箱(Windowsのリサイクルビン)へ移動(`main:app/src-tauri/src/fs_ops_delete.rs:14-45`、`use trash::delete;`は`:5`) | UI上の「削除」確認からは呼ばれない。呼ばれるのは`actions/undo_redo.ts`のUndo(取り消し)処理内、具体的には「コピーのUndo」(`applyUndoEntry`の`kind === "copy"`分岐、生成物を実際のごみ箱に送って取り消す)と「新規作成のUndo」(`kind === "create"`分岐)。参考コード(main上のファイル、Undo機能自体は本仕様のスコープ外): `app/src/lib/actions/undo_redo.ts:70`, `:130` |
| `fs_delete_with_undo` | 対象をアプリ管理の内部ステージング・フォルダ(`%APPDATA%\ReflexFiles\undo_trash\<epoch_ms>_<index>\<元のファイル名>`)へ`move_recursively`で退避させ、`DeleteSummary.trashed`に元パス⇔退避先パスの対応を返す(`main:app/src-tauri/src/fs_ops_delete.rs:51-113`、退避先算出は`undo_trash_root()`: `main:app/src-tauri/src/fs_ops_mutate_helpers.rs:80-89`、実体は`config_path().parent()/undo_trash`) | UIの削除確認ダイアログ(`DeleteConfirmModal`)から「削除する」を押したとき、実際に呼ばれるのはこちら(`confirmDelete`, `main:app/src/lib/actions/delete.ts:13-42`)。戻り値の`trashed`ペアをUndoスタックに積む(`pushUndoEntry({kind:"delete", pairs})`, `main:app/src/lib/actions/delete.ts:22-29`)。 |

つまり、既存実装の「削除」はOSのごみ箱(リサイクルビン)を使っていない。ユーザーマニュアル(`app/src-tauri/resources/user_manual.ja.md:110`の「削除(ゴミ箱)」、`:170`の操作表)は「ごみ箱」という表現で説明しているが、実体は独自の`undo_trash`ステージング・フォルダへの移動であり、Windowsの「ごみ箱を開く」等では復元できない(ドキュメントと実装の食い違いとして明記)。本物のOSごみ箱を使う`fs_delete_trash`は、UIの削除操作からは直接到達できない設計。

### 2.2 `undo_trash`ステージング・フォルダのクリーンアップ

- `undo_trash_root()`配下に退避したファイルを削除・整理するコードはmain上に見当たらない(`git grep -n "undo_trash" main -- app/src-tauri app/src`は上記の生成箇所のみで、削除・GC処理はヒットしなかった)。Undoスタックの保持件数は`UNDO_LIMIT = 50`(`main:app/src/lib/page_constants.ts:4`)でメモリ上の履歴は制限されるが、これは「アプリ内Undo履歴」の話であり、ディスク上の退避フォルダ自体は上限を超えた古いエントリも消えずに残る可能性がある(不明: 起動時クリーンアップ等の別経路がある可能性は未調査。少なくとも`fs_ops_delete.rs`/`fs_ops_mutate_helpers.rs`にはクリーンアップロジックは無い)。

### 2.3 確認ダイアログ

- `DeleteConfirmModal.svelte`によるモーダル確認(インライン確認ではない)。単一削除時は`delete.single`(ファイル名表示)、複数削除時は`delete.multi`(件数+先頭3件のリスト+`...`)を表示(`main:app/src/lib/components/modals/DeleteConfirmModal.svelte:37-46`)。
- 選択肢は「削除する / キャンセル」の2択(`main:app/src/lib/components/modals/DeleteConfirmModal.svelte:64-67`)。デフォルトフォーカスは`deleteConfirmIndex = 1`(=キャンセル側)(`main:app/src/lib/components/modals/DeleteConfirmModal.svelte:11`)であり、これはPasteConfirmModal(既定が「上書き」側)と対照的な「安全側デフォルト」になっている。
- 呼び出し元は2経路: キーボード`Delete`キー(`main:app/src/lib/utils/keyboard_list.ts:292-306`)と右クリック「削除」(`onContextDelete`, `main:app/src/lib/actions/context_menu/context_menu_items.ts:167-179`)。いずれも選択中の全パスを対象にする。

### 2.4 Undo前提設計であることの確認(ISS-0004との関係)

- 「削除」の実装(`fs_delete_with_undo`)自体が「取り消し可能にするために本物のごみ箱を使わず自前の待避フォルダに移す」設計になっている。ISS-0004でUndo/Redo自体をスコープ外とする決定がされているとのことだが、既存実装の削除ロジックはUndoを前提に設計されているため、Undoを実装しないままこの`fs_delete_with_undo`ロジックだけを移植すると、(a) OSのごみ箱に入らないため利用者がエクスプローラのごみ箱から復元できない、(b) `undo_trash`フォルダが際限なく肥大化する(2.2節)、という2つの問題が生じる。Phase 2で「削除」を実装する場合、既存の`fs_delete_with_undo`をそのまま流用するか、`fs_delete_trash`(本物のごみ箱、Undo非対応)を使うかは要決定事項(既存仕様側の未決事項としてISS-0006に記載されている「削除の方式」に直結)。

---

## 3. リネーム

- 方式はダイアログ(モーダル)。インライン編集(リスト行内でのテキスト編集)ではない。`RenameModal.svelte`は独立したテキスト入力を持つモーダル(`main:app/src/lib/components/modals/RenameModal.svelte:31-45`)。
- 起動: キーボード`F2`(`main:app/src/lib/ui_constants.ts:79`、ハンドラ`main:app/src/lib/utils/keyboard_list.ts:245-250`、フォーカス中の1件が対象)。右クリック「名前変更」(`context.rename`、単一選択時のみ有効: `main:app/src/lib/actions/context_menu/context_menu_items.ts:181-192`、有効条件は`isSingle`)。Editメニューには`rename`項目は無い(`main:app/src/lib/menus/edit.ts`にrename関連の項目なし)。
- 確定/取消: `confirmRename`/`cancelRename`(`main:app/src/lib/actions/edit_entries.ts:23-59,61-67`)。Enter/Escapeキー処理は`handleConfirmCancelKeydown`(モーダル本体と入力欄の両方にバインド: `main:app/src/lib/components/modals/RenameModal.svelte:25-30,37-42`)。
- バリデーション(`validate_name`, `main:app/src-tauri/src/fs_ops_mutate_helpers.rs:7-20`):
  - 空文字(trim後)は拒否(`name is required`)。
  - `.`・`..`は拒否(`invalid name`)。
  - 禁止文字は**9種類**(バックスラッシュ・スラッシュ・コロン・アスタリスク・クエスチョン・ダブルクォート・不等号2種・パイプ)、`main:app/src-tauri/src/fs_ops_mutate_helpers.rs:15`(オーケストレーターがmain直接確認により件数を訂正済み)。Windowsのファイル名禁止文字と一致(NTFSの予約文字と同等)。
  - このチェックは`preflight_rename`と`preflight_create`の両方から共通利用(`main:app/src-tauri/src/fs_ops_preflight.rs:42,59`)。フロントエンド側での追加バリデーションは`confirmRename`内には見当たらず(空文字チェックのみ`main:app/src/lib/actions/edit_entries.ts:27-30`)、禁止文字チェックはバックエンドの`fs_rename`呼び出し失敗時のエラー表示に一本化されている。
- 同名衝突: `preflight_rename`は`to.exists()`なら`already_exists`で無条件拒否(`main:app/src-tauri/src/fs_ops_preflight.rs:74-77`)。上書き確認や自動リネームの選択肢は無い。エラーは`RenameModal`内にインライン表示(`renameError`)される(`main:app/src/lib/actions/edit_entries.ts:44-58`)。

---

## 4. 新規作成

- 方式はダイアログ(モーダル)。`CreateModal.svelte`は「種類(ファイル/フォルダ)を選ぶ`<select>`」+「名前を入力する`<input>`」の2フィールド構成(`main:app/src/lib/components/modals/CreateModal.svelte:33-49`)。
- 起動: キーボード`Ctrl+N`(`main:app/src/lib/ui_constants.ts:80`、ハンドラ`main:app/src/lib/utils/keyboard_list.ts:252-256`は常に`openCreate("file")`を呼ぶ、つまりキーボードからは既定で「ファイル」が選択された状態でダイアログが開く)。右クリック(空白領域含む)「新規作成...」(`context.new`、同様に`openCreate("file")`を渡す: `main:app/src/lib/actions/context_menu/context_menu_items.ts:216-224`)。Editメニュー・Fileメニューのいずれにも「新規作成」項目は存在しない(`main:app/src/lib/menus/edit.ts`・`main:app/src/lib/menus/file.ts`を全項目確認、`new_file`アクションに対応するメニュー項目は無い。`main:app/src/lib/menus/file.ts:32-76`にopen/open_parent/open_explorer/open_cmd/open_vscode/open_git_client/settings/exitのみ)。
  - `openCreate(kind)`(`main:app/src/lib/actions/edit_entries.ts:69-75`)は呼び出し時の`kind`引数で`createType`の初期値を決めるが、キーボード/コンテキストメニューいずれの呼び出しも常に`"file"`を渡すため、「フォルダを新規作成」を直接呼び出す専用のショートカット/メニューはmain時点では存在しない。フォルダを作るには、ダイアログを開いた後に手動で`<select>`を「フォルダ」に切り替える必要がある(`createType`のUI操作、`main:app/src/lib/components/modals/CreateModal.svelte:33-36`)。
  - (参考: 作業ツリー側では`new_folder`という別アクション/既定キー`Ctrl+Shift+N`が追加されているが、mainには存在しない)
- デフォルトの命名: `createName`の初期値は空文字(`ctx.setCreateName("")`, `main:app/src/lib/actions/edit_entries.ts:71`)。Windowsエクスプローラのような「新しいフォルダー」等の自動デフォルト名は付与されない。名前未入力のまま確定しようとすると`error.name_required`のインラインエラーになる(`main:app/src/lib/actions/edit_entries.ts:77-80`)。
- 確定後の編集フロー: 作成後の自動リネーム待機(作成直後に名前を編集できる状態にする)は無い。`confirmCreate`成功後はモーダルを閉じ`loadDir`で一覧を再読込するのみ(`main:app/src/lib/actions/edit_entries.ts:86-92`)。作成された項目へのフォーカス移動・選択状態にする処理は`confirmCreate`内には見当たらない(不明: `loadDir`呼び出し先で自動選択される可能性はあるが、今回はこの関数のみを確認した範囲であり未追跡)。
- 同名衝突: `preflight_create`も`target.exists()`なら`already_exists`で無条件拒否(`main:app/src-tauri/src/fs_ops_preflight.rs:51-54`)。エラーは`CreateModal`にインライン表示(`createError`, `main:app/src/lib/actions/edit_entries.ts:100-112`)。
- 種別の妥当性チェック: `kind`が`"file"`/`"folder"`以外なら`invalid_kind`エラー(`main:app/src-tauri/src/fs_ops_preflight.rs:44-46`)。作成本体は`fs::create_dir`(フォルダ)または`fs::File::create`(ファイル、0バイト)(`main:app/src-tauri/src/fs_ops_create.rs:17-21`)。

---

## 5. エラーハンドリング

### 5.1 エラーコード体系

- バックエンドは2種類のエラー生成経路を持つ:
  1. `PreflightError { code: &'static str, message }`(`main:app/src-tauri/src/fs_ops_preflight.rs:8-19`)。事前検証で使うコードは`invalid_name` / `invalid_kind` / `parent_not_found` / `already_exists` / `same_path` / `not_found` / `invalid_path` / `no_items` / `destination_not_found` / `destination_not_dir` / `destination_inside_source`(preflight各関数内で網羅、行番号は本文2.3節参照)。
  2. `AppErrorKind`(`main:app/src-tauri/src/error.rs:3-31`): `permission_denied` / `not_found` / `conflict` / `invalid_path` / `io_error` / `unknown`。実行時のI/Oエラー(`io::Error`)はここに変換される(`AppErrorKind::from_io`, `main:app/src-tauri/src/error.rs:24-31`)。バッチ処理内の個別失敗コードは`io_error_code()`(`main:app/src-tauri/src/fs_ops_mutate_helpers.rs:69-77`および`main:app/src-tauri/src/fs_ops_transfer_helpers.rs:102-112`、後者は`Interrupted`→`canceled`を追加で持つ)。
  - 両者ともエラー文字列は`"code=<code>; <message>"`という共通フォーマットで返される(`format_error`, `main:app/src-tauri/src/error.rs:104-107`。preflight側も同フォーマットの文字列を手動生成、例: `main:app/src-tauri/src/fs_ops_rename.rs:12-17`)。
- フロントエンドは`formatError()`(`main:app/src/lib/utils/error_format.ts`)で`code=...; ...`パターンを正規表現で解析し(`parseErrorCode`)、`failure.code.<code>`という翻訳キーに変換して表示する。翻訳が無ければ生メッセージにフォールバック。
  - 定義済み翻訳キー(英語版, `main:app/src/lib/ui_constants.ts:441-459`、日本語版は`:821-839`付近): `invalid_path`/`invalid_name`/`invalid_kind`/`parent_not_found`/`destination_not_found`/`destination_not_dir`/`destination_inside_source`/`no_items`/`same_path`/`not_found`/`permission_denied`/`already_exists`/`invalid_input`/`io_error`/`canceled`/`conflict`/`unknown`/`undo_unavailable`/`redo_unavailable`。
  - 「使用中ファイル(Windowsの共有違反)」に対応する専用コードや専用メッセージは見当たらない。Rustの`std::io::ErrorKind`は現行バージョンでは共有違反を明示的な種別に分類しないため、`io_error_code()`の`_ => "io_error"`分岐に落ち、UI上は汎用の「I/Oエラー」表示になる(コードから読み取れる事実。OS依存の詳細な原因メッセージ自体は`FailureModal`の`error`欄にそのまま出る可能性はあるが、コード上の分類としては専用ハンドリングは無い)。

### 5.2 表示経路

| 経路 | 対象操作 | UI |
| --- | --- | --- |
| バッチ処理結果の`OpSummary.failures`/`DeleteSummary.failures` | コピー/移動/複製/日付プレフィックス付与/削除 | `showFailures(title, failures)`が`FailureModal`を開き、失敗した項目(パスのbasename + コード変換済みメッセージ)を先頭5件まで列挙、6件目以降は`...`(`main:app/src/lib/components/modals/FailureModal.svelte:29-36`)。呼び出し例: `main:app/src/lib/actions/clipboard.ts:141-143`(移動失敗時)、`:163-165`(コピー失敗時)、`main:app/src/lib/actions/file_ops.ts:52-54`(複製失敗時) |
| 単発操作(リネーム/新規作成/削除)の例外(try/catch) | リネーム/新規作成/削除 | モーダル内インラインエラー(`renameError`/`createError`/`deleteError`)として表示しつつ、モーダルは閉じずに再入力を促す。加えて`showError(err)`によるトースト的な表示(`main:app/src/lib/actions/edit_entries.ts:44-58,100-112`、`main:app/src/lib/actions/delete.ts:33-42`) |
| Preflight自体の失敗(バッチAPI呼び出し前) | すべて | `Err(format!("code={}; {}", err.code, err.message))`としてTauri側から`reject`され、フロント側の`catch`で`showError`(`fs_ops_transfer_copy.rs`等の各`match preflight_...(...) { Err(err) => {...return Err(...)} }`パターン) |

### 5.3 権限エラー・使用中ファイルの扱い(まとめ)

- 権限エラー(`PermissionDenied`)は`permission_denied`コードとして分類され、UI上は「アクセスが拒否されました」の定型文になる(バッチ処理内は該当項目だけ`failures`に積んで処理継続、単発操作は例外として全体失敗)。
- 「使用中ファイル」を検出して専用の案内(例: 「他のプログラムで使用中です」)を出す実装はmain上には見当たらない。OSからの生エラーメッセージがそのまま`err`欄に出る可能性があるが、コード上は`io_error`の一種として扱われる。
- リトライ/スキップ/続行のような対話的リカバリはバッチ処理では提供されない(1件失敗しても残りの処理は継続され、最終的に`OpSummary.failed`件数として集計・`FailureModal`で列挙されるのみ)。

---

## 6. SPEC-0300-0005 の未確定事項(3節)に対する調査結果まとめ

| 未確定事項(SPEC 3節) | 既存実装の状況 |
| --- | --- |
| 衝突時の解決仕様、確認ダイアログの要否 | 貼り付け(paste)経路のみ「上書き/スキップ/キャンセル」の確認ダイアログがあり、既定選択は「上書き」(1.3節)。それ以外の直接API(`fs_copy`/`fs_move`/`fs_copy_pairs`)は無条件上書き、`fs_rename`/`fs_create`は無条件拒否という非対称な挙動。「すべてに適用」チェックボックスは配線されていない未完成のUI(1.3節末尾)。 |
| 削除の方式(ごみ箱への移動/完全削除の選択可否) | UIが使う`fs_delete_with_undo`はOSのごみ箱ではなくアプリ内ステージング・フォルダへの移動で、クリーンアップ処理も無い。本物のOSごみ箱を使う`fs_delete_trash`はUndo内部処理専用でUIから直接到達不能。ユーザーマニュアルの「ゴミ箱」表記と実装が一致していない(2.1節)。「完全削除」の選択肢はUIに無い。 |
| Undo/Redoの提供有無 | (Phase2では対象外・ISS-0004で決定済みとのこと)。ただし既存の削除実装自体がUndoの存在を前提に設計されている点は移植時の設計判断に影響するため2.4節に記録した。 |
| 進捗表示・キャンセル・大量ファイル時のエラーハンドリング | 進捗表示はステータスバーの短文のみ(プログレスバー無し)。キャンセルAPI(`op_cancel`)はバックエンドに実装済みだがUIから呼ばれておらず到達不能(1.4節)。大量ファイル時のエラーは1件ずつ`failures`に積んで処理続行し、最後に`FailureModal`で先頭5件+`...`として要約表示(5.2節)。 |

## 7. その他、Phase2仕様化時に判断が必要な発見事項(コードから読み取れる事実のみ)

1. `fs_move`のフォールバック成功時に失敗と誤報告するバグ(1.6節)。移植する場合は修正が前提。
2. `fs_copy`/`fs_move`系は宛先の既存ファイルを無条件上書きする(preflightに存在チェックが無い)。フロントエンドの貼り付けフロー以外の経路(例: 将来D&Dを実装した場合)で同じ関数を再利用すると、確認なしの上書きが発生する。
3. `pasteApplyAll`(「すべてに適用」)チェックボックスがロジックに一切影響しない未配線UI(1.3節)。
4. 削除の「ゴミ箱」表記とアプリ内ステージング実装の不一致、およびそのステージング・フォルダのクリーンアップ処理の欠落(2.1, 2.2節)。
5. キャンセルAPIがUIから到達不能(1.4節)。
6. 「新規フォルダ」を1手で作る手段がmainには無い(Ctrl+Nと右クリック「新規作成」はいずれも既定でファイル種別を開く。3節参照)。
7. 「使用中ファイル」を専用に判別するエラーコードは無い(5.3節)。

## Evaluator所見(research-verifier + オーケストレーター、2026-09-23)

research-verifierはBash実行環境を持たず、`main`への直接照合ができなかったため、作業ツリー(new-feature-experiment)との間接照合に留まった。以下の点をオーケストレーターが`git -C "C:\Users\toshi\git\ReflexFiles" show main:<path>`で直接確認し、全ての疑問点を解消した。

1. **fs_moveのフォールバックバグ(1.6節)**: `main:app/src-tauri/src/fs_ops_transfer_move.rs`を直接取得し、`fs::rename`失敗→`copy_recursively`成功→`remove_recursively`成功でも`Err(err)`(元のrenameエラー)を返す構造を確認。調査書の指摘は正確(行番号はおおむね90-108付近)。
2. **禁止文字の数(3節)**: `main:app/src-tauri/src/fs_ops_mutate_helpers.rs:15`を直接確認し、配列は`['\\', '/', ':', '*', '?', '"', '<', '>', '|']`の**9種類**であることを確認。本文の「8種類」記載は誤りだったため訂正済み(9種類が正しい)。
3. **「すべてに適用」(pasteApplyAll)未配線の断定(1.3節)**: research-verifierが作業ツリーの`clipboard.ts`に`confirmPasteKeepBoth`/`setPasteApplyAll`呼び出しの痕跡を発見しPENDING_HUMAN_REVIEWとしていたが、`main:app/src/lib/actions/clipboard.ts`を直接grepした結果、`pasteApplyAll`/`confirmPasteKeepBoth`/`KeepBoth`はいずれも**0件**。調査書の当初の記述(mainには3択のみで「すべてに適用」は未配線)が正しいことを確認した。Keep Both機能一式は`new-feature-experiment`ブランチでの新規追加である。
4. **ユーザーマニュアルの「ゴミ箱」引用行(2.1節)**: research-verifierは作業ツリー版で110行目が無関係な内容だったため引用誤りと指摘していたが、`main:docs/ja/user_manual.ja.md`を直接確認したところ、**110行目に「削除（ゴミ箱）」の記載が実際に存在**した(作業ツリー側で他の記述が追加されたことによる行番号のズレが原因で、research-verifierの間接照合が誤って不一致と判定したもの)。調査書の引用は正確であり、修正不要。
5. **D&D関連のドキュメント/実装の食い違い(D&D未実装の結論への疑義)**: `main:docs/ja/user_manual.ja.md`をgrepした結果、「ゴミ箱」の他に265行目「ドラッグ&ドロップは未対応です。」の1件のみが該当し、research-verifierが懸念した「詳細なD&Dセクション(Ctrl+Alt+左クリック等)」はmain上には存在しなかった(これも`new-feature-experiment`側の新規追加)。マニュアルの記述(未対応)と実装(dragdrop_cmds.rs不在)は整合しており、食い違いは無い。

**結論: 本ドラフトの記述は、上記の「8種類」表記のみ「9種類」に訂正した上で、mainを正確に反映していることを確認した。** spec-writerはこのドラフトをそのまま実装仕様の根拠として使用してよい。
