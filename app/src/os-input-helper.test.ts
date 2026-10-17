/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// [単体 / 静的] Spec: SPEC-0400-0001 第5版 R-12 (OS key-input E2E: only an allow-list of key NAMES can be sent; the target is identified by process,
//   not by window title; the foreground window is checked before every send and nothing is sent when it is not the app; the helper never brings a
//   window to the front; never leaves a modifier held), R-12-1-1 / R-12-2 (identification; no foreground-forcing API), R-12-3 (the allow-list), R-12-4
//   (wrong foreground = FAIL, not SKIP), R-12-5 (explicit opt-in `REFLEXFILES_E2E_OS_INPUT=1`; otherwise SKIP with the reason), AC-12 (i)~(vii) (the unit /
//   static ones), SPEC-0300-0020 AC-1348 (the keys it needs), SPEC-0300-0015 AC-520 (`ArrowDown` is what it sends).
// Architecture: SPEC-0200-0001 §3.14.6 + §3.14.12-5 (MUST-133 / 134 / 135, SHOULD-205): `app/e2e/lib/os-input.mjs` (Node built-ins only; PowerShell via
//   `-EncodedCommand`), the allow-list WITHOUT PageUp / PageDown / Home / End (MUST-133 a), each entry sent as ONE SendInput array including the modifier
//   release (MUST-133 b), the foreground check right before each entry, the modifiers verified released at the end by GetAsyncKeyState and never
//   "repaired" by sending more input, the app exe found as a DESCENDANT of the test-launched process with the exact `target\{debug,release}` path
//   (MUST-134 a), and the static scan of `e2e/specs/**` call sites (MUST-135 last rows).
//   The real-OS self tests (`--selftest-os`: Notepad, a same-title form in another process) and `--selftest` run by hand and are NOT in vitest.
//
// Phase 13 TDD (stage B): `app/e2e/lib/os-input.mjs` does not exist yet (RED).
//
// Contract assumed (reported to the implementer) -- all PURE / injectable, no PowerShell is started by these tests:
//   export const ALLOWED_KEYS: readonly string[]      // exactly: AltTap F10 ArrowUp ArrowDown ArrowLeft ArrowRight Escape Alt+F Alt+E Alt+V Alt+G Alt+Space
//   assertAllowedKey(name: unknown): void             // throws for anything else (case-sensitive, no aliases, non-strings too)
//   sequenceFor(name: string): string[]               // ["Alt+Space"] -> ["Alt+Space", "Escape"]; every other name -> [name]; validates first
//   buildInputs(name: string): { vk: number; down: boolean; extended?: boolean }[]    // ONE flat array, presses AND releases
//   selectAppPid(processes: { pid: number; ppid: number; exePath: string | null }[], rootPid: number, expectedExePath: string): number
//                                                      // throws unless exactly ONE descendant of rootPid has exePath === expectedExePath
//   expectedExePath(o: { appDir: string; profile: "debug" | "release" }): string
//   sendKeys(target: { pid: number; hwnd: number }, names: string[], deps: {
//       getForegroundHwnd: () => number; sendInput: (inputs: ReturnType<typeof buildInputs>) => void;
//       getPressedModifiers?: () => number[] }): Promise<{ sent: string[]; aborted: boolean; reason?: string; stuckModifiers: number[] }>
//     - validates ALL names before sending anything (a bad name = throw, zero sends)
//     - for each entry of the expanded sequence: foreground check -> if not target.hwnd, stop (aborted: true) -> ONE sendInput(array)
//     - after the loop (success, abort or throw) it reads getPressedModifiers() and reports leftovers in stuckModifiers; it never sends a repair

const APP = resolve(__dirname, "..");
const HELPER_PATH = join(APP, "e2e", "lib", "os-input.mjs");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = any;
async function helper(): Promise<Mod> {
  return await import(/* @vite-ignore */ HELPER_PATH);
}

