import { afterEach, describe, expect, it, vi } from "vitest";
import { createContextMenuWiring, type ContextEventTarget, type ContextMenuWiringDeps, type DisplayedEntry } from "./context-menu-wiring.svelte";
import { planExecution, REASON_NOT_ZIP, buildMenu, type MenuItemId, type MenuSnapshot } from "$lib/features/context-menu/menu-model";
import { COPY_PATH_FAILED } from "$lib/features/context-menu/copy-path-text";
import { createFileOpsController } from "$lib/features/file-ops/file-ops-controller";
import { createArchiveController } from "$lib/features/archive/archive-controller";
import { isZipFileName } from "$lib/features/archive/target-rules";

// Spec: SPEC-0300-0018 R-1000~R-1004 (open only on a pointer right click on a
//   list row / blank; selection on contextmenu; keyboard-origin never opens),
//   R-1011, R-1022/R-1043 (targets = selection ∩ displayed), R-1024 (focus the
//   list), R-1042 (no re-evaluation while shown), R-1050~R-1056, R-1056-1 +
//   guardian 20th audit MUST-117 (before executing ANY row-menu item -- incl.
//   open / os_open / copy_path -- the selection is restored to the menu's
//   targets; only the blank menu's 新規作成... / ペースト are exempt), R-1053
//   (delete never passes Shift), R-1055 (close + focus the list BEFORE the
//   action), R-1060-3/4 (copy path status, app clipboard untouched), R-1080~
//   R-1084 (keys), R-1086, R-1087 (+G-4 shield), R-1088 (+G-5), R-1101,
//   AC-1000~AC-1002, AC-1030~AC-1040, AC-1041, AC-1042, AC-1052, AC-1053,
//   AC-1076, AC-1077.
// Architecture: SPEC-0200-0001 §3.9.4 (sync part before `await clipboard.get()`;
//   token + overlay + directory re-check afterwards), §3.9.6, §3.9.7,
//   §3.9.17.1~.5; MUST-115 wording consistency is checked by driving the REAL
//   controllers with fake deps (the controllers are unchanged).
// Module under test (stub): ./context-menu-wiring.svelte.ts. The shape of
//   `createContextMenuWiring`'s deps and of its return value is the ASSUMED
//   contract documented in the stub (the design leaves it open).

const P = (name: string) => `C:\\w\\${name}`;
const A: DisplayedEntry = { path: P("a.txt"), name: "a.txt", entryType: "file" };
const B: DisplayedEntry = { path: P("b.txt"), name: "b.txt", entryType: "file" };
const Z: DisplayedEntry = { path: P("c.zip"), name: "c.zip", entryType: "file" };
const D: DisplayedEntry = { path: P("d"), name: "d", entryType: "dir" };

// A fake DOM target: the ancestor chain carries attributes (see
// target-classify). `tagName` / `type` serve the input-field check.
function target(chain: Array<Record<string, string>>, extra: { tagName?: string; type?: string } = {}): ContextEventTarget {
  return {
    tagName: extra.tagName ?? "DIV",
    type: extra.type,
    closest(selector: string) {
      const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (m === null) throw new Error(`unsupported selector ${selector}`);
      for (const attrs of chain) {
        if (m[1] in attrs && (m[2] === undefined || attrs[m[1]] === m[2])) {
          return { getAttribute: (n: string) => attrs[n] ?? null };
        }
      }
      return null;
    },
  };
}
const rowEl = (e: DisplayedEntry) => target([{ "data-entry-path": e.path }, { "data-context-area": "list" }]);
const blankEl = () => target([{ "data-context-area": "list" }]);
const noneEl = () => target([{ "data-focus-area": "tree" }]);
const inputEl = () => target([{ "data-context-area": "list" }], { tagName: "INPUT", type: "text" });
const menuEl = () => target([{ role: "menu" }]);

interface Harness {
  wiring: ReturnType<typeof createContextMenuWiring>;
  deps: ContextMenuWiringDeps;
  log: string[];
  list: { currentPath: string; selected: Set<string>; displayed: DisplayedEntry[]; overlay: boolean; clipboardContent: unknown };
  clipboardPort: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };
  clock: { t: number };
  rightClick(el: ContextEventTarget, x?: number, y?: number): Promise<void>;
  openRow(e: DisplayedEntry, x?: number, y?: number): Promise<void>;
  openBlank(): Promise<void>;
}

