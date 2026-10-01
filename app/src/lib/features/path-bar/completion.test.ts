import { describe, expect, it } from "vitest";

// Spec: SPEC-0300-0016 §7 (R-740~R-748), §14.3 (AC-713~716, 744, 745).
// Module under test: ./completion.ts (TDD stub -- every case below is RED
// because both exported functions currently `throw`).

import { resolveCompletion, splitForCompletion } from "./completion";

describe("splitForCompletion (R-741)", () => {
  it("splits at the LAST separator: parent keeps it, prefix is the remainder", () => {
    expect(splitForCompletion("C:\\A\\doc")).toEqual({ parent: "C:\\A\\", prefix: "doc" });
  });

  it("an empty prefix (input ends in a separator) is valid -- lists everything under parent", () => {
    expect(splitForCompletion("C:\\A\\")).toEqual({ parent: "C:\\A\\", prefix: "" });
  });

  it("R-748: a UNC share root's own children split normally", () => {
    expect(splitForCompletion("\\\\server\\share\\do")).toEqual({ parent: "\\\\server\\share\\", prefix: "do" });
  });

  it("R-741: when the parent half is not an R-722-accepted absolute path, returns null (0 candidates, R-745)", () => {
    expect(splitForCompletion("foo")).toBeNull(); // no separator at all -> relative, not absolute
    expect(splitForCompletion("C:NoSuch\\x")).toBeNull(); // drive-relative parent
  });

  it("R-748: a share-name-level input (\\\\server\\sh, no separator after the server name yet) returns null -- the share level itself cannot be listed", () => {
    expect(splitForCompletion("\\\\server\\sh")).toBeNull();
  });

  it("R-748: \\\\?\\ / \\\\.\\ input is excluded from completion entirely (returns null, candidates 0)", () => {
    expect(splitForCompletion("\\\\?\\C:\\Win")).toBeNull();
  });
});

describe("resolveCompletion: R-743 (exactly one candidate)", () => {
  it("AC-713: a single front-matching directory name completes to that name", () => {
    expect(resolveCompletion("doc", ["Documents"])).toEqual({ kind: "single", text: "Documents" });
  });

  it("matching is case-insensitive on the prefix, but the candidate's own casing is returned", () => {
    expect(resolveCompletion("DOC", ["Documents"])).toEqual({ kind: "single", text: "Documents" });
  });
});

describe("resolveCompletion: R-744/R-744-1 (multiple candidates)", () => {
  it("AC-714: 2 candidates with a common prefix beyond the input extend to that common prefix (casing from the name-order-first candidate)", () => {
    expect(resolveCompletion("pro", ["Project1", "project2"])).toEqual({ kind: "common-prefix", text: "Project" });
  });

  it("AC-714: pressing again once already at the common prefix reports 'ambiguous' with the candidate count (input does not change)", () => {
    expect(resolveCompletion("Project", ["Project1", "project2"])).toEqual({ kind: "ambiguous", count: 2 });
  });

  it("3+ candidates with no shared extension beyond the prefix are 'ambiguous' with the full count", () => {
    expect(resolveCompletion("a", ["Apple", "Ant", "Avocado"])).toEqual({ kind: "ambiguous", count: 3 });
  });

  it("name-order tie-break: when candidates share NO extra common prefix character, casing does not matter (count only)", () => {
    const outcome = resolveCompletion("a", ["apple", "Ant"]);
    expect(outcome).toEqual({ kind: "ambiguous", count: 2 });
  });
});

describe("resolveCompletion: R-745 (no candidates)", () => {
  it("AC-715: an empty candidate list is 'none'", () => {
    expect(resolveCompletion("pro", [])).toEqual({ kind: "none" });
  });
});

describe("resolveCompletion is a pure function of (prefix, candidateNames) -- no hidden state", () => {
  it("calling it twice with the same arguments returns the same result", () => {
    const a = resolveCompletion("doc", ["Documents", "Docs"]);
    const b = resolveCompletion("doc", ["Documents", "Docs"]);
    expect(a).toEqual(b);
  });
});
