# 既存仕様調査(main基準): Phase3 検索(部分一致 + 正規表現)詳細

- 調査日: 2026-09-24
- 対象リポジトリ: `C:\Users\toshi\git\ReflexFiles`
- 調査基準: 「main」ブランチのコミット時点の内容のみ。すべて `git -C "C:/Users/toshi/git/ReflexFiles" show main:<path>` および `git -C ... ls-tree -r main --name-only` で取得したBlob/一覧を根拠にしている。作業ツリー(`new-feature-experiment` + 未コミット差分)は一切参照していない。
- `main` の HEAD: `a62954e89d5c5b6d57248585bb53068088399822`(`git log main --oneline -1` = `a62954e test`)。
- 対象仕様(骨組み): `C:\Users\toshi\git\project\specs\features\SPEC-0300-0004-search.md`(本調査では読んでいない)。
- 一次出典: コード(`git show main:<path>`)。
- 引用形式: `main:<repo相対パス>:<行番号>`。

---

## 0. 対象ファイル一覧(main)

| 領域 | ファイル |
| --- | --- |
| UIコンポーネント | `app/src/lib/components/SearchBar.svelte`、`app/src/lib/components/PageOverlays.svelte`、`app/src/lib/components/PageShell.svelte`、`app/src/lib/components/FileList.svelte` |
| 状態/エフェクト配線 | `app/src/lib/page_search.ts`、`app/src/lib/effects/search.ts`、`app/src/lib/page_init_section_inputs/search.ts`、`app/src/lib/page_init_sections/init_search.ts`、`app/src/routes/+page.svelte`(`$effect`) |
| アクション(起動/確定/キャンセル) | `app/src/lib/actions/history.ts`(`applySearch`/`clearSearch`/`onSearchKeydown`)、`app/src/lib/page_menu_runtime_inputs_from_state.ts`(`openSearch`) |
| コアロジック(マッチング) | `app/src/lib/utils/history.ts`(`applySearchFilter`) |
| キー入力/キーマップ | `app/src/lib/utils/keyboard_list.ts`(グローバル`search`アクション)、`app/src/lib/utils/keyboard_menu.ts`(INPUTフォーカス時のガード)、`app/src/lib/utils/keyboard_overlay.ts`、`app/src/lib/ui_constants.ts`(既定キーマップ・文言)、`app/src/lib/menus/edit.ts`(Editメニュー項目) |
| 選択/フォーカスとの関係 | `app/src/lib/actions/selection.ts`(`selectAll`)、`app/src/lib/utils/selection.ts`(`selectAllEntries`) |
| ステータスバー連携 | `app/src/lib/effects/status.ts` |
| バックエンド(Rust) | 検索専用コマンドなし。`app/src-tauri/src/fs_query_cmds.rs`(`fs_list_dir`)のみがディレクトリ一覧取得APIとして存在(非再帰) |

---

## 1. Phase1調査(`new-feature-experiment`基準)前提の再確認

Phase1調査で「検索は`app/src/lib/page_search.ts`・`components/SearchBar.svelte`・`effects/search.ts`にフロントエンド完結で実装されており、対応する専用バックエンドコマンドは見当たらない」とされていた前提は、main ブランチでも成立することを確認した。

- `main:app/src-tauri/src/fs_query_cmds.rs:1-60`に列挙されている`#[tauri::command]`は fs_list_dir / fs_read_text / fs_is_probably_text / fs_read_image_data_url / fs_read_image_normalized_temp_path / fs_get_properties / fs_dir_stats / fs_text_viewport_info / fs_read_text_viewport_lines のみで、検索・フィルタ用コマンドは存在しない。
- `app/src-tauri/src/*.rs` 全体を `git ls-tree -r main` で確認し、fn search や "search" 文字列を含むRustソースは見つからなかった。
- 実体は `main:app/src/lib/utils/history.ts:83-105` の applySearchFilter 関数(JS/TS、フロントエンド)で、entries(表示中ディレクトリの一覧、fs_list_dir の結果)を対象にJS側で Array.prototype.filter するだけの実装。

---

## 2. 検索の起動・UI

### 2.1 起動手段と既定キー