function setup(over: { displayed?: DisplayedEntry[]; selected?: string[]; clipboard?: unknown } = {}): Harness {
  const list = {
    currentPath: "C:\\w",
    selected: new Set<string>(over.selected ?? []),
    displayed: over.displayed ?? [A, B, Z, D],
    overlay: false,
    clipboardContent: over.clipboard === undefined ? { paths: ["x"], origin: "internal-copy" } : over.clipboard,
  };
  const log: string[] = [];
  const clock = { t: 1000 };
  const clipboardPort = {
    get: vi.fn(async () => list.clipboardContent),
    set: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
  };
  let wiringRef: ReturnType<typeof createContextMenuWiring> | undefined;
  const deps: ContextMenuWiringDeps = {
    fileList: {
      get currentPath() {
        return list.currentPath;
      },
      get selected() {
        return list.selected;
      },
      contextClickRow(visible, path) {
        log.push(`contextClickRow:${path}`);
        if (!visible.some((e) => e.path === path)) return;
        if (!list.selected.has(path)) list.selected = new Set([path]);
      },
      restoreDisplayedSelection(visible, paths) {
        log.push(`restore:${paths.join("|")}`);
        const shown = new Set(visible.map((e) => e.path));
        const hidden = [...list.selected].filter((p) => !shown.has(p));
        list.selected = new Set([...hidden, ...paths.filter((p) => shown.has(p))]);
      },
    },
    filteredEntries: () => list.displayed,
    isOverlayOpen: () => list.overlay,
    clipboard: clipboardPort,
    focus: {
      container() {
        log.push("focus");
      },
    },
    fileOps: {
      handleAction: vi.fn((action: string, event: { shiftKey: boolean }) => {
        log.push(`fileOps:${action}:shift=${event.shiftKey}:menuOpen=${wiringRef?.state.isOpen}:sel=${[...list.selected].join("|")}`);
        return true;
      }),
    },
    archive: {
      handleAction: vi.fn((action: string) => {
        log.push(`archive:${action}:menuOpen=${wiringRef?.state.isOpen}:sel=${[...list.selected].join("|")}`);
        return true;
      }),
    },
    viewer: {
      openFile: vi.fn((path: string) => {
        log.push(`openFile:${path}`);
      }),
      openWithOsAssociation: vi.fn((path: string) => {
        log.push(`osOpen:${path}`);
      }),
    },
    navigate: vi.fn((path: string) => {
      log.push(`navigate:${path}`);
    }),
    status: { show: vi.fn((m: string) => void log.push(`status:${m}`)) },
    writeClipboardText: vi.fn(async () => {}),
    isZip: isZipFileName,
    now: () => clock.t,
    isInsideMenu: (t) => t !== null && t.closest("[role=\"menu\"]") !== null,
  };
  // `isInsideMenu` uses the same fake selector grammar; make `[role="menu"]` parse.
  deps.isInsideMenu = (t) => t !== null && t.closest('[role="menu"]') !== null;
  const wiring = createContextMenuWiring(deps);
  wiringRef = wiring;
  const h: Harness = {
    wiring,
    deps,
    log,
    list,
    clipboardPort,
    clock,
    async rightClick(el, x = 50, y = 60) {
      wiring.onPointerDown({ button: 2 });
      await wiring.onContextMenu({ target: el, clientX: x, clientY: y });
    },
    async openRow(e, x = 50, y = 60) {
      await h.rightClick(rowEl(e), x, y);
    },
    async openBlank() {
      await h.rightClick(blankEl());
    },
  };
  return h;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("opening: row menu (R-1000, R-1020, R-1022, R-1024, AC-1000)", () => {
  it("pointer right click on a row: focuses the list, selects the row, opens a row menu at the cursor", async () => {
    const h = setup();
    await h.openRow(B, 120, 80);
    expect(h.wiring.state.isOpen).toBe(true);
    expect(h.log).toContain("focus");
    expect(h.log).toContain(`contextClickRow:${B.path}`);
    expect([...h.list.selected]).toEqual([B.path]);
    const snap = h.wiring.state.snapshot as MenuSnapshot;
    expect(snap.kind).toBe("row");
    expect(snap.targets.map((t) => t.path)).toEqual([B.path]);
    expect(snap.cursor).toEqual({ x: 120, y: 80 });
    expect(snap.directory).toBe("C:\\w");
    expect(h.wiring.state.highlightedId).toBeNull(); // R-1081
  });

  it("R-1004: a bare pointerdown(2) does not change the selection or open anything", async () => {
    const h = setup();
    h.wiring.onPointerDown({ button: 2 });
    expect(h.log).toEqual([]);
    expect(h.wiring.state.isOpen).toBe(false);
  });

  it("the sync part (focus + selection) is finished BEFORE the clipboard promise settles (R-1004)", async () => {
    const h = setup();
    let release: (v: unknown) => void = () => {};
    h.clipboardPort.get.mockImplementation(() => new Promise((r) => (release = r)));
    h.wiring.onPointerDown({ button: 2 });
    const p = h.wiring.onContextMenu({ target: rowEl(A), clientX: 1, clientY: 2 });
    expect(h.log).toContain(`contextClickRow:${A.path}`);
    expect(h.log).toContain("focus");
    expect(h.wiring.state.isOpen).toBe(false);
    release(null);
    await p;
    expect(h.wiring.state.isOpen).toBe(true);
  });

  it("an already selected row keeps the multi selection; targets are the displayed selection in display order (AC-1001)", async () => {
    const h = setup({ selected: [Z.path, A.path, B.path] });
    await h.openRow(Z);
    const snap = h.wiring.state.snapshot as MenuSnapshot;
    expect(snap.targets.map((t) => t.path)).toEqual([A.path, B.path, Z.path]);
    expect(h.list.selected.size).toBe(3);
  });

  it("D1 / AC-1025: a selected-but-hidden path is not a target; 名前の変更 is enabled for the 1 displayed target", async () => {
    const h = setup({ displayed: [A, Z], selected: [A.path, B.path] }); // b.txt is filtered out
    await h.openRow(A);
    const snap = h.wiring.state.snapshot as MenuSnapshot;
    expect(snap.targets.map((t) => t.path)).toEqual([A.path]);
    const rename = snap.entries.find((e) => e.type === "item" && e.id === "rename");
    expect(rename).toMatchObject({ enabled: true });
  });

  it("clipboardHasItems comes from the app clipboard (AC-1024)", async () => {
    const empty = setup({ clipboard: null });
    await empty.openRow(A);
    expect((empty.wiring.state.snapshot as MenuSnapshot).clipboardHasItems).toBe(false);
    const full = setup();
    await full.openRow(A);
    expect((full.wiring.state.snapshot as MenuSnapshot).clipboardHasItems).toBe(true);
  });

  it("the ZIP judgment is injected: c.zip alone enables ZIPを解凍", async () => {
    const h = setup();
    await h.openRow(Z);
    const snap = h.wiring.state.snapshot as MenuSnapshot;
    expect(snap.entries.find((e) => e.type === "item" && e.id === "zip_extract")).toMatchObject({ enabled: true });
  });
});

describe("opening: blank menu (R-1021, R-1031, AC-1002)", () => {
  it("right click on the blank: selection untouched, no row click, focus still goes to the list, blank menu", async () => {
    const h = setup({ selected: [A.path] });
    await h.openBlank();
    expect(h.wiring.state.isOpen).toBe(true);
    expect(h.log.some((l) => l.startsWith("contextClickRow"))).toBe(false);
    expect(h.log).toContain("focus");
    expect([...h.list.selected]).toEqual([A.path]);
    const snap = h.wiring.state.snapshot as MenuSnapshot;
    expect(snap.kind).toBe("blank");
    expect(snap.targets).toEqual([]);
    expect(snap.entries.map((e) => (e.type === "separator" ? "---" : e.label))).toEqual(["新規作成...", "---", "ペースト"]);
  });
});

describe("not opening (R-1001, R-1002, R-1011, R-1101)", () => {
  it("R-1001: the tree / other areas -> nothing happens (no focus, no selection)", async () => {
    const h = setup();
    await h.rightClick(noneEl());
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual([]);
  });

  it("R-1002: a contextmenu without a preceding right pointerdown (keyboard / synthetic) -> nothing", async () => {
    const h = setup();
    await h.wiring.onContextMenu({ target: rowEl(A), clientX: 1, clientY: 1 });
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual([]);
  });

  it("R-1002: after Shift+F10 the right-pointer record is erased -> keyboard contextmenu does not open", async () => {
    const h = setup();
    h.wiring.onPointerDown({ button: 2 });
    h.wiring.onKeyDownForOrigin({ key: "F10", shiftKey: true });
    await h.wiring.onContextMenu({ target: rowEl(A), clientX: 1, clientY: 1 });
    expect(h.wiring.state.isOpen).toBe(false);
  });

  it("AC-1004: a keyboard-origin contextmenu does not block the next real right click", async () => {
    const h = setup();
    await h.wiring.onContextMenu({ target: rowEl(A), clientX: 1, clientY: 1 });
    await h.openRow(A);
    expect(h.wiring.state.isOpen).toBe(true);
  });

  it("R-1011: an input field -> nothing (the native menu is the guard's business)", async () => {
    const h = setup();
    await h.rightClick(inputEl());
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual([]);
  });

  it("MUST-113: the pointer right click on an input CONSUMES the record, so a following synthetic contextmenu on a row does not open", async () => {
    const h = setup();
    await h.rightClick(inputEl());
    await h.wiring.onContextMenu({ target: rowEl(A), clientX: 1, clientY: 1 });
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual([]);
  });

  it("MUST-113: the record is also consumed when the menu is already open (a later synthetic event is keyboard)", async () => {
    const h = setup();
    await h.openRow(A);
    await h.rightClick(menuEl()); // inside the menu: ignored, but consumed
    await h.wiring.onContextMenu({ target: rowEl(B), clientX: 1, clientY: 1 }); // synthetic
    expect(h.wiring.state.isOpen).toBe(true);
    expect((h.wiring.state.snapshot as MenuSnapshot).targets.map((t) => t.path)).toEqual([A.path]);
  });

  it("R-1101 / AC-1080: an overlay is open -> no menu, no selection change, no focus move", async () => {
    const h = setup();
    h.list.overlay = true;
    await h.openRow(A);
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual([]);
    expect(h.list.selected.size).toBe(0);
  });
});

describe("menu already open (R-1088, G-5, AC-1076)", () => {
  it("a pointer right click outside the menu only closes it (and returns focus to the list)", async () => {
    const h = setup();
    await h.openRow(A);
    h.log.length = 0;
    await h.rightClick(rowEl(B));
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual(["focus"]);
    expect([...h.list.selected]).toEqual([A.path]); // selection unchanged
  });

  it("... also when the outside target is the blank, the tree or anything else", async () => {
    for (const el of [blankEl(), noneEl()]) {
      const h = setup();
      await h.openRow(A);
      await h.rightClick(el);
      expect(h.wiring.state.isOpen).toBe(false);
    }
  });

  it("a right click inside the menu does nothing", async () => {
    const h = setup();
    await h.openRow(A);
    h.log.length = 0;
    await h.rightClick(menuEl());
    expect(h.wiring.state.isOpen).toBe(true);
    expect(h.log).toEqual([]);
  });

  it("keyboard-origin / synthetic contextmenu while open: nothing (stays open, no focus move)", async () => {
    const h = setup();
    await h.openRow(A);
    h.log.length = 0;
    await h.wiring.onContextMenu({ target: rowEl(B), clientX: 1, clientY: 1 });
    expect(h.wiring.state.isOpen).toBe(true);
    expect(h.log).toEqual([]);
  });

  it("the right-click close does NOT record an outside-close (no double-click shield from it, §3.9.17.5)", async () => {
    const h = setup();
    await h.openRow(A);
    await h.rightClick(rowEl(B));
    expect(h.wiring.state.lastOutsideClose).toBeNull();
  });
});

describe("open request token and re-checks after the await (§3.9.4, SHOULD-162)", () => {
  function deferredGet(h: Harness) {
    const resolvers: Array<(v: unknown) => void> = [];
    h.clipboardPort.get.mockImplementation(() => new Promise((r) => resolvers.push(r)));
    return resolvers;
  }

  it("two quick right clicks: only the LATEST request opens, whatever order the clipboard answers in", async () => {
    const h = setup();
    const resolvers = deferredGet(h);
    h.wiring.onPointerDown({ button: 2 });
    const p1 = h.wiring.onContextMenu({ target: rowEl(A), clientX: 1, clientY: 1 });
    h.wiring.onPointerDown({ button: 2 });
    const p2 = h.wiring.onContextMenu({ target: rowEl(B), clientX: 2, clientY: 2 });
    resolvers[1](null);
    await p2;
    resolvers[0](null);
    await p1;
    expect(h.wiring.state.isOpen).toBe(true);
    expect((h.wiring.state.snapshot as MenuSnapshot).targets.map((t) => t.path)).toEqual([B.path]);
  });

  it("an overlay that opened while awaiting prevents opening", async () => {
    const h = setup();
    const resolvers = deferredGet(h);
    h.wiring.onPointerDown({ button: 2 });
    const p = h.wiring.onContextMenu({ target: rowEl(A), clientX: 1, clientY: 1 });
    h.list.overlay = true;
    resolvers[0](null);
    await p;
    expect(h.wiring.state.isOpen).toBe(false);
  });

  it("a directory change while awaiting prevents opening", async () => {
    const h = setup();
    const resolvers = deferredGet(h);
    h.wiring.onPointerDown({ button: 2 });
    const p = h.wiring.onContextMenu({ target: rowEl(A), clientX: 1, clientY: 1 });
    h.list.currentPath = "C:\\other";
    resolvers[0](null);
    await p;
    expect(h.wiring.state.isOpen).toBe(false);
  });
});

describe("while shown: nothing is re-evaluated (R-1042, AC-1027) and the directory watch (R-1056 last sentence, AC-1041)", () => {
  it("entries / targets in the snapshot stay as they were at open time even if the list or the clipboard change", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    const before = JSON.stringify(h.wiring.state.snapshot);
    h.list.displayed = [A, B, Z, D, { path: P("new.txt"), name: "new.txt", entryType: "file" }];
    h.list.clipboardContent = null;
    expect(JSON.stringify(h.wiring.state.snapshot)).toBe(before);
    expect(h.clipboardPort.get).toHaveBeenCalledTimes(1);
  });

  it("a different current directory closes the menu (focus returns to the list, nothing executed)", async () => {
    const h = setup();
    await h.openRow(A);
    h.log.length = 0;
    h.wiring.onCurrentPathChange("C:\\w\\parent");
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual(["focus"]);
  });

  it("the same path (a reload) does NOT close the menu", async () => {
    const h = setup();
    await h.openRow(A);
    h.wiring.onCurrentPathChange("C:\\w");
    expect(h.wiring.state.isOpen).toBe(true);
  });

  it("closeNow: closes then focuses the list, exactly once", async () => {
    const h = setup();
    await h.openRow(A);
    h.log.length = 0;
    h.wiring.closeNow();
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual(["focus"]);
  });
});

