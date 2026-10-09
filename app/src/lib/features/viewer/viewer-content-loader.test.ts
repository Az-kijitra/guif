import { describe, expect, it, vi } from "vitest";
import { createViewerContentLoader } from "./viewer-controller";

// [単体] SPEC-0300-0015 R-512 / R-514 (SPEC-0300-0019 W-50 / W-51): the viewer page shows `読み込み中…` while a
// handed-over file loads and `ファイルが選択されていません` only when nothing was handed over. The page cannot know
// a file was taken until the loader says so, because the file name only arrives with the content; `onTaken` is
// that signal (found by the wording E2E, AC-1210 (ii): the loading branch was unreachable).

const pending = { path: "C:\\work\\a.txt", kind: "text", currentIndex: 0, siblings: ["C:\\work\\a.txt"] };

function deps(takePending: () => Promise<unknown>) {
  const order: string[] = [];
  return {
    order,
    deps: {
      takePending: takePending as never,
      readText: vi.fn(async () => {
        order.push("readText");
        return { content: "x", encoding: "UTF-8", truncationMessage: null } as never;
      }),
      readImage: vi.fn(async () => new Uint8Array() as never),
      navigate: vi.fn(async () => ({}) as never),
    },
  };
}

describe("loadFromPending onTaken (R-512 / R-514)", () => {
  it("calls onTaken once a file was handed over, before its content is read", async () => {
    const d = deps(async () => pending);
    const loader = createViewerContentLoader(d.deps);
    const onTaken = vi.fn(() => d.order.push("onTaken"));
    const result = await loader.loadFromPending({ onTaken });
    expect(onTaken).toHaveBeenCalledTimes(1);
    expect(d.order).toEqual(["onTaken", "readText"]);
    expect(result?.fileName).toBe("a.txt");
  });

  it("does not call onTaken when nothing was handed over (the page keeps the no-file placeholder)", async () => {
    const d = deps(async () => null);
    const onTaken = vi.fn();
    expect(await createViewerContentLoader(d.deps).loadFromPending({ onTaken })).toBeNull();
    expect(onTaken).not.toHaveBeenCalled();
  });

  it("still works without options (existing callers)", async () => {
    const d = deps(async () => pending);
    expect((await createViewerContentLoader(d.deps).loadFromPending())?.fileName).toBe("a.txt");
  });
});