| 手段 | 内容 | 根拠 |
| --- | --- | --- |
| グローバルキーマップアクション search | handleListKey内で ctx.matchesAction(event, "search") が真なら event.preventDefault() 後 ctx.setSearchActive(true) のみを呼ぶ(フォーカス移動なし) | `main:app/src/lib/utils/keyboard_list.ts:353-357` |
| 既定キー(Windowsプロファイル) | search: "/" 【訂正: 当初"Ctrl+F"と誤記していたが誤り。後述の訂正注記参照】 | `main:app/src/lib/ui_constants.ts:83` |
| 既定キー(Vimプロファイル) | search: "/" | `main:app/src/lib/ui_constants.ts:131` |
| Editメニュー項目 | menuから openSearch() を呼ぶ。ショートカット表示は getMenuShortcut("search") | `main:app/src/lib/menus/edit.ts:118-119` |
| openSearch(メニュー経由専用の起動関数) | state.searchActive = true から await tick() の後 overlayRefs.searchInputEl?.focus() を呼び、明示的にinputへフォーカスする | `main:app/src/lib/page_menu_runtime_inputs_from_state.ts:17-20` |

重要な差異: グローバルキー(Ctrl+Fまたは/)経由の起動(keyboard_list.ts:353-357)は searchActive を立てるだけでフォーカス処理を一切呼んでいない。一方、Editメニュー経由の起動(openSearch, page_menu_runtime_inputs_from_state.ts:17-20)は tick() 後に searchInputEl.focus() を呼ぶ。両者で起動後の入力欄フォーカスの有無が異なる。SearchBar.svelteのinput自体にautofocus属性は無い(main:app/src/lib/components/SearchBar.svelte:12-19)。この差がコードレビュー時点の意図的な仕様か実装漏れかは、コードから読み取れないため不明。

### 2.2 表示位置

コンポーネント階層(`main:app/src/lib/components/PageShell.svelte:42-105`)は以下の順:

```
<MenuBar>                       (43行目)
<PageOverlaysBindings>          (45-48行目) SearchBarはここに含まれる(searchActive時のみ描画)
<PathBar>                       (81-87行目、dualレイアウト時は別経路)
<div class="content"> (TreePanel + FileList)  (89-102行目)
<StatusBar>                     (105行目)
```

`PageOverlaysBindings`から`PageOverlays.svelte`内で`{#if searchActive}<SearchBar .../>{/if}`という条件描画(`main:app/src/lib/components/PageOverlays.svelte:164-174`)。つまり検索バーは**MenuBarとPathBarの間**に、`searchActive`がtrueの間だけ挿入表示される(非アクティブ時は完全に非表示、DOMに存在しない)。PathBarより上、ファイル一覧より上という位置関係になる。

### 2.3 クエリ入力・確定・キャンセル

- 入力: `<input type="text" bind:value={searchQuery} ... onkeydown={onSearchKeydown}>`という双方向バインディング(`main:app/src/lib/components/SearchBar.svelte:12-19`)。1文字入力するたびに`searchQuery`(state)が即時更新され、下記2.4の再計算エフェクトが走る(=ライブ絞り込み。デバウンスなし、詳細は4章)。
- 確定操作: `<form onsubmit>`で`event.preventDefault()`後に`applySearch()`を呼ぶ(Enterキー押下または「Apply」ボタン)(`main:app/src/lib/components/SearchBar.svelte:9-14`)。`applySearch()`本体(`main:app/src/lib/actions/history.ts:79-88`):
  - クエリが空(trim後)なら`searchActive`をfalseにして終了(検索バーを閉じる)。
  - クエリが非空なら`updateSearchHistory`で検索履歴に追加し`scheduleUiSave()`するのみ。フィルタ処理自体はこの関数では行わない(既にライブ反映済みのため)。`searchActive`は変更しない(開いたまま)。
  - 正規表現トグルボタン(`searchRegex`)はクリックで即座に`!searchRegex`へトグルされ、フォーム送信は不要(`main:app/src/lib/components/SearchBar.svelte:26-31`)。
- キャンセル(Escapeキー、入力欄内): `onSearchKeydown`が`event.key === "Escape"`を検知し`event.preventDefault()`後`clearSearch()`を呼ぶ(`main:app/src/lib/actions/history.ts:98-101`)。`clearSearch()`は`searchQuery=""`, `searchActive=false`, `searchError=""`にリセットする(`main:app/src/lib/actions/history.ts:91-96`)。「Clear」ボタンからも同じ`clearSearch`が呼ばれる(`main:app/src/lib/components/SearchBar.svelte:33`)。
- 検索履歴呼び出し: 入力欄で`ArrowUp`を押すと履歴の先頭(直近1件)を`searchQuery`にセット、`ArrowDown`は`searchQuery`を空文字にリセット(`main:app/src/lib/actions/history.ts:102-110`)。履歴の上下スクロールや複数件からの選択UIは無い(先頭1件のみ)。

