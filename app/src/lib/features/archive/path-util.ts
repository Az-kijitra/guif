// SPEC-0200-0001 §3.4.6: small pure path helpers (Windows and POSIX
// separators). features/archive must not import features/file-ops (§4.1), so
// this is its own copy. Used for default paths (R-321/R-342) and for the
// "is the result directly under the displayed directory" test (R-398).

const SEP = /[\/]/;

function isSep(ch: string | undefined): boolean {
  return ch === "\\" || ch === "/";
}

function stripTrailingSeps(path: string): string {
  let end = path.length;
  while (end > 0 && isSep(path[end - 1])) end--;
  return path.slice(0, end);
}

// The separator a directory path uses when a name is appended.
function separatorFor(dir: string): string {
  if (dir.includes("\\") || /^[A-Za-z]:/.test(dir)) return "\\";
  return "/";
}

export function joinPath(dir: string, name: string): string {
  if (dir === "") return name;
  if (isSep(dir[dir.length - 1])) return dir + name;
  return dir + separatorFor(dir) + name;
}

export function basename(path: string): string {
  const trimmed = stripTrailingSeps(path);
  let i = trimmed.length - 1;
  while (i >= 0 && !isSep(trimmed[i])) i--;
  return trimmed.slice(i + 1);
}

// Parent directory. A direct child of a root keeps the root's separator
// (`C:\a.zip` -> `C:\`, `/a.zip` -> `/`).
export function dirname(path: string): string {
  const trimmed = stripTrailingSeps(path);
  let i = trimmed.length - 1;
  while (i >= 0 && !isSep(trimmed[i])) i--;
  if (i < 0) return "";
  const head = trimmed.slice(0, i);
  // Parent is a root ("" for POSIX, "C:" for a drive): keep the separator.
  if (head === "" || /^[A-Za-z]:$/.test(head)) return trimmed.slice(0, i + 1);
  return head;
}

// SHOULD-97: Windows semantics - case and separator kind are not
// distinguished; a trailing separator is ignored.
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => stripTrailingSeps(p).split(SEP).join("\\").toLowerCase();
  return norm(a) === norm(b);
}