describe("run: item id -> existing controller (R-1050~R-1054, AC-1030~AC-1038)", () => {
  const cases: Array<{ id: MenuItemId; want: string; sel: DisplayedEntry[]; row: DisplayedEntry }> = [
    { id: "copy", want: "fileOps:copy:shift=false", sel: [A, B], row: A },
    { id: "cut", want: "fileOps:cut:shift=false", sel: [A, B], row: A },
    { id: "paste", want: "fileOps:paste:shift=false", sel: [A, B], row: A },
    { id: "delete", want: "fileOps:delete:shift=false", sel: [A, B], row: A },
    { id: "rename", want: "fileOps:rename:shift=false", sel: [A], row: A },
    { id: "zip_create", want: "archive:zip_create", sel: [A, B], row: A },
    { id: "zip_extract", want: "archive:zip_extract", sel: [Z], row: Z },
  ];

  for (const c of cases) {
    it(`${c.id} -> ${c.want}, called AFTER the menu closed and the list was focused (R-1055)`, async () => {
      const h = setup({ selected: c.sel.map((e) => e.path) });
      await h.openRow(c.row);
      h.log.length = 0;
      h.wiring.run(c.id);
      const opLine = h.log.findIndex((l) => l.startsWith(c.want));
      expect(opLine).toBeGreaterThan(-1);
      expect(h.log[opLine]).toContain("menuOpen=false");
      expect(h.log.indexOf("focus")).toBeGreaterThan(-1);
      expect(h.log.indexOf("focus")).toBeLessThan(opLine);
      expect(h.wiring.state.isOpen).toBe(false);
    });
  }

  it("R-1053 / AC-1036: delete never forwards a Shift (always shiftKey: false)", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    h.wiring.run("delete");
    expect(h.deps.fileOps.handleAction).toHaveBeenCalledWith("delete", { shiftKey: false });
  });

  it("new_file (blank menu) -> fileOps.handleAction('new_file', { shiftKey: false })", async () => {
    const h = setup();
    await h.openBlank();
    h.wiring.run("new_file");
    expect(h.deps.fileOps.handleAction).toHaveBeenCalledWith("new_file", { shiftKey: false });
  });

  it("R-1023 / AC-1033: paste from the blank menu is the controller's paste (current directory), once", async () => {
    const h = setup();
    await h.openBlank();
    h.wiring.run("paste");
    expect(h.deps.fileOps.handleAction).toHaveBeenCalledTimes(1);
    expect(h.deps.fileOps.handleAction).toHaveBeenCalledWith("paste", { shiftKey: false });
  });

  it("open on a folder -> navigate(path), no viewer (AC-1030)", async () => {
    const h = setup({ selected: [D.path] });
    await h.openRow(D);
    h.wiring.run("open");
    expect(h.deps.navigate).toHaveBeenCalledWith(D.path);
    expect(h.deps.viewer.openFile).not.toHaveBeenCalled();
  });

  it("open on a file -> viewer.openFile(path), no navigation (AC-1030)", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    h.wiring.run("open");
    expect(h.deps.viewer.openFile).toHaveBeenCalledWith(A.path);
    expect(h.deps.navigate).not.toHaveBeenCalled();
  });

  it("os_open -> viewer.openWithOsAssociation(path) exactly once; no navigation / viewer (AC-1031)", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    h.wiring.run("os_open");
    expect(h.deps.viewer.openWithOsAssociation).toHaveBeenCalledTimes(1);
    expect(h.deps.viewer.openWithOsAssociation).toHaveBeenCalledWith(A.path);
    expect(h.deps.viewer.openFile).not.toHaveBeenCalled();
    expect(h.deps.navigate).not.toHaveBeenCalled();
    expect(h.deps.fileOps.handleAction).not.toHaveBeenCalled();
  });

  it("run closes the menu even for items that call nothing (R-1055)", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    h.wiring.run("os_open");
    expect(h.wiring.state.isOpen).toBe(false);
  });
});

