import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0011 R-35/R-53/R-55 (confirm dialogs, default = cancel),
//   R-33/R-34-1 (apply-to-all checkbox, default checked), R-42/R-42-1/R-42-2/
//   R-43 (progress modal, cancel once), R-60~R-63 / R-70~R-74 (form dialogs
//   with inline errors that keep the dialog open), R-82 (inline errors),
//   R-81 (failure list = confirm with one button), AC-32-1, AC-40.
// Architecture: docs/architecture/proposals/SPEC-0200-0001.md §3.3.3 (data
//   descriptors + read/operate surfaces), §3.3.13-4 (SHOULD-75: single
//   slot; opening a second modal while one is shown throws; kinds =
//   confirm/form/progress only), §3.3.13-5 (MUST-63 cancel is ignored while
//   submitting; SHOULD-83 onSubmit throw => inline message, dialog stays
//   open, submitting=false), §3.3.10 (test strategy), §3.3.14-1 (承認A:
//   modal-host is an approved shared state).
// Module under test (not yet implemented): ./modal-host.svelte.ts
//   exports `createModalHost()` (factory, same shape as
//   createStatusMessageState) and the singleton `modalHost`.
//
// Contract assumed by these tests (documented in the handback report; the
// design fixes the operation names but not the shape of `top`/`dispatch`):
//   host.isOpen: boolean, host.depth: 0|1, host.topId: number|null
//     (monotonically increasing per opened modal; null when closed)
//   host.top: null | { id, kind: "confirm"|"form"|"progress", spec,
//     // mutable state, flattened onto `top`:
//     values?: Record<string,string>, error?: string|null, submitting?: boolean,
//     checked?: boolean, label?: string, index?: number, total?: number,
//     canCancel?: boolean }
//   host.confirm(spec) => Promise<{ buttonId, checked }>
//   host.form(spec) => Promise<"submitted" | "cancelled">
//   host.showProgress(spec) => { update({label,index,total}), close() }
//   host.dispatch({ type: "cancel" } | { type: "submit" } |
//                 { type: "pressButton", id })
//   host.setFieldValue(fieldId, value), host.setChecked(checked)

import { createModalHost, modalHost } from "./modal-host.svelte";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function confirmSpec(overrides: Record<string, unknown> = {}) {
  return {
    title: "確認",
    lines: ["a.txt"],
    buttons: [
      { id: "overwrite", label: "上書き" },
      { id: "skip", label: "スキップ" },
      { id: "cancel", label: "キャンセル" },
    ],
    defaultButtonId: "cancel",
    cancelButtonId: "cancel",
    ...overrides,
  };
}

function formSpec(onSubmit: (values: Record<string, string>) => Promise<string | null>) {
  return {
    title: "名前の変更",
    fields: [{ id: "name", label: "名前", type: "text" as const, value: "report.txt", selection: [0, 6] as [number, number] }],
    submitLabel: "OK",
    cancelLabel: "キャンセル",
    onSubmit,
  };
}

// True when calling fn throws synchronously or returns a rejecting promise
// (the design says "throws"; sync-vs-async is not fixed).
function throwsOrRejects(fn: () => unknown): Promise<boolean> {
  try {
    const r = fn();
    return Promise.race([
      Promise.resolve(r).then(
        () => false,
        () => true,
      ),
      new Promise<boolean>((res) => setTimeout(() => res(false), 0)),
    ]);
  } catch {
    return Promise.resolve(true);
  }
}

describe("initial state / singleton", () => {
  it("starts closed: isOpen=false, depth=0, topId=null, top=null", () => {
    const host = createModalHost();
    expect(host.isOpen).toBe(false);
    expect(host.depth).toBe(0);
    expect(host.topId).toBeNull();
    expect(host.top).toBeNull();
  });

  it("exports a singleton modalHost with the same surface", () => {
    expect(modalHost.isOpen).toBe(false);
    expect(typeof modalHost.confirm).toBe("function");
    expect(typeof modalHost.form).toBe("function");
    expect(typeof modalHost.showProgress).toBe("function");
    expect(typeof modalHost.dispatch).toBe("function");
  });

  it("dispatch with nothing open is a harmless no-op", () => {
    const host = createModalHost();
    expect(() => host.dispatch({ type: "cancel" })).not.toThrow();
    expect(() => host.dispatch({ type: "submit" })).not.toThrow();
    expect(() => host.dispatch({ type: "pressButton", id: "x" })).not.toThrow();
  });
});

