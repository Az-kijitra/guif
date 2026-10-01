// SPEC-0200-0001 §3.7.10.1/§3.7.10.2(a) (architecture-guardian 16th audit,
// MUST-96/MUST-98(a), SHOULD-133): the result shape shared by
// `features/file-list/list-state.svelte.ts`'s `navigate`/`loadDirectory` and
// `features/path-bar/path-bar-state.svelte.ts`. Lives in `shared/` (a leaf
// module, imports nothing) because `features/path-bar/` importing a type
// from `features/file-list/` would be a feature-to-feature import violation
// (§4.1; `import-boundary.test.ts` counts type imports too).
//
// Four variants (SHOULD-133): a plain 3-value success/stale/failed result is
// not enough for callers like `openFocused()` (focused entry is not a
// directory) / `goParent()` (already at a filesystem root) that need to
// report "nothing to do" distinctly from "outrun by a later request".

export type NavigateResult =
  | { status: "success"; path: string }
  | { status: "stale" }
  | { status: "failed"; code: string; message: string }
  | { status: "noop" };
