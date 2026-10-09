import { beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0009 R-77-3 (a corrupted `ui-state.toml` is reset and reported);
//   SPEC-0300-0019 W-35, AC-1209 (vi) (the notice text is Japanese).
// Architecture: SPEC-0200-0001 §3.13.7 (W-34 / W-35 come from `file-list/messages.ts`), §3.13.14 SHOULD-195 (a):
//   a NEW test (no existing test imports `ui-state-persistence.ts`) with `$lib/shared/ipc/config` mocked.
//
// Module under test: ./ui-state-persistence.ts (`createUiStatePersistenceCoordinator()`; the coordinator's
// `hydrateAll()` resolves to the notice text or null -- see shared/persistence-coordinator.ts).

vi.mock("$lib/shared/ipc/config", () => ({
  uiStateLoad: vi.fn(),
  uiStateSave: vi.fn(),
}));

import { uiStateLoad, type UiStateData } from "$lib/shared/ipc/config";
import { createUiStatePersistenceCoordinator } from "./ui-state-persistence";

function data(): UiStateData {
  return {
    uiShowHidden: false,
    uiShowSize: true,
    uiShowTime: true,
    uiShowTree: true,
    sortKey: "name",
    sortOrder: "asc",
  };
}

beforeEach(() => {
  vi.mocked(uiStateLoad).mockReset();
});

describe("createUiStatePersistenceCoordinator: the load notice (R-77-3, W-35)", () => {
  it("a normal load resolves to null (no notice)", async () => {
    vi.mocked(uiStateLoad).mockResolvedValueOnce({ data: data(), recoveredFromCorruption: false });
    const coordinator = createUiStatePersistenceCoordinator();

    await expect(coordinator.hydrateAll()).resolves.toBeNull();
    expect(coordinator.hydrated).toBe(true);
  });

  it("W-35: a corruption recovery resolves to the Japanese notice that names ui-state.toml", async () => {
    vi.mocked(uiStateLoad).mockResolvedValueOnce({ data: data(), recoveredFromCorruption: true });
    const coordinator = createUiStatePersistenceCoordinator();

    await expect(coordinator.hydrateAll()).resolves.toBe(
      "ui-state.toml を読み込めなかったため、表示の設定を既定に戻しました。元のファイルは退避しました。",
    );
    expect(coordinator.hydrated).toBe(true); // a recovery still counts as a successful load
  });

  it("AC-1212: the old English sentence is gone", async () => {
    vi.mocked(uiStateLoad).mockResolvedValueOnce({ data: data(), recoveredFromCorruption: true });
    const notice = (await createUiStatePersistenceCoordinator().hydrateAll()) ?? "";

    expect(notice).not.toContain("Display settings were corrupted");
  });

  it("W-38: a rejected load resolves to the Japanese `保存データを読み込めなかったため…` notice", async () => {
    vi.mocked(uiStateLoad).mockRejectedValueOnce(new Error("io error"));
    const coordinator = createUiStatePersistenceCoordinator();

    await expect(coordinator.hydrateAll()).resolves.toBe("保存データを読み込めなかったため、今回の変更は保存しません。");
    expect(coordinator.hydrated).toBe(false);
  });
});