describe("confirm (R-31/R-35/R-53/R-55)", () => {
  it("opening publishes kind=confirm, depth=1 and a topId", () => {
    const host = createModalHost();
    void host.confirm(confirmSpec());
    expect(host.isOpen).toBe(true);
    expect(host.depth).toBe(1);
    expect(host.topId).not.toBeNull();
    expect(host.top?.kind).toBe("confirm");
  });

  it("pressButton(id) resolves { buttonId: id, checked } and closes", async () => {
    const host = createModalHost();
    const p = host.confirm(confirmSpec());
    host.dispatch({ type: "pressButton", id: "overwrite" });
    await expect(p).resolves.toEqual({ buttonId: "overwrite", checked: false });
    expect(host.isOpen).toBe(false);
    expect(host.topId).toBeNull();
    expect(host.top).toBeNull();
  });

  it("cancel (Escape) resolves with the spec's cancelButtonId, not a hard-coded id", async () => {
    const host = createModalHost();
    const p = host.confirm(confirmSpec({ cancelButtonId: "no", buttons: [{ id: "yes", label: "Y" }, { id: "no", label: "N" }], defaultButtonId: "no" }));
    host.dispatch({ type: "cancel" });
    await expect(p).resolves.toMatchObject({ buttonId: "no" });
    expect(host.isOpen).toBe(false);
  });

  it("checkbox: initial value comes from the spec (R-34-1 initial ON) and toggling is reported in the result", async () => {
    const host = createModalHost();
    const p = host.confirm(confirmSpec({ checkbox: { label: "すべてに適用", checked: true } }));
    expect(host.top?.checked).toBe(true);
    host.setChecked(false);
    expect(host.top?.checked).toBe(false);
    host.dispatch({ type: "pressButton", id: "skip" });
    await expect(p).resolves.toEqual({ buttonId: "skip", checked: false });
  });

  it("checkbox left checked is reported as checked=true", async () => {
    const host = createModalHost();
    const p = host.confirm(confirmSpec({ checkbox: { label: "すべてに適用", checked: true } }));
    host.dispatch({ type: "pressButton", id: "overwrite" });
    await expect(p).resolves.toEqual({ buttonId: "overwrite", checked: true });
  });

  it("failure list (R-81) is a confirm with a single button: pressing it resolves and closes", async () => {
    const host = createModalHost();
    const p = host.confirm({
      title: "失敗",
      lines: ["a: エラー"],
      note: "ほか3件",
      buttons: [{ id: "close", label: "閉じる" }],
      defaultButtonId: "close",
      cancelButtonId: "close",
    });
    host.dispatch({ type: "cancel" });
    await expect(p).resolves.toMatchObject({ buttonId: "close" });
    expect(host.isOpen).toBe(false);
  });

  it("pressButton with an unknown id is ignored (dialog stays open)", async () => {
    const host = createModalHost();
    const p = host.confirm(confirmSpec());
    host.dispatch({ type: "pressButton", id: "nope" });
    expect(host.isOpen).toBe(true);
    host.dispatch({ type: "cancel" });
    await p;
  });

  it("submit intent (Enter) on a confirm is a no-op (Enter is left to the focused button's native click)", () => {
    const host = createModalHost();
    void host.confirm(confirmSpec());
    host.dispatch({ type: "submit" });
    expect(host.isOpen).toBe(true);
  });
});