describe("R-1056-1 / MUST-117 / AC-1042: the selection is restored to the menu's targets before ANY row-menu item", () => {
  const rowItems: MenuItemId[] = ["open", "os_open", "copy", "cut", "paste", "copy_path", "delete", "rename", "zip_create"];

  for (const id of rowItems) {
    it(`${id}: restoreDisplayedSelection(displayed, targets) is called before the action`, async () => {
      const h = setup({ selected: [A.path] });
      await h.openRow(A);
      h.log.length = 0;
      h.wiring.run(id);
      expect(h.log).toContain(`restore:${A.path}`);
      const restoreAt = h.log.indexOf(`restore:${A.path}`);
      const actionAt = h.log.findIndex((l) => /^(fileOps|archive|openFile|osOpen|navigate)/.test(l));
      if (actionAt >= 0) expect(restoreAt).toBeLessThan(actionAt);
    });
  }

  it("zip_extract on a zip: restored as well", async () => {
    const h = setup({ selected: [Z.path] });
    await h.openRow(Z);
    h.log.length = 0;
    h.wiring.run("zip_extract");
    expect(h.log).toContain(`restore:${Z.path}`);
  });

  it("the restore receives the CURRENT displayed list and the targets in display order", async () => {
    const h = setup({ selected: [A.path, B.path] });
    await h.openRow(A);
    const spy = vi.spyOn(h.deps.fileList, "restoreDisplayedSelection");
    h.wiring.run("copy");
    expect(spy).toHaveBeenCalledWith(h.list.displayed, [A.path, B.path]);
  });

  it("AC-1042: selection cleared by a reload while the menu was open -> the controller sees a, b again", async () => {
    const h = setup({ selected: [A.path, B.path] });
    await h.openRow(A);
    h.list.selected = new Set(); // reload cleared it
    h.wiring.run("copy");
    const line = h.log.find((l) => l.startsWith("fileOps:copy"));
    expect(line).toContain(`sel=${A.path}|${B.path}`);
    expect([...h.list.selected]).toEqual([A.path, B.path]);
  });

  it("AC-1042: b.txt vanished -> only a.txt is restored and acted upon", async () => {
    const h = setup({ selected: [A.path, B.path] });
    await h.openRow(A);
    h.list.selected = new Set();
    h.list.displayed = [A, Z, D];
    h.wiring.run("copy");
    expect(h.log).toContain(`restore:${A.path}`);
    const line = h.log.find((l) => l.startsWith("fileOps:copy"));
    expect(line).toContain(`sel=${A.path}`);
    expect(line).not.toContain(B.path);
  });

  it("a filter-hidden selection is preserved by the restore (kept in the selected set)", async () => {
    const h = setup({ displayed: [A, Z], selected: [A.path, B.path] });
    await h.openRow(A);
    h.list.selected = new Set([B.path]); // only the hidden one is left after a reload
    h.wiring.run("copy");
    expect(h.list.selected.has(B.path)).toBe(true);
    expect(h.list.selected.has(A.path)).toBe(true);
  });

  it("all targets gone: nothing is restored, no controller call, copy shows 選択がありません (AC-1040)", async () => {
    const h = setup({ selected: [B.path] });
    await h.openRow(B);
    h.list.displayed = [A, Z, D];
    h.log.length = 0;
    h.wiring.run("copy");
    expect(h.log.some((l) => l.startsWith("restore"))).toBe(false);
    expect(h.deps.fileOps.handleAction).not.toHaveBeenCalled();
    expect(h.deps.status.show).toHaveBeenCalledWith("選択がありません");
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log[0]).toBe("focus"); // closed + list focused (R-1086)
  });

  it("all targets gone: zip_create shows 対象がありません; open / os_open do nothing at all", async () => {
    const h = setup({ selected: [B.path] });
    await h.openRow(B);
    h.list.displayed = [A, Z, D];
    h.wiring.run("zip_create");
    expect(h.deps.status.show).toHaveBeenCalledWith("対象がありません");
    expect(h.deps.archive.handleAction).not.toHaveBeenCalled();

    const g = setup({ selected: [B.path] });
    await g.openRow(B);
    g.list.displayed = [A, Z, D];
    g.wiring.run("open");
    expect(g.deps.navigate).not.toHaveBeenCalled();
    expect(g.deps.viewer.openFile).not.toHaveBeenCalled();
    const o = setup({ selected: [B.path] });
    await o.openRow(B);
    o.list.displayed = [A, Z, D];
    o.wiring.run("os_open");
    expect(o.deps.viewer.openWithOsAssociation).not.toHaveBeenCalled();
    expect(o.deps.status.show).not.toHaveBeenCalled();
  });

  it("the blank menu's 新規作成... / ペースト are EXEMPT: no restore", async () => {
    const h = setup({ selected: [A.path] });
    await h.openBlank();
    h.log.length = 0;
    h.wiring.run("new_file");
    h.wiring.run("paste");
    expect(h.log.some((l) => l.startsWith("restore"))).toBe(false);
  });
});

