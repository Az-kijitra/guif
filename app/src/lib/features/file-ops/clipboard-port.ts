// SPEC-0200-0001 §3.3.4 / §3.10.8: ClipboardPort and the app-internal implementation.
// The OS-backed implementation is os-clipboard-port.ts (SPEC-0300-0011 R-15~R-19);
// this internal one is its fallback part and the test double for callers. The content is
// feature-local closure state, not shared state.

import type { ClipboardOrigin } from "./clipboard-mode";
import type { PasteNotice } from "./clipboard-messages";

export interface ClipboardContent {
  paths: string[];
  origin: "internal-copy" | "internal-cut";
}

// What `get()` hands to paste: the app-internal origins plus `external` (OS files, R-19-2).
export interface ClipboardPasteSource {
  paths: string[];
  origin: ClipboardOrigin;
  notice?: PasteNotice;
}

export interface SetResult {
  os: "written" | "failed" | "not-applicable";
}

export interface ClipboardPort {
  set(content: ClipboardContent): Promise<SetResult>;
  get(): Promise<ClipboardPasteSource | null>;
  clear(): Promise<void>;
  hasItems(): Promise<boolean>;
  afterMove(failedPaths: readonly string[]): Promise<void>;
}

export function createInternalClipboard(): ClipboardPort {
  let content: ClipboardContent | null = null;
  return {
    async set(value) {
      content = { paths: [...value.paths], origin: value.origin };
      return { os: "not-applicable" };
    },
    async get() {
      return content === null ? null : { paths: [...content.paths], origin: content.origin };
    },
    async clear() {
      content = null;
    },
    async hasItems() {
      return content !== null && content.paths.length > 0;
    },
    // R-19-6: nothing failed -> empty; otherwise only the failed items remain, as a cut.
    async afterMove(failedPaths) {
      content = failedPaths.length === 0 ? null : { paths: [...failedPaths], origin: "internal-cut" };
    },
  };
}
