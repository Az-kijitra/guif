import { describe, expect, it } from "vitest";

// [単体] Spec: SPEC-0300-0020 §7 (R-1350 1 / 3 activation by F10 and Alt+F/E/V/G, R-1351 Esc / F10 deactivate, R-1352 restore focus,
//   R-1353 heading level keys, R-1354 dropdown keys, R-1355 every other key is swallowed, OS keys are not), AC-1340, AC-1342, AC-1343,
//   AC-1346, AC-1347 [単体]; SPEC-0300-0010 第16版 R-14-5-2 / §3.1 #14.
//   NOT covered (on hold, after the real-machine spike and the client's decision): Alt-alone activation (`createAltTracker`) and anything
//   that depends on plan A (win_keymenu.rs).
// Architecture: SPEC-0200-0001 §3.14.1-1 (`menu-bar-keys.ts`: pure state machine `reduceMenuBarKey(state, event)` ->
//   `{ state, effect, handled, preventDefault }`), §3.14.1-2 (navigation through `shared/menu-navigation`), §3.14.12-9.
//
// Contract assumed (reported to the implementer):
//   type MenuId = "file" | "edit" | "view" | "go";   MENU_ORDER = ["file", "edit", "view", "go"] (readonly)
//   interface MenuBarKeyState {
//     active: boolean;
//     headingIndex: number;                      // 0..3, the highlighted heading (index into MENU_ORDER)
//     openMenu: MenuId | null;                   // the dropdown that is open, or null (heading level)
//     highlightId: string | null;                // the highlighted item of the open dropdown
//     entries: readonly NavEntry<string>[];      // SNAPSHOT of the open dropdown taken when it was opened (R-1322); [] when closed
//   }
//   INACTIVE_STATE: MenuBarKeyState = { active: false, headingIndex: 0, openMenu: null, highlightId: null, entries: [] }
//   interface MenuBarKeyEvent { key; ctrlKey; altKey; shiftKey; metaKey; isComposing?; keyCode? }
//   type MenuBarEffect =
//     | { kind: "none" }
//     | { kind: "activate" }                                              // F10 from inactive: heading 0, dropdown closed
//     | { kind: "open-menu"; menu: MenuId; highlight: "first" | "none" }   // the WIRING builds the snapshot (it may need an async clipboard read, R-1322)
//                                                                          //   and then sets entries / highlightId; the reducer already moved headingIndex / openMenu
//     | { kind: "execute"; id: string }                                   // the menu is already closed in the returned state (R-1341)
//     | { kind: "deactivate" };                                           // the wiring restores the focus (R-1352)
//   reduceMenuBarKey(state: MenuBarKeyState, event: MenuBarKeyEvent): { state: MenuBarKeyState; effect: MenuBarEffect; handled: boolean; preventDefault: boolean }
//   - handled === preventDefault in every case EXCEPT the OS keys, where both are false (R-14-5-2: do not swallow, do not preventDefault)
//
// Module under test (not yet implemented): ./menu-bar-keys.ts

import { INACTIVE_STATE, MENU_ORDER, reduceMenuBarKey, type MenuBarKeyState } from "./menu-bar-keys";

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing: boolean; keyCode: number }> = {},
) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

type E = { type: "item"; id: string; enabled: boolean } | { type: "separator" };
const item = (id: string, enabled = true): E => ({ type: "item", id, enabled });
const sep: E = { type: "separator" };
// a (on), b (off), ---, c (on), d (off), e (on)
const ENTRIES: E[] = [item("a"), item("b", false), sep, item("c"), item("d", false), item("e")];

const headingState = (headingIndex: number): MenuBarKeyState => ({ active: true, headingIndex, openMenu: null, highlightId: null, entries: [] });
const dropdownState = (headingIndex: number, highlightId: string | null, entries: E[] = ENTRIES): MenuBarKeyState => ({
  active: true,
  headingIndex,
  openMenu: MENU_ORDER[headingIndex],
  highlightId,
  entries,
});

describe("MENU_ORDER / INACTIVE_STATE", () => {
  it("the menus are ファイル(file), 編集(edit), 表示(view), 移動(go) from left to right", () => {
    expect([...MENU_ORDER]).toEqual(["file", "edit", "view", "go"]);
  });
  it("the inactive state", () => {
    expect(INACTIVE_STATE).toEqual({ active: false, headingIndex: 0, openMenu: null, highlightId: null, entries: [] });
  });
});

