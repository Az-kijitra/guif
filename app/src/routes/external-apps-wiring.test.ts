import { describe, expect, it, vi } from "vitest";
import { createExternalAppsWiring } from "./external-apps-wiring";

// [単体] Spec: SPEC-0300-0021 R-1530 (key / menu bar: the FOCUS ROW only), R-1531 (no focus row -> the current folder as a folder), R-1533 (the tree having the
//   focus changes nothing: the file list's focus row is the target), R-1549 (a key repeat starts nothing but the key is still consumed; every fresh press starts
//   once, also a second launch of the same app), R-1550 + R-1560 (a key with no decidable target starts nothing and shows W-9D `対象がありません`),
//   R-1552 (the menu items: name, FIRST usable key as the shortcut text, formatted like R-1330-1), R-1560 / R-1561 (the menu's availability = "a target can be
//   decided"), R-1570 / R-1571.. (messages via the launch flow), R-1535 (target decided at the moment of the launch for key / menu bar; handed over for the
//   right-click menu), AC-1512 / AC-1513 / AC-1515 / AC-1523 / AC-1543 (the unit parts).
// Architecture: SPEC-0200-0001 §3.16.6 (`routes/external-apps-wiring.ts`: composition only), §3.16.7 (`onExternalAppKey`: 1 match -> 2 repeat => consumed without a
//   launch -> 3 no target => W-9D, consumed -> 4 `launchExternalApp` without waiting, consumed), §3.16.8 / MUST-144 (`barExtension()`, `launchByIndex`, the
//   right-click menu's `launchOnTarget`), MINOR-36 (`formatShortcut` is called HERE).
//
// Contract assumed (reported to the implementer):
//   createExternalAppsWiring(deps: {
//     entries: () => readonly { index: number; label: string; keys: readonly string[] }[];                       // externalAppsState.entries in production
//     filteredEntries: () => readonly { path: string; name: string; entryType: "file" | "dir" }[];                // the displayed rows
//     focusedPath: () => string;                                                                                // "" = none
//     currentPath: () => string;
//     status: { show(message: string): void };
//     ipc?: { externalAppLaunch(index: number, path: string, kind: "file" | "dir"): Promise<void> };            // defaults to shared/ipc/external-apps
//   }): {
//     readonly entries: readonly { index: number; label: string; shortcutText?: string }[];                     // for the menus (the right-click menu ignores shortcutText)
//     barExtension(): { externalApps: readonly { index: number; label: string; shortcutText?: string }[]; externalTargetAvailable: boolean };
//     onKey(event: KeydownLikeEvent): boolean;          // true = consumed (the dispatcher prevents the default action)
//     launchByIndex(index: number): void;               // menu bar: target decided now; W-9D when none
//     launchOnTarget(index: number, target: { path: string; kind: "file" | "dir" }): void;   // right-click menu: the target the menu was opened with
//   }
//
// Module under test (not yet implemented): ./external-apps-wiring.ts

const A = { path: "C:\\w\\a.txt", name: "a.txt", entryType: "file" as const };
const B = { path: "C:\\w\\b.txt", name: "b.txt", entryType: "file" as const };
const C = { path: "C:\\w\\c.txt", name: "c.txt", entryType: "file" as const };
const D = { path: "C:\\w\\d", name: "d", entryType: "dir" as const };

const ENTRIES = [
  { index: 0, label: "ターミナルで開く", keys: ["Ctrl+Alt+C"] },
  { index: 1, label: "VS Codeで開く", keys: ["Ctrl+Alt+V"] },
  { index: 2, label: "エクスプローラーで開く", keys: ["Ctrl+Alt+E", "F9"] },
  { index: 3, label: "GitHub Desktopで開く", keys: ["Ctrl+Alt+Shift+G"] },
  { index: 4, label: "keyless", keys: [] as string[] },
];

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean; isComposing: boolean; keyCode: number; repeat: boolean }> = {},
) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

