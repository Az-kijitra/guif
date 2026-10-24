import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0023 R-1721 / R-1742 (the colours are set before the first paint: the main window WAITS for the back end's values in
//   `load`, so the page is never drawn with the defaults), R-1749 (the viewer: the values given at window creation, read once),
//   SPEC-0300-0015 R-420-1 (the route guard still runs FIRST and synchronously: the main window never enters /viewer and vice versa).
// Architecture: SPEC-0200-0001 §3.18.5 + §3.18.15 (Q-B, MUST-1): `routes/+layout.ts` `load` is `async`. The guard (`resolveRouteGuardRedirect` +
//   `throw redirect`) is first. For the MAIN label only, `startAppearanceLoad()` is called at MODULE LOAD (to overlap the wait with other start-up
//   work) and `load` awaits that Promise, then `applyAppearance(dto)`. A failure -> one `console.error` and carry on WITHOUT colours (no throw).
//   For the VIEWER label there is no IPC: `load` reads the initialization script's values synchronously (`readViewerInitVars`) and applies them
//   (`applyCssVars`); when they cannot be read -> one `console.error`, carry on.
//
// Module under test: ./+layout.ts (existing; `load` becomes async)

const startAppearanceLoad = vi.fn();
const applyAppearance = vi.fn();
const applyCssVars = vi.fn();
const readViewerInitVars = vi.fn();
let label = "main";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label }) }));
vi.mock("$lib/shared/state/appearance-state.svelte", () => ({ startAppearanceLoad: () => startAppearanceLoad() }));
vi.mock("$lib/shared/appearance-apply", () => ({
  applyAppearance: (d: unknown) => applyAppearance(d),
  applyCssVars: (v: unknown) => applyCssVars(v),
  readViewerInitVars: () => readViewerInitVars(),
}));

const dto = { dark: true, bg: "#2e3440", uiVars: [["--ui-bg", "#2e3440"]], fontFamily: "monospace", fontSize: 16, rowHeight: 21, minColWidth: 24, treeWidthPercent: 24, problems: [] };

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  startAppearanceLoad.mockReset();
  applyAppearance.mockReset();
  applyCssVars.mockReset();
  readViewerInitVars.mockReset();
  label = "main";
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

async function loadLayout() {
  return await import("./+layout");
}

const url = (path: string) => new URL(`http://localhost${path}`);

describe("main window", () => {
  it("module load starts the appearance load once (before `load` is even called)", async () => {
    startAppearanceLoad.mockResolvedValue(dto);
    await loadLayout();
    expect(startAppearanceLoad).toHaveBeenCalledTimes(1);
  });

  it("`load` waits for the values, applies them (applyAppearance with the dto) and returns {}", async () => {
    let resolve!: (v: unknown) => void;
    startAppearanceLoad.mockReturnValue(new Promise((r) => (resolve = r)));
    const { load } = await loadLayout();
    const result = Promise.resolve(load({ url: url("/") }));
    await Promise.resolve();
    expect(applyAppearance).not.toHaveBeenCalled(); // still waiting: the page must not be drawn yet (R-1742)
    resolve(dto);
    await expect(result).resolves.toEqual({});
    expect(applyAppearance).toHaveBeenCalledTimes(1);
    expect(applyAppearance).toHaveBeenCalledWith(dto);
    expect(startAppearanceLoad).toHaveBeenCalledTimes(1); // `load` reuses the Promise started at module load
  });

  it("a failed load: one console.error, no applyAppearance, `load` still resolves {} (the start does not stop, MUST-1)", async () => {
    startAppearanceLoad.mockRejectedValue(new Error("no such command"));
    const { load } = await loadLayout();
    await expect(Promise.resolve(load({ url: url("/") }))).resolves.toEqual({});
    expect(applyAppearance).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("R-420-1: the main window on /viewer is redirected to / BEFORE waiting (the guard is first)", async () => {
    startAppearanceLoad.mockReturnValue(new Promise(() => {})); // never resolves: the redirect must not depend on it
    const { load } = await loadLayout();
    const outcome = await Promise.race([
      Promise.resolve().then(() => load({ url: url("/viewer") })).then(
        () => "resolved",
        (e: { status?: number; location?: string }) => `${e.status} ${e.location}`,
      ),
      new Promise((r) => setTimeout(() => r("timeout"), 50)),
    ]);
    expect(outcome).toBe("307 /");
    expect(applyAppearance).not.toHaveBeenCalled();
  });
});

describe("viewer window", () => {
  beforeEach(() => {
    label = "viewer";
  });

  it("makes no IPC: neither module load nor `load` calls startAppearanceLoad (the viewer capability has no appearance_load)", async () => {
    readViewerInitVars.mockReturnValue([["--vw-bg", "#2e3440"]]);
    const { load } = await loadLayout();
    await load({ url: url("/viewer") });
    expect(startAppearanceLoad).not.toHaveBeenCalled();
    expect(applyAppearance).not.toHaveBeenCalled();
  });

  it("reads the initialization script's pairs and applies them with applyCssVars", async () => {
    const vars = [
      ["--vw-bg", "#2e3440"],
      ["--vw-color-scheme", "dark"],
    ];
    readViewerInitVars.mockReturnValue(vars);
    const { load } = await loadLayout();
    await expect(Promise.resolve(load({ url: url("/viewer") }))).resolves.toEqual({});
    expect(applyCssVars).toHaveBeenCalledTimes(1);
    expect(applyCssVars).toHaveBeenCalledWith(vars);
  });

  it("when the values cannot be read: one console.error, nothing applied, `load` still returns {}", async () => {
    readViewerInitVars.mockReturnValue(null);
    const { load } = await loadLayout();
    await expect(Promise.resolve(load({ url: url("/viewer") }))).resolves.toEqual({});
    expect(applyCssVars).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("R-420-1: the viewer window on / is redirected to /viewer", async () => {
    const { load } = await loadLayout();
    await expect(Promise.resolve().then(() => load({ url: url("/") }))).rejects.toMatchObject({ status: 307, location: "/viewer" });
  });
});
