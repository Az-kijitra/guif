// SPEC-0300-0011 §8/§9 (R-62-1): the frontend performs only the
// empty/blank-name check itself; forbidden-character/"."/".." validation is
// left to the backend's error response (R-62, covered by
// app/src-tauri/src/fs_ops/name_validation.rs). This keeps the two
// validations from silently drifting apart while matching R-62-1's explicit
// division of responsibility.

export function isNameBlank(name: string): boolean {
  return name.trim().length === 0;
}
