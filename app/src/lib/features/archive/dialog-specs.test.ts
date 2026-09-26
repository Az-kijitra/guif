import { describe, expect, it, vi } from "vitest";

// Spec: SPEC-0300-0014 R-320 (create dialog: target count, editable output
//   path, create / cancel), R-320-1 (NO password field), R-320-2 / R-340-3
//   (Enter confirms, Escape cancels; the path field is the (only) field),
//   R-326-1 (overwrite confirm: exactly "overwrite" / "cancel", default =
//   cancel; no "skip"), R-340 (extract dialog: ZIP path, editable destination,
//   extract / cancel), R-340-1 (NO "I understand the overwrite" checkbox),
//   R-340-2 (no password field / attempt counter), R-374 (conflict confirm:
//   overwrite / skip / cancel, apply-to-all checkbox initially CHECKED,
//   default = cancel), R-374-1 (shows the conflicting archive-internal path and
//   the total), R-374-3 (only FILES conflict: the wording is that of a file
//   replacement, not a folder merge), R-380/R-381 (progress dialog: modal with
//   a cancel button; label = entry name + current/total), R-351-1 (error
//   dialog), R-390-1 (no password UI), AC-308, AC-311, AC-312, AC-326, AC-340,
//   AC-341, AC-342.
// Architecture: SPEC-0200-0001 §3.4.6 (dialog-specs.ts: pure generators of
//   FormSpec / ConfirmSpec / ProgressSpec for the shared modal-host; progress
//   label `<作成中|展開中> <name> (<index>/<total>)`).
// Module under test (not yet implemented): ./dialog-specs.ts
//
// Contract assumed (documented in the handback report):
//   buildCreateFormSpec({ count, outputPath, onSubmit }) -> FormSpec
//        (title "ZIPを作成"; lines[0] mentions `${count}件`; ONE text field
//         id "outputPath" prefilled; submitLabel "作成"; cancelLabel "キャンセル")
//   buildExtractFormSpec({ zipPath, destination, onSubmit }) -> FormSpec
//        (title "ZIPを展開"; lines contain zipPath; ONE text field id
//         "destination"; submitLabel "展開"; cancelLabel "キャンセル")
//   buildOverwriteConfirmSpec(outputPath) -> ConfirmSpec (buttons overwrite/cancel)
//   buildConflictConfirmSpec(entryPath, total) -> ConfirmSpec (overwrite/skip/cancel)
//   buildErrorConfirmSpec({ title, lines, note? }) -> ConfirmSpec (single "close")
//   buildProgressSpec(kind: "create" | "extract", onCancel) -> ProgressSpec
//   formatArchiveProgressLabel(kind, { name, index, total }) -> string

import {
  buildConflictConfirmSpec,
  buildCreateFormSpec,
  buildErrorConfirmSpec,
  buildExtractFormSpec,
  buildOverwriteConfirmSpec,
  buildProgressSpec,
  formatArchiveProgressLabel,
} from "./dialog-specs";

const noop = async () => null;
const fieldsOf = (s: { fields: { id: string; type: string; label: string; value?: string }[] }) => s.fields;

describe("buildCreateFormSpec (R-320, R-320-1, AC-308)", () => {
  const spec = buildCreateFormSpec({ count: 3, outputPath: "C:\\work\\archive.zip", onSubmit: noop });

  it("has the target count as a display line (AC-300: the dialog shows how many entries are archived)", () => {
    expect((spec.lines ?? []).join("\n")).toContain("3件");
  });

  it("has exactly ONE field: the editable output path, prefilled (R-320, R-321)", () => {
    const fields = fieldsOf(spec);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe("outputPath");
    expect(fields[0].type).toBe("text");
    expect(fields[0].value).toBe("C:\\work\\archive.zip");
  });

  it("AC-308 / R-320-1: no password field (nothing password-like in ids, labels or type)", () => {
    for (const f of fieldsOf(spec)) {
      expect(f.type).not.toBe("password");
      expect(`${f.id} ${f.label}`.toLowerCase()).not.toMatch(/pass|パスワード/);
    }
  });

  it("has create / cancel labels and forwards onSubmit untouched", () => {
    const onSubmit = vi.fn(async () => null);
    const s = buildCreateFormSpec({ count: 1, outputPath: "x", onSubmit });
    expect(s.submitLabel).toBe("作成");
    expect(s.cancelLabel).toBe("キャンセル");
    expect(s.onSubmit).toBe(onSubmit);
  });

  it("a text selection, when given, lies inside the value (it would select the name before the extension)", () => {
    const f = fieldsOf(spec)[0] as unknown as { value: string; selection?: [number, number] };
    if (f.selection !== undefined) {
      expect(f.selection[0]).toBeGreaterThanOrEqual(0);
      expect(f.selection[0]).toBeLessThanOrEqual(f.selection[1]);
      expect(f.selection[1]).toBeLessThanOrEqual(f.value.length);
    }
  });
});