function setup(over: { rows?: (typeof A)[]; focused?: string; current?: string; entries?: typeof ENTRIES; launch?: (i: number, p: string, k: "file" | "dir") => Promise<void> } = {}) {
  const state = { rows: over.rows ?? [A, B, C, D], focused: over.focused ?? C.path, current: over.current ?? "C:\\w", entries: over.entries ?? ENTRIES };
  const ipc = { externalAppLaunch: vi.fn(over.launch ?? (async () => {})) };
  const status = { show: vi.fn() };
  const wiring = createExternalAppsWiring({
    entries: () => state.entries,
    filteredEntries: () => state.rows,
    focusedPath: () => state.focused,
    currentPath: () => state.current,
    status,
    ipc,
  } as never);
  return { wiring, state, ipc, status };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("the key (R-1550)", () => {
  it("AC-1512: a registration key launches that app with the FOCUS ROW (a file) and is consumed", async () => {
    const s = setup({ focused: C.path }); // a.txt / b.txt may be selected elsewhere: the wiring does not even know the selection
    expect(s.wiring.onKey(ev("v", { ctrlKey: true, altKey: true }))).toBe(true);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledTimes(1);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(1, C.path, "file");
    await flush();
    expect(s.status.show).toHaveBeenCalledWith("「VS Codeで開く」を起動しました");
  });

  it("a folder row is sent as a folder", () => {
    const s = setup({ focused: D.path });
    s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }));
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(0, D.path, "dir");
  });

  it("the second key of a comma list and a Shift key work too", () => {
    const s = setup();
    expect(s.wiring.onKey(ev("F9"))).toBe(true);
    expect(s.ipc.externalAppLaunch).toHaveBeenLastCalledWith(2, C.path, "file");
    expect(s.wiring.onKey(ev("g", { ctrlKey: true, altKey: true, shiftKey: true }))).toBe(true);
    expect(s.ipc.externalAppLaunch).toHaveBeenLastCalledWith(3, C.path, "file");
  });

  it("the key is compared the way the keymap compares (case of the key body, modifier order in the written key)", () => {
    const s = setup({ entries: [{ index: 0, label: "x", keys: ["ctrl+alt+t"] }] as never });
    expect(s.wiring.onKey(ev("T", { ctrlKey: true, altKey: true }))).toBe(true);
    expect(s.wiring.onKey(ev("t", { ctrlKey: true, altKey: true }))).toBe(true);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledTimes(2);
  });

  it("a key nobody registered is not consumed and starts nothing", () => {
    const s = setup();
    expect(s.wiring.onKey(ev("x", { ctrlKey: true }))).toBe(false);
    expect(s.wiring.onKey(ev("c", { ctrlKey: true }))).toBe(false);
    expect(s.wiring.onKey(ev("Tab"))).toBe(false);
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
    expect(s.status.show).not.toHaveBeenCalled();
  });

  it("an app without a key is never started by a key", () => {
    const s = setup();
    expect(s.wiring.onKey(ev("k"))).toBe(false);
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
  });

  it("R-1550 (no registrations at all, external_apps = []): nothing is consumed", () => {
    const s = setup({ entries: [] });
    expect(s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }))).toBe(false);
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
    expect(s.status.show).not.toHaveBeenCalled();
  });

  it("IME composition is never a launch", () => {
    const s = setup();
    expect(s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true, isComposing: true }))).toBe(false);
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
  });
});

describe("R-1549: the key repeat (AC-1523)", () => {
  it("a repeating keydown starts nothing but IS consumed (so the OS / page do nothing with it)", () => {
    const s = setup();
    expect(s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true, repeat: true }))).toBe(true);
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
    expect(s.status.show).not.toHaveBeenCalled();
  });

  it("press, hold (3 repeats), release, press again: two launches in total", () => {
    const s = setup();
    const press = ev("c", { ctrlKey: true, altKey: true });
    const held = ev("c", { ctrlKey: true, altKey: true, repeat: true });
    s.wiring.onKey(press);
    s.wiring.onKey(held);
    s.wiring.onKey(held);
    s.wiring.onKey(held);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledTimes(1);
    s.wiring.onKey(press);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledTimes(2);
  });

  it("a repeat of a key that is NOT registered is not consumed", () => {
    const s = setup();
    expect(s.wiring.onKey(ev("x", { ctrlKey: true, repeat: true }))).toBe(false);
  });

  it("the same app can be started again while the first launch is still running (no guard)", () => {
    const s = setup({ launch: () => new Promise<void>(() => {}) });
    s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }));
    s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }));
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledTimes(2);
  });

  it("it does not wait for the launch: the key is consumed while the backend call is still pending", () => {
    const s = setup({ launch: () => new Promise<void>(() => {}) });
    expect(s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }))).toBe(true);
    expect(s.status.show).not.toHaveBeenCalled();
  });
});

