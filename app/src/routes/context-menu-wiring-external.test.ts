import { describe, expect, it, vi } from "vitest";
import { createContextMenuWiring, type ContextEventTarget, type ContextMenuWiringDeps, type DisplayedEntry } from "./context-menu-wiring.svelte";
import { isZipFileName } from "$lib/features/archive/target-rules";

// [単体] Spec: SPEC-0300-0021 R-1553 (the registered apps are items of the row menu and of the blank menu), R-1532 (the row menu's target is the right-clicked
//   row -- ONE row even with several selected -- and the blank menu's target is the current folder, treated as a folder; an exception to SPEC-0300-0018 R-1022),
//   R-1554 (the menu closes and the focus returns BEFORE the launch), R-1535 (the target is the one the menu was OPENED with: kept in the snapshot), R-1536 /
//   AC-1517 (a row that vanished while the menu was open is not a notice of the menu: the backend answers target-missing), AC-1514 (the selection is NOT
//   put back: SPEC-0300-0018 R-1056-1 does not apply to these items), AC-1536 (the focus returns to the file list), R-1560 / R-1561 (availability fixed at open).
// Architecture: SPEC-0200-0001 §3.16.8 (`context-menu-wiring.svelte.ts::run` branches on `ext:<n>` FIRST: it does not go through `planExecution` or
//   `restoreDisplayedSelection`; it closes the menu (`closeNow`) and then calls `externalApps.launchOnTarget(index, rowTarget ?? the directory)`), §3.16.15 MUST-144
//   (a pass-through of `externalApps?.entries` / `launchOnTarget` only).
//
// Contract assumed (reported to the implementer):
//   ContextMenuWiringDeps gains: externalApps?: {
//     readonly entries: readonly { index: number; label: string }[];
//     launchOnTarget(index: number, target: { path: string; kind: "file" | "dir" }): void;
//   }
//   - buildMenu is given { externalApps: deps.externalApps?.entries, directory } so the menu shows the items; MenuSnapshot gains `rowTarget` (the right-clicked
//     row, or null for a blank menu).
//   - wiring.run("ext:<n>") (click / Enter): state closed, focus -> list, THEN launchOnTarget(n, row target | { path: snapshot.directory, kind: "dir" }).
//   - wiring.state.snapshot.rowTarget / .directory are what the launch uses (not the entries displayed now).
//
// Module under test: ./context-menu-wiring.svelte.ts

const P = (name: string) => `C:\\w\\${name}`;
const A: DisplayedEntry = { path: P("a.txt"), name: "a.txt", entryType: "file" };
const B: DisplayedEntry = { path: P("b.txt"), name: "b.txt", entryType: "file" };
const D: DisplayedEntry = { path: P("d"), name: "d", entryType: "dir" };

const FOUR = [
  { index: 0, label: "ターミナルで開く" },
  { index: 1, label: "VS Codeで開く" },
  { index: 2, label: "エクスプローラーで開く" },
  { index: 3, label: "GitHub Desktopで開く" },
];

function target(chain: Array<Record<string, string>>): ContextEventTarget {
  return {
    tagName: "DIV",
    closest(selector: string) {
      const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (m === null) throw new Error(`unsupported selector ${selector}`);
      for (const attrs of chain) {
        if (m[1] in attrs && (m[2] === undefined || attrs[m[1]] === m[2])) return { getAttribute: (n: string) => attrs[n] ?? null };
      }
      return null;
    },
  };
}
const rowEl = (e: DisplayedEntry) => target([{ "data-entry-path": e.path }, { "data-context-area": "list" }]);
const blankEl = () => target([{ "data-context-area": "list" }]);

