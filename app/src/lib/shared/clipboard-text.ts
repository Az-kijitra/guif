// SPEC-0300-0018 R-1060-3/5, AC-1053 / SPEC-0200-0001 §3.9.8.
// Writes plain text to the OS clipboard through the WebView's standard API.
// Rejects on any failure so the caller can report it (never silent).

export interface ClipboardTextDeps {
  clipboard: { writeText(text: string): Promise<void> } | undefined;
}

export function createClipboardTextWriter(deps: ClipboardTextDeps): (text: string) => Promise<void> {
  return async (text: string): Promise<void> => {
    if (deps.clipboard === undefined) throw new Error("clipboard API is not available");
    await deps.clipboard.writeText(text);
  };
}

export const writeClipboardText: (text: string) => Promise<void> = (text) =>
  createClipboardTextWriter({ clipboard: globalThis.navigator?.clipboard })(text);
