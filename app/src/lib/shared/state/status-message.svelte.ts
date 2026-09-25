// Sole owner of the transient status-line message (SPEC-0200-0001 §3.2.9-2,
// MUST-46). Any feature may call show(); only this module mutates `text`.

export function createStatusMessageState() {
  let text = $state<string | null>(null);
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  function show(message: string, durationMs = 2500): void {
    text = message;
    if (dismissTimer !== undefined) clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => {
      text = null;
      dismissTimer = undefined;
    }, durationMs);
  }

  function clear(): void {
    if (dismissTimer !== undefined) clearTimeout(dismissTimer);
    dismissTimer = undefined;
    text = null;
  }

  return {
    get text() {
      return text;
    },
    show,
    clear,
  };
}

export const statusMessage = createStatusMessageState();
