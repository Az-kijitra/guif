import { describe, expect, it } from "vitest";
import { isNameBlank } from "./name-validation";

// Spec: SPEC-0300-0011 (file operations detail) §8/§9
// Module under test (not yet implemented): ./name-validation.ts
//
// R-62-1: the frontend performs only the empty/blank-name check itself;
//   forbidden-character/"."/".." validation is left to the backend's error
//   response (SPEC-0300-0011 R-62, covered by
//   app/src-tauri/src/fs_ops/name_validation.rs). This keeps the two
//   validations from silently drifting apart while matching R-62-1's
//   explicit division of responsibility.

describe("isNameBlank (SPEC-0300-0011 R-62-1)", () => {
  it("AC-60 (frontend half): an empty string is blank", () => {
    expect(isNameBlank("")).toBe(true);
  });

  it("AC-60 (frontend half): a whitespace-only string is blank", () => {
    expect(isNameBlank("   ")).toBe(true);
    expect(isNameBlank("\t\n")).toBe(true);
  });

  it("a name with visible characters is not blank", () => {
    expect(isNameBlank("a")).toBe(false);
    expect(isNameBlank("  a  ")).toBe(false);
  });
});