describe("inactive: the activating keys (R-1350 1 / 3) -- F10 and Alt+F/E/V/G", () => {
  it("F10 activates with the first heading highlighted and the dropdown closed (AC-1340)", () => {
    const r = reduceMenuBarKey(INACTIVE_STATE, ev("F10"));
    expect(r.state).toEqual({ active: true, headingIndex: 0, openMenu: null, highlightId: null, entries: [] });
    expect(r.effect).toEqual({ kind: "activate" });
    expect(r.handled).toBe(true);
    expect(r.preventDefault).toBe(true);
  });

  it.each([
    ["f", 0, "file"], ["e", 1, "edit"], ["v", 2, "view"], ["g", 3, "go"],
  ] as const)("Alt+%s opens the %s dropdown directly (T-04, AC-1346); the first enabled item gets the highlight", (k, idx, menu) => {
    for (const key of [k, k.toUpperCase()]) {
      const r = reduceMenuBarKey(INACTIVE_STATE, ev(key, { altKey: true }));
      expect(r.state.active).toBe(true);
      expect(r.state.headingIndex).toBe(idx);
      expect(r.state.openMenu).toBe(menu);
      expect(r.effect).toEqual({ kind: "open-menu", menu, highlight: "first" });
      expect(r.handled).toBe(true);
      expect(r.preventDefault).toBe(true);
    }
  });

  it("any other key while inactive is not the menu bar's business (handled false, nothing changes)", () => {
    for (const e of [ev("a"), ev("ArrowDown"), ev("Enter"), ev("Escape"), ev("Delete"), ev("F2")]) {
      const r = reduceMenuBarKey(INACTIVE_STATE, e);
      expect(r.state).toEqual(INACTIVE_STATE);
      expect(r.effect).toEqual({ kind: "none" });
      expect(r.handled).toBe(false);
      expect(r.preventDefault).toBe(false);
    }
  });

  it("not activating: F10 with a modifier, Ctrl+Alt+F (AltGr-like / ZIP style), Alt+Z, Alt+H (there is no ヘルプ menu)", () => {
    for (const e of [
      ev("F10", { ctrlKey: true }), ev("F10", { shiftKey: true }), ev("F10", { altKey: true }), ev("f", { altKey: true, ctrlKey: true }),
      ev("z", { altKey: true }), ev("h", { altKey: true }),
    ]) {
      const r = reduceMenuBarKey(INACTIVE_STATE, e);
      expect(r.state.active, JSON.stringify(e)).toBe(false);
      expect(r.handled).toBe(false);
    }
  });

  it("IME composition (isComposing, or keyCode 229) never activates (R-1350 2 / R-14-5-1)", () => {
    expect(reduceMenuBarKey(INACTIVE_STATE, ev("F10", { isComposing: true })).state.active).toBe(false);
    expect(reduceMenuBarKey(INACTIVE_STATE, ev("F10", { keyCode: 229 })).state.active).toBe(false);
    expect(reduceMenuBarKey(INACTIVE_STATE, ev("f", { altKey: true, isComposing: true })).state.active).toBe(false);
  });
});

