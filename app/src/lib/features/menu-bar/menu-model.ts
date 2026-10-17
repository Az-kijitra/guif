// SPEC-0300-0020 R-1301 / R-1310~R-1313 / R-1320 / R-1330 / SPEC-0200-0001 §3.14.1-1. Pure: DOM-free, every value is INJECTED.
// The menus, the items (a fixed layout that never depends on the input, R-1312), the enabling rule and the reason of each item.
// The reasons are the SAME constants the key operations show (SHARED_SENTENCES, AC-1314).

import { SHARED_SENTENCES } from "$lib/shared/messages";
import { formatExitShortcut, formatShortcut } from "./shortcut-format";
import { headingLabel, ITEM_LABELS, MENU_HEADINGS } from "./messages";

export type MenuId = "file" | "edit" | "view" | "go";
export type ItemId =
  | "open" | "os_open" | "new_file" | "new_folder" | "rename" | "delete" | "zip_create" | "zip_extract" | "exit"
  | "cut" | "copy" | "paste" | "copy_path" | "select_all" | "clear_selection" | "search"
  | "toggle_tree" | "toggle_hidden" | "toggle_size" | "toggle_time" | "sort_menu"
  | "go_parent" | "focus_path" | "history" | "history_jump_list" | "jump_add";

// SPEC-0300-0021 R-1552 / SPEC-0200-0001 §3.16.8: a registered external app is a DYNAMIC item `ext:<registration index>`, never an `ItemId`
// (the static ids, `ITEM_LABELS` and the shortcut table are untouched).
export type ExternalItemId = `ext:${number}`;
export type BarItemId = ItemId | ExternalItemId;

export interface BarExternalApp {
  index: number;
  label: string;
  // The FINISHED text (formatted by routes/external-apps-wiring.ts, MINOR-36); absent or "" = no shortcut text.
  shortcutText?: string;
}

export interface BarTarget {
  entryType: "file" | "dir";
  name: string;
}

export interface BarInput {
  // The displayed targets (the selection, else the focused row): n = targets.length.
  targets: readonly BarTarget[];
  // The displayed focused row (the "open" family looks at it, not at the selection).
  focusRow: BarTarget | null;
  clipboardHasItems: boolean;
  isZip: (name: string) => boolean;
  checks: { tree: boolean; hidden: boolean; size: boolean; time: boolean };
  // Normalised binding strings ("Escape", "Ctrl+Insert,Ctrl+C", ""); formatted here.
  shortcuts: Partial<Record<ItemId, string>>;
  // SPEC-0300-0021 R-1552 / R-1560: the usable registrations in order (absent = none) and whether a target can be decided now
  // (the focus row, else the current folder). Only `false` disables the registered items.
  externalApps?: readonly BarExternalApp[];
  externalTargetAvailable?: boolean;
}

export type BarEntry =
  | { type: "separator" }
  | { type: "item"; id: BarItemId; label: string; enabled: boolean; reason?: string; shortcutText?: string; checked?: boolean };

export interface BarMenu {
  id: MenuId;
  label: string;
  ariaLabel: string;
  accessKey: "F" | "E" | "V" | "G";
  entries: BarEntry[];
}

type Slot = ItemId | "---" | "@ext";

// R-1310: the fixed order; a separator is never first, last or doubled.
const LAYOUT: Record<MenuId, readonly Slot[]> = {
  file: ["open", "os_open", "---", "@ext", "---", "new_file", "new_folder", "---", "rename", "delete", "---", "zip_create", "zip_extract", "---", "exit"],
  edit: ["cut", "copy", "paste", "copy_path", "---", "select_all", "clear_selection", "---", "search"],
  view: ["toggle_tree", "toggle_hidden", "toggle_size", "toggle_time", "---", "sort_menu"],
  go: ["go_parent", "focus_path", "---", "history", "history_jump_list", "jump_add"],
};

export const MENU_IDS: readonly MenuId[] = ["file", "edit", "view", "go"];

const LABELS: Record<ItemId, string> = ITEM_LABELS;

const CHECK_KEY: Partial<Record<ItemId, keyof BarInput["checks"]>> = {
  toggle_tree: "tree",
  toggle_hidden: "hidden",
  toggle_size: "size",
  toggle_time: "time",
};

const ENABLED = { enabled: true } as const;

function disabled(reason: string): { enabled: false; reason: string } {
  return { enabled: false, reason };
}

