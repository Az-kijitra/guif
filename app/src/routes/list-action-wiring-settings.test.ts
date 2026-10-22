import { describe, expect, it, vi } from "vitest";
import { createListActionHandler } from "./list-action-wiring";

// [単体] Spec: SPEC-0300-0022 R-1671 (the operation id `settings` is "open the settings file"; the id set stays 34, AC-1663), R-1606 (an auto-repeat
//   runs nothing; a key-repeat is still consumed), R-1672 (the menu runs it too), AC-1612, AC-1661 (ii) (`settings = "Ctrl+Shift+O"` reaches it via
//   the keymap route); SPEC-0300-0010 第18版 R-44 (`settings` = open the settings file, §4.2 #13).
// Architecture: SPEC-0200-0001 §3.17.9: `ListActionDeps.settingsFile?: { open(): void | Promise<unknown> }`; the `settings` case calls it; the same
//   shape as `external-apps-wiring.ts::onKey` for `repeat` (the event type gains `repeat?: boolean`).
//
// Module under test: ./list-action-wiring.ts

function makeHandler(over: Record<string, unknown> = {}) {
  const settingsFile = { open: vi.fn().mockResolvedValue(undefined) };
  const deps = {
    fileList: {},
    filteredEntries: () => [],
    rowsPerColumn: () => 10,
    afterUserNavigation: vi.fn(),
    activateSearch: vi.fn(),
    openHistoryList: vi.fn(),
    addJump: vi.fn(),
    currentPath: () => "C:\\d",
    fileOps: { handleAction: vi.fn(() => true) },
    archive: { handleAction: vi.fn(() => true) },
    focusedEntry: () => null,
    viewer: { openFile: vi.fn(), openWithOsAssociation: vi.fn() },
    settingsFile,
    ...over,
  };
  const onListAction = createListActionHandler(deps as unknown as Parameters<typeof createListActionHandler>[0]);
  return { onListAction, settingsFile, deps };
}
const ev = (over: Partial<{ shiftKey: boolean; repeat: boolean }> = {}) => ({ shiftKey: false, repeat: false, ...over });

describe("the `settings` action (a keymap-resolved key such as Ctrl+Shift+O)", () => {
  it("calls settingsFile.open() once and reports the key as handled", () => {
    const { onListAction, settingsFile } = makeHandler();
    expect(onListAction("settings", ev())).toBe(true);
    expect(settingsFile.open).toHaveBeenCalledTimes(1);
  });

  it("R-1606: an auto-repeat (event.repeat === true) does nothing but is still consumed (returns true)", () => {
    const { onListAction, settingsFile } = makeHandler();
    expect(onListAction("settings", ev({ repeat: true }))).toBe(true);
    expect(settingsFile.open).not.toHaveBeenCalled();
  });

  it("two separate presses run it twice", () => {
    const { onListAction, settingsFile } = makeHandler();
    onListAction("settings", ev());
    onListAction("settings", ev());
    expect(settingsFile.open).toHaveBeenCalledTimes(2);
  });

  it("R-1672: from the menu (source: 'menu', an event without `repeat`) it runs", () => {
    const { onListAction, settingsFile } = makeHandler();
    expect(onListAction("settings", { shiftKey: false }, { source: "menu" })).toBe(true);
    expect(settingsFile.open).toHaveBeenCalledTimes(1);
  });

  it("works while the tree has the focus (it is not a file operation, R-14-14 does not block it)", () => {
    const { onListAction, settingsFile } = makeHandler({ isTreeFocused: () => true });
    expect(onListAction("settings", ev())).toBe(true);
    expect(settingsFile.open).toHaveBeenCalledTimes(1);
  });

  it("does not touch the file operations, the archive or the viewer", () => {
    const { onListAction, deps } = makeHandler();
    onListAction("settings", ev());
    expect(deps.fileOps.handleAction).not.toHaveBeenCalled();
    expect(deps.archive.handleAction).not.toHaveBeenCalled();
    expect(deps.viewer.openFile).not.toHaveBeenCalled();
    expect(deps.viewer.openWithOsAssociation).not.toHaveBeenCalled();
  });

  it("other actions are unaffected (an unknown id still returns false and opens nothing)", () => {
    const { onListAction, settingsFile } = makeHandler();
    expect(onListAction("help_keymap", ev())).toBe(false);
    expect(settingsFile.open).not.toHaveBeenCalled();
  });
});
