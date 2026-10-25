# guif

[![CI](https://github.com/Az-kijitra/guif/actions/workflows/ci.yml/badge.svg)](https://github.com/Az-kijitra/guif/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

`guif` は、Windows 10 / 11 向けに設計された、キーボード操作を中心にしたモダンな GUI ファイラーです（**Tauri 2 + Rust + Svelte 5** 製）。

フォルダーの一覧とツリー表示、ファイル操作（コピー・切り取り・貼り付け・名前の変更・ごみ箱/完全削除・新規作成）、検索、訪問履歴とジャンプリスト、ZIP 圧縮と展開、内蔵テキスト/Markdown/画像ビューア、外部アプリ連携、設定ファイル (`config.toml`) による柔軟なカスタマイズを備えています。

CUI/TUI ファイラー `tuif` と共通の配色テーマ・フォント・配置設計を採用しており、端末と GUI で一貫した操作感と統一された視覚体験を提供します。

---

## インストール

### 方法 1: リリースインストーラーを実行（推奨）

1. [Releases](https://github.com/Az-kijitra/guif/releases) から最新のインストーラー `guif_0.3.0_x64-setup.exe` をダウンロードして実行します。
2. 画面の案内に従って進めます。インストール先は既定で `%LOCALAPPDATA%\guif` です（現在のユーザーのみ、管理者権限不要）。
3. インストールが終わったら、スタートメニューの「guif」から起動します。

> **SmartScreen の警告が出たとき**
> 本インストーラーにはコード署名がないため、Windows の SmartScreen が「Windows によって PC が保護されました」という警告を出すことがあります。
> 警告が出た場合は、「詳細情報」を選び、表示される「実行」ボタンを押して進めてください。

### 方法 2: ソースコードからビルドする場合

<details>
<summary>ビルド手順を表示</summary>

### 必要要件
- Windows 10 または Windows 11 (64 ビット版)
- Rust 1.75 以上 (`cargo`)
- Node.js 20 以上 (`npm`)
- Microsoft Edge WebView2 ランタイム

```powershell
# クローン
git clone https://github.com/Az-kijitra/guif.git
cd guif/app

# 依存パッケージのインストール
npm install

# 開発サーバー起動 (ホットリロード付き)
npm run tauri dev

# 単体テストの実行
npm test          # フロントエンド (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml  # バックエンド (Rust)

# リリースバイナリ・インストーラーのビルド
npm run tauri build
```
</details>

---

## 主な特徴

- **キーボード中心ナビゲーション**: 矢印キー移動、Shift+矢印による範囲選択、Space 選択、Tab / Ctrl+Tab によるペイン切替、Enter 実行など、キーボードだけでスムーズに操作可能。
- **ファイル一覧 & ツリービュー**: 多段カラム表示に対応したファイル一覧とフォルダーツリー。ツリー幅や表示・非表示（`Ctrl+Shift+B` または `T`）は自由に調整可能。
- **内蔵ファジー検索 (Quick Open)**: `Ctrl+P` または `Ctrl+F` で検索パレットを呼び出し、カレントフォルダー配下の全ファイルを再帰的かつインクリメンタルに検索して素早く移動。
- **tuif-look 外観 & Nerd Fonts アイコン**: CUI ファイラー `tuif` と共通の配色パレット、Monospace 等幅フォント、Nerd Fonts によるファイル種別アイコン表示に対応。外観設定は `config.toml` からカスタマイズ可能。
- **Windows エクスプローラー連携**: `CF_HDROP` クリップボード形式にネイティブ対応。エクスプローラーと `guif` の間で相互にファイルのコピー＆貼り付けが可能。
- **内蔵ビューア**: テキスト・Markdown・画像のプレビューに即座に対応（Enter キー）。Markdown の構文強調表示や文字コードの自動判別をサポート。
- **ZIP 圧縮・展開**: Windows 標準の CP932 (Shift_JIS) エントリ名に対応し、文字化けすることなく ZIP ファイルの圧縮と展開を実行可能。
- **外部アプリで開く**: 選択したファイルやフォルダーを、VS Code、Windows Terminal、エクスプローラー、GitHub Desktop など任意のエディタ・ツールで起動。
- **設定ファイルと検証機能**: `Ctrl+,` で `config.toml` を直接編集でき、書き方の構文エラーや未知のキーを検出する「設定ファイルのチェック」機能を内蔵。

---

## 設定ファイル（手軽なカスタマイズ）

メニューバーの「ファイル」→「設定ファイルを開く」(`Ctrl+,`) を選ぶと、既定のエディタで設定ファイル (`%APPDATA%\dev.guif.app\config.toml`) が開きます。

初回はすべての設定項目の説明と既定値が書かれた雛形が自動生成されます。設定フォルダーには見本 `config.sample.toml` も配置されます。

設定ファイルの書き方を確かめたいときは、「ファイル」→「設定ファイルのチェック」で構文や項目名を事前に検証できます。

---

## アンインストール

Windows の「設定」→「アプリ」（「インストールされているアプリ」または「アプリと機能」）から「guif」を選んでアンインストールします。

アンインストール画面で「アプリのデータを削除する」のチェックを外したままにすると、設定と履歴は保持され、再インストール時に引き継がれます。設定も含めて全削除したい場合はチェックを入れて実行してください。

---

## ドキュメント

- [ユーザーマニュアル](docs/user_manual.md): 操作方法、全ショートカットキー、設定項目、トラブルシューティングの詳細
- [仕様台帳](specs/_registry.md): 機能・アーキテクチャの仕様一覧
- [トレーサビリティ台帳](docs/architecture/traceability.md): 仕様 ⇔ 実装 ⇔ テストの対応表
- [変更履歴](CHANGELOG.md): リリース履歴

---

## ライセンス

[MIT License](LICENSE)
