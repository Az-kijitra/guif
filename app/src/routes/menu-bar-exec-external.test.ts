import { describe, expect, it, vi } from "vitest";
import { createMenuExecutor } from "./menu-bar-exec";

// [単体] Spec: SPEC-0300-0021 R-1552 + R-1554 (a registered app's menu-bar item runs AFTER the menu closed and the focus went back -- the executor itself is
//   only the table "item id -> handler call"; `runItem` in menu-bar-wiring does close -> restore focus -> execute), R-1530 / R-1533 (the target is decided at
//   the moment of the launch by the external-apps wiring, NOT by the menu: the executor passes only the registration's index), SPEC-0300-0020 R-1340 (a menu
//   item calls the handler a key would; here: the launch path of the registered apps, never `onListAction`), SPEC-0300-0010 R-14-5-4.
// Architecture: SPEC-0200-0001 §3.16.8 (`routes/menu-bar-exec.ts`: `createMenuExecutor` gets a dep `launchExternal(index)` and routes ids matching
//   `/^ext:(\d+)$/` to it), §3.16.15 MUST-144.
//
// Contract assumed (reported to the implementer):
//   MenuExecutorDeps gains: launchExternal?: (index: number) => void
//   execute("ext:<n>") -> deps.launchExternal(n) exactly once (n is a Number); onListAction / onExitAction / copyPath are not called.
//   An id that does not match /^ext:(\d+)$/ never reaches launchExternal. Without the dep, an ext id is silently ignored (no throw).
//
// Module under test: ./menu-bar-exec.ts

function recorder(withExternal = true) {
  const onListAction = vi.fn(() => true);
  const onExitAction = vi.fn(() => true);
  const copyPath = vi.fn();
  const launchExternal = vi.fn();
  const deps = withExternal ? { onListAction, onExitAction, copyPath, launchExternal } : { onListAction, onExitAction, copyPath };
  const execute = createMenuExecutor(deps as never) as (id: string, ...rest: unknown[]) => void;
  return { execute, onListAction, onExitAction, copyPath, launchExternal };
}

describe("ext:<n> items", () => {
  it.each([0, 1, 3, 9, 12, 19])("ext:%i calls launchExternal(%i) once and nothing else", (n) => {
    const r = recorder();
    r.execute(`ext:${n}`);
    expect(r.launchExternal).toHaveBeenCalledTimes(1);
    expect(r.launchExternal).toHaveBeenCalledWith(n);
    expect(r.onListAction).not.toHaveBeenCalled();
    expect(r.onExitAction).not.toHaveBeenCalled();
    expect(r.copyPath).not.toHaveBeenCalled();
  });

  it("the index is passed as a number", () => {
    const r = recorder();
    r.execute("ext:7");
    expect(typeof r.launchExternal.mock.calls[0][0]).toBe("number");
  });

  it("extra arguments (a click event) are ignored, like for every other item", () => {
    const r = recorder();
    r.execute("ext:2", { shiftKey: true }, "more");
    expect(r.launchExternal).toHaveBeenCalledTimes(1);
    expect(r.launchExternal.mock.calls[0]).toEqual([2]);
  });

  it.each(["ext:", "ext:x", "ext:-1", "ext:1:2", "ext: 1", "ext:1.5", "extx:1", "xext:1", "EXT:1", "open_ext", "ext", ""])("the id %j is not a registered-app item", (id) => {
    const r = recorder();
    r.execute(id);
    expect(r.launchExternal).not.toHaveBeenCalled();
  });

  it("without the dep an ext id is ignored without throwing, and still never reaches the list handler", () => {
    const r = recorder(false);
    expect(() => r.execute("ext:1")).not.toThrow();
    expect(r.onListAction).not.toHaveBeenCalled();
  });
});

describe("the existing items are unchanged", () => {
  it("a list item still calls the key-operation handler with { source: 'menu' } and never the launcher", () => {
    const r = recorder();
    r.execute("new_file");
    expect(r.onListAction).toHaveBeenCalledWith("new_file", { shiftKey: false }, { source: "menu" });
    expect(r.launchExternal).not.toHaveBeenCalled();
  });

  it("exit and copy_path likewise", () => {
    const r = recorder();
    r.execute("exit");
    r.execute("copy_path");
    expect(r.onExitAction).toHaveBeenCalledWith("exit");
    expect(r.copyPath).toHaveBeenCalledTimes(1);
    expect(r.launchExternal).not.toHaveBeenCalled();
  });
});