describe("active, heading level (dropdown closed): R-1353", () => {
  it("→ moves to the next heading and wraps (AC-1340: ファイル -> 編集 -> 表示 -> 編集 ...)", () => {
    expect(reduceMenuBarKey(headingState(0), ev("ArrowRight")).state.headingIndex).toBe(1);
    expect(reduceMenuBarKey(headingState(1), ev("ArrowRight")).state.headingIndex).toBe(2);
    expect(reduceMenuBarKey(headingState(3), ev("ArrowRight")).state.headingIndex).toBe(0);
  });

  it("← moves to the previous heading and wraps (ファイル <- wraps to 移動)", () => {
    expect(reduceMenuBarKey(headingState(2), ev("ArrowLeft")).state.headingIndex).toBe(1);
    expect(reduceMenuBarKey(headingState(0), ev("ArrowLeft")).state.headingIndex).toBe(3);
  });

  it("AC-1340 sequence: F10, →→, ←←← lands on 移動 (wrap)", () => {
    let s = reduceMenuBarKey(INACTIVE_STATE, ev("F10")).state;
    const seen: number[] = [];
    for (const k of ["ArrowRight", "ArrowRight", "ArrowLeft", "ArrowLeft", "ArrowLeft"]) {
      s = reduceMenuBarKey(s, ev(k)).state;
      seen.push(s.headingIndex);
    }
    expect(seen).toEqual([1, 2, 1, 0, 3]);
    expect(s.openMenu).toBeNull();
  });

  it("moving between headings never opens a dropdown and the effect is none", () => {
    const r = reduceMenuBarKey(headingState(0), ev("ArrowRight"));
    expect(r.state.openMenu).toBeNull();
    expect(r.effect).toEqual({ kind: "none" });
    expect(r.handled && r.preventDefault).toBe(true);
  });

  it.each(["ArrowDown", "Enter", " "])("%j opens the highlighted heading's dropdown and asks for the first enabled item (R-1353)", (k) => {
    const r = reduceMenuBarKey(headingState(2), ev(k));
    expect(r.state.active).toBe(true);
    expect(r.state.openMenu).toBe("view");
    expect(r.state.headingIndex).toBe(2);
    expect(r.effect).toEqual({ kind: "open-menu", menu: "view", highlight: "first" });
    expect(r.handled && r.preventDefault).toBe(true);
  });

  it("Enter / Space with Ctrl or Shift are 'other keys' (nothing opens); Alt+Space is an OS key (not swallowed)", () => {
    for (const e of [ev("Enter", { ctrlKey: true }), ev("Enter", { shiftKey: true }), ev(" ", { ctrlKey: true }), ev(" ", { shiftKey: true })]) {
      const r = reduceMenuBarKey(headingState(0), e);
      expect(r.state).toEqual(headingState(0));
      expect(r.effect).toEqual({ kind: "none" });
      expect(r.handled).toBe(true);
    }
    const os = reduceMenuBarKey(headingState(0), ev(" ", { altKey: true }));
    expect(os.handled).toBe(false);
    expect(os.preventDefault).toBe(false);
    expect(os.state).toEqual(headingState(0));
  });

  it("Esc deactivates in ONE press and asks the wiring to restore the focus (R-1351, R-1352)", () => {
    const r = reduceMenuBarKey(headingState(1), ev("Escape"));
    expect(r.state).toEqual(INACTIVE_STATE);
    expect(r.effect).toEqual({ kind: "deactivate" });
    expect(r.handled && r.preventDefault).toBe(true);
  });

  it("F10 again deactivates (R-1351)", () => {
    const r = reduceMenuBarKey(headingState(2), ev("F10"));
    expect(r.state).toEqual(INACTIVE_STATE);
    expect(r.effect).toEqual({ kind: "deactivate" });
    expect(r.handled).toBe(true);
  });

  it("↑ / Home / End at heading level do nothing (R-1353 lists only ←→ and ↓ Enter Space) but are swallowed", () => {
    for (const k of ["ArrowUp", "Home", "End"]) {
      const r = reduceMenuBarKey(headingState(1), ev(k));
      expect(r.state).toEqual(headingState(1));
      expect(r.effect).toEqual({ kind: "none" });
      expect(r.handled).toBe(true);
    }
  });
});

