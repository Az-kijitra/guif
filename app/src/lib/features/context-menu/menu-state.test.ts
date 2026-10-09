import { describe, expect, it } from "vitest";
import { createContextMenuState } from "./menu-state.svelte";
import { buildMenu, type MenuSnapshot, type MenuTarget } from "./menu-model";

// Spec: SPEC-0300-0018 R-1081 (opens with NO highlight), R-1082 (confirm target),
//   R-1090 (hover highlight shares the key state; disabled items / separators
//   do not highlight; the highlight stays), R-1042 (state fixed while shown),
//   R-1087 + G-4 (outside-close record for the double-click shield),
//   SPEC-0200-0001 §3.9.17.4 (open-request token and `closedAt` live in the
//   state), AC-1077 (hover -> ArrowDown flow), AC-1090 (highlightedId).
// Module under test (stub): ./menu-state.svelte.ts (feature-local state)

const isZip = (n: string) => /\.zip$/i.test(n);
const t = (name: string): MenuTarget => ({ path: `C:\\w\\${name}`, name, entryType: "file" });

function snap(targets: MenuTarget[], clipboardHasItems = true, kind: "row" | "blank" = "row"): MenuSnapshot {
  return {
    kind,
    targets,
    clipboardHasItems,
    directory: "C:\\w",
    entries: buildMenu({ kind, targets, clipboardHasItems, isZip }),
    cursor: { x: 5, y: 6 },
  };
}

describe("createContextMenuState", () => {
  it("starts closed with no snapshot and no highlight", () => {
    const s = createContextMenuState();
    expect(s.isOpen).toBe(false);
    expect(s.snapshot).toBeNull();
    expect(s.highlightedId).toBeNull();
    expect(s.lastOutsideClose).toBeNull();
  });

  it("open: isOpen, snapshot kept, NOTHING highlighted (R-1081)", () => {
    const s = createContextMenuState();
    const sn = snap([t("a.txt")]);
    s.open(sn);
    expect(s.isOpen).toBe(true);
    expect(s.snapshot).toEqual(sn);
    expect(s.highlightedId).toBeNull();
  });

  it("re-opening resets the highlight", () => {
    const s = createContextMenuState();
    s.open(snap([t("a.txt")]));
    s.moveHighlight("down");
    expect(s.highlightedId).not.toBeNull();
    s.open(snap([t("a.txt")]));
    expect(s.highlightedId).toBeNull();
  });

  it("moveHighlight: Down from none -> 開く, Up from none -> last enabled (ZIPを展開 is disabled for a.txt -> ZIPに圧縮)", () => {
    const s = createContextMenuState();
    s.open(snap([t("a.txt")]));
    s.moveHighlight("down");
    expect(s.highlightedId).toBe("open");
    s.close();
    s.open(snap([t("a.txt")]));
    s.moveHighlight("up");
    expect(s.highlightedId).toBe("zip_create");
  });

  it("AC-1077 flow: hover 切り取り highlights it, then ArrowDown -> 貼り付け", () => {
    const s = createContextMenuState();
    s.open(snap([t("a.txt"), t("b.txt")]));
    s.highlight("cut");
    expect(s.highlightedId).toBe("cut");
    s.moveHighlight("down");
    expect(s.highlightedId).toBe("paste");
  });

  it("highlight ignores a DISABLED item (名前の変更 with 2 targets) and keeps the previous highlight (R-1090, AC-1077)", () => {
    const s = createContextMenuState();
    s.open(snap([t("a.txt"), t("b.txt")]));
    s.highlight("paste");
    s.highlight("rename");
    expect(s.highlightedId).toBe("paste");
  });

  it("confirmTarget: highlighted item, else the first enabled item, else null (R-1082)", () => {
    const s = createContextMenuState();
    s.open(snap([t("a.txt")]));
    expect(s.confirmTarget()).toBe("open");
    s.highlight("delete");
    expect(s.confirmTarget()).toBe("delete");
    s.close();
    s.open(snap([t("a.txt"), t("b.txt")]));
    expect(s.confirmTarget()).toBe("copy");
  });

  it("confirmTarget does not close the menu (closing is the caller's job)", () => {
    const s = createContextMenuState();
    s.open(snap([t("a.txt")]));
    s.confirmTarget();
    expect(s.isOpen).toBe(true);
  });

  it("close: isOpen false and highlight cleared", () => {
    const s = createContextMenuState();
    s.open(snap([t("a.txt")]));
    s.highlight("copy");
    s.close();
    expect(s.isOpen).toBe(false);
    expect(s.highlightedId).toBeNull();
  });

  it("blank menu: Down walks 新規作成… -> 貼り付け", () => {
    const s = createContextMenuState();
    s.open(snap([], true, "blank"));
    s.moveHighlight("down");
    expect(s.highlightedId).toBe("new_file");
    s.moveHighlight("down");
    expect(s.highlightedId).toBe("paste");
  });

  it("R-1042: the snapshot (entries) is not recomputed while open", () => {
    const s = createContextMenuState();
    const sn = snap([t("a.txt")]);
    s.open(sn);
    expect(s.snapshot?.entries).toBe(sn.entries);
  });

  describe("open-request token (SHOULD-162)", () => {
    it("each nextOpenToken is a new value and only the latest is 'latest'", () => {
      const s = createContextMenuState();
      const t1 = s.nextOpenToken();
      expect(s.isLatestOpenToken(t1)).toBe(true);
      const t2 = s.nextOpenToken();
      expect(t2).not.toBe(t1);
      expect(s.isLatestOpenToken(t1)).toBe(false);
      expect(s.isLatestOpenToken(t2)).toBe(true);
    });

    it("tokens are independent per state instance", () => {
      const a = createContextMenuState();
      const b = createContextMenuState();
      const ta = a.nextOpenToken();
      b.nextOpenToken();
      b.nextOpenToken();
      expect(a.isLatestOpenToken(ta)).toBe(true);
    });
  });

  describe("outside-close record (R-1087, G-4)", () => {
    it("recordOutsideClose stores time and position; survives close()", () => {
      const s = createContextMenuState();
      s.open(snap([t("a.txt")]));
      s.recordOutsideClose({ time: 1234, x: 40, y: 50 });
      s.close();
      expect(s.lastOutsideClose).toEqual({ time: 1234, x: 40, y: 50 });
    });

    it("a later record replaces the earlier one", () => {
      const s = createContextMenuState();
      s.recordOutsideClose({ time: 1, x: 1, y: 1 });
      s.recordOutsideClose({ time: 2, x: 3, y: 4 });
      expect(s.lastOutsideClose).toEqual({ time: 2, x: 3, y: 4 });
    });
  });
});