describe("the target (R-1530 / R-1531 / R-1533)", () => {
  it("AC-1513: no focus row (an empty folder, or the search shows nothing) -> the current folder as a folder", () => {
    const empty = setup({ rows: [], focused: "", current: "C:\\w\\e" });
    empty.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }));
    expect(empty.ipc.externalAppLaunch).toHaveBeenCalledWith(0, "C:\\w\\e", "dir");
    const filtered = setup({ rows: [], focused: C.path, current: "C:\\w" }); // the focused path is not displayed any more
    filtered.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }));
    expect(filtered.ipc.externalAppLaunch).toHaveBeenCalledWith(0, "C:\\w", "dir");
  });

  it("the focused path must be among the DISPLAYED rows, else the current folder is the target", () => {
    const s = setup({ rows: [A, B], focused: C.path });
    s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }));
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(0, "C:\\w", "dir");
  });

  it("AC-1543: no focus row and no current folder: nothing is started, W-9D is shown once, the key is consumed", () => {
    const s = setup({ rows: [], focused: "", current: "" });
    expect(s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }))).toBe(true);
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
    expect(s.status.show).toHaveBeenCalledTimes(1);
    expect(s.status.show).toHaveBeenCalledWith("対象がありません");
  });

  it("the target is decided at the moment of the key (a later change of the focus is seen by the next press)", () => {
    const s = setup({ focused: A.path });
    s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }));
    s.state.focused = D.path;
    s.wiring.onKey(ev("c", { ctrlKey: true, altKey: true }));
    expect(s.ipc.externalAppLaunch.mock.calls.map((c) => c[1])).toEqual([A.path, D.path]);
  });

  it("a .zip file is an ordinary file target (R-1534)", () => {
    const zip = { path: "C:\\w\\z.zip", name: "z.zip", entryType: "file" as const };
    const s = setup({ rows: [zip], focused: zip.path });
    s.wiring.onKey(ev("e", { ctrlKey: true, altKey: true }));
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(2, zip.path, "file");
  });
});

describe("failures are shown, never thrown (R-1575)", () => {
  it("the not-found message of the backend reaches the status line", async () => {
    const err = Object.assign(new Error(""), { code: "program_not_found", program: "C:\\x\\GitHubDesktop.exe" });
    const s = setup({ launch: () => Promise.reject(err) });
    s.wiring.onKey(ev("g", { ctrlKey: true, altKey: true, shiftKey: true }));
    await flush();
    expect(s.status.show).toHaveBeenCalledTimes(1);
    expect(s.status.show).toHaveBeenCalledWith("「GitHub Desktopで開く」を起動できませんでした。実行ファイルが見つかりません: C:\\x\\GitHubDesktop.exe。");
  });
});