const ALLOWED = ["AltTap", "F10", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "Alt+F", "Alt+E", "Alt+V", "Alt+G", "Alt+Space"];
const VK = { MENU: 0x12, CONTROL: 0x11, SHIFT: 0x10, LWIN: 0x5b, RWIN: 0x5c, LSHIFT: 0xa0, RSHIFT: 0xa1, LCTRL: 0xa2, RCTRL: 0xa3, F10: 0x79, ESC: 0x1b, SPACE: 0x20, LEFT: 0x25, UP: 0x26, RIGHT: 0x27, DOWN: 0x28 };

describe("R-12-3: the allow-list", () => {
  it("is exactly the SPEC-0400-0001 R-12-3 list: AltTap F10 the four arrows Escape Alt+F/E/V/G Alt+Space (PageUp/PageDown/Home/End were removed, MUST-133 a)", async () => {
    const h = await helper();
    expect([...h.ALLOWED_KEYS].sort()).toEqual([...ALLOWED].sort());
  });

  it("accepts every allowed name", async () => {
    const h = await helper();
    for (const k of ALLOWED) expect(() => h.assertAllowedKey(k), k).not.toThrow();
  });

  it.each([
    "Enter", "Return", "Delete", "Del", "Backspace", "Tab", "Space", "PageUp", "PageDown", "Home", "End", "Insert", "F1", "F2", "F4", "F5", "F11", "F12",
    "Win", "LWin", "RWin", "Meta", "Super", "Ctrl", "Shift", "Alt", "Ctrl+Alt+Delete", "Ctrl+C", "Ctrl+V", "Ctrl+Q", "Ctrl+Shift+Esc", "Alt+Tab", "Alt+F4",
    "Alt+Enter", "Alt+Shift", "Alt+H", "Alt+Z", "Win+R", "Win+D", "a", "A", "1", "/", "hello", "Esc", "ESC", "escape", "f10", "alttap", "alt+f", "Alt + F",
    "ArrowUp ", " ArrowUp", "Arrow Up", "Up", "Down", "Left", "Right", "",
  ])("rejects %j (not on the list) before anything is sent", async (name) => {
    const h = await helper();
    expect(() => h.assertAllowedKey(name)).toThrow();
  });

  it("rejects non-string input of any shape (no object / array / number form can smuggle a key)", async () => {
    const h = await helper();
    for (const v of [undefined, null, 0, 13, 0x5b, {}, { key: "Enter" }, ["F10"], () => "F10", Symbol("x"), true]) {
      expect(() => h.assertAllowedKey(v), String(typeof v)).toThrow();
    }
  });

  it("the list is frozen: pushing a key into it does not work", async () => {
    const h = await helper();
    expect(Object.isFrozen(h.ALLOWED_KEYS)).toBe(true);
    expect(() => {
      "use strict";
      (h.ALLOWED_KEYS as string[]).push("Enter");
    }).toThrow();
    expect(h.ALLOWED_KEYS).not.toContain("Enter");
  });
});