### 2.4 検索終了時のフォーカス復帰

`setSearchActive`は単純なstateセッター(`main:app/src/lib/page_mount_dom_handlers_inputs_from_state.ts:128-131`)であり、`clearSearch`/Escape/検索バー閉鎖経路のいずれにも、ファイル一覧(`listEl`)等へフォーカスを明示的に戻す処理は見つからなかった。`{#if searchActive}`ブロックがfalseになると`<SearchBar>`はDOMから除去されるため、ブラウザの既定動作としてフォーカスは失われる(`document.body`等に移る)と推測されるが、明示的なフォーカス復帰コードはコード上見当たらない(不明)。

---

## 3. 検索対象とマッチング方式

コアロジックは `applySearchFilter(entries, { searchActive, searchQuery, searchRegex, t })`(`main:app/src/lib/utils/history.ts:83-105`)。

```
main:app/src/lib/utils/history.ts:83-105 (要約引用)
export function applySearchFilter(entries, { searchActive, searchQuery, searchRegex, t }) {
  if (!searchActive || !searchQuery.trim()) {
    return { filteredEntries: entries, searchError: "" };
  }
  if (searchRegex) {
    try {
      const re = new RegExp(searchQuery.trim(), "i");
      return { filteredEntries: entries.filter((entry) => re.test(entry.name)), searchError: "" };
    } catch (err) {
      return { filteredEntries: entries, searchError: t("search.invalid_regex") };
    }
  }
  const q = searchQuery.trim().toLowerCase();
  return { filteredEntries: entries.filter((entry) => entry.name.toLowerCase().includes(q)), searchError: "" };
}
```

### 3.1 部分一致検索

- `searchQuery.trim().toLowerCase()`と`entry.name.toLowerCase()`の`String.prototype.includes`による単純な部分一致(大文字小文字を区別しない)(`main:app/src/lib/utils/history.ts:100-104`)。
- 検索対象は`entry.name`(ファイル名/フォルダ名のみ)。`Entry`型の`path`フィールド(`main:app/src/lib/types.ts:19-26`、name: string; path: string;)は一切参照していないため、フルパスは検索対象に含まれない。

### 3.2 正規表現検索

- `searchRegex`(SearchBar内のトグルボタンで切替、`main:app/src/lib/components/SearchBar.svelte:26-31`)がtrueの場合、`new RegExp(searchQuery.trim(), "i")`(常に`i`フラグ=大文字小文字無視付き)を生成し`entry.name`に対して`.test()`する(`main:app/src/lib/utils/history.ts:88-93`)。
- 不正な正規表現の場合は`try/catch`で捕捉し、`filteredEntries: entries`(絞り込みなし、全件表示に戻す)と`searchError: t("search.invalid_regex")`(文言: 英語「Invalid regular expression」/日本語「正規表現が不正です」、`main:app/src/lib/ui_constants.ts:260,681`)を返す(`main:app/src/lib/utils/history.ts:94-97`)。エラーメッセージは`SearchBar.svelte`内で`{#if searchError}<span class="search-error">{searchError}</span>{/if}`として検索バー内にインライン表示される(`main:app/src/lib/components/SearchBar.svelte:36-38`)。一覧やアプリ全体はブロックされず、操作継続可能。

### 3.3 「単一アルファベット文字の大文字小文字正規化」との関係

Phase1で言及されている「単一アルファベット文字の大文字小文字正規化」は、ReflexFiles(main)のコード上ではキーマップのキー文字列正規化の話であり(`normalizeKeyPart`関数、`part.length === 1`なら`part.toUpperCase()`を返す、`main:app/src/lib/utils/keymap.ts:16`)、キーボードショートカットの一致判定(例:「a」と「A」を同じキーとして扱う)に使われるロジックである。

一方、検索のマッチング(3.1/3.2)は`.toLowerCase()`(部分一致側)または正規表現`i`フラグ(正規表現側)によって独立に大文字小文字を無視しており、キーマップ正規化とは無関係な別ロジックである(`main:app/src/lib/utils/history.ts:90,100-103`)。両者は偶然どちらも「大文字小文字を区別しない」という結果になっているだけで、コード上の依存関係・共有関数は無い。

