import { describe, expect, it, vi } from "vitest";
import { createClipboardTextWriter } from "./clipboard-text";

// Spec: SPEC-0300-0018 R-1060 (text to the OS clipboard), R-1060-3 (failure must
//   not be silent -> the writer REJECTS so the caller can show the status),
//   R-1060-5, R-1061 (text only; not the CF_HDROP GAP), AC-1053.
// Architecture: SPEC-0200-0001 §3.9.8 (DI: `clipboard` may be undefined; a
//   rejected writeText propagates). Module under test (stub): ./clipboard-text.ts

describe("createClipboardTextWriter (AC-1053)", () => {
  it("passes the text to writeText unchanged (CRLF included) and resolves", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const write = createClipboardTextWriter({ clipboard: { writeText } });
    await expect(write("C:\\a\r\nC:\\b")).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith("C:\\a\r\nC:\\b");
  });

  it("rejects when writeText rejects (permission / focus failure)", async () => {
    const error = new Error("NotAllowedError");
    const write = createClipboardTextWriter({ clipboard: { writeText: vi.fn().mockRejectedValue(error) } });
    await expect(write("x")).rejects.toBe(error);
  });

  it("rejects when the clipboard API does not exist", async () => {
    const write = createClipboardTextWriter({ clipboard: undefined });
    await expect(write("x")).rejects.toBeDefined();
  });

  it("rejects (as a promise, not a synchronous throw) when writeText throws synchronously", async () => {
    const write = createClipboardTextWriter({
      clipboard: {
        writeText: () => {
          throw new Error("boom");
        },
      },
    });
    let result: Promise<void> | undefined;
    expect(() => {
      result = write("x");
    }).not.toThrow();
    await expect(result).rejects.toBeDefined();
  });

  it("does not call writeText when constructed (lazy)", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    createClipboardTextWriter({ clipboard: { writeText } });
    expect(writeText).not.toHaveBeenCalled();
  });
});