describe("active, dropdown open: R-1354", () => {
  it("↓ walks the enabled items only and wraps: a -> c -> e -> a (AC-1342: disabled items and separators are skipped)", () => {
    expect(reduceMenuBarKey(dropdownState(0, "a"), ev("ArrowDown")).state.highlightId).toBe("c");
    expect(reduceMenuBarKey(dropdownState(0, "c"), ev("ArrowDown")).state.highlightId).toBe("e");
    expect(reduceMenuBarKey(dropdownState(0, "e"), ev("ArrowDown")).state.highlightId).toBe("a");
  });

  it("↑ goes backwards and wraps: a -> e -> c -> a", () => {
    expect(reduceMenuBarKey(dropdownState(0, "a"), ev("ArrowUp")).state.highlightId).toBe("e");
    expect(reduceMenuBarKey(dropdownState(0, "e"), ev("ArrowUp")).state.highlightId).toBe("c");
    expect(reduceMenuBarKey(dropdownState(0, "c"), ev("ArrowUp")).state.highlightId).toBe("a");
  });

  it("with no highlight (the dropdown was opened with the mouse): ↓ -> first enabled, ↑ -> last enabled (R-1354 1)", () => {
    expect(reduceMenuBarKey(dropdownState(0, null), ev("ArrowDown")).state.highlightId).toBe("a");
    expect(reduceMenuBarKey(dropdownState(0, null), ev("ArrowUp")).state.highlightId).toBe("e");
  });

  it("Home / End -> first / last enabled item (R-1354 2)", () => {
    expect(reduceMenuBarKey(dropdownState(0, "c"), ev("Home")).state.highlightId).toBe("a");
    expect(reduceMenuBarKey(dropdownState(0, "c"), ev("End")).state.highlightId).toBe("e");
  });

  it("moving the highlight keeps the snapshot and the open menu (R-1322: not re-evaluated while shown), effect none", () => {
    const s = dropdownState(1, "a");
    const r = reduceMenuBarKey(s, ev("ArrowDown"));
    expect(r.state.entries).toBe(s.entries);
    expect(r.state.openMenu).toBe("edit");
    expect(r.state.headingIndex).toBe(1);
    expect(r.effect).toEqual({ kind: "none" });
    expect(r.handled && r.preventDefault).toBe(true);
  });

  it("a dropdown without any enabled item: ↑↓ Home End leave the highlight null, Enter does nothing", () => {
    const none: E[] = [item("x", false), sep, item("y", false)];
    for (const k of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) {
      const r = reduceMenuBarKey(dropdownState(0, null, none), ev(k));
      expect(r.state.highlightId, k).toBeNull();
      expect(r.state.openMenu, k).toBe("file");
      expect(r.effect, k).toEqual({ kind: "none" });
      expect(r.handled, k).toBe(true);
    }
  });

  it("→ switches to the next menu, wrapping, and asks for its first enabled item (R-1354 3, AC-1342)", () => {
    const r = reduceMenuBarKey(dropdownState(0, "c"), ev("ArrowRight"));
    expect(r.state.openMenu).toBe("edit");
    expect(r.state.headingIndex).toBe(1);
    expect(r.state.highlightId).toBeNull();
    expect(r.effect).toEqual({ kind: "open-menu", menu: "edit", highlight: "first" });
    const wrap = reduceMenuBarKey(dropdownState(3, "a"), ev("ArrowRight"));
    expect(wrap.state.openMenu).toBe("file");
    expect(wrap.state.headingIndex).toBe(0);
    expect(wrap.effect).toEqual({ kind: "open-menu", menu: "file", highlight: "first" });
  });

  it("← switches to the previous menu, wrapping", () => {
    expect(reduceMenuBarKey(dropdownState(1, "a"), ev("ArrowLeft")).state.openMenu).toBe("file");
    const wrap = reduceMenuBarKey(dropdownState(0, "a"), ev("ArrowLeft"));
    expect(wrap.state.openMenu).toBe("go");
    expect(wrap.effect).toEqual({ kind: "open-menu", menu: "go", highlight: "first" });
  });

  it("Enter executes the highlighted item: the menu is closed in the returned state (R-1341) and the effect names the item", () => {
    const r = reduceMenuBarKey(dropdownState(0, "c"), ev("Enter"));
    expect(r.effect).toEqual({ kind: "execute", id: "c" });
    expect(r.state.active).toBe(false);
    expect(r.state.openMenu).toBeNull();
    expect(r.handled && r.preventDefault).toBe(true);
  });

  it("Enter with no highlight executes the first enabled item (R-1354 4)", () => {
    expect(reduceMenuBarKey(dropdownState(0, null), ev("Enter")).effect).toEqual({ kind: "execute", id: "a" });
  });

  it("Enter is never an execute of a disabled item, even if the highlight points at one (defensive)", () => {
    const r = reduceMenuBarKey(dropdownState(0, "b"), ev("Enter"));
    expect(r.effect.kind === "execute" ? r.effect.id : null).not.toBe("b");
  });

  it("Space does NOT execute in the dropdown (R-1354 lists Enter only); it is swallowed", () => {
    const r = reduceMenuBarKey(dropdownState(0, "c"), ev(" "));
    expect(r.effect).toEqual({ kind: "none" });
    expect(r.state).toEqual(dropdownState(0, "c"));
    expect(r.handled).toBe(true);
  });

  it("Esc closes the dropdown AND deactivates in one press (R-1351), asking for the focus restore", () => {
    const r = reduceMenuBarKey(dropdownState(2, "c"), ev("Escape"));
    expect(r.state).toEqual(INACTIVE_STATE);
    expect(r.effect).toEqual({ kind: "deactivate" });
    expect(r.handled && r.preventDefault).toBe(true);
  });

  it("F10 closes everything as well (R-1351)", () => {
    const r = reduceMenuBarKey(dropdownState(2, "c"), ev("F10"));
    expect(r.state).toEqual(INACTIVE_STATE);
    expect(r.effect).toEqual({ kind: "deactivate" });
  });

  it("R-1354 5: Alt + another heading's access key switches to that menu", () => {
    const r = reduceMenuBarKey(dropdownState(0, "c"), ev("e", { altKey: true }));
    expect(r.state.openMenu).toBe("edit");
    expect(r.state.headingIndex).toBe(1);
    expect(r.effect).toEqual({ kind: "open-menu", menu: "edit", highlight: "first" });
    expect(r.handled && r.preventDefault).toBe(true);
    expect(reduceMenuBarKey(headingState(0), ev("g", { altKey: true })).effect).toEqual({ kind: "open-menu", menu: "go", highlight: "first" });
  });
});

