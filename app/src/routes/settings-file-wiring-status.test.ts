import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0022 R-1663 / R-1663-1 / R-1663-2 / R-1655, AC-1647 (an open result is APPENDED with ` / ` to a start-up notice with errors),
//   AC-1655 ((i) a check with errors replaced by a quiet one, (ii) the reverse, (iii) a start-up notice incl. its ui-state part replaced by a check result,
//   (iv) an open result appended behind a check with errors), AC-1656 (15 s with errors / unreadable, 2.5 s quiet / missing; the open result alone 2.5 s).
// Architecture: SPEC-0200-0001 §3.17.10: `shared/state/status-message.svelte.ts` is UNCHANGED; the wiring combines its `show` and `showPriority`.
//   This file uses the REAL status state (a fresh `createStatusMessageState()`) with the REAL settings-file wiring and only fakes the IPC.
//
// Module under test: ./settings-file-wiring.ts + shared/state/status-message.svelte.ts

import { createStatusMessageState } from "$lib/shared/state/status-message.svelte";
import { createSettingsFileWiring } from "./settings-file-wiring";

const keymap = (over: Record<string, unknown> = {}) =>
  ({ entries: [], parseError: null, present: true, unknownSettings: [], ...over }) as never;
const app = (over: Record<string, unknown> = {}) => ({ dark: true, bg: "#2e3440", uiVars: [], fontFamily: "monospace", fontSize: 16, rowHeight: 21, minColWidth: 24, treeWidthPercent: 24, problems: [], ...over }) as never;
const ext = () => ({ apps: [], invalid: [], typeError: false, typeErrorLine: null }) as never;
const BAD = () => ({ keymap: keymap({ entries: [{ actionId: "copy", value: "Ctrl+", line: 12 }] }), externalApps: ext(), appearance: app() });
const GOOD = () => ({ keymap: keymap(), externalApps: ext(), appearance: app() });
const BAD_TEXT = "設定ファイルのチェック(次の起動での扱い): config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。";
const GOOD_TEXT = "設定ファイルのチェック(次の起動での扱い): 問題はありません。変更は再起動で反映されます";
const OPENED = "config.toml を VS Code で開きました";

function setup(next: { check: () => unknown }) {
  const status = createStatusMessageState();
  const ipc = {
    settingsFileOpen: vi.fn(async () => ({ templateCreated: false, sampleError: null, result: { kind: "vscode" } })),
    settingsFileCheck: vi.fn(async () => next.check()),
  };
  const wiring = createSettingsFileWiring({ status, closeMenus: () => {}, ipc } as never);
  return { status, wiring };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("AC-1656: how long each result stays", () => {
  it("with errors: 15 s", async () => {
    const s = setup({ check: BAD });
    await s.wiring.check();
    expect(s.status.text).toBe(BAD_TEXT);
    await vi.advanceTimersByTimeAsync(14999);
    expect(s.status.text).toBe(BAD_TEXT);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.status.text).toBeNull();
  });

  it("nothing wrong: 2.5 s", async () => {
    const s = setup({ check: GOOD });
    await s.wiring.check();
    await vi.advanceTimersByTimeAsync(2499);
    expect(s.status.text).toBe(GOOD_TEXT);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.status.text).toBeNull();
  });

  it("no config.toml: 2.5 s", async () => {
    const s = setup({ check: () => ({ keymap: keymap({ present: false }), externalApps: ext(), appearance: app() }) });
    await s.wiring.check();
    await vi.advanceTimersByTimeAsync(2500);
    expect(s.status.text).toBeNull();
  });

  it("the open result alone (no priority text): 2.5 s", async () => {
    const s = setup({ check: GOOD });
    await s.wiring.open();
    expect(s.status.text).toBe(OPENED);
    await vi.advanceTimersByTimeAsync(2500);
    expect(s.status.text).toBeNull();
  });
});

describe("AC-1655: replacing (R-1663-1)", () => {
  it("(i) a check with errors, then a quiet check: the quiet one replaces it, and it is gone after 2.5 s (not after the old 15 s)", async () => {
    let which = BAD;
    const s = setup({ check: () => which() });
    await s.wiring.check();
    which = GOOD;
    await s.wiring.check();
    expect(s.status.text).toBe(GOOD_TEXT);
    await vi.advanceTimersByTimeAsync(2500);
    expect(s.status.text).toBeNull();
  });

  it("(ii) a quiet check, then one with errors: replaced, 15 s", async () => {
    let which = GOOD;
    const s = setup({ check: () => which() });
    await s.wiring.check();
    which = BAD;
    await s.wiring.check();
    expect(s.status.text).toBe(BAD_TEXT);
    await vi.advanceTimersByTimeAsync(14999);
    expect(s.status.text).toBe(BAD_TEXT);
  });

  it("(iii) a start-up notice (with its ui-state part) is replaced as a whole by the check result", async () => {
    const s = setup({ check: GOOD });
    s.status.showPriority("config.toml の不正なキー割り当て 1 件を無視しました: copy(12 行目)。 / ui-state.toml のお知らせ", 15000);
    await s.wiring.check();
    expect(s.status.text).toBe(GOOD_TEXT);
    expect(s.status.text).not.toContain("ui-state");
  });
});

describe("AC-1647 / AC-1655 (iv): an open result is appended to a priority text, which keeps its own time", () => {
  it("AC-1647: behind a start-up notice with errors: `<notice> / <result>`; the notice is not removed", async () => {
    const s = setup({ check: GOOD });
    s.status.showPriority("STARTUP", 15000);
    await s.wiring.open();
    expect(s.status.text).toBe(`STARTUP / ${OPENED}`);
  });

  it("AC-1655 (iv): behind a check result with errors: `<check> / <opened>`, and both disappear together at the check's 15 s", async () => {
    const s = setup({ check: BAD });
    await s.wiring.check();
    await s.wiring.open();
    expect(s.status.text).toBe(`${BAD_TEXT} / ${OPENED}`);
    await vi.advanceTimersByTimeAsync(14999);
    expect(s.status.text).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.status.text).toBeNull();
  });
});
