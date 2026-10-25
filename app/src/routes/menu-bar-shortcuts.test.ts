import { describe, expect, it } from "vitest";
import { buildMenuBar, type BarInput } from "$lib/features/menu-bar/menu-model";
import { validateKeymapEntries } from "$lib/features/keyboard/keymap-validate";
import { buildShortcutTable } from "./menu-bar-shortcuts";

// [単体] Spec: SPEC-0300-0020 R-1330 (the text comes from the CURRENT bindings: the default keymap with `input_keymap_custom` applied; the fixed
//   Shift+Enter as is), R-1330-1 + 【レビュー m-3】 (the text is the keymap's CANONICAL form: lower-case and re-ordered input is normalised --
//   Ctrl -> Alt -> Shift, capital letter; Escape -> Esc; Comma -> ","; first of a list; empty = nothing; the exit item shows Ctrl+Q when empty),
//   R-1330-2 (decided once from the bindings fixed at start-up), R-1331, AC-1320, AC-1321, AC-1322.
// Architecture: SPEC-0200-0001 §3.14.1-6 ("ショートカット表: `routes/` builds it with the keyboard feature's `resolveBinding` and normalisation
//   (only routes may use both features) and INJECTS the normal-form strings into menu-bar"; `menu-bar-shortcuts.ts` is the pure function that
//   builds the table), §3.14.1-1 (`shortcut-format.ts` turns the normal form into the display text).
//
// Contract assumed (reported to the implementer):
//   buildShortcutTable(customOverrides: Record<string, string>): Partial<Record<ItemId, string>>
//     - for every item that has a keymap action (all but os_open and copy_path): the binding string(s) of that action after resolveBinding(), each
//       normalised with normalizeKeyString(), joined with ","; an action disabled with "" gives ""
//     - os_open: "Shift+Enter" always (SPEC-0300-0010 §3.1 #2, fixed key)
//     - copy_path: NO entry

const EMPTY: BarInput = {
  targets: [],
  focusRow: null,
  clipboardHasItems: false,
  isZip: () => false,
  checks: { tree: false, hidden: false, size: false, time: false },
  shortcuts: {},
};

function shown(overrides: Record<string, string>): Record<string, string | undefined> {
  const menus = buildMenuBar({ ...EMPTY, shortcuts: buildShortcutTable(overrides) });
  const out: Record<string, string | undefined> = {};
  for (const m of menus) for (const e of m.entries) if (e.type === "item") out[e.id] = e.shortcutText;
  return out;
}

describe("AC-1320: the default keymap, as displayed", () => {
  it("every item shows its R-1310 default (copy_path shows nothing)", () => {
    expect(shown({})).toEqual({
      open: "Enter",
      os_open: "Shift+Enter",
      new_file: "Ctrl+N",
      new_folder: "Ctrl+Shift+N",
      rename: "F2",
      delete: "Delete",
      zip_create: "Ctrl+Alt+Z",
      zip_extract: "Ctrl+Alt+X",
      config_open: "Ctrl+,", // SPEC-0300-0022 R-1670: `settings` shown as 設定ファイルを開く
      config_check: undefined, // no key (R-1671)
      exit: "Ctrl+Q",
      cut: "Ctrl+X",
      copy: "Ctrl+C",
      paste: "Ctrl+V",
      copy_path: undefined,
      select_all: "Ctrl+A",
      clear_selection: "Esc",
      search: "/",
      toggle_tree: "Ctrl+Shift+B",
      toggle_hidden: "Ctrl+H",
      toggle_size: "Ctrl+Shift+S",
      toggle_time: "Ctrl+Shift+T",
      sort_menu: "S",
      go_parent: "Backspace",
      focus_path: "Ctrl+L",
      fuzzy_find_file: "Ctrl+P",
      history: "Ctrl+Y",
      history_jump_list: "Ctrl+J",
      jump_add: "Ctrl+Shift+J",
    });
  });
});

describe("AC-1321: input_keymap_custom = { copy = 'Ctrl+Insert,Ctrl+C', rename = '', search = 'Ctrl+F' }", () => {
  const custom = { copy: "Ctrl+Insert,Ctrl+C", rename: "", search: "Ctrl+F" };

  it("コピー shows the first binding only, 名前の変更 shows nothing, 検索 shows Ctrl+F", () => {
    const s = shown(custom);
    expect(s.copy).toBe("Ctrl+Insert");
    expect(s.rename).toBeUndefined();
    expect(s.search).toBe("Ctrl+F");
  });

  it("the other items are unchanged by the overrides", () => {
    const base = shown({});
    const s = shown(custom);
    for (const id of Object.keys(base)) if (!["copy", "rename", "search"].includes(id)) expect(s[id], id).toBe(base[id]);
  });

  it("the table itself keeps `rename` empty (it is disabled, not missing): the item stays enabled and executable (R-1330-1)", () => {
    const t = buildShortcutTable(custom) as Record<string, string | undefined>;
    expect(t.rename === "" || t.rename === undefined).toBe(true);
  });
});