function setup(over: { displayed?: DisplayedEntry[]; selected?: string[]; current?: string; apps?: typeof FOUR | undefined } = {}) {
  const log: string[] = [];
  const list = { currentPath: over.current ?? "C:\\w", selected: new Set<string>(over.selected ?? []), displayed: over.displayed ?? [A, B, D] };
  let wiringRef: ReturnType<typeof createContextMenuWiring> | undefined;
  const externalApps =
    over.apps === undefined && "apps" in over
      ? undefined
      : {
          entries: over.apps ?? FOUR,
          launchOnTarget: vi.fn((index: number, t: { path: string; kind: string }) => {
            log.push(`launch:${index}:${t.path}:${t.kind}:menuOpen=${wiringRef?.state.isOpen}:sel=${[...list.selected].join("|")}`);
          }),
        };
  const deps = {
    fileList: {
      get currentPath() {
        return list.currentPath;
      },
      get selected() {
        return list.selected;
      },
      contextClickRow(visible: readonly DisplayedEntry[], path: string) {
        log.push(`contextClickRow:${path}`);
        if (!visible.some((e) => e.path === path)) return;
        if (!list.selected.has(path)) list.selected = new Set([path]);
      },
      restoreDisplayedSelection(_visible: readonly DisplayedEntry[], paths: readonly string[]) {
        log.push(`restore:${paths.join("|")}`);
        list.selected = new Set(paths);
      },
    },
    filteredEntries: () => list.displayed,
    isOverlayOpen: () => false,
    clipboard: { hasItems: vi.fn(async () => true) },
    focus: {
      container() {
        log.push("focus");
      },
    },
    fileOps: { handleAction: vi.fn(() => true) },
    archive: { handleAction: vi.fn(() => true) },
    viewer: { openFile: vi.fn(), openWithOsAssociation: vi.fn() },
    navigate: vi.fn(),
    status: { show: vi.fn((m: string) => void log.push(`status:${m}`)) },
    writeClipboardText: vi.fn(async () => {}),
    isZip: isZipFileName,
    now: () => 1000,
    isInsideMenu: (t: ContextEventTarget) => t !== null && t.closest('[role="menu"]') !== null,
    externalApps,
  } as unknown as ContextMenuWiringDeps;
  const wiring = createContextMenuWiring(deps);
  wiringRef = wiring;
  return {
    wiring,
    log,
    list,
    externalApps,
    async openRow(e: DisplayedEntry) {
      wiring.onPointerDown({ button: 2 });
      await wiring.onContextMenu({ target: rowEl(e), clientX: 10, clientY: 20 });
    },
    async openBlank() {
      wiring.onPointerDown({ button: 2 });
      await wiring.onContextMenu({ target: blankEl(), clientX: 10, clientY: 20 });
    },
    run: (id: string) => wiring.run(id as never),
  };
}

const ids = (w: ReturnType<typeof createContextMenuWiring>): string[] =>
  (w.state.snapshot?.entries ?? []).map((e) => (e.type === "separator" ? "---" : String(e.id)));

describe("the items (R-1553, AC-1531)", () => {
  it("the row menu shows the four after 「OSの関連付けで開く」 and before 「コピー」", async () => {
    const s = setup();
    await s.openRow(B);
    expect(ids(s.wiring)).toEqual([
      "open", "os_open", "---", "ext:0", "ext:1", "ext:2", "ext:3", "---", "copy", "cut", "paste", "copy_path", "---", "delete", "rename", "---", "zip_create", "zip_extract",
    ]);
  });

  it("the blank menu shows them after 「貼り付け」", async () => {
    const s = setup();
    await s.openBlank();
    expect(ids(s.wiring)).toEqual(["new_file", "---", "paste", "---", "ext:0", "ext:1", "ext:2", "ext:3"]);
  });

  it("without registrations (the dep absent, or an empty list) the menus are the old ones", async () => {
    for (const apps of [undefined, []] as const) {
      const s = setup({ apps: apps as never });
      await s.openRow(B);
      expect(ids(s.wiring)).toHaveLength(13);
      expect(ids(s.wiring).some((x) => x.startsWith("ext:"))).toBe(false);
      s.wiring.closeNow();
      await s.openBlank();
      expect(ids(s.wiring)).toEqual(["new_file", "---", "paste"]);
    }
  });

  it("the snapshot remembers the right-clicked row (the target of a launch)", async () => {
    const s = setup();
    await s.openRow(B);
    expect((s.wiring.state.snapshot as unknown as { rowTarget: { path: string } | null }).rowTarget).toMatchObject({ path: B.path });
    s.wiring.closeNow();
    await s.openBlank();
    expect((s.wiring.state.snapshot as unknown as { rowTarget: unknown }).rowTarget ?? null).toBeNull();
  });
});