describe("copy_path (R-1060, AC-1050, AC-1052, AC-1053)", () => {
  it("writes the displayed targets' paths joined by CRLF, synchronously within run (user-activation window)", async () => {
    const h = setup({ selected: [B.path, A.path] });
    await h.openRow(A);
    h.wiring.run("copy_path");
    expect(h.deps.writeClipboardText).toHaveBeenCalledTimes(1); // no await needed
    expect(h.deps.writeClipboardText).toHaveBeenCalledWith(`${A.path}\r\n${B.path}`);
  });

  it("success -> status パスをコピーしました(2 件)", async () => {
    const h = setup({ selected: [A.path, B.path] });
    await h.openRow(A);
    h.wiring.run("copy_path");
    await vi.waitFor(() => expect(h.deps.status.show).toHaveBeenCalledWith("パスをコピーしました(2 件)"));
  });

  it("failure -> status パスをコピーできませんでした, no unhandled rejection (AC-1053)", async () => {
    const h = setup({ selected: [A.path] });
    vi.mocked(h.deps.writeClipboardText).mockRejectedValue(new Error("denied"));
    await h.openRow(A);
    h.wiring.run("copy_path");
    await vi.waitFor(() => expect(h.deps.status.show).toHaveBeenCalledWith(COPY_PATH_FAILED));
    expect(h.deps.status.show).not.toHaveBeenCalledWith(expect.stringContaining("コピーしました"));
  });

  it("a folder path carries no trailing separator (AC-1050)", async () => {
    const h = setup({ selected: [D.path] });
    await h.openRow(D);
    h.wiring.run("copy_path");
    expect(h.deps.writeClipboardText).toHaveBeenCalledWith(D.path);
  });

  it("R-1060-4 / AC-1052: the app clipboard is never written or cleared and the controller is not called", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    h.wiring.run("copy_path");
    await vi.waitFor(() => expect(h.deps.status.show).toHaveBeenCalled());
    expect(h.clipboardPort.set).not.toHaveBeenCalled();
    expect(h.clipboardPort.clear).not.toHaveBeenCalled();
    expect(h.deps.fileOps.handleAction).not.toHaveBeenCalled();
  });

  it("only the displayed targets are written when the selection was reduced by a reload (R-1056)", async () => {
    const h = setup({ selected: [A.path, B.path] });
    await h.openRow(A);
    h.list.displayed = [A, Z, D];
    h.wiring.run("copy_path");
    expect(h.deps.writeClipboardText).toHaveBeenCalledWith(A.path);
  });

  it("all targets gone: 選択がありません and nothing is written", async () => {
    const h = setup({ selected: [B.path] });
    await h.openRow(B);
    h.list.displayed = [A];
    h.wiring.run("copy_path");
    expect(h.deps.writeClipboardText).not.toHaveBeenCalled();
    expect(h.deps.status.show).toHaveBeenCalledWith("選択がありません");
  });
});

