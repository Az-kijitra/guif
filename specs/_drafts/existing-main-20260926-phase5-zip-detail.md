# 既存仕様調査(main基準): Phase5 ZIP 作成 / 展開 詳細

- 調査日: 2026-09-26
- 対象リポジトリ: `C:\Users\toshi\git\ReflexFiles`
- 調査基準: `main` ブランチの内容のみ(`git show main:<path>` / `git grep main`)。作業ツリーは参照していない。
- 引用形式: `main:<repo相対パス>:<行番号>`。「不明」はコードから読めない事項、「(コード読解)」は実行していない推論。
- 作成: codebase-researcher(本文)。Write不可のためオーケストレーターがファイル化(本文は要点を保持して整理)。**オーケストレーター直接確認済みの項目は末尾「Evaluator所見」**。

## 0. 対象ファイル(main)

| 領域 | ファイル |
|---|---|
| Rust ZIP本体 | `app/src-tauri/src/fs_ops_archive.rs`(168行。`zip_create` :70-109、`zip_extract` :111-168、`zip_safe_path` :13-28、`zip_add_path` :30-68) |
| Rust 事前検証 | `fs_ops_preflight.rs`(`preflight_zip_create` :171-187、`preflight_zip_extract` :189-198) |
| 登録/エラー/依存 | `bootstrap.rs:41-42`、`error.rs:107-110`、`Cargo.toml:39` |
| フロント | `actions/zip.ts`(118行)、`components/modals/ZipModal.svelte`、`page_constants.ts:3`、`utils/keyboard_list.ts:132-144`、`actions/context_menu/context_menu_items.ts:244,341-352`、`utils/tauri_fs.ts:40-54`、`utils/error_format.ts` |
| キーマップ・文言 | `app/src/lib/ui_constants.ts` |
| Phase2共通部品(比較) | `fs_ops_transfer_copy.rs`、`fs_ops_transfer_helpers.rs`、`actions/clipboard.ts`、`PasteConfirmModal.svelte`、`page_lifecycle.ts:122-162` |
| テスト | `app/e2e/tauri/smoke.mjs:669-800`(ハッピーパスのみ) |

### 0.1 骨組み仕様との食い違い(最重要)
SPEC-0300-0006 §2 は `zip_create` / `zip_extract` / **`zip_extract_list_conflicts`** をバックエンドと記すが、**main には `zip_extract_list_conflicts` は存在しない**(登録は `zip_create`/`zip_extract` の2本のみ: `bootstrap.rs:41-42`。`git grep` 該当なし)。これは `new-feature-experiment` 側の追加機能で、main の根拠にならない。**main の展開には衝突検出そのものが無い**。

## 1. ZIP作成(`zip_create`)