describe("the menu bar (R-1552, R-1530, R-1533)", () => {
  it("launchByIndex decides the target NOW from the focus row and launches", async () => {
    const s = setup({ focused: B.path });
    s.wiring.launchByIndex(3);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(3, B.path, "file");
    await flush();
    expect(s.status.show).toHaveBeenCalledWith("「GitHub Desktopで開く」を起動しました");
  });

  it("no focus row -> the current folder", () => {
    const s = setup({ rows: [], focused: "", current: "C:\\w\\e" });
    s.wiring.launchByIndex(0);
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(0, "C:\\w\\e", "dir");
  });

  it("no target at all -> W-9D, nothing started", () => {
    const s = setup({ rows: [], focused: "", current: "" });
    s.wiring.launchByIndex(0);
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
    expect(s.status.show).toHaveBeenCalledWith("対象がありません");
  });

  it("an index that is not registered is ignored without a message", () => {
    const s = setup();
    s.wiring.launchByIndex(99);
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
    expect(s.status.show).not.toHaveBeenCalled();
  });

  it("barExtension lists the registrations with name and the FIRST key, formatted like the other shortcuts (R-1330-1)", () => {
    const s = setup();
    const ext = s.wiring.barExtension();
    expect(ext.externalApps).toEqual([
      { index: 0, label: "ターミナルで開く", shortcutText: "Ctrl+Alt+C" },
      { index: 1, label: "VS Codeで開く", shortcutText: "Ctrl+Alt+V" },
      { index: 2, label: "エクスプローラーで開く", shortcutText: "Ctrl+Alt+E" },
      { index: 3, label: "GitHub Desktopで開く", shortcutText: "Ctrl+Alt+Shift+G" },
      { index: 4, label: "keyless" },
    ]);
    expect("shortcutText" in ext.externalApps[4]).toBe(false);
  });

  it("the shortcut text is the normal form of the key as written (R-1330-1: `ctrl+alt+shift+g` -> `Ctrl+Alt+Shift+G`)", () => {
    const s = setup({ entries: [{ index: 0, label: "x", keys: ["alt+ctrl+t"] }] as never });
    expect(s.wiring.barExtension().externalApps[0].shortcutText).toBe("Ctrl+Alt+T");
  });

  it("externalTargetAvailable: true with a focus row or a current folder, false with neither (R-1560)", () => {
    expect(setup().wiring.barExtension().externalTargetAvailable).toBe(true);
    expect(setup({ rows: [], focused: "", current: "C:\\w" }).wiring.barExtension().externalTargetAvailable).toBe(true);
    expect(setup({ rows: [], focused: "", current: "" }).wiring.barExtension().externalTargetAvailable).toBe(false);
  });

  it("with no registrations barExtension has an empty list", () => {
    expect(setup({ entries: [] }).wiring.barExtension().externalApps).toEqual([]);
  });

  it("the entries (for the right-click menu) are the same list", () => {
    const s = setup();
    expect(s.wiring.entries.map((e) => [e.index, e.label])).toEqual(ENTRIES.map((e) => [e.index, e.label]));
  });
});

describe("the right-click menu (R-1532, R-1535)", () => {
  it("launchOnTarget launches exactly the target it is given -- the focus row and the current folder are not consulted", () => {
    const s = setup({ focused: A.path });
    s.wiring.launchOnTarget(1, { path: B.path, kind: "file" });
    s.wiring.launchOnTarget(0, { path: "C:\\w\\sub", kind: "dir" });
    expect(s.ipc.externalAppLaunch.mock.calls).toEqual([
      [1, B.path, "file"],
      [0, "C:\\w\\sub", "dir"],
    ]);
  });

  it("works even when no focus row and no current folder exist now (the menu decided earlier)", () => {
    const s = setup({ rows: [], focused: "", current: "" });
    s.wiring.launchOnTarget(0, { path: "C:\\w\\gone.txt", kind: "file" });
    expect(s.ipc.externalAppLaunch).toHaveBeenCalledWith(0, "C:\\w\\gone.txt", "file");
    expect(s.status.show).not.toHaveBeenCalledWith("対象がありません");
  });

  it("AC-1517: a target that vanished meanwhile is the backend's answer, shown as the target-missing message", async () => {
    const err = Object.assign(new Error(""), { code: "target_missing" });
    const s = setup({ launch: () => Promise.reject(err) });
    s.wiring.launchOnTarget(0, { path: "C:\\w\\gone.txt", kind: "file" });
    await flush();
    expect(s.status.show).toHaveBeenCalledWith("「ターミナルで開く」を起動できませんでした。対象が見つかりません。");
  });

  it("an index that is not registered is ignored", () => {
    const s = setup();
    s.wiring.launchOnTarget(42, { path: B.path, kind: "file" });
    expect(s.ipc.externalAppLaunch).not.toHaveBeenCalled();
  });
});
