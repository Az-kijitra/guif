// SPEC-0300-0011 §6 (R-40~R-45): copy/move progress display and cancel.
//
// R-42-1: the progress display is a modal overlay, so it participates in
// the keyboard dispatch priority chain the same way every other modal does
// (SPEC-0300-0010 R-13) — that trapping mechanism is already covered
// generically by app/src/lib/features/keyboard/key-dispatch.test.ts. This
// module only needs to report that it *is* an overlay while shown
// (PROGRESS_MODAL_IS_OVERLAY), and that Escape maps to the same "cancel"
// outcome as the cancel button (handleProgressDialogKeydown).
//
// R-45: only copy/move show progress — delete/rename/create must not (see
// progress-modal.test.ts's "AC-35" describe block, which asserts the
// sibling flow modules expose no progress-shaped API).

export const PROGRESS_MODAL_IS_OVERLAY = true;

export interface ProgressLabelInfo {
  currentName: string;
  index: number;
  total: number;
}

// R-41: at least the current target name and "current/total" counts.
export function formatProgressLabel(prefix: string, info: ProgressLabelInfo): string {
  return `${prefix} ${info.currentName} (${info.index}/${info.total})`;
}

export interface ProgressDialogState {
  title: string;
  canCancel: boolean;
}

// R-42: the cancel affordance is available as soon as the dialog exists.
export function createProgressDialogState(title: string): ProgressDialogState {
  return { title, canCancel: true };
}

export interface KeyLikeEvent {
  key: string;
}

// R-42-2: Escape maps to the same "cancel" outcome as the cancel button.
export function handleProgressDialogKeydown(event: KeyLikeEvent): "cancel" | null {
  return event.key === "Escape" ? "cancel" : null;
}

export type ProgressEventType = "start" | "done" | "fail";

export interface ProgressEvent {
  type: ProgressEventType;
  name: string;
  index: number;
  total: number;
  code?: string;
}

export interface ProgressFailure {
  name: string;
  code: string;
}

export interface BatchProgressAccumulator {
  total: number;
  index: number;
  currentName: string | null;
  ok: number;
  failed: number;
  failures: ProgressFailure[];
}

export function createBatchProgressAccumulator(total: number): BatchProgressAccumulator {
  return { total, index: 0, currentName: null, ok: 0, failed: 0, failures: [] };
}

// R-40/R-44: fold a single backend progress event into the accumulator. A
// "fail" event with code "canceled" (R-44) is recorded like any other
// failure — the distinct code is what lets the UI tell it apart.
export function applyProgressEvent(
  acc: BatchProgressAccumulator,
  event: ProgressEvent,
): BatchProgressAccumulator {
  switch (event.type) {
    case "start":
      return { ...acc, currentName: event.name, index: event.index, total: event.total };
    case "done":
      return { ...acc, ok: acc.ok + 1 };
    case "fail":
      return {
        ...acc,
        failed: acc.failed + 1,
        failures: [...acc.failures, { name: event.name, code: event.code ?? "unknown" }],
      };
    default:
      return acc;
  }
}
