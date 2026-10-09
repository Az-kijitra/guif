import { afterEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0019 AC-1206 (i)(ii)(iii), AC-1211 (the `other` path), W-12 / W-13, R-1204 2;
//   SPEC-0300-0016 R-731 (the list-error body), SPEC-0300-0017 R-906.
// Architecture: SPEC-0200-0001 §3.13.14 MUST-127: `routes/messages.ts` exports the pure template
//   `listErrorText(message: string): string` (= `エラー: ${message}`); `FileListPanel.svelte` shows
//   `{listErrorText(error)}` and takes `読み込み中…` from `shared/messages.ts` (`COMMON.loading`).
//   The test builds `list-state` with the same DI as `features/file-list/list-state-navigate.test.ts` (`$lib/shared/ipc/fs`
//   mocked) and feeds the resulting `state.error` to `listErrorText`. A routes test may import a feature's
//   `list-state` (route 2: composition in routes), so this does not touch the import boundary.
//
// Module under test: ./messages.ts (`listErrorText`), composed with the real `createFileListState()`.

vi.mock("$lib/shared/ipc/fs", async () => {
  class FsListDirError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    fsListDir: vi.fn(),
    FsListDirError,
    normalizeFsListDirError: (e: unknown) =>
      e instanceof FsListDirError ? e : new FsListDirError("other", e instanceof Error ? e.message : String(e)),
  };
});

import { createFileListState } from "$lib/features/file-list/list-state.svelte";
import { COMMON } from "$lib/shared/messages";
import { fsListDir, FsListDirError } from "$lib/shared/ipc/fs";
import { listErrorText } from "./messages";

const mocked = () => vi.mocked(fsListDir);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => mocked().mockReset());

describe("listErrorText: W-13 (`エラー: {message}`)", () => {
  it("prefixes the message with `エラー: ` (full-width colon is NOT used; one half-width space after `:`)", () => {
    expect(listErrorText("x")).toBe("エラー: x");
  });

  it("AC-1212: the old `Error: ` prefix is gone", () => {
    expect(listErrorText("x").startsWith("Error: ")).toBe(false);
  });

  it("is a pure template: an empty message gives only the prefix", () => {
    expect(listErrorText("")).toBe("エラー: ");
  });
});

describe("AC-1206 (ii): a failed (re)load with a known code shows the translated body", () => {
  it("not_found -> `エラー: 対象が見つかりません。`", async () => {
    mocked().mockRejectedValueOnce(new FsListDirError("not_found", "os: not found"));
    const state = createFileListState();
    await state.loadDirectory("C:\\gone");

    expect(state.error).not.toBeNull();
    expect(listErrorText(state.error as string)).toBe("エラー: 対象が見つかりません。");
  });

  it("access_denied -> `エラー: 権限がないため操作を実行できませんでした。`", async () => {
    mocked().mockRejectedValueOnce(new FsListDirError("access_denied", "os: denied"));
    const state = createFileListState();
    await state.loadDirectory("C:\\locked");

    expect(listErrorText(state.error as string)).toBe("エラー: 権限がないため操作を実行できませんでした。");
  });

  it("not_a_directory -> `エラー: フォルダーではありません。` (W-25)", async () => {
    mocked().mockRejectedValueOnce(new FsListDirError("not_a_directory", "os: not dir"));
    const state = createFileListState();
    await state.loadDirectory("C:\\f.txt");

    expect(listErrorText(state.error as string)).toBe("エラー: フォルダーではありません。");
  });
});

describe("AC-1206 (iii) / AC-1211: an `other` failure keeps the OS message as it is (R-1204 2)", () => {
  it("other (message `Some OS error`) -> `エラー: Some OS error` (not translated)", async () => {
    mocked().mockRejectedValueOnce(new FsListDirError("other", "Some OS error"));
    const state = createFileListState();
    await state.loadDirectory("C:\\odd");

    expect(listErrorText(state.error as string)).toBe("エラー: Some OS error");
  });
});

describe("AC-1206 (i): the loading indication", () => {
  it("`loading` is true while fs_list_dir is pending and false afterwards; the text is `読み込み中…`", async () => {
    const gate = deferred<never[]>();
    mocked().mockReturnValueOnce(gate.promise);
    const state = createFileListState();
    const pending = state.loadDirectory("C:\\slow");

    expect(state.loading).toBe(true);
    expect(COMMON.loading).toBe("読み込み中…");

    gate.resolve([]);
    await pending;
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });
});