---

## 4. 検索結果の反映方法

### 4.1 `filteredEntries`との関係

- `+page.svelte`に`$effect(() => actions.recomputeSearch());`という副作用が登録されている(`main:app/src/routes/+page.svelte:394`)。Svelte 5のrune`$effect`は、実行時に読み取られたリアクティブ値の変化を追跡して再実行するため、`recomputeSearch`内部で`getEntries()`/`getSearchActive()`/`getSearchQuery()`/`getSearchRegex()`を呼ぶことで、これら4つのうちいずれかが変化するたびに自動的に再実行される(`main:app/src/lib/page_search.ts:26-37`)。
- `recomputeSearch()`は`computeSearchEffect(entries, {...})`から`applySearchFilter(...)`を呼び、結果の`filteredEntries`を`setFilteredEntries`で`state.filteredEntries`に書き込み、`searchError`も同時に更新する(`main:app/src/lib/page_search.ts:26-37`、`main:app/src/lib/page_init_set_inputs_from_state.ts:202-204`)。
- `state.filteredEntries`はFileListコンポーネントの表示専用配列としてそのまま渡される(`main:app/src/lib/components/FileList.svelte:12,62-65`、`fileListProps`経由)。すなわち検索は`filteredEntries`を書き換えることで表示を絞り込む方式であり、Phase1で確定した「`filteredEntries`は表示専用の絞り込み配列」という前提と一致する。
- `searchActive`がfalseまたはクエリが空文字の場合は`filteredEntries = entries`(絞り込みなし、全件)がそのまま返る(`main:app/src/lib/utils/history.ts:84-86`)。つまり検索非アクティブ時は`filteredEntries`は`entries`の単純なミラーとして機能する。

### 4.2 フォーカス・選択状態への影響

- フォーカス: `focusedIndex`は`entries`(全件配列)に対するインデックスとして管理されている(`main:app/src/lib/utils/navigation.ts:6-9,21-28`の`getCurrentVisualIndex`/`getNextIndexByRow`が`entries`と`filteredEntries`を両方受け取り、`entries[focusedIndex]`から現在のエントリを特定してから`filteredEntries`内での見た目上のインデックスに変換するロジック)。検索によって`filteredEntries`が変化しても`focusedIndex`自体(全entries基準)は自動補正されない箇所と、`FileList.svelte`側で`isEntryVisible(entry)`(`filteredEntries.some(...)`)により、フォーカス中のエントリが現在の絞り込み結果に含まれない場合は`aria-activedescendant`を`undefined`にする処理がある(`main:app/src/lib/components/FileList.svelte:35-40`)。つまり、検索でフォーカス中の項目が非表示になった場合、見た目上のアクティブ行表示(ARIA)は消えるが、内部的な`focusedIndex`(全件基準)自体はリセットされない。
- 全選択(Ctrl+A / `select_all`)との整合性: Phase1で決定された「全選択は表示中のみ対象」という仕様とは異なり、ReflexFiles(main)の`selectAll()`は`filteredEntries`ではなく`ctx.getEntries()`(全件、フィルタ前)を対象にしている(`main:app/src/lib/actions/selection.ts:41-45`から`main:app/src/lib/utils/selection.ts:54-61`の`selectAllEntries(entries, focusedIndex)`)。`ctx.getEntries`は`state.entries`(フィルタ前の全件)を返す(`main:app/src/lib/page_actions_page.ts:102`、`getEntries: () => resolve(state.entries)`)。したがって、**ReflexFiles(main)では検索で絞り込み中でもCtrl+Aは検索条件に一致しない項目も含めた全件を選択する**。新プロダクトのPhase1仕様(表示中のみ選択)を踏襲する場合は、この点でReflexFilesの既存挙動から意図的に変更することになる。

### 4.3 検索結果0件の場合の表示

- `FileList.svelte`は`{#if loading} ... {:else if filteredEntries.length === 0} <div class="row">{t("no_items")}</div> {:else} ...`という分岐(`main:app/src/lib/components/FileList.svelte:61-65`)。
- `no_items`の文言は英語「No items」/日本語「項目なし」(`main:app/src/lib/ui_constants.ts:461,881`)であり、検索結果0件専用のメッセージ(例:「一致する項目がありません」)は存在しない。空のディレクトリを開いた場合と同じ汎用メッセージが表示される。
- ステータスバー側では、検索アクティブかつクエリ非空の場合に`status.filter`という項目が追加表示される: `t("status.filter", { query: searchQuery.trim() })`(英語「Filter: {query}」/日本語「絞り込み: {query}」、`main:app/src/lib/effects/status.ts:27-29`、文言は`main:app/src/lib/ui_constants.ts:501,921`)。0件かどうかに関わらず、検索中である旨とクエリ文字列は常にステータスバーに表示される。