- **対象は選択項目のみ**。選択0件なら何もしない(`actions/zip.ts:12-13`)。カーソル項目へのフォールバックは無い(コピー等は `clipboard.ts:42-45` でフォールバックあり)。無選択時はステータス表示もなし。
- 起動: キー(`keyboard_list.ts:132-136`)、右クリック「ZIPに圧縮」(`context_menu_items.ts:341-346`)。**メニューバーにZIP項目なし**。
- 既定出力: `${currentPath}\<名前>.zip`(1件=`<最後の要素>.zip`〈拡張子は追加。`a.txt`→`a.txt.zip`〉、複数=`archive.zip`)(`actions/zip.ts:14-19`)。モーダルで**出力ファイルのフルパスを自由編集**可。空はエラー。**拡張子の自動付与・検証なし**。
- **既存名との衝突処理なし**: `File::create` が既存ファイルを無警告で切り詰め上書き(`fs_ops_archive.rs:90-91`)。作成には上書き確認UIもない。親ディレクトリは `create_dir_all`。
- 圧縮: ファイルは `Deflated`(レベルは `SimpleFileOptions::default()`、既定値は不明)、ディレクトリは `Stored`。**パスワード指定時のみAES-256**(`with_aes_encryption(AesMode::Aes256, …)`、ZipCryptoでは作らない、ファイルエントリのみ)。圧縮方式/レベルを選ぶUIなし。ファイルは `read_to_end` で全体をメモリへ(:58-65)。
- 再帰走査。**空ディレクトリは保持**(:37-41)。**隠し/システムファイルもフィルタなしで含める**。シンボリックリンク/ジャンクションは辿って実体を格納、ループ検出なし(循環で無限再帰しうる。コード読解)。読み取り不能ファイルは即Err。
- アーカイブ内構造: 各入力項目を**その項目名をルートとして**格納(親パスは含めない)。区切りは `/` に正規化。`file_name()` がNone(`C:\`等)は `"invalid path"`(`code=`形式でない、:96)。
- **出力先が入力フォルダ内を指す場合の自己包含検査なし**(コード読解)。Phase 2の `destination_inside_source` 相当なし。
- **進捗イベントなし、キャンセル不可**(`emit_progress`/`cancel_requested`未使用。`OpKind`は Copy/Move のみ)。コマンドは同期 `pub fn`。
- **最初のエラーで全体中断**(`?`)、`Result<(),String>` のみ(成功/失敗件数や一覧なし)。**途中失敗で不完全なZIPが出力先に残る**(`finish()`は成功パスのみ)。
- ログは成功時のみ(`ZIP_CREATE`)。
- Windows: 長いパス(>260)・予約名・禁止文字の専用検証なし。名前は `to_string_lossy()`。

## 2. ZIP展開(`zip_extract`)

- **対象は選択ちょうど1件**(`actions/zip.ts:29-31`)。**ZIP判定は拡張子 `.zip` のみ**(マジック非検査)。他形式は展開不可。
  - キー起動はカーソル項目の拡張子を検査するが(`keyboard_list.ts:137-144`)、対象は**選択**を使う → **判定と対象が別ソース**(カーソルがZIPでも選択0件/複数なら無反応、カーソルと選択が別なら非ZIPが対象になりうる)。`zip_extract` はカーソルが非ZIPのとき `preventDefault` して true を返す(キーを消費して無反応)。
  - 右クリックは単一選択かつ拡張子 `.zip` のとき有効。
- **展開先**: 既定は現在ディレクトリ(**ZIP名のサブフォルダは作らない**=既存ファイルと混在)。ダイアログで編集可。存在しなければ `create_dir_all`。
- **衝突検出なし・常に上書き**: `File::create` で既存を無警告切り詰め(:156-157)。UI手当ては「上書きの可能性を理解した」チェック(`zip.overwrite_confirm`、**毎回必須・初期OFF**、未チェックだと「解凍」ボタンdisabled)のみ。**何が衝突するかは表示されない**。上書き/スキップ/リネーム/「すべてに適用」なし。ファイルとディレクトリの同名衝突は全体中断(コード読解)。
- **zip-slip対策**: `zip_safe_path`(:13-28)が `Path::components()` で分解し、`Normal`のみ連結、`CurDir`は無視、それ以外(`..`/ルート/ドライブ)は `invalid_path` で全体中断。`file.name()`(生の名前)を使用、`enclosed_name()`は不使用。
  - **限界**: 展開先内の既存シンボリックリンク/ジャンクション経由の脱出は検査しない。**エントリを順に処理する途中で検査**するため、不正エントリ到達前の正常エントリは書き込み済み(事前の全件検証なし)。Windows予約名・末尾ドット・`:`(ADS)の専用検証なし。単体テストなし。
- **文字コード**: デコード処理はコードになく `file.name()` をそのまま使用。CP932等(UTF-8フラグ無し)の扱いは zip crate 7 既定に依存 → **不明(要実験)**。
- **パスワード**: `Some` なら全エントリを `by_index_decrypt` で開く。`aes-crypto` feature あり(従来型ZipCryptoの復号可否は不明)。誤パスワードは `format_error(Unknown, "ZIP_BAD_PASSWORD")`(:137)。暗号化ZIPをパスワード無しで開くと `code=unknown; …`。試行回数制限(3回)は**フロントのみ**で、モーダルを開き直せばリセット。パスワードは作成/展開とも任意(空は null)。
- **破損ZIP**: `ZipArchive::new` 失敗 → `code=unknown; <crateメッセージ>`(専用コードなし)。エントリ単位の破損は `io_error` で中断し**書きかけファイルが残る**。
- **zip bomb対策なし**(展開サイズ・エントリ数・圧縮率・空き容量の上限チェックなし)。ストリーム展開のためメモリは有界。
- **進捗・キャンセルなし**、二重実行防止なし。**最初の1件のエラーで全体中断、ロールバックなし**(展開済みが残る)。書込は最終名へ直接(アトミックでない)。
- feature は `deflate`,`aes-crypto` のみ(`Cargo.toml:39`)→ **Deflate/Stored以外のZIPは展開不能**(コード読解)。

## 3. フロントエンド

- フロー(`actions/zip.ts`): `openZipCreate`/`openZipExtract` → モーダル → `runZipAction`(出力先空チェック→展開時は試行回数と上書き確認チェック→IPC→成功でモーダルを閉じ現在ディレクトリを再読込)。
- ダイアログ(`ZipModal.svelte`): 作成=対象件数、展開=ファイルパス+試行回数(n/3)、出力先、パスワード、展開のみ上書き確認チェック、エラー1行。選択肢は「作成/解凍」「キャンセル」で**既定は実行側(index 0)**(Phase 2 R-35の既定=キャンセルと逆)。
- **既定キー(`ui_constants.ts`を開いて転記)**: `zip_create` windows `Ctrl+Alt+Z`(:98)/ vim `Z`(:146)、`zip_extract` windows `Ctrl+Alt+X`(:99)/ vim `Shift+Z`(:147)。
- 完了後: 選択は解除、カーソルは先頭(`page_dir.ts:63-65`)。**作成/展開物へカーソルを移す処理なし、成功ステータスなし**。展開先が現在ディレクトリ以外でも遷移しない。ファイル監視(300ms)が処理中の書込で再読込し選択がリセットされうる(コード読解)。
- **バグ(コード読解・確度高・未実行)**: 誤パスワード時、`formatError` が `code=unknown` を翻訳文言「不明なエラー」に置換して返すため(`error_format.ts:19-25`)、`message.includes("ZIP_BAD_PASSWORD")`(`actions/zip.ts:83`)が常に偽となり、**試行回数カウントと専用メッセージが到達不能**。

## 4. バックエンド構造

| 項目 | 内容 |
|---|---|
| コマンド | `zip_create(items, destination, password)` / `zip_extract(path, destination, password)`、戻り値 `Result<(), String>`(`bootstrap.rs:41-42`) |
| エラー | `"code=<code>; <message>"`。ZIP由来の多くは `unknown` |
| クレート | `zip = { version = "7", default-features = false, features = ["deflate","aes-crypto"] }`(`Cargo.toml:39`) |
| 実行モデル | 同期 `pub fn`、進捗/キャンセルなし |
| 事前検証 | 作成: 空items/空destination/不存在のみ。展開: 空パス/ZIP不存在のみ(展開先の種別は検査しない) |

## 5. Phase 2(コピー/移動)との関係
**共通実装はほぼなく完全に別実装**。ZIPは `OpSummary`(個別失敗継続)、`op_progress`、`op_cancel`、`FailureModal`、`PasteConfirmModal` をいずれも使わない。SPEC-0300-0011 の R-30/R-30-1(無確認上書き禁止・`conflict`拒否)/R-33/R-35/R-40〜R-45(進捗モーダル+キャンセル。R-45 は copy/move 限定)は **main のZIPでは満たされていない**。ZIPの扱いは SPEC-0300-0006 側で決める必要がある。

## 6. ドキュメントとコードの食い違い
- `user_manual.ja.md:175-176` のキー(`Ctrl+Alt+Z`/`Ctrl+Alt+X`)は windows 既定と一致。vim(`Z`/`Shift+Z`)の記載なし。
- **英語マニュアルにZIP作成/展開の記載なし**(日本語と非対称)。全マニュアルにパスワード/AES/上書き確認/展開先/zip-slip拒否/非対応形式の説明なし。

## 7. テスト
Rust `#[cfg(test)]` なし(zip-slip・パスワード・破損ZIPのテストなし)。e2e はハッピーパスのみ(パスワード・衝突・非ASCII名・キャンセルなし)。フロント単体テストなし。

## 8. 不整合・バグ・未配線(要点)

| # | 内容 | 種別 |
|---|---|---|
| 1 | SPEC の `zip_extract_list_conflicts` は main に無い。展開に衝突検出が無い | 仕様とmainの不整合(ISS-0003関連) |
| 2 | 誤パスワード検出が機能しない(§3のバグ) | バグ |
| 3 | 展開は既存ファイルを無警告上書き(確認は内容非表示のチェック1個) | 安全性 |
| 4 | 作成は同名ZIPを確認なしで上書き | 安全性 |
| 5 | 失敗時のロールバックなし(不完全ZIP・部分展開が残る) | 残骸 |
| 6 | 展開の起動判定(カーソル拡張子)と対象(選択1件)が別ソース | 不整合 |
| 7 | 作成は選択0件でフォーカス項目にフォールバックしない・無反応 | 非対称 |
| 8 | 確認ダイアログの既定フォーカスが実行側(Phase 2 R-35と逆) | Phase2整合 |
| 9 | 進捗・キャンセルなし | 未実装 |
| 10 | zip bomb対策なし | セキュリティ |
| 11 | zip-slipは`..`/絶対パスを拒否するが、既存リンク経由・全件事前検証・予約名は無い | セキュリティ |
| 12 | 出力先が入力内なら自身を走査しうる(自己包含検査なし) | 潜在バグ |
| 13 | シンボリックリンク循環で無限再帰しうる | 潜在バグ |
| 14 | 作成時ファイル全体をメモリへ読む | 性能 |
| 15 | エラー形式が不統一(`"invalid path"`)、ZIP由来の大半が `unknown` | 不整合 |
| 16 | 完了後ステータスなし・カーソルは先頭・監視で処理中に選択リセット | UX |
| 17 | CP932/UTF-8フラグの実挙動は不明 | 要実験 |
| 18 | Deflate/Stored以外は展開不能 | 機能制限 |

## 9. 人間判断が必要になりそうな論点

1. 展開時の衝突解決方式(Phase 2 R-30/R-33のダイアログ+すべてに適用/ZIP独自の衝突一覧/自動連番/`conflict`拒否)。
2. 作成時の同名ZIP衝突(上書き確認/自動連番/拒否)。
3. 展開先の既定(現在ディレクトリ直下/ZIP名のサブフォルダ)、展開先の編集可否。
4. 操作対象の決定(作成=選択、無ければフォーカス1件へ揃えるか/展開の起動条件をカーソル基準か選択基準に統一/複数ZIP一括展開)。
5. 進捗・キャンセル(Phase 2 R-40〜R-45を適用するか)。キャンセル時の残骸の扱い。
6. 途中失敗の方針(作成は一時ファイル→リネーム/展開は失敗時ロールバックか継続して失敗一覧か中断か)。
7. セキュリティ要件(zip-slipの強化、zip bomb上限の数値、予約名・ADSの拒否)。
8. ZIP以外の形式の扱い(main は `.zip` のみ)。
9. パスワード付きZIP(対応するか。暗号方式AES-256固定でよいか〈Windows標準エクスプローラーはAES非対応〉、誤パスワード検出の修正、試行回数制限、パスワードのログ非出力)。
10. 文字コード(CP932 ZIPの文字化け対策の要否。zip crate 7 の既定挙動の実験が先)。
11. 作成時の特殊ファイル(隠し/システム/リンク/空ディレクトリ/自己包含/長いパス)。
12. 導線(メニューバー項目の有無、既定キー `Ctrl+Alt+Z`/`Ctrl+Alt+X`・vim `Z`/`Shift+Z` の踏襲。SPEC-0300-0010との整合)。
13. 完了後の挙動(成功ステータス、作成物/展開物へのカーソル移動・選択、処理中の監視再読込の抑止)。
14. エラー体系(ZIP専用エラーコードの追加、Phase 2 R-85との整合)。
15. ごみ箱との関係(上書きされるファイルの退避)。

---

## Evaluator所見(オーケストレーター直接検証、2026-09-26)

`git show main:<path>` で以下を直接確認し、調査本文と一致した。
- 既定キー: `ui_constants.ts` 98-99(windows `Ctrl+Alt+Z`/`Ctrl+Alt+X`)、146-147(vim `Z`/`Shift+Z`)。
- `bootstrap.rs:41-42` にZIPコマンドは `zip_create`/`zip_extract` の2本のみ。`git grep zip_extract_list_conflicts main -- app` は該当なし。
- `zip_safe_path`(:13-28)は `Normal` のみ連結、`CurDir` 無視、それ以外は `invalid_path`。
- 誤パスワード判定: Rust `fs_ops_archive.rs:137` が `ZIP_BAD_PASSWORD` を `unknown` コードで返し、`actions/zip.ts:83` が `message.includes("ZIP_BAD_PASSWORD")` を判定。`error_format.ts:19-25` は翻訳キー(`failure.code.unknown`)が存在すれば翻訳文言を返すため、上記バグの構造は成立する(実行は未確認)。
- `Cargo.toml:39`: `zip = { version = "7", default-features = false, features = ["deflate", "aes-crypto"] }`。

未確認(「不明」のまま): zip crate 7 のCP932既定挙動、同期コマンドのスレッドモデル、ModalShellのフォーカス戻し、検索バー/PathBar入力中のZIPキー有効性。