describe("keys while open (R-1080~R-1084, AC-1070, AC-1071, AC-1073)", () => {
  const k = (key: string, over: Partial<Parameters<ReturnType<typeof createContextMenuWiring>["handleKey"]>[0]> = {}) => ({
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...over,
  });

  it("ArrowDown highlights the first enabled item and the key is handled", async () => {
    const h = setup({ selected: [A.path, B.path] });
    await h.openRow(A);
    expect(h.wiring.handleKey(k("ArrowDown"))).toBe(true);
    expect(h.wiring.state.highlightedId).toBe("copy"); // 開く / OSの関連付けで開く are disabled
  });

  it("ArrowUp from the start highlights the last enabled item", async () => {
    const h = setup({ selected: [A.path, B.path] });
    await h.openRow(A);
    h.wiring.handleKey(k("ArrowUp"));
    expect(h.wiring.state.highlightedId).toBe("zip_create");
  });

  it("Enter without a highlight runs the first enabled item (AC-1071: 開く on a.txt)", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    expect(h.wiring.handleKey(k("Enter"))).toBe(true);
    expect(h.deps.viewer.openFile).toHaveBeenCalledWith(A.path);
    expect(h.wiring.state.isOpen).toBe(false);
  });

  it("Enter runs the highlighted item", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    h.wiring.handleKey(k("ArrowDown"));
    h.wiring.handleKey(k("ArrowDown")); // os_open
    h.wiring.handleKey(k("ArrowDown")); // copy
    h.wiring.handleKey(k("Enter"));
    expect(h.log.some((l) => l.startsWith("fileOps:copy"))).toBe(true);
  });

  it("Escape closes without executing anything and returns focus to the list", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    h.log.length = 0;
    expect(h.wiring.handleKey(k("Escape"))).toBe(true);
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual(["focus"]);
  });

  it("Tab / Home / letters / Delete / Ctrl+C are handled (true) but change nothing; the menu stays open", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    h.log.length = 0;
    for (const e of [k("Tab"), k("Tab", { shiftKey: true }), k("Home"), k("ArrowLeft"), k("s"), k("Delete"), k("c", { ctrlKey: true }), k("a", { ctrlKey: true })]) {
      expect(h.wiring.handleKey(e), e.key).toBe(true);
    }
    expect(h.wiring.state.isOpen).toBe(true);
    expect(h.wiring.state.highlightedId).toBeNull();
    expect(h.log).toEqual([]);
  });

  it("Alt+F4 / Alt+Tab / Meta are NOT handled (false -> not preventDefault'ed)", async () => {
    const h = setup({ selected: [A.path] });
    await h.openRow(A);
    expect(h.wiring.handleKey(k("F4", { altKey: true }))).toBe(false);
    expect(h.wiring.handleKey(k("Tab", { altKey: true }))).toBe(false);
    expect(h.wiring.handleKey(k("Meta", { metaKey: true }))).toBe(false);
    expect(h.wiring.state.isOpen).toBe(true);
  });

  it("blank menu: Enter without a highlight runs the first item 新規作成... (R-1082)", async () => {
    const h = setup();
    await h.openBlank();
    h.wiring.handleKey(k("Enter"));
    expect(h.deps.fileOps.handleAction).toHaveBeenCalledWith("new_file", { shiftKey: false });
  });
});