describe("single slot (SHOULD-75)", () => {
  it("opening a confirm while another modal is shown throws", async () => {
    const host = createModalHost();
    void host.confirm(confirmSpec());
    expect(await throwsOrRejects(() => host.confirm(confirmSpec()))).toBe(true);
    expect(host.depth).toBe(1);
  });

  it("opening a form / progress while a modal is shown throws", async () => {
    const host = createModalHost();
    void host.confirm(confirmSpec());
    expect(await throwsOrRejects(() => host.form(formSpec(async () => null)))).toBe(true);
    expect(await throwsOrRejects(() => host.showProgress({ title: "t", cancelLabel: "c", onCancel: () => {} }))).toBe(true);
    expect(host.depth).toBe(1);
  });

  it("the slot is reusable after closing, and topId increases monotonically", async () => {
    const host = createModalHost();
    const p1 = host.confirm(confirmSpec());
    const id1 = host.topId as number;
    host.dispatch({ type: "cancel" });
    await p1;
    const p2 = host.confirm(confirmSpec());
    const id2 = host.topId as number;
    expect(id2).toBeGreaterThan(id1);
    host.dispatch({ type: "cancel" });
    await p2;
    expect(host.topId).toBeNull();
  });
});

describe("form (R-60~R-63, R-70~R-74, MUST-63, SHOULD-83)", () => {
  it("opening publishes kind=form with initial values from the fields and no error", () => {
    const host = createModalHost();
    void host.form(formSpec(async () => null));
    expect(host.top?.kind).toBe("form");
    expect(host.top?.values).toEqual({ name: "report.txt" });
    expect(host.top?.error ?? null).toBeNull();
    expect(host.top?.submitting ?? false).toBe(false);
  });

  it("submit passes the current values to onSubmit; null closes the dialog and resolves 'submitted'", async () => {
    const host = createModalHost();
    const onSubmit = vi.fn().mockResolvedValue(null);
    const p = host.form(formSpec(onSubmit));
    host.setFieldValue("name", "new.txt");
    host.dispatch({ type: "submit" });
    await expect(p).resolves.toBe("submitted");
    expect(onSubmit).toHaveBeenCalledWith({ name: "new.txt" });
    expect(host.isOpen).toBe(false);
  });

  it("R-63/R-74: onSubmit returning an error string shows it inline and keeps the dialog open (submitting back to false)", async () => {
    const host = createModalHost();
    const onSubmit = vi.fn().mockResolvedValue("同じ名前の項目がすでに存在します。");
    let settled = false;
    const p = host.form(formSpec(onSubmit)).then((r) => {
      settled = true;
      return r;
    });
    host.dispatch({ type: "submit" });
    await flush();
    expect(host.isOpen).toBe(true);
    expect(host.top?.error).toBe("同じ名前の項目がすでに存在します。");
    expect(host.top?.submitting).toBe(false);
    expect(settled).toBe(false);
    // The user can retry: the next successful submit clears the error and closes.
    onSubmit.mockResolvedValueOnce(null);
    host.dispatch({ type: "submit" });
    await expect(p).resolves.toBe("submitted");
  });

  it("MUST-63/SHOULD-83: onSubmit throwing shows the message inline, stays open, and resets submitting=false", async () => {
    const host = createModalHost();
    const onSubmit = vi.fn().mockRejectedValue(new Error("disk exploded"));
    void host.form(formSpec(onSubmit));
    host.dispatch({ type: "submit" });
    await flush();
    expect(host.isOpen).toBe(true);
    expect(host.top?.submitting).toBe(false);
    expect(host.top?.error).toContain("disk exploded");
  });

  it("SHOULD-83: a bare rejected string (the backend's error code) is shown inline too", async () => {
    const host = createModalHost();
    void host.form(formSpec(vi.fn().mockRejectedValue("some_unknown_code")));
    host.dispatch({ type: "submit" });
    await flush();
    expect(host.isOpen).toBe(true);
    expect(host.top?.error).toContain("some_unknown_code");
  });

  it("MUST-63: cancel while submitting is ignored; the dialog then closes as 'submitted' when the submit succeeds", async () => {
    const host = createModalHost();
    let finishSubmit!: (v: string | null) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<string | null>((res) => {
          finishSubmit = res;
        }),
    );
    const p = host.form(formSpec(onSubmit));
    host.dispatch({ type: "submit" });
    expect(host.top?.submitting).toBe(true);
    host.dispatch({ type: "cancel" }); // Escape / cancel button mid-submit
    expect(host.isOpen).toBe(true);
    expect(host.top?.submitting).toBe(true);
    finishSubmit(null);
    await expect(p).resolves.toBe("submitted");
  });

  it("double submit while submitting calls onSubmit only once", async () => {
    const host = createModalHost();
    let finishSubmit!: (v: string | null) => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<string | null>((res) => {
          finishSubmit = res;
        }),
    );
    const p = host.form(formSpec(onSubmit));
    host.dispatch({ type: "submit" });
    host.dispatch({ type: "submit" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    finishSubmit(null);
    await p;
  });

  it("cancel when not submitting resolves 'cancelled' and does not call onSubmit", async () => {
    const host = createModalHost();
    const onSubmit = vi.fn().mockResolvedValue(null);
    const p = host.form(formSpec(onSubmit));
    host.dispatch({ type: "cancel" });
    await expect(p).resolves.toBe("cancelled");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(host.isOpen).toBe(false);
  });

  it("select field (new-entry kind, R-70/R-72-1): initial value is taken from the spec and edits reach onSubmit", async () => {
    const host = createModalHost();
    const onSubmit = vi.fn().mockResolvedValue(null);
    const p = host.form({
      title: "新規作成",
      fields: [
        {
          id: "kind",
          label: "種別",
          type: "select" as const,
          value: "folder",
          options: [
            { value: "file", label: "ファイル" },
            { value: "folder", label: "フォルダ" },
          ],
        },
        { id: "name", label: "名前", type: "text" as const, value: "" },
      ],
      submitLabel: "作成",
      cancelLabel: "キャンセル",
      onSubmit,
    });
    expect(host.top?.values).toEqual({ kind: "folder", name: "" });
    host.setFieldValue("name", "docs");
    host.dispatch({ type: "submit" });
    await p;
    expect(onSubmit).toHaveBeenCalledWith({ kind: "folder", name: "docs" });
  });
});

