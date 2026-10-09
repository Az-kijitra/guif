// SPEC-0300-0016 §3~§8 (R-700~R-766): feature-local state for the path bar.
// Architecture: SPEC-0200-0001 §3.7.4, §3.7.10.4 (MUST-100), §3.7.10.9
// (SHOULD-136). Never read by another feature (§5.1) -- only
// `routes/path-bar-wiring.ts` reads it.
//
// SHOULD-136: this module never creates a Map/Set-like collection anywhere
// (checked by a source scan test) -- it holds only 2 scalar `$state`
// primitives, so there is nothing to `touch()`.

import { pathComparisonKey } from "$lib/shared/path-key";
import { FILE_OP_ERROR_MESSAGES } from "$lib/shared/messages";
import type { NavigateResult } from "$lib/shared/navigation-result";
import { resolveCompletion, splitForCompletion } from "./completion";
import { normalizePathBarInput } from "./normalize";
import { PATH_BAR_MESSAGES } from "./messages";

export interface PathBarDeps {
  currentPath: () => string;
  navigate: (path: string) => Promise<NavigateResult>;
  listDirForCompletion: (parent: string, showHidden: boolean) => Promise<{ name: string }[]>;
  showHidden: () => boolean;
  notify: (message: string) => void;
  onExitToList: () => void;
  onOpenHistory: (mode: "history" | "jump") => void;
  onAddJump: () => void;
  // R-730-1 / R-746: caret to the end of the input (DOM operation executed by
  // routes; optional so feature tests need not supply it).
  onCaretToEnd?: () => void;
}

export type ConfirmOutcome = NavigateResult | { status: "invalid" } | { status: "empty" };

export function createPathBarState(deps: PathBarDeps) {
  let rawFocused = $state(false);
  let rawText = $state("");

  // MUST-100(b): `editing` IS the DOM focus state (the `<input>` is always
  // mounted, R-700).
  function setFocused(focused: boolean): void {
    // MUST-100(a): a stale rawText from a prior editing session must not
    // resurface on the next click-to-focus (AC-702). Only on a real
    // not-editing -> editing transition: returning to the window while the
    // input was kept in editing (R-704) re-fires `focus` and must keep the
    // user's text.
    if (focused && !rawFocused) rawText = deps.currentPath();
    rawFocused = focused;
  }

  function setText(value: string): void {
    rawText = value;
  }

  // R-704 / SHOULD-143(b): discard the in-progress edit back to the current
  // path. Does not move focus (the caller does the DOM work).
  function discardEdit(): void {
    rawText = deps.currentPath();
  }

  async function handleConfirm(): Promise<ConfirmOutcome> {
    const confirmedText = rawText;
    const normalized = normalizePathBarInput(confirmedText);
    if (normalized.kind === "empty") return { status: "empty" }; // R-722-1
    if (normalized.kind === "invalid") {
      deps.notify(FILE_OP_ERROR_MESSAGES.invalid_path); // R-731
      deps.onCaretToEnd?.();
      return { status: "invalid" };
    }
    // R-723: same path -> no navigation, no history entry; leave the bar.
    if (pathComparisonKey(normalized.path) === pathComparisonKey(deps.currentPath())) {
      deps.onExitToList();
      return { status: "noop" };
    }

    const result = await deps.navigate(normalized.path);
    if (result.status === "stale") return result; // R-726: outrun, do nothing at all

    // MUST-100(d): 3-way resolution on the state at resolution time.
    const stillEditing = rawFocused;
    const textUnchanged = rawText === confirmedText;
    if (result.status === "success") {
      if (stillEditing && textUnchanged) deps.onExitToList(); // R-724
      // !stillEditing: R-726-1 (focus is already elsewhere, do not move it).
      // text changed: R-726-2 (keep editing and the user's text).
    } else if (result.status === "failed") {
      deps.notify(result.message); // R-730 / R-726-1 / R-726-3
      if (stillEditing && textUnchanged) deps.onCaretToEnd?.(); // R-730-1
    }
    return result;
  }

  async function handleTabComplete(): Promise<void> {
    const textAtTabTime = rawText;
    const notFound = () => deps.notify(PATH_BAR_MESSAGES.noCandidates);
    // R-741: R-721 steps 1-3 only.
    let input = textAtTabTime.trim();
    if (input.length >= 2 && input.startsWith('"') && input.endsWith('"')) input = input.slice(1, -1);
    input = input.replace(/\//g, "\\");

    const split = splitForCompletion(input);
    if (split === null) {
      notFound();
      return;
    }
    let names: { name: string }[];
    try {
      names = await deps.listDirForCompletion(split.parent, deps.showHidden());
    } catch {
      names = []; // R-745: a listing failure is treated as 0 candidates
    }
    // R-747 / MUST-100(d): discard when no longer editing or the text changed.
    if (!rawFocused || rawText !== textAtTabTime) return;

    const lowerPrefix = split.prefix.toLowerCase();
    const candidates = names.map((n) => n.name).filter((n) => n.toLowerCase().startsWith(lowerPrefix));
    const outcome = resolveCompletion(split.prefix, candidates);
    switch (outcome.kind) {
      case "single":
        rawText = split.parent + outcome.text + "\\"; // R-743
        deps.onCaretToEnd?.();
        break;
      case "common-prefix":
        rawText = split.parent + outcome.text; // R-744
        deps.onCaretToEnd?.();
        break;
      case "ambiguous":
        deps.notify(PATH_BAR_MESSAGES.ambiguousCandidates(outcome.count)); // R-744-1
        break;
      case "none":
        notFound(); // R-745
        break;
    }
  }

  return {
    get editing() {
      return rawFocused;
    },
    // R-701: while not editing, the display is ALWAYS the current path.
    get text() {
      return rawFocused ? rawText : deps.currentPath();
    },
    setFocused,
    setText,
    discardEdit,
    endEditing: discardEdit,
    handleConfirm,
    handleTabComplete,
  };
}
