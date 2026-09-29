// Sole owner of the transient status-line message (SPEC-0200-0001 §3.2.9-2,
// MUST-46). Any feature may call show(); only this module mutates `text`.

export function createStatusMessageState() {
  let text = $state<string | null>(null);
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;
  // SHOULD-119: while a `showPriority()` message (e.g. the startup notice,
  // R-45-6/R-77-6) is still on screen, an ordinary `show()` call must not
  // silently clobber it before its own (longer) duration elapses.
  let priorityActive = false;

  function scheduleDismiss(durationMs: number): void {
    if (dismissTimer !== undefined) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => {
      text = null;
      dismissTimer = undefined;
      priorityActive = false;
    }, durationMs);
  }

  function show(message: string, durationMs = 2500): void {
    if (priorityActive && text !== null) {
      // Appended, not overwritten -- the priority message's own timer
      // (already running) is left untouched.
      text = `${text} / ${message}`;
      return;
    }
    text = message;
    scheduleDismiss(durationMs);
  }

  // SHOULD-119: same mechanism as `show()`, but marks the message as
  // "priority" for its own duration -- subsequent `show()` calls append
  // instead of replacing until it naturally dismisses (or `clear()` runs).
  function showPriority(message: string, durationMs: number): void {
    text = message;
    priorityActive = true;
    scheduleDismiss(durationMs);
  }

  function clear(): void {
    if (dismissTimer !== undefined) clearTimeout(dismissTimer);
    dismissTimer = undefined;
    priorityActive = false;
    text = null;
  }

  return {
    get text() {
      return text;
    },
    show,
    showPriority,
    clear,
  };
}

export const statusMessage = createStatusMessageState();
