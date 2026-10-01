// SPEC-0300-0016 §7 (R-740~R-748): folder-name completion (Tab). Pure,
// DOM/Tauri-independent (SPEC-0200-0001 §3.7.4/§3.7.8) -- the actual
// directory listing is injected by the caller (`path-bar-state.svelte.ts`'s
// `listDirForCompletion`), never called from here (R-742).
//
// Division of responsibility with the caller: `resolveCompletion` only sees
// folder NAMES and returns the completed NAME/prefix fragment; composing the
// final input ("parent + text" for "common-prefix", "parent + text + '\\'"
// for "single", R-743/R-744) is the caller's job.

import { normalizePathBarInput } from "./normalize";

export type CompletionOutcome =
  | { kind: "single"; text: string } // R-743: exactly 1 candidate -- its own name (its casing)
  | { kind: "common-prefix"; text: string } // R-744: >=2 candidates, extendable (casing of the name-order-first candidate)
  | { kind: "ambiguous"; count: number } // R-744-1: >=2 candidates, NOT extendable
  | { kind: "none" }; // R-745: 0 candidates

// R-741: splits `input` (already passed through R-721 steps 1-3 by the
// caller) at the LAST separator. Returns null when `parent` is not an
// R-722-accepted absolute path, or when the input is a `\\?\` / `\\.\` path
// (R-748: out of completion scope).
export function splitForCompletion(input: string): { parent: string; prefix: string } | null {
  if (input.startsWith("\\\\?\\") || input.startsWith("\\\\.\\")) return null;
  const index = input.lastIndexOf("\\");
  if (index < 0) return null;
  const parent = input.slice(0, index + 1);
  const prefix = input.slice(index + 1);
  if (normalizePathBarInput(parent).kind !== "path") return null;
  return { parent, prefix };
}

function compareByNameOrder(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// R-742~R-745: `candidateNames` is the ALREADY-FILTERED list (directories
// only, front-matching `prefix` case-insensitively, hidden setting applied).
export function resolveCompletion(prefix: string, candidateNames: readonly string[]): CompletionOutcome {
  if (candidateNames.length === 0) return { kind: "none" };
  if (candidateNames.length === 1) return { kind: "single", text: candidateNames[0] };

  const sorted = [...candidateNames].sort(compareByNameOrder);
  const first = sorted[0];
  let length = first.length;
  for (const name of sorted) {
    let i = 0;
    const limit = Math.min(length, name.length);
    while (i < limit && first[i].toLowerCase() === name[i].toLowerCase()) i++;
    length = i;
  }
  if (length > prefix.length) return { kind: "common-prefix", text: first.slice(0, length) };
  return { kind: "ambiguous", count: candidateNames.length };
}
