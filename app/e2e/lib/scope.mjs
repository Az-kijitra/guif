// The lexical scope rule of the page-level copy/move stubs (SPEC-0200-0001 §3.10.17.3 MUST-119).
//
// The functions are injected into the page as source text (`fn.toString()`), so they must stay
// self-contained (no outer references) and must never throw. The real protection against
// links / junctions leaving the test folder is the backend scope (REFLEXFILES_E2E_FS_SCOPE,
// SPEC-0400-0001 R-10); this layer is the second, textual line of defence.
//
//   node app/e2e/lib/scope.mjs --selftest

import { fileURLToPath } from "node:url";

/**
 * `root` is `fs.realpathSync.native(fx.root)` (an absolute drive path, set by Node, never by the
 * page). True when `p` is strictly INSIDE `root` (the root itself is not: `items` never contain it).
 * Rejects (false): non-strings and empty strings, any `/`, a leading `\` (`\\?\`, `\\.\`, UNC,
 * root-relative), an empty / `.` / `..` / dots-and-spaces-only / trailing-space-or-dot component
 * below the root, and anything not starting with `root + "\"` (case-insensitive).
 */
export function isInsideScope(root, p) {
  try {
    if (typeof root !== "string" || root === "" || typeof p !== "string" || p === "") return false;
    if (p.includes("/") || p.startsWith("\\")) return false;
    const prefix = root.toLowerCase() + "\\";
    if (!p.toLowerCase().startsWith(prefix)) return false;
    const rest = p.slice(prefix.length);
    if (rest === "") return false;
    for (const part of rest.split("\\")) {
      if (part === "" || part === "." || part === "..") return false;
      if (/^[. ]+$/.test(part)) return false;
      if (part.endsWith(" ") || part.endsWith(".")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Arguments of `fs_ops_copy` / `fs_ops_move`: `items` a NON-EMPTY array of strings that are all
 * inside the scope, `destination` a string inside the scope or exactly the root. Anything else
 * (including `{}` from an unparsable body) is refused.
 */
export function copyMoveArgsAllowed(root, args) {
  try {
    if (args === null || typeof args !== "object") return false;
    const { items, destination } = args;
    if (!Array.isArray(items) || items.length === 0) return false;
    if (!items.every((item) => typeof item === "string" && isInsideScope(root, item))) return false;
    if (typeof destination !== "string") return false;
    return destination.toLowerCase() === String(root).toLowerCase() || isInsideScope(root, destination);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- self test

function selftest() {
  const results = [];
  const check = (name, ok) => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  };
  const root = String.raw`C:\Users\x\AppData\Local\Temp\rf-e2e-abc`;
  const inside = String.raw`C:\Users\x\AppData\Local\Temp\rf-e2e-abc\src\a.txt`;
  check("a file inside is allowed", isInsideScope(root, inside));
  check("case differences are allowed", isInsideScope(root, inside.toUpperCase()));
  check("a name with an inner dot and space is allowed", isInsideScope(root, root + String.raw`\a b.c\d`));
  const escapes = [
    ["parent traversal", root + String.raw`\..\..\Users\x`],
    ["a component with a trailing space", root + String.raw`\a. `],
    ["a component with a trailing dot", root + String.raw`\a.`],
    ["a forward slash", root + "/a"],
    ["an extended-prefix path", "\\\\?\\" + root + "\\.."],
    ["a device-prefix path", "\\\\.\\" + root],
    ["a UNC path", String.raw`\\server\share\x`],
    ["a root-relative path", String.raw`\Users\x`],
    ["the same prefix, another folder", root + "x" + String.raw`\a.txt`],
    ["the root itself", root],
    ["the root with a trailing backslash", root + "\\"],
    ["a `.` component", root + String.raw`\a\.\b`],
    ["an empty component", root + String.raw`\a\\b`],
    ["a dots-only name", root + String.raw`\...`],
    ["a dots-and-spaces name", root + String.raw`\. .`],
    ["the empty string", ""],
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
    ["an object", {}],
    ["an array", [inside]],
  ];
  for (const [name, value] of escapes) check(`rejected: ${name}`, isInsideScope(root, value) === false);
  check("a bad root never allows anything", isInsideScope("", inside) === false && isInsideScope(null, inside) === false);

  check("copy/move args: items and destination inside", copyMoveArgsAllowed(root, { items: [inside], destination: root + String.raw`\dst` }));
  check("copy/move args: destination may be the root itself", copyMoveArgsAllowed(root, { items: [inside], destination: root }));
  const badArgs = [
    ["items missing", { destination: root }],
    ["items not an array", { items: inside, destination: root }],
    ["items empty", { items: [], destination: root }],
    ["an item outside", { items: [inside, String.raw`C:\Windows\x`], destination: root }],
    ["a non-string item", { items: [inside, 1], destination: root }],
    ["destination missing", { items: [inside] }],
    ["destination outside", { items: [inside], destination: String.raw`C:\Users\x\Desktop` }],
    ["destination not a string", { items: [inside], destination: 5 }],
    ["destination with ..", { items: [inside], destination: root + String.raw`\..\x` }],
    ["the empty object (unparsable body)", {}],
    ["null", null],
    ["a string", "items"],
  ];
  for (const [name, args] of badArgs) check(`copy/move args rejected: ${name}`, copyMoveArgsAllowed(root, args) === false);
  return results.every(Boolean) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && process.argv.includes("--selftest")) {
  process.exit(selftest());
}