describe("【レビュー m-3】 normalisation: the keymap's canonical form is displayed, not the text the user wrote", () => {
  it("lower case and any modifier order: ctrl+shift+n and Shift+Ctrl+N both show Ctrl+Shift+N", () => {
    expect(shown({ new_folder: "ctrl+shift+n" }).new_folder).toBe("Ctrl+Shift+N");
    expect(shown({ new_folder: "Shift+Ctrl+N" }).new_folder).toBe("Ctrl+Shift+N");
    expect(shown({ new_folder: "SHIFT+CTRL+n" }).new_folder).toBe("Ctrl+Shift+N");
  });

  it("modifier order is Ctrl -> Alt -> Shift: shift+alt+ctrl+z shows Ctrl+Alt+Shift+Z", () => {
    expect(shown({ zip_create: "shift+alt+ctrl+z" }).zip_create).toBe("Ctrl+Alt+Shift+Z");
  });

  it("a one-letter key is shown upper case: 'q' for exit shows Q; 'x' for sort_menu shows X", () => {
    expect(shown({ exit: "q" }).exit).toBe("Q");
    expect(shown({ sort_menu: "x" }).sort_menu).toBe("X");
  });

  it("escape in any case is shown as Esc", () => {
    expect(shown({ clear_selection: "escape" }).clear_selection).toBe("Esc");
    expect(shown({ clear_selection: "ESCAPE" }).clear_selection).toBe("Esc");
    expect(shown({ clear_selection: "Escape" }).clear_selection).toBe("Esc");
  });

  it("the internal spelling Comma is shown as the symbol", () => {
    expect(shown({ focus_path: "Ctrl+Comma" }).focus_path).toBe("Ctrl+,");
  });

  it("each element of a list is normalised and only the first is shown", () => {
    expect(shown({ copy: "shift+ctrl+f2,ctrl+c" }).copy).toBe("Ctrl+Shift+F2");
  });

  it("multi-key names keep their documented capitalisation: delete -> Delete, f2 -> F2, backspace -> Backspace", () => {
    expect(shown({ delete: "delete" }).delete).toBe("Delete");
    expect(shown({ rename: "f2" }).rename).toBe("F2");
    expect(shown({ go_parent: "backspace" }).go_parent).toBe("Backspace");
  });
});

describe("【レビュー m-3】 the 終了 item", () => {
  it("exit = '' (disabled in the keymap) still shows Ctrl+Q", () => {
    expect(shown({ exit: "" }).exit).toBe("Ctrl+Q");
  });

  it("exit = 'Alt+F4' shows that key (the first one), not Ctrl+Q", () => {
    expect(shown({ exit: "Alt+F4" }).exit).toBe("Alt+F4");
    expect(shown({ exit: "alt+f4,ctrl+q" }).exit).toBe("Alt+F4");
  });
});

describe("fixed and absent entries", () => {
  it("os_open is Shift+Enter whatever the overrides say (it is a fixed key, not an action)", () => {
    expect(shown({ open: "F3" }).os_open).toBe("Shift+Enter");
    expect(shown({ open: "F3" }).open).toBe("F3");
  });

  it("copy_path has no entry in the table (R-1331)", () => {
    expect("copy_path" in buildShortcutTable({})).toBe(false);
    expect("copy_path" in buildShortcutTable({ copy_path: "Ctrl+Shift+C" })).toBe(false);
  });

  it("an override for an action that has no menu item (select_toggle, refresh) does not appear anywhere", () => {
    const t = buildShortcutTable({ select_toggle: "Ctrl+Space", refresh: "F6" });
    expect(Object.keys(t)).not.toContain("select_toggle");
    expect(Object.keys(t)).not.toContain("refresh");
  });

  it("an INVALID override (rejected by the keymap, e.g. delete with Shift) falls back to the default the way resolveBinding does", () => {
    expect(shown({ delete: "Shift+Delete" }).delete).toBe("Delete");
  });
});

describe("AC-1322 through the whole path", () => {
  it("Escape -> Esc, multiple -> first, empty -> nothing", () => {
    const s = shown({ clear_selection: "Escape,Ctrl+G", copy: "Ctrl+Insert,Ctrl+C", rename: "" });
    expect(s.clear_selection).toBe("Esc");
    expect(s.copy).toBe("Ctrl+Insert");
    expect(s.rename).toBeUndefined();
  });
});

describe("the table follows the EFFECTIVE keymap (startup validation drops an invalid override, so the default is shown)", () => {
  const effective = (raw: Record<string, string>): Record<string, string> =>
    validateKeymapEntries(Object.entries(raw).map(([actionId, value]) => ({ actionId, value }))).effective;

  it("copy = 'Ctrl+Insert,Ctrl+C': Insert is not a known key body (SPEC-0300-0010 R-45-4-1), the whole override is rejected at load and Ctrl+C is shown", () => {
    expect(shown(effective({ copy: "Ctrl+Insert,Ctrl+C" })).copy).toBe("Ctrl+C");
  });

  it("a valid list shows its FIRST binding (T-10)", () => {
    expect(shown(effective({ copy: "Ctrl+Shift+C,Ctrl+C" })).copy).toBe("Ctrl+Shift+C");
  });
});
