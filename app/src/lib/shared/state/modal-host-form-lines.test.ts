import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0014 R-320 (the create dialog shows the number of targets),
//   R-340 (the extract dialog shows the ZIP path), R-395-1 (inline error keeps
//   the dialog open), R-326-2-1 (a form can be re-opened with the previous
//   input); SPEC-0300-0011 R-60~R-63 (existing form behaviour must not change).
// Architecture: SPEC-0200-0001 §3.4.1 / §3.4.11-D (approved 2026-09-27):
//   `FormSpec` gets an OPTIONAL `lines?: string[]` (display-only rows above the
//   fields); existing callers (file-ops) do not pass it, so nothing changes for
//   them (backward compatible). `ModalTop`'s form state is unchanged.
// Module under test: ./modal-host.svelte.ts (existing; only the type gains a
//   field, and `top.spec` keeps carrying the spec object handed to form()).
// Kept in a separate file so modal-host.test.ts stays untouched.

import { createModalHost, type FormSpec } from "./modal-host.svelte";

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function spec(over: Partial<FormSpec> = {}): FormSpec {
  return {
    title: "ZIPを作成",
    fields: [{ id: "outputPath", label: "出力先", type: "text", value: "C:\\w\\a.zip" }],
    submitLabel: "作成",
    cancelLabel: "キャンセル",
    onSubmit: async () => null,
    ...over,
  };
}

describe("FormSpec.lines (SPEC-0200-0001 §3.4.11-D; R-320, R-340)", () => {
  it("the lines given to form() are exposed on top.spec unchanged, in order, for the dialog to render", () => {
    const host = createModalHost();
    void host.form(spec({ lines: ["対象: 3件", "C:\\work"] }));
    expect(host.top?.kind).toBe("form");
    expect((host.top?.spec as FormSpec).lines).toEqual(["対象: 3件", "C:\\work"]);
  });

  it("R-340: a long ZIP path is carried as a single untruncated line", () => {
    const host = createModalHost();
    const longPath = "C:\\" + "very-long-directory-name\\".repeat(10) + "archive.zip";
    void host.form(spec({ lines: [`ZIP: ${longPath}`] }));
    expect((host.top?.spec as FormSpec).lines).toEqual([`ZIP: ${longPath}`]);
  });

  it("backward compatible: a form WITHOUT lines still opens and `lines` stays undefined (file-ops rename/create)", () => {
    const host = createModalHost();
    void host.form(spec());
    expect(host.top?.kind).toBe("form");
    expect((host.top?.spec as FormSpec).lines).toBeUndefined();
  });

  it("an empty lines array is allowed", () => {
    const host = createModalHost();
    void host.form(spec({ lines: [] }));
    expect((host.top?.spec as FormSpec).lines).toEqual([]);
  });

  it("lines do not create form values: `values` holds only the fields (a display row is not submitted)", () => {
    const host = createModalHost();
    void host.form(spec({ lines: ["対象: 1件"] }));
    expect(host.top?.values).toEqual({ outputPath: "C:\\w\\a.zip" });
  });

  it("form behaviour is unchanged with lines: submit => onSubmit gets the values and null closes with 'submitted'", async () => {
    const host = createModalHost();
    const onSubmit = vi.fn(async () => null);
    const p = host.form(spec({ lines: ["対象: 1件"], onSubmit }));
    host.setFieldValue("outputPath", "C:\\w\\b.zip");
    host.dispatch({ type: "submit" });
    await flush();
    expect(onSubmit).toHaveBeenCalledWith({ outputPath: "C:\\w\\b.zip" });
    expect(await p).toBe("submitted");
    expect(host.isOpen).toBe(false);
  });

  it("R-395-1: an inline error keeps the dialog open with the lines still present, and a re-submit is possible", async () => {
    const host = createModalHost();
    const onSubmit = vi.fn().mockResolvedValueOnce("出力先が不正です").mockResolvedValueOnce(null);
    const p = host.form(spec({ lines: ["対象: 2件"], onSubmit }));
    host.dispatch({ type: "submit" });
    await flush();
    expect(host.top?.error).toBe("出力先が不正です");
    expect(host.top?.submitting).toBe(false);
    expect((host.top?.spec as FormSpec).lines).toEqual(["対象: 2件"]);
    host.dispatch({ type: "submit" });
    await flush();
    expect(await p).toBe("submitted");
  });

  it("cancel with lines => 'cancelled' (Escape closes the dialog without side effects)", async () => {
    const host = createModalHost();
    const p = host.form(spec({ lines: ["対象: 2件"] }));
    host.dispatch({ type: "cancel" });
    expect(await p).toBe("cancelled");
  });

  it("single slot is unaffected: a second modal while a lines-form is open still throws", async () => {
    const host = createModalHost();
    void host.form(spec({ lines: ["x"] }));
    let threw = false;
    try {
      void host.form(spec());
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