---

## 5. パフォーマンス・スコープ

### 5.1 再帰検索の有無

- 検索対象は`entries`、すなわち現在開いているディレクトリの一覧のみ。取得元は`fs_list_dir`コマンド(`main:app/src-tauri/src/fs_query_cmds.rs:8-18`)で、これは単一ディレクトリの一覧を返すAPIであり、再帰的なサブディレクトリ探索を行う引数・実装は無い(`app/src-tauri/src/*.rs`全体をリストしても再帰検索用コマンドは存在しない、0章参照)。
- したがって、サブディレクトリを跨いだ検索は行われない。現在のディレクトリ内(表示中の`entries`)のみが対象。

### 5.2 検索処理方式(即時/デバウンス)

- リポジトリ全体(`app/src`配下)を`debounce`/`throttle`というキーワードで検索したが、該当箇所は0件だった。
- 4.1で述べた通り、`searchQuery`の変更は`bind:value`で即座に state に反映され、`$effect`(`main:app/src/routes/+page.svelte:394`)がその都度同期的に`applySearchFilter`(`Array.prototype.filter`と`String.prototype.includes`または`RegExp.test`)を実行する。デバウンス・スロットリングは一切実装されておらず、キー入力のたびに同期的・即時にフィルタが再計算される。
- `entries`はディレクトリ内の全件が対象であり、件数が多い場合の仮想化(virtual scroll)やチャンク処理も、`FileList.svelte`(`main:app/src/lib/components/FileList.svelte:65`、`{#each filteredEntries as entry}`で全件を`ListRow`として描画)を見る限り実装されていない。

---

## 6. 検索起動時のキーボード割り込みに関する補足知見

検索入力欄にフォーカスがある間、グローバルキー処理(`handleGlobalKey`, `main:app/src/lib/utils/keyboard_global.ts:10-43`)が呼び出し順に`handleOverlayKey`から`handleMenuKey`、`handleTreeKeyBlock`、`handleListKey`の順に試すが、`handleMenuKey`内に以下のガードがある:

```
main:app/src/lib/utils/keyboard_menu.ts:23-50 (要約)
if (active && active.tagName === "INPUT") {
  if (ctx.pathInputEl && active === ctx.pathInputEl) {
    // history_jump_list / history / jump_add_url のみ特別処理
  }
  return true;   // どのINPUTでも、上記以外のキーは処理済みとして無条件にtrueを返す
}
```

このため、`SearchBar.svelte`のinputにフォーカスがある間は、`handleMenuKey`が`true`を返して`handleGlobalKey`が即座にtrueで抜け(`main:app/src/lib/utils/keyboard_global.ts:38-40`)、後続の`handleListKey`(移動・トグル系の全アクション)には到達しない。したがって、Vimプロファイル(`h`/`j`/`k`/`l`等の単一英字キーで移動)であっても、検索入力中にこれらの文字を入力してもファイル一覧側の移動アクションは発火しない。Escape/ArrowUp/ArrowDownは`SearchBar`自身の`onSearchKeydown`(2.3節)がinput要素のkeydownイベントで先に処理する。この補足は検索中のフォーカス・選択状態への影響を評価するうえでの前提情報として記載した。

---

## 7. まとめ(要点表)

