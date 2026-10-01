// SPEC-0300-0016 §5 (R-720~R-727): path-bar input normalization (R-721),
// root definition (R-721-1) and accepted-format judgment (R-722). Pure,
// DOM/Tauri-independent (SPEC-0200-0001 §3.7.4/§3.7.8) -- the actual
// directory move (via `fs_list_dir`) is NOT this module's job; it only
// decides what string (if any) gets handed to the mover.
//
// Deliberately independent of features/file-list/tree.ts: the tree hides the
// `\\?\` prefix and this module must not (R-701-1).

export type NormalizedPathInput =
  | { kind: "empty" } // R-722-1
  | { kind: "invalid" } // R-722 rejected format, or R-721 step 7 emptied a component
  | { kind: "path"; path: string };

// R-721-1: the 7 root forms (each ends with a separator).
const ROOT_PATTERNS: readonly RegExp[] = [
  /^[A-Za-z]:\\/,
  /^\\\\\?\\[A-Za-z]:\\/,
  /^\\\\\?\\UNC\\[^\\]+\\[^\\]+\\/i,
  /^\\\\\?\\Volume\{[^}\\]+\}\\/i,
  /^\\\\\.\\[A-Za-z]:\\/,
  /^\\\\\.\\Volume\{[^}\\]+\}\\/i,
  /^\\\\[^\\]+\\[^\\]+\\/,
];

function matchRootPrefix(path: string): string | null {
  // The `\\?\...` / `\\.\...` forms must win over the generic UNC form, so
  // the longest match is taken.
  let best: string | null = null;
  for (const pattern of ROOT_PATTERNS) {
    const m = pattern.exec(path);
    if (m !== null && (best === null || m[0].length > best.length)) best = m[0];
  }
  return best;
}

// R-721-1: true when `path` is itself one of the 7 root forms.
export function isPathBarRoot(path: string): boolean {
  const root = matchRootPrefix(path);
  return root !== null && root.length === path.length;
}

const INVALID: NormalizedPathInput = { kind: "invalid" };

// `\\?\` / `\\.\` paths (R-721 exception): steps 3/5/6/7 are skipped; step 8
// (trailing separator) still applies, the root keeping its separator.
function normalizeNamespacePath(s: string): NormalizedPathInput {
  const isDevice = s.startsWith("\\\\.\\");
  const body = s.slice(4);
  if (body === "") return INVALID;
  if (isDevice && !/^([A-Za-z]:|Volume\{[^}\\]+\})(\\|$)/i.test(body)) return INVALID;
  if (isPathBarRoot(s + "\\")) {
    // A bare root without its separator ("\\?\C:") gets it back.
    return { kind: "path", path: s + "\\" };
  }
  const root = matchRootPrefix(s);
  const minLength = root === null ? 4 : root.length;
  let result = s;
  while (result.length > minLength && result.endsWith("\\")) result = result.slice(0, -1);
  return { kind: "path", path: result };
}

export function normalizePathBarInput(raw: string): NormalizedPathInput {
  // 1. trim
  let s = raw.trim();
  // 2. wrapping double quotes
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  if (s === "") return { kind: "empty" };

  // Exception: namespace paths are judged BEFORE step 3 (written as-is).
  if (s.startsWith("\\\\?\\") || s.startsWith("\\\\.\\")) return normalizeNamespacePath(s);

  // 3. "/" -> "\"
  s = s.replace(/\//g, "\\");
  // A namespace prefix that only appeared through step 3 is not accepted.
  if (s.startsWith("\\\\?\\") || s.startsWith("\\\\.\\")) return INVALID;
  // 4. bare drive letter -> drive root
  if (/^[A-Za-z]:$/.test(s)) s = s + "\\";
  // 5. collapse repeated separators (UNC leading "\\" kept as exactly two)
  s = s.startsWith("\\\\")
    ? "\\\\" + s.replace(/^\\+/, "").replace(/\\+/g, "\\")
    : s.replace(/\\+/g, "\\");

  let root: string;
  let rest: string;
  if (/^[A-Za-z]:\\/.test(s)) {
    root = s.slice(0, 3);
    rest = s.slice(3);
  } else if (s.startsWith("\\\\")) {
    const parts = s.slice(2).split("\\");
    if (parts[0] === "" || parts[1] === undefined || parts[1] === "") return INVALID;
    root = `\\\\${parts[0]}\\${parts[1]}\\`;
    rest = parts.slice(2).join("\\");
  } else {
    // relative, drive-relative ("C:foo"), root-relative, "~", URL, ...
    return INVALID;
  }

  // 6. lexical "." / ".." resolution (never above the root)
  const stack: string[] = [];
  for (const component of rest.split("\\")) {
    if (component === "" || component === ".") continue;
    if (component === "..") {
      stack.pop();
      continue;
    }
    stack.push(component);
  }
  // 7. trailing dots/spaces per component (Win32 parity)
  const cleaned: string[] = [];
  for (const component of stack) {
    const trimmed = component.replace(/[. ]+$/, "");
    if (trimmed === "") return INVALID;
    cleaned.push(trimmed);
  }
  // 8. trailing separator only kept for the root
  return { kind: "path", path: root + cleaned.join("\\") };
}