describe("MUST-133 (b): one flat array per entry, presses and releases together", () => {
  const pairs = (a: { vk: number; down: boolean }[]): [number, boolean][] => a.map((x) => [x.vk, x.down]);

  it("AltTap = Alt down, Alt up", async () => {
    const h = await helper();
    expect(pairs(h.buildInputs("AltTap"))).toEqual([[VK.MENU, true], [VK.MENU, false]]);
  });

  it("F10 = F10 down, F10 up (no Alt, no modifier)", async () => {
    const h = await helper();
    expect(pairs(h.buildInputs("F10"))).toEqual([[VK.F10, true], [VK.F10, false]]);
  });

  it("Escape and the four arrows", async () => {
    const h = await helper();
    expect(pairs(h.buildInputs("Escape"))).toEqual([[VK.ESC, true], [VK.ESC, false]]);
    expect(pairs(h.buildInputs("ArrowLeft"))).toEqual([[VK.LEFT, true], [VK.LEFT, false]]);
    expect(pairs(h.buildInputs("ArrowUp"))).toEqual([[VK.UP, true], [VK.UP, false]]);
    expect(pairs(h.buildInputs("ArrowRight"))).toEqual([[VK.RIGHT, true], [VK.RIGHT, false]]);
    expect(pairs(h.buildInputs("ArrowDown"))).toEqual([[VK.DOWN, true], [VK.DOWN, false]]);
  });

  it("the arrow keys are marked as extended keys (otherwise the numpad arrows are sent, which NumLock changes)", async () => {
    const h = await helper();
    for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) for (const i of h.buildInputs(k)) expect(i.extended, k).toBe(true);
  });

  it.each([["Alt+F", 0x46], ["Alt+E", 0x45], ["Alt+V", 0x56], ["Alt+G", 0x47]] as const)(
    "%s = Alt down, letter down, letter up, Alt up (the modifier is released inside the SAME array)",
    async (name, vk) => {
      const h = await helper();
      expect(pairs(h.buildInputs(name))).toEqual([[VK.MENU, true], [vk, true], [vk, false], [VK.MENU, false]]);
    },
  );

  it("Alt+Space = Alt down, Space down, Space up, Alt up", async () => {
    const h = await helper();
    expect(pairs(h.buildInputs("Alt+Space"))).toEqual([[VK.MENU, true], [VK.SPACE, true], [VK.SPACE, false], [VK.MENU, false]]);
  });

  it("for every allowed name: modifiers are balanced, released in reverse order, and the LAST input is a release", async () => {
    const h = await helper();
    const MODS = new Set([VK.MENU, VK.CONTROL, VK.SHIFT, VK.LSHIFT, VK.RSHIFT, VK.LCTRL, VK.RCTRL, VK.LWIN, VK.RWIN]);
    for (const k of ALLOWED) {
      const inputs: { vk: number; down: boolean }[] = h.buildInputs(k);
      const held: number[] = [];
      for (const i of inputs) {
        if (!MODS.has(i.vk)) continue;
        if (i.down) held.push(i.vk);
        else expect(held.pop(), `${k}: release order`).toBe(i.vk);
      }
      expect(held, `${k}: modifiers left held`).toEqual([]);
      expect(inputs[inputs.length - 1].down, `${k}: last input`).toBe(false);
      const down = inputs.filter((i) => i.down).length;
      const up = inputs.filter((i) => !i.down).length;
      expect(down, `${k}: presses vs releases`).toBe(up);
    }
  });

  it("no allowed name ever produces a Windows key, Ctrl, Shift, Enter, Delete, Tab, F4 or a letter outside F/E/V/G (MUST-133 / R-12-3)", async () => {
    const h = await helper();
    const FORBIDDEN = new Set([VK.CONTROL, VK.SHIFT, VK.LSHIFT, VK.RSHIFT, VK.LCTRL, VK.RCTRL, VK.LWIN, VK.RWIN, 0x0d, 0x2e, 0x09, 0x73, 0x08, 0x21, 0x22, 0x23, 0x24]);
    for (const k of ALLOWED) for (const i of h.buildInputs(k)) expect(FORBIDDEN.has(i.vk), `${k}: vk 0x${i.vk.toString(16)}`).toBe(false);
    for (const k of ["Alt+F", "Alt+E", "Alt+V", "Alt+G"]) expect(h.buildInputs(k).map((i: { vk: number }) => i.vk)).toContain({ "Alt+F": 0x46, "Alt+E": 0x45, "Alt+V": 0x56, "Alt+G": 0x47 }[k]);
  });

  it("buildInputs refuses a name outside the list (it cannot be used to assemble an arbitrary key)", async () => {
    const h = await helper();
    for (const bad of ["Enter", "Win+R", "Alt+Tab", "PageDown"]) expect(() => h.buildInputs(bad)).toThrow();
  });
});

