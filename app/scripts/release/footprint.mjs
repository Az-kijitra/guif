// What the installer writes or creates (SPEC-0600-0001 AC-1470, design SPEC-0200-0001 3.15.4 as corrected by 3.15.13 3).
// This is the single source for audit-state.mjs and for the manual checklist. Node built-ins only.
//
// afterUninstall (uninstall with the "delete the application data" check left off):
//   removed   = must be gone
//   remains   = is correct to remain
//   unchanged = read only, never changed

/** @type {{ id: string, label: string, location: string, afterUninstall: "removed" | "remains" | "unchanged" }[]} */
export const FOOTPRINT = [
  {
    id: "R1",
    label: "アンインストール情報(BundleIdentifier の印を含む)",
    location: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReflexFiles",
    afterUninstall: "removed",
  },
  {
    id: "R2",
    label: "前回のインストール先(既定値)と親キー",
    location: "HKCU\\Software\\reflexfiles\\ReflexFiles (and the parent HKCU\\Software\\reflexfiles)",
    afterUninstall: "remains",
  },
  {
    id: "R3",
    label: "インストール言語の値(対話と /P のとき書かれる)",
    location: "HKCU\\Software\\reflexfiles\\ReflexFiles value `Installer Language`",
    afterUninstall: "remains",
  },
  {
    id: "R4",
    label: "旧製品の検出と WebView2 の有無の判定(読み取りのみ)",
    location:
      "HKCU / HKLM (64 and 32) ...\\CurrentVersion\\Uninstall, and ...\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    afterUninstall: "unchanged",
  },
  {
    id: "R5",
    label: "自動起動の値(インストーラーは書かず、アンインストールが消す)",
    location: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run value `ReflexFiles`",
    afterUninstall: "removed",
  },
  {
    id: "F1",
    label: "実行ファイル",
    location: "%LOCALAPPDATA%\\ReflexFiles\\ReflexFiles.exe",
    afterUninstall: "removed",
  },
  {
    id: "F2",
    label: "アンインストーラー",
    location: "%LOCALAPPDATA%\\ReflexFiles\\uninstall.exe",
    afterUninstall: "removed",
  },
  {
    id: "F3",
    label: "インストール先のフォルダー(空のとき消える)",
    location: "%LOCALAPPDATA%\\ReflexFiles",
    afterUninstall: "removed",
  },
  {
    id: "S1",
    label: "スタートメニューのショートカット(サブフォルダーは作らない)",
    location: "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\ReflexFiles.lnk",
    afterUninstall: "removed",
  },
  {
    id: "S2",
    label: "デスクトップのショートカット(/S と /P では常に作る)",
    location: "[Environment]::GetFolderPath('Desktop')\\ReflexFiles.lnk",
    afterUninstall: "removed",
  },
  {
    id: "S3",
    label: "ジャンプリスト等の最近使った項目(AppUserModelId dev.reflexfiles.successor)",
    location: "AppUserModelId dev.reflexfiles.successor (Windows が管理)",
    afterUninstall: "removed",
  },
  {
    id: "T1",
    label: "WebView2 のブートストラップ(ランタイムが無いときだけ取得。一覧の対象外)",
    location: "%TEMP%\\MicrosoftEdgeWebview2Setup.exe",
    afterUninstall: "remains",
  },
  {
    id: "W1",
    label: "WebView2 ランタイム(ある場合のみ導入。OS の共有部品)",
    location: "WebView2 Runtime (EdgeUpdate Clients {F3017226-FE2A-4295-8BDF-00C3A9A7E4C5})",
    afterUninstall: "remains",
  },
  {
    id: "D1",
    label: "アプリが作る設定と WebView2 のデータ(インストーラーは書かない)",
    location: "%APPDATA%\\dev.reflexfiles.successor and %LOCALAPPDATA%\\dev.reflexfiles.successor",
    afterUninstall: "remains",
  },
  {
    id: "M1",
    label: "中断時の残り(印だけの Uninstall\\ReflexFiles と空のインストール先)",
    location:
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ReflexFiles (BundleIdentifier only) and an empty %LOCALAPPDATA%\\ReflexFiles",
    afterUninstall: "remains",
  },
];