describe("outside click / double-click shield / auxclick (R-1087, G-4, §3.9.17.5)", () => {
  it("onOutsideClose closes, returns focus, records the click time and position", async () => {
    const h = setup();
    await h.openRow(A);
    h.log.length = 0;
    h.clock.t = 5000;
    h.wiring.onOutsideClose({ x: 300, y: 200 });
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.log).toEqual(["focus"]);
    expect(h.wiring.state.lastOutsideClose).toEqual({ time: 5000, x: 300, y: 200 });
  });

  it("the 2nd click of a double click (detail 2) within 600ms at the same spot is swallowed; a single click is not", async () => {
    const h = setup();
    await h.openRow(A);
    h.clock.t = 5000;
    h.wiring.onOutsideClose({ x: 300, y: 200 });
    h.clock.t = 5300;
    expect(h.wiring.shouldSwallow({ type: "click", detail: 2, x: 301, y: 200 })).toBe(true);
    expect(h.wiring.shouldSwallow({ type: "dblclick", detail: 2, x: 300, y: 201 })).toBe(true);
    expect(h.wiring.shouldSwallow({ type: "click", detail: 1, x: 300, y: 200 })).toBe(false);
  });

  it("... but not after 600ms or far away", async () => {
    const h = setup();
    await h.openRow(A);
    h.clock.t = 5000;
    h.wiring.onOutsideClose({ x: 300, y: 200 });
    h.clock.t = 5601;
    expect(h.wiring.shouldSwallow({ type: "click", detail: 2, x: 300, y: 200 })).toBe(false);
    h.clock.t = 5100;
    expect(h.wiring.shouldSwallow({ type: "click", detail: 2, x: 500, y: 200 })).toBe(false);
  });

  it("nothing is swallowed before any outside close", () => {
    const h = setup();
    expect(h.wiring.shouldSwallow({ type: "dblclick", detail: 2, x: 0, y: 0 })).toBe(false);
  });

  it("auxclick: the middle button closes the menu (with a record); the right button does not", async () => {
    const h = setup();
    await h.openRow(A);
    h.wiring.onOutsideAuxClick({ button: 2, x: 10, y: 10 });
    expect(h.wiring.state.isOpen).toBe(true);
    expect(h.wiring.state.lastOutsideClose).toBeNull();
    h.wiring.onOutsideAuxClick({ button: 1, x: 10, y: 10 });
    expect(h.wiring.state.isOpen).toBe(false);
    expect(h.wiring.state.lastOutsideClose).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MUST-115 / SHOULD-161 / SHOULD-168: the wording duplicated in menu-model is
// compared against the REAL controllers' behaviour (controllers unchanged).

describe("wording consistency with the real controllers (MUST-115)", () => {
  const tick = () => new Promise((r) => setTimeout(r, 0));

  function fileOpsStatusFor(action: string): string[] {
    const shown: string[] = [];
    const controller = createFileOpsController({
      ipc: {} as never,
      modal: {} as never,
      status: { show: (m: string) => void shown.push(m) },
      clipboard: { set: async () => {}, get: async () => null, clear: async () => {} },
      context: () => ({ currentPath: "C:\\w", entries: [], selected: [], focusedPath: null }),
      reload: async () => {},
    });
    controller.handleAction(action, { shiftKey: false });
    return shown;
  }

  function archiveStatusFor(
    action: string,
    ctx: { entries: Array<{ name: string; path: string; entryType: "file" | "dir" }>; selected: string[] },
  ): string[] {
    const shown: string[] = [];
    const controller = createArchiveController({
      ipc: {} as never,
      modal: {} as never,
      status: { show: (m: string) => void shown.push(m) },
      context: () => ({ currentPath: "C:\\w", focusedPath: null, ...ctx }),
      reload: async () => {},
    });
    controller.handleAction(action);
    return shown;
  }

  const emptyPlan = (id: MenuItemId) => {
    const snapshot: MenuSnapshot = {
      kind: "row",
      targets: [{ path: A.path, name: A.name, entryType: "file" }],
      clipboardHasItems: true,
      directory: "C:\\w",
      entries: buildMenu({ kind: "row", targets: [{ path: A.path, name: A.name, entryType: "file" }], clipboardHasItems: true, isZip: isZipFileName }),
      cursor: { x: 0, y: 0 },
    };
    return planExecution({ snapshot, id, displayed: [], isZip: isZipFileName });
  };

  it("copy / cut with no selection: the menu's notice equals the file-ops controller's status", async () => {
    for (const action of ["copy", "cut"] as const) {
      const shown = fileOpsStatusFor(action);
      await tick();
      expect(shown).toHaveLength(1);
      expect(emptyPlan(action)).toEqual({ kind: "notice", message: shown[0] });
    }
  });

  it("delete / rename with no selection: the notice equals the controller's status (SPEC-0300-0011 R-10)", async () => {
    for (const action of ["delete", "rename"] as const) {
      const shown = fileOpsStatusFor(action);
      await tick();
      if (shown.length > 0) expect(emptyPlan(action)).toEqual({ kind: "notice", message: shown[0] });
      else expect(emptyPlan(action)).toEqual({ kind: "notice", message: "選択がありません" });
    }
  });

  it("zip_create with no target: the notice equals the archive controller's status", async () => {
    const shown = archiveStatusFor("zip_create", { entries: [], selected: [] });
    await tick();
    expect(shown).toHaveLength(1);
    expect(emptyPlan("zip_create")).toEqual({ kind: "notice", message: shown[0] });
  });

  it("zip_extract on a folder: REASON_NOT_ZIP equals the archive controller's status (G-2, no space)", async () => {
    const shown = archiveStatusFor("zip_extract", {
      entries: [{ name: "d", path: P("d"), entryType: "dir" }],
      selected: [P("d")],
    });
    await tick();
    expect(shown).toEqual([REASON_NOT_ZIP]);
  });

  it("zip_extract on a non-zip file: also the same text", async () => {
    const shown = archiveStatusFor("zip_extract", {
      entries: [{ name: "a.txt", path: P("a.txt"), entryType: "file" }],
      selected: [P("a.txt")],
    });
    await tick();
    expect(shown).toEqual([REASON_NOT_ZIP]);
  });

  it("the injected ZIP rule (archive's isZipFileName) agrees with the menu: a table of names", () => {
    const names: Array<[string, boolean]> = [
      ["a.zip", true],
      ["A.ZIP", true],
      ["a.Zip", true],
      ["a.zip.txt", false],
      ["zip", false],
      [".zip", true],
      ["a.7z", false],
      ["a.txt", false],
    ];
    for (const [name, expected] of names) {
      expect(isZipFileName(name), name).toBe(expected);
      const entries = buildMenu({
        kind: "row",
        targets: [{ path: P(name), name, entryType: "file" }],
        clipboardHasItems: true,
        isZip: isZipFileName,
      });
      const zx = entries.find((e) => e.type === "item" && e.id === "zip_extract");
      expect(zx).toMatchObject({ enabled: expected });
    }
  });
});