describe("progress (R-40/R-41/R-42/R-42-2/R-43)", () => {
  function open(onCancel = vi.fn()) {
    const host = createModalHost();
    const handle = host.showProgress({ title: "コピー中", cancelLabel: "キャンセル", onCancel });
    return { host, handle, onCancel };
  }

  it("opening publishes kind=progress with canCancel=true", () => {
    const { host } = open();
    expect(host.isOpen).toBe(true);
    expect(host.top?.kind).toBe("progress");
    expect(host.top?.canCancel).toBe(true);
  });

  it("handle.update reflects label/index/total in top", () => {
    const { host, handle } = open();
    handle.update({ label: "コピー中 a.txt (1/3)", index: 1, total: 3 });
    expect(host.top?.label).toBe("コピー中 a.txt (1/3)");
    expect(host.top?.index).toBe(1);
    expect(host.top?.total).toBe(3);
  });

  it("handle.close closes the modal", () => {
    const { host, handle } = open();
    handle.close();
    expect(host.isOpen).toBe(false);
    expect(host.topId).toBeNull();
  });

  it("R-42-2: cancel (Escape / button) calls onCancel once and flips canCancel to false; the modal stays open until close()", () => {
    const { host, onCancel } = open();
    host.dispatch({ type: "cancel" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(host.top?.canCancel).toBe(false);
    expect(host.isOpen).toBe(true);
  });

  it("R-43: repeated cancel presses call onCancel only once", () => {
    const { host, onCancel } = open();
    host.dispatch({ type: "cancel" });
    host.dispatch({ type: "cancel" });
    host.dispatch({ type: "cancel" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("update/close after the modal was already closed is harmless (late progress event)", () => {
    const { host, handle } = open();
    handle.close();
    expect(() => handle.update({ label: "late", index: 2, total: 3 })).not.toThrow();
    expect(() => handle.close()).not.toThrow();
    expect(host.isOpen).toBe(false);
  });

  it("a stale handle from a closed modal cannot close the NEXT modal", async () => {
    const host = createModalHost();
    const stale = host.showProgress({ title: "t", cancelLabel: "c", onCancel: () => {} });
    stale.close();
    const p = host.confirm(confirmSpec());
    stale.close();
    stale.update({ label: "x", index: 1, total: 1 });
    expect(host.isOpen).toBe(true);
    expect(host.top?.kind).toBe("confirm");
    host.dispatch({ type: "cancel" });
    await p;
  });

  it("Enter (submit intent) on a progress modal does nothing", () => {
    const { host, onCancel } = open();
    host.dispatch({ type: "submit" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(host.isOpen).toBe(true);
  });
});