describe("Alt+Space is one unit with the Escape that closes the system menu (R-12-3)", () => {
  it("sequenceFor expands Alt+Space to [Alt+Space, Escape]; every other name is itself", async () => {
    const h = await helper();
    expect(h.sequenceFor("Alt+Space")).toEqual(["Alt+Space", "Escape"]);
    for (const k of ALLOWED.filter((x) => x !== "Alt+Space")) expect(h.sequenceFor(k), k).toEqual([k]);
  });

  it("sequenceFor validates", async () => {
    const h = await helper();
    expect(() => h.sequenceFor("Enter")).toThrow();
  });
});

describe("R-12-2 / R-12-4 / MUST-133: sendKeys sends only to the target, one array per entry, checks the foreground before EACH entry", () => {
  const TARGET = { pid: 4242, hwnd: 0x1234 };
  function setup(foreground: (callIndex: number) => number, pressed: number[] = []) {
    let calls = 0;
    const sendInput = vi.fn();
    const getForegroundHwnd = vi.fn(() => foreground(calls++));
    const getPressedModifiers = vi.fn(() => pressed);
    return { sendInput, getForegroundHwnd, getPressedModifiers, deps: { sendInput, getForegroundHwnd, getPressedModifiers } };
  }

  it("foreground = target: every entry is sent, as ONE sendInput call each with exactly buildInputs(name)", async () => {
    const h = await helper();
    const s = setup(() => TARGET.hwnd);
    const r = await h.sendKeys(TARGET, ["AltTap", "ArrowDown", "Alt+F"], s.deps);
    expect(r.sent).toEqual(["AltTap", "ArrowDown", "Alt+F"]);
    expect(r.aborted).toBe(false);
    expect(s.sendInput).toHaveBeenCalledTimes(3);
    expect(s.sendInput.mock.calls[0][0]).toEqual(h.buildInputs("AltTap"));
    expect(s.sendInput.mock.calls[1][0]).toEqual(h.buildInputs("ArrowDown"));
    expect(s.sendInput.mock.calls[2][0]).toEqual(h.buildInputs("Alt+F"));
  });

  it("Alt+Space is followed by its Escape without being asked: two sendInput calls, the foreground checked before each", async () => {
    const h = await helper();
    const s = setup(() => TARGET.hwnd);
    const r = await h.sendKeys(TARGET, ["Alt+Space"], s.deps);
    expect(r.sent).toEqual(["Alt+Space", "Escape"]);
    expect(s.sendInput).toHaveBeenCalledTimes(2);
    expect(s.getForegroundHwnd.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("AC-12 (iii): another window is in front at the start -> NOT ONE input is sent, aborted, with a reason", async () => {
    const h = await helper();
    const s = setup(() => 0x9999);
    const r = await h.sendKeys(TARGET, ["F10", "ArrowDown"], s.deps);
    expect(s.sendInput).not.toHaveBeenCalled();
    expect(r.sent).toEqual([]);
    expect(r.aborted).toBe(true);
    expect(typeof r.reason).toBe("string");
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("R-12-4: no foreground window at all (0 / no interactive desktop) counts as a mismatch, never as 'fine'", async () => {
    const h = await helper();
    const s = setup(() => 0);
    const r = await h.sendKeys(TARGET, ["F10"], s.deps);
    expect(s.sendInput).not.toHaveBeenCalled();
    expect(r.aborted).toBe(true);
  });

  it("AC-12 (iv): the foreground changes BETWEEN entries -> the entries after the change are not sent; the entry in flight was one complete array", async () => {
    const h = await helper();
    // call 0 (before entry 1): target; call 1 (before entry 2): target; call 2 (before entry 3): somebody else
    const s = setup((i) => (i < 2 ? TARGET.hwnd : 0x9999));
    const r = await h.sendKeys(TARGET, ["AltTap", "ArrowDown", "Alt+F", "F10"], s.deps);
    expect(r.sent).toEqual(["AltTap", "ArrowDown"]);
    expect(r.aborted).toBe(true);
    expect(s.sendInput).toHaveBeenCalledTimes(2);
    for (const c of s.sendInput.mock.calls as [{ vk: number; down: boolean }[]][]) {
      const arr = c[0];
      expect(arr[arr.length - 1].down).toBe(false); // each array ended with a release: no modifier left held by the helper
    }
  });

  it("the check is made before EACH entry: the foreground is read at least once per entry sent", async () => {
    const h = await helper();
    const s = setup(() => TARGET.hwnd);
    await h.sendKeys(TARGET, ["F10", "ArrowRight", "ArrowDown", "Escape"], s.deps);
    expect(s.getForegroundHwnd.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("MUST-133/134: a name outside the allow-list anywhere in the list -> throws BEFORE the first send (zero sends, zero foreground reads needed)", async () => {
    const h = await helper();
    const s = setup(() => TARGET.hwnd);
    await expect(h.sendKeys(TARGET, ["F10", "ArrowDown", "Enter"], s.deps)).rejects.toThrow();
    expect(s.sendInput).not.toHaveBeenCalled();
  });

  it("a malformed target (no hwnd / pid) is refused: the helper never guesses a window", async () => {
    const h = await helper();
    const s = setup(() => 0);
    await expect(h.sendKeys({ pid: 1 } as never, ["F10"], s.deps)).rejects.toThrow();
    await expect(h.sendKeys({ hwnd: 0 } as never, ["F10"], s.deps)).rejects.toThrow();
    await expect(h.sendKeys(null as never, ["F10"], s.deps)).rejects.toThrow();
    expect(s.sendInput).not.toHaveBeenCalled();
  });

  it("MUST-133: modifiers still held at the end are REPORTED (stuckModifiers) and never repaired by sending more input", async () => {
    const h = await helper();
    const s = setup(() => TARGET.hwnd, [VK.MENU]);
    const r = await h.sendKeys(TARGET, ["F10"], s.deps);
    expect(r.stuckModifiers).toEqual([VK.MENU]);
    expect(s.sendInput).toHaveBeenCalledTimes(1); // only the F10 entry: no 'release Alt' repair was sent
  });

  it("no stuck modifiers -> an empty list, also after an abort", async () => {
    const h = await helper();
    const ok = await h.sendKeys(TARGET, ["F10"], setup(() => TARGET.hwnd).deps);
    expect(ok.stuckModifiers).toEqual([]);
    const aborted = await h.sendKeys(TARGET, ["F10"], setup(() => 0x1).deps);
    expect(aborted.stuckModifiers).toEqual([]);
  });

  it("the modifier check also runs when sendInput throws; the error is not swallowed", async () => {
    const h = await helper();
    const getPressedModifiers = vi.fn(() => []);
    const deps = { getForegroundHwnd: () => TARGET.hwnd, sendInput: () => { throw new Error("SendInput failed"); }, getPressedModifiers };
    await expect(h.sendKeys(TARGET, ["F10"], deps)).rejects.toThrow(/SendInput failed/);
    expect(getPressedModifiers).toHaveBeenCalled();
  });
});

describe("MUST-134 (a) / R-12-1-1: finding the app process", () => {
  const EXPECTED = "C:\\Users\\dev\\git\\project\\app\\src-tauri\\target\\debug\\reflexfiles-successor.exe";
  const base = [
    { pid: 100, ppid: 1, exePath: "C:\\Program Files\\nodejs\\node.exe" }, // the test launcher (rootPid)
    { pid: 110, ppid: 100, exePath: "C:\\Windows\\System32\\cmd.exe" },
    { pid: 120, ppid: 110, exePath: EXPECTED }, // the app
    { pid: 130, ppid: 120, exePath: "C:\\Program Files (x86)\\Microsoft\\EdgeWebView\\Application\\msedgewebview2.exe" }, // owns the CDP port, NOT the app
    { pid: 900, ppid: 1, exePath: "C:\\Users\\dev\\AppData\\Local\\guif\\guif.exe" }, // the user's own installed app
  ];

  it("the single descendant with the exact path is chosen (not the WebView2 process that owns the CDP port, not the user's installed guif.exe)", async () => {
    const h = await helper();
    expect(h.selectAppPid(base, 100, EXPECTED)).toBe(120);
  });

  it("zero candidates -> throws (abort, nothing is sent)", async () => {
    const h = await helper();
    expect(() => h.selectAppPid(base.filter((p) => p.pid !== 120), 100, EXPECTED)).toThrow();
  });

  it("two candidates -> throws (ambiguous)", async () => {
    const h = await helper();
    expect(() => h.selectAppPid([...base, { pid: 121, ppid: 110, exePath: EXPECTED }], 100, EXPECTED)).toThrow();
  });

  it("a process with the right path that is NOT a descendant of the launcher is ignored (another copy started by somebody else)", async () => {
    const h = await helper();
    expect(h.selectAppPid([...base, { pid: 700, ppid: 1, exePath: EXPECTED }], 100, EXPECTED)).toBe(120);
    expect(() => h.selectAppPid(base.filter((p) => p.pid !== 120).concat([{ pid: 700, ppid: 1, exePath: EXPECTED }]), 100, EXPECTED)).toThrow();
  });

  it("the match is on the full path, not the file name or a prefix/suffix: the user's guif.exe, the same name in another folder, and a longer path are all rejected", async () => {
    const h = await helper();
    const decoys = [
      { pid: 201, ppid: 100, exePath: "C:\\Users\\dev\\AppData\\Local\\guif\\guif.exe" },
      { pid: 202, ppid: 100, exePath: "C:\\other\\target\\debug\\reflexfiles-successor.exe" },
      { pid: 203, ppid: 100, exePath: EXPECTED + ".bak" },
      { pid: 204, ppid: 100, exePath: "D:" + EXPECTED.slice(2) },
      { pid: 205, ppid: 100, exePath: null },
    ];
    expect(() => h.selectAppPid(decoys, 100, EXPECTED)).toThrow();
  });

  it("Windows path rules: case and slash style do not matter", async () => {
    const h = await helper();
    const odd = [{ pid: 100, ppid: 1, exePath: "x" }, { pid: 120, ppid: 100, exePath: EXPECTED.toUpperCase().replace(/\\/g, "/") }];
    expect(h.selectAppPid(odd, 100, EXPECTED)).toBe(120);
  });

  it("grandchildren count as descendants (cmd -> npm -> cargo -> app), and a parent cycle in the table does not hang", async () => {
    const h = await helper();
    const deep = [
      { pid: 100, ppid: 1, exePath: "n" }, { pid: 101, ppid: 100, exePath: "c" }, { pid: 102, ppid: 101, exePath: "d" },
      { pid: 103, ppid: 102, exePath: "e" }, { pid: 104, ppid: 103, exePath: EXPECTED },
      { pid: 500, ppid: 501, exePath: "x" }, { pid: 501, ppid: 500, exePath: "y" },
    ];
    expect(h.selectAppPid(deep, 100, EXPECTED)).toBe(104);
  });

  it("the expected path is built from the build settings: debug is <app>\\src-tauri\\target\\debug\\reflexfiles-successor.exe -- never the user's guif.exe", async () => {
    const h = await helper();
    const dbg: string = h.expectedExePath({ appDir: "C:\\r\\app", profile: "debug" });
    expect(dbg.toLowerCase().replace(/\//g, "\\")).toBe("c:\\r\\app\\src-tauri\\target\\debug\\reflexfiles-successor.exe");
    const rel: string = h.expectedExePath({ appDir: "C:\\r\\app", profile: "release" });
    expect(rel.toLowerCase().replace(/\//g, "\\")).toMatch(/^c:\\r\\app\\src-tauri\\target\\release\\[a-z-]+\.exe$/);
    expect(rel.toLowerCase()).toContain("\\target\\release\\");
  });
});

describe("static: os-input.mjs obeys the safety rules (R-12-2, R-12-3, SHOULD-205)", () => {
  const src = (): string => readFileSync(HELPER_PATH, "utf-8");
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

  it("exists", () => {
    expect(existsSync(HELPER_PATH)).toBe(true);
  });

  it("no API that brings a window to the front or moves the focus -- the helper cannot give the app a foreground it did not get itself (AC-1348 / AC-520)", () => {
    const s = stripComments(src());
    for (const api of [
      "SetForegroundWindow", "AllowSetForegroundWindow", "LockSetForegroundWindow", "SwitchToThisWindow", "BringWindowToTop", "SetActiveWindow", "SetFocus",
      "ShowWindow", "ShowWindowAsync", "AttachThreadInput", "keybd_event", "mouse_event", "SendMessage", "PostMessage", "AppActivate", "SendKeys",
    ]) {
      expect(s, api).not.toContain(api);
    }
  });

  it("uses the intended Win32 calls: SendInput, GetForegroundWindow, GetWindowThreadProcessId, GetGUIThreadInfo, GetAsyncKeyState", () => {
    const s = src();
    for (const api of ["SendInput", "GetForegroundWindow", "GetWindowThreadProcessId", "GetGUIThreadInfo", "GetAsyncKeyState"]) expect(s, api).toContain(api);
  });

  it("PowerShell is started with -EncodedCommand and the execution policy is not touched", () => {
    const s = stripComments(src());
    expect(s).toContain("-EncodedCommand");
    expect(s).not.toMatch(/-ExecutionPolicy|Set-ExecutionPolicy|Bypass/i);
  });

  it("only Node built-ins are imported (`node:`): no new dependency for the key sending (R-12 dependency clause)", () => {
    const specs = [...stripComments(src()).matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(specs.length).toBeGreaterThan(0);
    for (const s of specs) expect(s.startsWith("node:"), s).toBe(true);
  });

  it("no key name outside the allow-list appears as a string literal (Enter, Delete, Tab, Win, PageDown, Alt+Tab, Alt+F4, Ctrl+...)", () => {
    const s = stripComments(src());
    for (const name of ["Enter", "Return", "Delete", "Tab", "Win", "LWin", "RWin", "PageUp", "PageDown", "Home", "End", "Alt+Tab", "Alt+F4", "Ctrl+Alt+Delete"]) {
      expect(s, name).not.toMatch(new RegExp(`["'\`]${name.replace(/\+/g, "\\+")}["'\`]`));
    }
    expect(s).not.toMatch(/["'`]Ctrl\+/);
  });

  it("the --selftest entry exists (runs without the app: allow-list, PID selection, foreground mock in dry-run mode)", () => {
    expect(src()).toContain("--selftest");
  });

  it("the E2E opt-in and its SKIP reason are in the code: REFLEXFILES_E2E_OS_INPUT (R-12-5)", () => {
    const all = [HELPER_PATH, join(APP, "e2e", "run.mjs")].filter(existsSync).map((f) => readFileSync(f, "utf-8")).join("\n");
    expect(all).toContain("REFLEXFILES_E2E_OS_INPUT");
    expect(all).toContain("OS のキー入力のテストは無効");
  });
});

describe("package.json: nothing was added for sending keys (AC-12 'OS キー入力のために依存を足さない')", () => {
  it("no key-sending / process-listing package in dependencies or devDependencies", () => {
    const pkg = JSON.parse(readFileSync(join(APP, "package.json"), "utf-8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /robotjs|nut-?js|node-key-sender|sendkeys|ffi|koffi|edge-js|ps-list|node-powershell|windows-?(?:api|input)|autohotkey|win32|user32|desktop-?automation|puppeteer-?input/i.test(n))).toEqual([]);
  });
});

describe("static: the call sites in e2e/specs/** and e2e/run.mjs send only allow-listed names (MUST-135, last-but-one row)", () => {
  const E2E = join(APP, "e2e");
  const files = (): string[] => [...readdirSync(join(E2E, "specs")).filter((f) => f.endsWith(".mjs")).map((f) => join(E2E, "specs", f)), join(E2E, "run.mjs")];

  // every quoted string inside the argument list of each `sendKeys(` call
  function sendKeysLiterals(text: string): string[] {
    const out: string[] = [];
    let from = 0;
    for (;;) {
      const at = text.indexOf("sendKeys(", from);
      if (at < 0) return out;
      let i = at + "sendKeys(".length;
      let depth = 1;
      const start = i;
      while (i < text.length && depth > 0) {
        if ("([{".includes(text[i])) depth++;
        else if (")]}".includes(text[i])) depth--;
        i++;
      }
      for (const m of text.slice(start, i - 1).matchAll(/["'`]([^"'`]*)["'`]/g)) out.push(m[1]);
      from = i;
    }
  }
  const nonLiteralArgs = (text: string): boolean => /sendKeys\(\s*[^)]*\[\s*[A-Za-z_$][\w$.]*\s*[\],]/.test(text);

  it("the scanner finds quoted names in call arguments and flags a variable key list (self-check)", () => {
    expect(sendKeysLiterals('await sendKeys(t, ["F10", "ArrowDown"]); sendKeys(t, ["Alt+F"])')).toEqual(["F10", "ArrowDown", "Alt+F"]);
    expect(sendKeysLiterals("nothing here")).toEqual([]);
    expect(nonLiteralArgs("sendKeys(t, [name])")).toBe(true);
    expect(nonLiteralArgs('sendKeys(t, ["F10"])')).toBe(false);
  });

  it("every literal handed to sendKeys( in the E2E code is on the allow-list", () => {
    const bad: string[] = [];
    for (const f of files()) {
      for (const lit of sendKeysLiterals(readFileSync(f, "utf-8"))) if (!ALLOWED.includes(lit)) bad.push(`${f}: ${JSON.stringify(lit)}`);
    }
    expect(bad).toEqual([]);
  });

  it("no call builds the key list from a variable (a literal list can be audited, a variable one cannot)", () => {
    const bad = files().filter((f) => nonLiteralArgs(readFileSync(f, "utf-8")));
    expect(bad).toEqual([]);
  });

  it("only files that import the helper call sendKeys( (nothing else defines its own SendInput path)", () => {
    for (const f of files()) {
      const text = readFileSync(f, "utf-8");
      if (/\bsendKeys\(/.test(text)) expect(text, f).toMatch(/os-input\.mjs/);
      expect(text, f).not.toMatch(/\bSendInput\b|\bkeybd_event\b/);
    }
  });

  it("the spike probe is not registered in run.mjs (SHOULD-202): keymenu-probe stays out of SPEC_FILES / SCENARIO_FILES", () => {
    expect(readFileSync(join(E2E, "run.mjs"), "utf-8")).not.toContain("keymenu-probe");
  });

  it("the os-input scenario is a scenario (one app start, AC-1348 needs 'right after start') and the menu bar spec is registered", () => {
    const run = readFileSync(join(E2E, "run.mjs"), "utf-8");
    const scen = /const SCENARIO_FILES = \[([^\]]*)\]/.exec(run);
    expect(scen).not.toBeNull();
    expect(scen![1]).toContain('"os-input"');
    const spec = /const SPEC_FILES = \[([^\]]*)\]/.exec(run);
    expect(spec).not.toBeNull();
    expect(spec![1]).toContain('"menubar"');
  });
});