describe("R-1355 / AC-1343 / AC-91: every other key is swallowed WITHOUT changing the state", () => {
  const OTHERS = [
    ev("Tab"), ev("Tab", { shiftKey: true }), ev("a"), ev("A", { shiftKey: true }), ev("Delete"), ev("F2"), ev("/"), ev("Backspace"), ev("s"),
    ev("c", { ctrlKey: true }), ev("a", { ctrlKey: true }), ev("x", { ctrlKey: true }), ev("PageDown"), ev("PageUp"), ev("q"), ev("Q"),
    ev("z", { ctrlKey: true, altKey: true }), ev("F5"),
  ];

  for (const [name, s] of [["heading level", headingState(1)], ["dropdown open", dropdownState(1, "c")]] as const) {
    it(`${name}: handled and preventDefault, state and effect unchanged`, () => {
      for (const e of OTHERS) {
        const r = reduceMenuBarKey(s, e);
        expect(r.handled, JSON.stringify(e)).toBe(true);
        expect(r.preventDefault, JSON.stringify(e)).toBe(true);
        expect(r.state, JSON.stringify(e)).toEqual(s);
        expect(r.effect, JSON.stringify(e)).toEqual({ kind: "none" });
      }
    });
  }

  it("an exit remapped to `Q` (input_keymap_custom.exit = 'Q') is not evaluated: Q is just swallowed (AC-1343 last clause)", () => {
    const r = reduceMenuBarKey(dropdownState(0, "a"), ev("q"));
    expect(r.effect).toEqual({ kind: "none" });
    expect(r.handled).toBe(true);
  });
});

describe("R-1355 / R-14-5-2: OS keys are NOT swallowed and keep the state (AC-93)", () => {
  const OS_KEYS = [
    ev("F4", { altKey: true }), // Alt+F4
    ev("Tab", { altKey: true }), // Alt+Tab
    ev(" ", { altKey: true }), // Alt+Space (system menu)
    ev("r", { metaKey: true }), // Win+R
    ev("Meta", { metaKey: true }), // the Windows key itself
    ev("d", { metaKey: true }),
    ev("ArrowLeft", { metaKey: true }),
  ];

  for (const [name, s] of [["heading level", headingState(0)], ["dropdown open", dropdownState(0, "a")]] as const) {
    it(`${name}: handled false, preventDefault false, nothing changes`, () => {
      for (const e of OS_KEYS) {
        const r = reduceMenuBarKey(s, e);
        expect(r.handled, JSON.stringify(e)).toBe(false);
        expect(r.preventDefault, JSON.stringify(e)).toBe(false);
        expect(r.state, JSON.stringify(e)).toEqual(s);
        expect(r.effect, JSON.stringify(e)).toEqual({ kind: "none" });
      }
    });
  }

  it("Alt+F / Alt+E (access keys) are NOT OS keys: they are handled", () => {
    expect(reduceMenuBarKey(headingState(0), ev("f", { altKey: true })).handled).toBe(true);
    expect(reduceMenuBarKey(headingState(0), ev("e", { altKey: true })).handled).toBe(true);
  });
});

describe("AC-1342 end to end: a dropdown walk from the keyboard", () => {
  it("ファイル opened at 'a'; ↓↓↓ -> c, e, a; End -> e; → -> 編集 (first requested); Enter later runs the highlighted item", () => {
    let s = dropdownState(0, "a");
    const seen: (string | null)[] = [];
    for (const k of ["ArrowDown", "ArrowDown", "ArrowDown", "End"]) {
      s = reduceMenuBarKey(s, ev(k)).state;
      seen.push(s.highlightId);
    }
    expect(seen).toEqual(["c", "e", "a", "e"]);
    const r = reduceMenuBarKey(s, ev("ArrowRight"));
    expect(r.effect).toEqual({ kind: "open-menu", menu: "edit", highlight: "first" });
    // the wiring snapshots the new menu and highlights its first enabled item; Enter then executes it
    const reopened: MenuBarKeyState = { ...r.state, entries: ENTRIES, highlightId: "a" };
    expect(reduceMenuBarKey(reopened, ev("Enter")).effect).toEqual({ kind: "execute", id: "a" });
  });
});
