import { describe, expect, it } from "vitest";
import { getFileIcon, ICONS } from "./file-icons";

describe("file-icons", () => {
  it("resolves directory icons based on expansion state", () => {
    expect(getFileIcon("src", true, false)).toBe(ICONS.folder);
    expect(getFileIcon("src", true, true)).toBe(ICONS.folderOpen);
  });

  it("resolves exact filenames", () => {
    expect(getFileIcon(".gitignore", false)).toBe(ICONS.git);
    expect(getFileIcon("Cargo.toml", false)).toBe(ICONS.rust);
    expect(getFileIcon("package.json", false)).toBe(ICONS.json);
    expect(getFileIcon("Dockerfile", false)).toBe(ICONS.docker);
  });

  it("resolves file extensions case-insensitively", () => {
    expect(getFileIcon("main.rs", false)).toBe(ICONS.rust);
    expect(getFileIcon("MAIN.RS", false)).toBe(ICONS.rust);
    expect(getFileIcon("index.ts", false)).toBe(ICONS.typescript);
    expect(getFileIcon("App.svelte", false)).toBe(ICONS.svelte);
    expect(getFileIcon("README.md", false)).toBe(ICONS.markdown);
    expect(getFileIcon("photo.PNG", false)).toBe(ICONS.image);
    expect(getFileIcon("archive.zip", false)).toBe(ICONS.archive);
  });

  it("falls back to generic file icon for unknown extensions", () => {
    expect(getFileIcon("unknown.xyz123", false)).toBe(ICONS.file);
    expect(getFileIcon("no_extension", false)).toBe(ICONS.file);
  });
});
