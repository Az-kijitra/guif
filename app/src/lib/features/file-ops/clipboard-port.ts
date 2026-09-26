// SPEC-0200-0001 §3.3.4/§3.3.14-1: the internal (in-app) clipboard only. The
// OS clipboard (R-15~R-18) stays a GAP. Methods are async so an OS-backed
// implementation can replace this without changing callers. The content is
// feature-local closure state, not shared state.

export interface ClipboardContent {
  paths: string[];
  origin: "internal-copy" | "internal-cut";
}

export interface ClipboardPort {
  set(content: ClipboardContent): Promise<void>;
  get(): Promise<ClipboardContent | null>;
  clear(): Promise<void>;
}

export function createInternalClipboard(): ClipboardPort {
  let content: ClipboardContent | null = null;
  return {
    async set(value) {
      content = { paths: [...value.paths], origin: value.origin };
    },
    async get() {
      return content === null ? null : { paths: [...content.paths], origin: content.origin };
    },
    async clear() {
      content = null;
    },
  };
}
