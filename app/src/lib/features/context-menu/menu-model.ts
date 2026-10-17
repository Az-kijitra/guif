// SPEC-0300-0018 R-1030~R-1043, R-1056, R-1130 / SPEC-0200-0001 §3.9.2, §3.9.7,
// §3.9.17.2/.3. Menu items, their order and enabled/disabled reasons, and the
// execution-time recheck (planExecution). Pure, DOM-free; imports no other
// feature.

import { SHARED_SENTENCES } from "$lib/shared/messages";
import { MENU_ITEM_LABELS, MENU_NOTICES, MENU_REASONS } from "./messages";

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

// SPEC-0300-0021 R-1553 / SPEC-0200-0001 §3.16.8: a registered external app is a DYNAMIC item `ext:<registration index>`, never a `MenuItemId`
// (the static ids, `MENU_ITEM_LABELS` and `planExecution` are untouched).
export type ExternalMenuItemId = `ext:${number}`;

// The id of any menu entry: a static item or a registered app.
export type MenuEntryId = MenuItemId | ExternalMenuItemId;

export interface MenuExternalApp {
  index: number;
  label: string;
}

export type MenuKind = "row" | "blank";

export type MenuEntry =
  | { type: "item"; id: MenuEntryId; label: string; enabled: boolean; reason?: string }
  | { type: "separator" };

export interface MenuInput {
  kind: MenuKind;
  targets: readonly MenuTarget[];
  clipboardHasItems: boolean;
  isZip: (name: string) => boolean;
  // SPEC-0300-0021 R-1553 / R-1560: the usable registrations in order (absent = none). Never a shortcut text (R-1033).
  externalApps?: readonly MenuExternalApp[];
  // The current folder, the BLANK menu's target (R-1532): "" = none decided, which disables the registered items of the blank menu.
  directory?: string;
}

// What the menu remembers from the moment it was opened (R-1042: never
// re-evaluated while shown).
export interface MenuSnapshot {
  kind: MenuKind;
  targets: readonly MenuTarget[];
  clipboardHasItems: boolean;
  directory: string;
  // SPEC-0300-0021 R-1532 / R-1535: the right-clicked row of a ROW menu (null / absent for the blank menu): the target of a registered app.
  rowTarget?: MenuTarget | null;
  entries: readonly MenuEntry[];
  cursor: { x: number; y: number };
}

export type ExecutionPlan =
  | { kind: "run"; id: MenuItemId; targets: readonly MenuTarget[] }
  | { kind: "notice"; message: string }
  | { kind: "noop" };

export const REASON_ONE_ONLY = MENU_REASONS.oneOnly;
export const REASON_FOLDER = MENU_REASONS.folder;
export const REASON_NOT_ZIP = MENU_REASONS.notZip;
export const REASON_CLIPBOARD_EMPTY = MENU_REASONS.clipboardEmpty;

const LABELS: Record<MenuItemId, string> = MENU_ITEM_LABELS;

type Layout = ReadonlyArray<MenuItemId | "---" | "@ext">;

// R-1030 / R-1031: the fixed order (a separator is never first, last or doubled).
const ROW_LAYOUT: Layout = [
  "open", "os_open", "---", "@ext", "---", "copy", "cut", "paste", "copy_path", "---", "delete", "rename", "---", "zip_create", "zip_extract",
];
const BLANK_LAYOUT: Layout = ["new_file", "---", "paste", "---", "@ext"];

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

// R-1560: the row menu's registered items are always enabled; the blank menu's need a current folder (decided when the menu opens).
function externalEntry(app: MenuExternalApp, input: MenuInput): MenuEntry {
  const id = `ext:${app.index}` as const;
  if (input.kind === "blank" && input.directory === "") return { type: "item", id, label: app.label, enabled: false, reason: SHARED_SENTENCES.noTarget };
  return { type: "item", id, label: app.label, enabled: true };
}

// R-1031 / R-1032: a separator is never first, last or doubled (a layout with no registered item drops the slot and one neighbour).
function compact(entries: readonly MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "separator" && (out.length === 0 || out[out.length - 1].type === "separator")) continue;
    out.push(entry);
  }
  while (out.length > 0 && out[out.length - 1].type === "separator") out.pop();
  return out;
}

export function buildMenu(input: MenuInput): MenuEntry[] {
  if (input.kind === "row" && input.targets.length === 0) return [];
  const layout = input.kind === "row" ? ROW_LAYOUT : BLANK_LAYOUT;
  const apps = input.externalApps ?? [];
  const entries = layout.flatMap((slot): MenuEntry[] => {
    if (slot === "---") return [{ type: "separator" }];
    if (slot === "@ext") return apps.map((app) => externalEntry(app, input));
    const result = evaluateItem(slot, input);
    const base = { type: "item" as const, id: slot, label: LABELS[slot], enabled: result.enabled };
    return [result.reason === undefined ? base : { ...base, reason: result.reason }];
  });
  return compact(entries);
}

const NOTICE_NO_SELECTION = MENU_NOTICES.noSelection;
const NOTICE_NO_TARGET = MENU_NOTICES.noTarget;
const NOTICE_EXTRACT_ONE_AT_A_TIME = MENU_NOTICES.extractOneAtATime;

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