describe("buildExtractFormSpec (R-340, R-340-1, R-340-2, AC-326)", () => {
  const spec = buildExtractFormSpec({ zipPath: "C:\\work\\a.zip", destination: "C:\\work\\a", onSubmit: noop });

  it("shows the ZIP path as a display line", () => {
    expect((spec.lines ?? []).join("\n")).toContain("C:\\work\\a.zip");
  });

  it("has exactly ONE field: the editable destination, prefilled (R-342)", () => {
    const fields = fieldsOf(spec);
    expect(fields).toHaveLength(1);
    expect(fields[0].id).toBe("destination");
    expect(fields[0].type).toBe("text");
    expect(fields[0].value).toBe("C:\\work\\a");
  });

  it("AC-326: no password field, no attempt counter, no 'I understand the overwrite' checkbox / select", () => {
    const text = JSON.stringify({ ...spec, onSubmit: undefined });
    expect(text.toLowerCase()).not.toMatch(/pass|パスワード/);
    expect(text).not.toMatch(/理解|試行|checkbox/);
    for (const f of fieldsOf(spec)) expect(f.type).toBe("text");
  });

  it("has extract / cancel labels and forwards onSubmit untouched", () => {
    const onSubmit = vi.fn(async () => null);
    const s = buildExtractFormSpec({ zipPath: "z", destination: "d", onSubmit });
    expect(s.submitLabel).toBe("展開");
    expect(s.cancelLabel).toBe("キャンセル");
    expect(s.onSubmit).toBe(onSubmit);
  });
});

describe("buildOverwriteConfirmSpec (R-326, R-326-1, AC-311, AC-312)", () => {
  const spec = buildOverwriteConfirmSpec("C:\\work\\out.zip");

  it("offers exactly two choices: overwrite and cancel (no skip)", () => {
    expect(spec.buttons.map((b) => b.id)).toEqual(["overwrite", "cancel"]);
    expect(spec.buttons.map((b) => b.label)).toEqual(["上書き", "キャンセル"]);
  });

  it("AC-312: the default focus is the SAFE choice (cancel) and Escape resolves to cancel", () => {
    expect(spec.defaultButtonId).toBe("cancel");
    expect(spec.cancelButtonId).toBe("cancel");
  });

  it("names the file that would be overwritten", () => {
    expect(spec.lines.join("\n")).toContain("out.zip");
  });

  it("has no apply-to-all checkbox (a single output file)", () => {
    expect(spec.checkbox).toBeUndefined();
  });
});

describe("buildConflictConfirmSpec (R-374, R-374-1, R-374-3, AC-340~AC-342)", () => {
  const spec = buildConflictConfirmSpec("docs/sub/x.txt", 5);

  it("AC-340: three choices overwrite / skip / cancel, in this order (no 'keep both')", () => {
    expect(spec.buttons.map((b) => b.id)).toEqual(["overwrite", "skip", "cancel"]);
    expect(spec.buttons.map((b) => b.label)).toEqual(["上書き", "スキップ", "キャンセル"]);
  });

  it("AC-342: default focus = cancel; Escape resolves to cancel", () => {
    expect(spec.defaultButtonId).toBe("cancel");
    expect(spec.cancelButtonId).toBe("cancel");
  });

  it("AC-342: the 'apply to all' checkbox exists and starts CHECKED (R-374 / SPEC-0300-0011 R-34-1)", () => {
    expect(spec.checkbox).toEqual({ label: "すべてに適用", checked: true });
  });

  it("AC-341 / R-374-1: shows the conflicting archive-internal path and the total number of conflicts", () => {
    const text = spec.lines.join("\n");
    expect(text).toContain("docs/sub/x.txt");
    expect(text).toContain("5");
  });

  it("R-374-3: the wording is about replacing FILES, not merging folders", () => {
    const text = `${spec.title}\n${spec.lines.join("\n")}`;
    expect(text).not.toContain("マージ");
  });

  it("with a single conflict it still works (total 1)", () => {
    const one = buildConflictConfirmSpec("a.txt", 1);
    expect(one.lines.join("\n")).toContain("a.txt");
    expect(one.defaultButtonId).toBe("cancel");
  });
});

describe("buildErrorConfirmSpec (R-351-1, R-395-1: errors after the start are shown as an error dialog)", () => {
  it("a single 'close' button that is both the default and the Escape target", () => {
    const spec = buildErrorConfirmSpec({ title: "展開に失敗しました", lines: ["途中まで展開しました"] });
    expect(spec.buttons.map((b) => b.id)).toEqual(["close"]);
    expect(spec.defaultButtonId).toBe("close");
    expect(spec.cancelButtonId).toBe("close");
  });

  it("carries title, lines and the optional note", () => {
    const spec = buildErrorConfirmSpec({ title: "T", lines: ["l1", "l2"], note: "n" });
    expect(spec.title).toBe("T");
    expect(spec.lines).toEqual(["l1", "l2"]);
    expect(spec.note).toBe("n");
    expect(buildErrorConfirmSpec({ title: "T", lines: [] }).note).toBeUndefined();
  });
});

describe("buildProgressSpec (R-380: modal progress with a cancel button)", () => {
  it("create and extract have distinct titles and a cancel label; onCancel is the given function", () => {
    const onCancel = vi.fn();
    const c = buildProgressSpec("create", onCancel);
    const e = buildProgressSpec("extract", onCancel);
    expect(c.title).not.toBe(e.title);
    expect(c.cancelLabel).toBe("キャンセル");
    expect(e.cancelLabel).toBe("キャンセル");
    c.onCancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("formatArchiveProgressLabel (R-381, AC-350)", () => {
  it("create: `作成中 <name> (<index>/<total>)` with the archive-internal path", () => {
    expect(formatArchiveProgressLabel("create", { name: "docs/a.txt", index: 3, total: 10 })).toBe("作成中 docs/a.txt (3/10)");
  });

  it("extract: `展開中 <name> (<index>/<total>)`", () => {
    expect(formatArchiveProgressLabel("extract", { name: "x/y.bin", index: 1, total: 100000 })).toBe("展開中 x/y.bin (1/100000)");
  });
});
