// SPEC-0300-0015 R-466-2 / R-410-1: extension -> highlight language. Extension only (last dot of the file name,
// case-insensitive), no content sniffing. Markdown is coloured in the Markdown Text mode only (R-474).

export type LanguageId = "c" | "cpp" | "rust" | "javascript" | "typescript" | "python" | "json" | "markdown";

const TABLE: ReadonlyMap<string, LanguageId> = new Map<string, LanguageId>([
  ["c", "c"],
  ["h", "c"],
  ["cpp", "cpp"],
  ["cc", "cpp"],
  ["cxx", "cpp"],
  ["hpp", "cpp"],
  ["hh", "cpp"],
  ["hxx", "cpp"],
  ["rs", "rust"],
  ["js", "javascript"],
  ["mjs", "javascript"],
  ["cjs", "javascript"],
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["py", "python"],
  ["json", "json"],
  ["md", "markdown"],
  ["markdown", "markdown"],
]);

export function languageForPath(path: string, opts?: { mode?: "html" | "text" }): LanguageId | null {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null; // no dot, or a name that only starts with one (.gitignore)
  const language = TABLE.get(name.slice(dot + 1).toLowerCase()) ?? null;
  if (language === "markdown" && opts?.mode === "html") return null;
  return language;
}
