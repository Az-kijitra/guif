import { afterEach, describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0011 R-18 (3 commands, `expectedSequence`, `probeOnly`).
// Architecture: SPEC-0200-0001 §3.10.8 / §4.5 (thin invoke wrappers, camelCase arguments, no logic).
// Only the Tauri boundary is mocked, so command names and argument names are pinned.

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { clipboardClearIfUnchanged, clipboardGetFiles, clipboardSetFiles } from "./clipboard";

afterEach(() => {
  vi.mocked(invoke).mockReset();
});

function lastArgs(): Record<string, unknown> {
  const calls = vi.mocked(invoke).mock.calls;
  return calls[calls.length - 1][1] as Record<string, unknown>;
}

describe("clipboardSetFiles", () => {
  it("invokes clipboard_set_files with { paths, effect } and returns the DTO as is", async () => {
    vi.mocked(invoke).mockResolvedValue({ ok: true, sequence: 5 });
    const r = await clipboardSetFiles(["C:\\a.txt", "C:\\d"], "copy");
    expect(vi.mocked(invoke).mock.calls[0][0]).toBe("clipboard_set_files");
    expect(lastArgs()).toMatchObject({ paths: ["C:\\a.txt", "C:\\d"], effect: "copy" });
    expect(r).toEqual({ ok: true, sequence: 5 });
  });

  it("without options no expectedSequence value is sent", async () => {
    vi.mocked(invoke).mockResolvedValue({ ok: true, sequence: 5 });
    await clipboardSetFiles(["C:\\a"], "move");
    expect(lastArgs().expectedSequence).toBeUndefined();
  });

  it("passes expectedSequence in camelCase", async () => {
    vi.mocked(invoke).mockResolvedValue({ ok: false, sequence: 0, error: "changed" });
    const r = await clipboardSetFiles(["C:\\a"], "move", { expectedSequence: 7 });
    expect(lastArgs()).toMatchObject({ paths: ["C:\\a"], effect: "move", expectedSequence: 7 });
    expect(r).toEqual({ ok: false, sequence: 0, error: "changed" });
  });

  it("an expectedSequence of 0 is still sent (the backend rejects it as 'changed')", async () => {
    vi.mocked(invoke).mockResolvedValue({ ok: false, sequence: 0, error: "changed" });
    await clipboardSetFiles(["C:\\a"], "move", { expectedSequence: 0 });
    expect(lastArgs().expectedSequence).toBe(0);
  });

  it("uses no snake_case argument names", async () => {
    vi.mocked(invoke).mockResolvedValue({ ok: true, sequence: 1 });
    await clipboardSetFiles(["C:\\a"], "move", { expectedSequence: 7 });
    expect(Object.keys(lastArgs()).filter((k) => k.includes("_"))).toEqual([]);
  });

  it("an IPC rejection propagates (the port, not the wrapper, absorbs it)", async () => {
    vi.mocked(invoke).mockRejectedValue(new Error("down"));
    await expect(clipboardSetFiles(["C:\\a"], "copy")).rejects.toThrow("down");
  });
});

describe("clipboardGetFiles", () => {
  it("invokes clipboard_get_files with { probeOnly } (camelCase) and returns the DTO", async () => {
    vi.mocked(invoke).mockResolvedValue({ state: "files", paths: ["C:\\a"], sequence: 9 });
    const r = await clipboardGetFiles(false);
    expect(vi.mocked(invoke).mock.calls[0][0]).toBe("clipboard_get_files");
    expect(lastArgs()).toEqual({ probeOnly: false });
    expect(r).toEqual({ state: "files", paths: ["C:\\a"], sequence: 9 });
  });

  it("probeOnly true is sent as true", async () => {
    vi.mocked(invoke).mockResolvedValue({ state: "none", paths: [], sequence: 1 });
    await clipboardGetFiles(true);
    expect(lastArgs()).toEqual({ probeOnly: true });
  });
});

describe("clipboardClearIfUnchanged", () => {
  it("invokes clipboard_clear_if_unchanged with { sequence } and returns the boolean", async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    expect(await clipboardClearIfUnchanged(5)).toBe(true);
    expect(vi.mocked(invoke).mock.calls[0][0]).toBe("clipboard_clear_if_unchanged");
    expect(lastArgs()).toEqual({ sequence: 5 });
    vi.mocked(invoke).mockResolvedValue(false);
    expect(await clipboardClearIfUnchanged(6)).toBe(false);
  });
});