describe("running an item from the row menu (R-1532 1, AC-1514)", () => {
  it("launches with the right-clicked row; the menu is already closed and the focus has returned (R-1554)", async () => {
    const s = setup({ selected: [A.path, B.path] });
    await s.openRow(B); // B is inside the selection: the selection {A, B} stays
    s.log.length = 0;
    s.run("ext:1");
    expect(s.wiring.state.isOpen).toBe(false);
    expect(s.log).toEqual(["focus", `launch:1:${B.path}:file:menuOpen=false:sel=${A.path}|${B.path}`]);
  });

  it("with several rows selected the target is still the ONE right-clicked row (R-1532 1)", async () => {
    const s = setup({ selected: [A.path, B.path, D.path] });
    await s.openRow(A);
    s.run("ext:0");
    expect(s.externalApps!.launchOnTarget).toHaveBeenCalledTimes(1);
    expect(s.externalApps!.launchOnTarget).toHaveBeenCalledWith(0, { path: A.path, kind: "file" });
  });

  it("a folder row is sent as a folder", async () => {
    const s = setup();
    await s.openRow(D);
    s.run("ext:2");
    expect(s.externalApps!.launchOnTarget).toHaveBeenCalledWith(2, { path: D.path, kind: "dir" });
  });

  it("AC-1514: the selection is NOT restored (R-1056-1 does not apply) and not changed", async () => {
    const s = setup({ selected: [A.path, B.path] });
    await s.openRow(B);
    s.run("ext:0");
    expect(s.log.some((l) => l.startsWith("restore:"))).toBe(false);
    expect([...s.list.selected]).toEqual([A.path, B.path]);
  });

  it("no ordinary action runs: no file operation, no archive, no viewer, no navigation, no notice", async () => {
    const s = setup();
    await s.openRow(B);
    s.run("ext:3");
    expect(s.log.filter((l) => l.startsWith("status:"))).toEqual([]);
  });

  it("AC-1517: the row vanished from the list while the menu was open -- the launch still uses the target the menu was opened with", async () => {
    const s = setup();
    await s.openRow(B);
    s.list.displayed = [A, D]; // the file watcher removed B
    s.run("ext:0");
    expect(s.externalApps!.launchOnTarget).toHaveBeenCalledWith(0, { path: B.path, kind: "file" });
    expect(s.log.filter((l) => l.startsWith("status:"))).toEqual([]); // no menu notice and no silent no-op: the backend answers
  });
});

describe("running an item from the blank menu (R-1532 2)", () => {
  it("launches with the current folder, as a folder", async () => {
    const s = setup({ current: "C:\\w\\sub" });
    await s.openBlank();
    s.log.length = 0;
    s.run("ext:1");
    expect(s.log).toEqual(["focus", "launch:1:C:\\w\\sub:dir:menuOpen=false:sel="]);
  });

  it("uses the folder the menu was opened for, not the one shown now", async () => {
    const s = setup({ current: "C:\\w" });
    await s.openBlank();
    s.list.currentPath = "C:\\elsewhere";
    s.run("ext:0");
    expect(s.externalApps!.launchOnTarget).toHaveBeenCalledWith(0, { path: "C:\\w", kind: "dir" });
  });

  it("with no current folder the four items are shown but disabled (R-1560)", async () => {
    const s = setup({ current: "" });
    await s.openBlank();
    const entries = s.wiring.state.snapshot?.entries ?? [];
    const exts = entries.filter((e) => e.type === "item" && String(e.id).startsWith("ext:"));
    expect(exts.length).toBe(4);
    for (const e of exts) expect(e.type === "item" && e.enabled).toBe(false);
  });
});

describe("the ordinary items are unaffected", () => {
  it("copy still restores the selection first and runs the file operation (SPEC-0300-0018 R-1056-1)", async () => {
    const s = setup({ selected: [A.path] });
    await s.openRow(B);
    s.log.length = 0;
    s.run("copy");
    expect(s.log.some((l) => l.startsWith("restore:"))).toBe(true);
    expect(s.externalApps!.launchOnTarget).not.toHaveBeenCalled();
  });
});

describe("the situation is not a prerequisite", () => {
  it("running an ext item while no menu is open does nothing", () => {
    const s = setup();
    s.run("ext:0");
    expect(s.externalApps!.launchOnTarget).not.toHaveBeenCalled();
  });

  it("an ext item whose index is not in the wiring's list is still passed on (the backend decides unknown_app)", async () => {
    const s = setup();
    await s.openRow(A);
    s.run("ext:42");
    expect(s.externalApps!.launchOnTarget).toHaveBeenCalledWith(42, { path: A.path, kind: "file" });
  });
});
