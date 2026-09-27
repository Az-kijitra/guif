import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0014 R-305 / R-305-1 (zip_create / zip_extract are started
//   from the keyboard actions), R-306 (no menu / context-menu entry in Phase
//   5: the keyboard is the only route), R-307-1 / MUST-61 (targets are limited
//   to displayed entries: the injected context reports them), R-308-2,
//   R-397 (a reload after the operation is not navigation => no visit),
//   SPEC-0300-0010 R-17 (the keyboard layer only resolves action ids; each
//   feature implements its action), AC-45 (the key fires the action; the
//   effects are verified elsewhere), AC-304 (d), AC-302-1.
//   SPEC-0200-0001 §3.4.13-3 MUST-67 (guardian): the context's `entries` carry
//   `entryType` (so a directory named x.zip is not extractable).
// Architecture: SPEC-0200-0001 §3.4.7 (`ListActionDeps` gets
//   `archive: { handleAction(action: string): boolean }`; a ZIP_ACTIONS set is
//   checked right after FILE_OP_ACTIONS and returns
//   `deps.archive.handleAction(action)`; `event` is NOT passed; the handler
//   imports no feature), §3.4.13-3 (createFileOpsContext returns
//   entries `{ name, path, entryType }`; file-ops' own `FileOpsContext.entries`
//   stays `{ name, path }`, a structural supertype, so the existing file-ops
//   controller tests are unchanged).
// Module under test: ./list-action-wiring.ts (zip cases + entryType are new).
// Kept in a separate file so list-action-wiring.test.ts stays untouched.

import { createFileOpsContext, createListActionHandler } from "./list-action-wiring";

const ev = (over: Partial<{ shiftKey: boolean }> = {}) => ({
  key: "x",
  ctrlKey: true,
  altKey: true,
  shiftKey: false,
  metaKey: false,
  ...over,
});

function makeDeps(over: Record<string, unknown> = {}) {
  const filtered = [{ name: "a", path: "C:\\d\\a", entryType: "file" as "file" | "dir" }];
  const deps = {
    fileList: {
      moveRow: vi.fn(),
      moveColumn: vi.fn(),
      openFocused: vi.fn(async () => "C:\\d\\sub" as string | null),
      goParent: vi.fn(async () => "C:\\" as string | null),
      toggleFocused: vi.fn(),
      selectAll: vi.fn(),
    },
    filteredEntries: () => filtered,
    rowsPerColumn: () => 10,
    afterUserNavigation: vi.fn(async (pr: Promise<string | null>) => pr),
    activateSearch: vi.fn(),
    openHistoryList: vi.fn(),
    addJump: vi.fn(),
    currentPath: () => "C:\\d",
    fileOps: { handleAction: vi.fn(() => true) },
    archive: { handleAction: vi.fn(() => true) },
    // SPEC-0300-0015 §3.5.3: the "open" case's new dependencies (see
    // list-action-wiring.test.ts for the full entryType x shiftKey matrix;
    // this file only needs "open" to keep working alongside `archive`).
    focusedEntry: () => filtered[0] ?? null,
    viewer: { openFile: vi.fn(), openWithOsAssociation: vi.fn() },
    ...over,
  };
  return { deps, filtered };
}

describe("createListActionHandler: zip_create / zip_extract (SPEC-0200-0001 §3.4.7)", () => {
  it.each(["zip_create", "zip_extract"])("%s is forwarded to archive.handleAction(action) with ONLY the action id", (action) => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler(action, ev())).toBe(true);
    expect(deps.archive.handleAction).toHaveBeenCalledTimes(1);
    expect(deps.archive.handleAction).toHaveBeenCalledWith(action);
  });

  it("the return value of archive.handleAction is the handler's return value (consumed / not consumed)", () => {
    const { deps } = makeDeps({ archive: { handleAction: vi.fn(() => false) } });
    const handler = createListActionHandler(deps as never);
    expect(handler("zip_create", ev())).toBe(false);
  });

  it("R-397: zip actions never go through afterUserNavigation (no visit is recorded) and never reach the file-ops controller", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    handler("zip_create", ev());
    handler("zip_extract", ev());
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
    expect(deps.fileOps.handleAction).not.toHaveBeenCalled();
    expect(deps.fileList.openFocused).not.toHaveBeenCalled();
  });

  it("the 7 file-operation actions still go to fileOps only (archive is not involved)", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    for (const a of ["copy", "cut", "paste", "delete", "rename", "new_file", "new_folder"]) handler(a, ev());
    expect(deps.fileOps.handleAction).toHaveBeenCalledTimes(7);
    expect(deps.archive.handleAction).not.toHaveBeenCalled();
  });

  it("similar-looking ids are not zip actions (`zip`, `zip_list`, `ZIP_CREATE`) => false and archive untouched", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    for (const a of ["zip", "zip_list", "ZIP_CREATE", "unzip"]) expect(handler(a, ev())).toBe(false);
    expect(deps.archive.handleAction).not.toHaveBeenCalled();
  });

  it("existing cases keep working with the archive dependency present (open on a FILE => viewer.openFile, per SPEC-0300-0015 §3.5.3)", () => {
    const { deps } = makeDeps();
    const handler = createListActionHandler(deps as never);
    expect(handler("open", ev())).toBe(true);
    expect(deps.viewer.openFile).toHaveBeenCalledWith("C:\\d\\a");
    expect(deps.afterUserNavigation).not.toHaveBeenCalled();
    expect(deps.archive.handleAction).not.toHaveBeenCalled();
  });
});

describe("createFileOpsContext: entryType is passed through (MUST-67, §3.4.13-3)", () => {
  const F = { name: "a.txt", path: "C:\\d\\a.txt", entryType: "file" as const };
  const D = { name: "x.zip", path: "C:\\d\\x.zip", entryType: "dir" as const };
  const H = { name: "hidden.zip", path: "C:\\d\\hidden.zip", entryType: "file" as const };

  function ctx(over: Record<string, unknown> = {}) {
    return createFileOpsContext({
      currentPath: () => "C:\\d",
      entries: () => [F, D, H],
      filteredEntries: () => [F, D],
      selected: () => new Set([F.path, H.path]),
      focusedPath: () => D.path,
      ...over,
    } as never)();
  }

  it("each displayed entry carries name, path AND entryType (a directory named x.zip stays a 'dir')", () => {
    const entries = ctx().entries as { name: string; path: string; entryType: string }[];
    expect(entries).toEqual([
      { name: "a.txt", path: F.path, entryType: "file" },
      { name: "x.zip", path: D.path, entryType: "dir" },
    ]);
  });

  it("R-307-1: entries that are filtered out are absent (so their type can never make them a target); selection / focus rules are unchanged", () => {
    const c = ctx();
    expect((c.entries as { path: string }[]).some((e) => e.path === H.path)).toBe(false);
    expect(c.selected).toEqual([F.path]);
    expect(c.focusedPath).toBe(D.path);
    expect(c.currentPath).toBe("C:\\d");
  });

  it("is re-evaluated on every call (getters), including entryType", () => {
    let list = [F];
    const get = createFileOpsContext({
      currentPath: () => "C:\\d",
      entries: () => list,
      filteredEntries: () => list,
      selected: () => new Set<string>(),
      focusedPath: () => null,
    } as never);
    expect((get().entries as { entryType: string }[])[0].entryType).toBe("file");
    list = [{ ...F, entryType: "dir" as never }];
    expect((get().entries as { entryType: string }[])[0].entryType).toBe("dir");
  });
});