| 項目 | ReflexFiles(main)の実装 |
| --- | --- |
| 起動キー(既定) | Windows: `/` / Vim: `/`(両プロファイル同一。`main:app/src/lib/ui_constants.ts:83,131`) |
| 起動時フォーカス | グローバルキー経由: フォーカスしない(`keyboard_list.ts:353-357`) / メニュー経由: フォーカスする(`page_menu_runtime_inputs_from_state.ts:17-20`) |
| 表示位置 | MenuBarとPathBarの間、`searchActive`時のみ表示(`PageShell.svelte:42-48`) |
| 確定操作 | Enter/Applyボタンで`applySearch()`(検索履歴に追加するのみ、フィルタは既にライブ反映済み) |
| キャンセル | Escapeまたは Clear ボタンで`clearSearch()`(クエリ・エラーをリセットし検索バーを閉じる) |
| 部分一致 | `name.toLowerCase().includes(query.toLowerCase())` |
| 正規表現 | `new RegExp(query, "i")`、不正時はエラー文言表示と全件表示へのフォールバック |
| 検索対象 | ファイル名(`entry.name`)のみ。パスは対象外 |
| 検索スコープ | 現在ディレクトリの`entries`のみ(非再帰、専用バックエンドコマンドなし) |
| 反映先 | `filteredEntries`(表示専用配列)を書き換え |
| 0件表示 | 汎用の`no_items`(「No items」/「項目なし」)。検索専用メッセージなし |
| Ctrl+A(全選択)との関係 | `filteredEntries`ではなく`entries`(全件)を対象。新プロダクトのPhase1方針(表示中のみ選択)とは異なる |
| デバウンス | なし。キー入力ごとに同期的即時再計算 |

---

## Evaluator所見(research-verifier + オーケストレーター直接検証、2026-09-24)

research-verifierはBash/git実行ツールを持たないため、`git show main:<path>`の直接再照合ができず、代わりに`C:\Users\toshi\git\ReflexFiles`の作業ツリー(`new-feature-experiment`+未コミット差分)とのRead/Grep照合を行った。その結果、項目2(既定キー)・3(マッチングロジック)・4(`filteredEntries`更新)・5(Ctrl+A全件対象)・6(非再帰・デバウンス無し)・7(INPUT時グローバルキー無効化)は作業ツリーとほぼ完全一致(行番号のズレのみ)であり、内容の正確性が裏付けられた。

一方、**項目1(2.1節・7章の「起動経路によってフォーカス挙動が異なる」という記述)については、作業ツリーの`SearchBar.svelte`に本調査が言及していない大掛かりな多重フォーカス処理(`onMount`での即時focus→`tick()`後再focus→`queueMicrotask`→`requestAnimationFrame`→`setTimeout(0/30/120ms)`の計7回試行)が存在し、`page_menu_runtime_inputs_from_state.ts`の`openSearch`も引用より複雑な多重リトライ構造になっていたため、`PENDING_HUMAN_REVIEW`と判定された。**

この保留点について、オーケストレーターが直接`git -C "C:\Users\toshi\git\ReflexFiles" show main:app/src/lib/components/SearchBar.svelte`および`main:app/src/lib/page_menu_runtime_inputs_from_state.ts`を実行し確認した。結果:

- `main`の`SearchBar.svelte`には`<script>`ブロックのみで`onMount`は一切存在しない(単純な`bind:this={searchInputEl}`のprops宣言のみ、多重フォーカス処理なし)。
- `main`の`openSearch`は引用通り、`state.searchActive = true` → `await params.tick()` → `params.overlayRefs.searchInputEl?.focus()`という単純な1回限りのフォーカス処理のみ。

したがって、research-verifierが提示した2つの仮説のうち**(a)「mainには多重フォーカス処理は無く、調査文書の記述はmain時点として正確」が確定**した。作業ツリー(`new-feature-experiment`)で見つかった7回リトライの多重フォーカス機構は、mainから分岐した後に(おそらくフォーカスのレースコンディション対策として)追加されたものであり、本調査の対象範囲(main基準)には含まれない。

**結論: 2.1節・7章の「グローバルキー起動はフォーカスしない、メニュー起動はフォーカスする」という記述はmain基準として正確であり、そのままspec-writerの入力として採用してよい。**

### 追加訂正(ISS-0055、spec-writer起票→オーケストレーター解消、2026-09-24)

本ドラフト初版は既定キーについて「windowsプロファイル: `Ctrl+F`(`ui_constants.ts:85`)」と記載していたが、これは誤りだった。オーケストレーターが`git -C "C:\Users\toshi\git\ReflexFiles" show main:app/src/lib/ui_constants.ts`を再実行し全体を確認した結果、当該ファイルに`Ctrl+F`という文字列は一切存在せず、windowsプロファイル(83行目)・vimプロファイル(131行目)とも`search: "/"`だった(Phase1調査・Evaluator所見の記載と一致)。原因はcodebase-researcherの誤引用(行番号・値の取り違え)と推定される。上記2.1節・7章・要点表は訂正済み。ISS-0055として起票された「SPEC-0300-0010との食い違い」はこの誤りに起因するものであり、RESOLVED(SPEC-0300-0010は改訂不要)とした。
