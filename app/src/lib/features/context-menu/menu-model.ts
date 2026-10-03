// SPEC-0300-0018 R-1030~R-1043, R-1056, R-1130 / SPEC-0200-0001 §3.9.2, §3.9.7,
// §3.9.17.2/.3. Menu items, their order and enabled/disabled reasons, and the
// execution-time recheck (planExecution). Pure, DOM-free; imports no other
// feature.

export type MenuItemId =
  | "open"
  | "os_open"
  | "copy"
  | "cut"
  | "paste"
  | "copy_path"
  | "delete"
  | "rename"
  | "zip_create"
  | "zip_extract"
  | "new_file";

export interface MenuTarget {
  path: string;
  name: string;
  entryType: "file" | "dir";
}

export type MenuKind = "row" | "blank";

export type MenuEntry =
  | { type: "item"; id: MenuItemId; label: string; enabled: boolean; reason?: string }
  | { type: "separator" };

export interface MenuInput {
  kind: MenuKind;
  targets: readonly MenuTarget[];
  clipboardHasItems: boolean;
  isZip: (name: string) => boolean;
}

// What the menu remembers from the moment it was opened (R-1042: never
// re-evaluated while shown).
export interface MenuSnapshot {
  kind: MenuKind;
  targets: readonly MenuTarget[];
  clipboardHasItems: boolean;
  directory: string;
  entries: readonly MenuEntry[];
  cursor: { x: number; y: number };
}

export type ExecutionPlan =
  | { kind: "run"; id: MenuItemId; targets: readonly MenuTarget[] }
  | { kind: "notice"; message: string }
  | { kind: "noop" };

export const REASON_ONE_ONLY = "1件だけ選択してください";
export const REASON_FOLDER = "フォルダには使えません";
export const REASON_NOT_ZIP = "ZIPファイルではありません";
export const REASON_CLIPBOARD_EMPTY = "クリップボードが空です";

const LABELS: Record<MenuItemId, string> = {
  open: "開く",
  os_open: "OSの関連付けで開く",
  copy: "コピー",
  cut: "カット",
  paste: "ペースト",
  copy_path: "パスのコピー",
  delete: "削除",
  rename: "名前の変更",
  zip_create: "ZIPに圧縮",
  zip_extract: "ZIPを解凍",
  new_file: "新規作成...",
};

type Layout = ReadonlyArray<MenuItemId | "---">;

// R-1030 / R-1031: the fixed order (a separator is never first, last or doubled).
const ROW_LAYOUT: Layout = [
  "open", "os_open", "---", "copy", "cut", "paste", "copy_path", "---", "delete", "rename", "---", "zip_create", "zip_extract",
];
const BLANK_LAYOUT: Layout = ["new_file", "---", "paste"];

const ENABLED = { enabled: true } as const;

function disabled(reason: string): { enabled: false; reason: string } {
  return { enabled: false, reason };
}

// R-1040: n is the number of displayed targets; the first matching reason wins.
export function evaluateItem(id: MenuItemId, input: MenuInput): { enabled: boolean; reason?: string } {
  const n = input.targets.length;
  const only = input.targets[0];
  switch (id) {
    case "open":
    case "rename":
      return n === 1 ? ENABLED : disabled(REASON_ONE_ONLY);
    case "os_open":
      if (n >= 2) return disabled(REASON_ONE_ONLY);
      return n === 1 && only.entryType === "file" ? ENABLED : disabled(REASON_FOLDER);
    case "zip_extract":
      if (n >= 2) return disabled(REASON_ONE_ONLY);
      return n === 1 && only.entryType === "file" && input.isZip(only.name) ? ENABLED : disabled(REASON_NOT_ZIP);
    case "paste":
      return input.clipboardHasItems ? ENABLED : disabled(REASON_CLIPBOARD_EMPTY);
    default:
      return ENABLED;
  }
}

export function buildMenu(input: MenuInput): MenuEntry[] {
  if (input.kind === "row" && input.targets.length === 0) return [];
  const layout = input.kind === "row" ? ROW_LAYOUT : BLANK_LAYOUT;
  return layout.map((slot): MenuEntry => {
    if (slot === "---") return { type: "separator" };
    const result = evaluateItem(slot, input);
    const base = { type: "item" as const, id: slot, label: LABELS[slot], enabled: result.enabled };
    return result.reason === undefined ? base : { ...base, reason: result.reason };
  });
}

const NOTICE_NO_SELECTION = "選択がありません";
const NOTICE_NO_TARGET = "対象がありません";
const NOTICE_EXTRACT_ONE_AT_A_TIME = "展開は1件ずつ指定してください";

// R-1056: re-check at execution time against the entries displayed now.
export function planExecution(i: {
  snapshot: MenuSnapshot;
  id: MenuItemId;
  displayed: readonly MenuTarget[];
  isZip: (name: string) => boolean;
}): ExecutionPlan {
  const { snapshot, id } = i;
  const wanted = new Set(snapshot.targets.map((t) => t.path));
  const targets = i.displayed.filter((t) => wanted.has(t.path));
  // Paste / new file do not depend on the targets (they are only reported for the selection restore).
  if (id === "paste" || id === "new_file") return { kind: "run", id, targets };
  if (targets.length === 0) {
    if (id === "zip_create" || id === "zip_extract") return { kind: "notice", message: NOTICE_NO_TARGET };
    if (id === "open" || id === "os_open") return { kind: "noop" };
    return { kind: "notice", message: NOTICE_NO_SELECTION };
  }
  const current = evaluateItem(id, { kind: snapshot.kind, targets, clipboardHasItems: snapshot.clipboardHasItems, isZip: i.isZip });
  if (!current.enabled) {
    if (id === "zip_extract") {
      // Two or more targets is unreachable (the targets are a subset of a menu that was enabled).
      return { kind: "notice", message: targets.length >= 2 ? NOTICE_EXTRACT_ONE_AT_A_TIME : REASON_NOT_ZIP };
    }
    return { kind: "noop" };
  }
  return { kind: "run", id, targets };
}