// R-1320: n is the number of displayed targets; the first matching reason wins.
export function evaluateBarItem(id: BarItemId, input: BarInput): { enabled: boolean; reason?: string } {
  const n = input.targets.length;
  const only = input.targets[0];
  switch (id) {
    case "open":
      return input.focusRow === null ? disabled(SHARED_SENTENCES.noSelection) : ENABLED;
    case "os_open":
      if (input.focusRow === null) return disabled(SHARED_SENTENCES.noSelection);
      return input.focusRow.entryType === "file" ? ENABLED : disabled(SHARED_SENTENCES.folderNotAllowed);
    case "rename":
      if (n === 0) return disabled(SHARED_SENTENCES.noSelection);
      return n === 1 ? ENABLED : disabled(SHARED_SENTENCES.renameOneAtATime);
    case "delete":
    case "cut":
    case "copy":
    case "copy_path":
      return n >= 1 ? ENABLED : disabled(SHARED_SENTENCES.noSelection);
    case "zip_create":
      return n >= 1 ? ENABLED : disabled(SHARED_SENTENCES.noTarget);
    case "zip_extract":
      if (n === 0) return disabled(SHARED_SENTENCES.noTarget);
      if (n >= 2) return disabled(SHARED_SENTENCES.extractOneAtATime);
      return only.entryType === "file" && input.isZip(only.name) ? ENABLED : disabled(SHARED_SENTENCES.notZipFile);
    case "paste":
      return input.clipboardHasItems ? ENABLED : disabled(SHARED_SENTENCES.noPasteItems);
    default:
      return ENABLED;
  }
}

// R-1330 / R-1331: the text of the shortcut; copy_path never has one; the exit item shows Ctrl+Q even when its binding is empty.
function shortcutOf(id: ItemId, input: BarInput): string {
  if (id === "copy_path") return "";
  if (id === "exit") return formatExitShortcut(input.shortcuts.exit);
  return formatShortcut(input.shortcuts[id]);
}

function buildItem(id: ItemId, input: BarInput): BarEntry {
  const result = evaluateBarItem(id, input);
  const item: BarEntry = { type: "item", id, label: LABELS[id], enabled: result.enabled };
  if (result.reason !== undefined) item.reason = result.reason;
  const shortcut = shortcutOf(id, input);
  if (shortcut !== "") item.shortcutText = shortcut;
  const checkKey = CHECK_KEY[id];
  if (checkKey !== undefined) item.checked = input.checks[checkKey];
  return item;
}

function buildExternalItem(app: BarExternalApp, input: BarInput): BarEntry {
  const item: BarEntry = { type: "item", id: `ext:${app.index}`, label: app.label, enabled: true };
  if (input.externalTargetAvailable === false) {
    item.enabled = false;
    item.reason = SHARED_SENTENCES.noTarget;
  }
  if (app.shortcutText !== undefined && app.shortcutText !== "") item.shortcutText = app.shortcutText;
  return item;
}

// Expands the `@ext` slot; with no registration the slot AND the separator right after it are dropped (the old menu, AC-1501).
function expandSlots(slots: readonly Slot[], input: BarInput): BarEntry[] {
  const apps = input.externalApps ?? [];
  const out: BarEntry[] = [];
  slots.forEach((slot, i) => {
    if (slot === "@ext") {
      out.push(...apps.map((app) => buildExternalItem(app, input)));
    } else if (slot === "---") {
      if (apps.length === 0 && slots[i - 1] === "@ext") return;
      out.push({ type: "separator" });
    } else {
      out.push(buildItem(slot, input));
    }
  });
  return compact(out);
}

// R-1310: a separator is never first, last or doubled.
export function compact(entries: readonly BarEntry[]): BarEntry[] {
  const out: BarEntry[] = [];
  for (const entry of entries) {
    if (entry.type === "separator" && (out.length === 0 || out[out.length - 1].type === "separator")) continue;
    out.push(entry);
  }
  while (out.length > 0 && out[out.length - 1].type === "separator") out.pop();
  return out;
}

export function buildMenuBar(input: BarInput): BarMenu[] {
  return MENU_IDS.map((id): BarMenu => {
    const heading = MENU_HEADINGS[id];
    return {
      id,
      label: headingLabel(heading.name, heading.accessKey),
      ariaLabel: heading.name,
      accessKey: heading.accessKey,
      entries: expandSlots(LAYOUT[id], input),
    };
  });
}
