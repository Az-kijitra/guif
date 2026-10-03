// SPEC-0300-0011 R-15-3, R-16, R-19-2 ~ R-19-6, CB-06, CB-11 (SPEC-0200-0001 §3.10.8, §3.10.17.5).
// ClipboardPort backed by the OS clipboard through an injected IPC; the app-internal clipboard
// stays the fallback (an OS failure never loses the app content). `record` (the sequence number
// of our own last successful OS write, R-19-3) is feature-local closure state, memory only.

import { osEffectFor } from "./clipboard-mode";
import type { ClipboardContent, ClipboardPasteSource, ClipboardPort, SetResult } from "./clipboard-port";
import { decideAfterMove, resolvePasteSource, type OsRead } from "./clipboard-source";

export interface OsClipboardIpc {
  setFiles(
    paths: string[],
    effect: "copy" | "move",
    opts?: { expectedSequence?: number },
  ): Promise<{ ok: boolean; sequence: number; error?: string | null }>;
  getFiles(probeOnly: boolean): Promise<{ state: "files" | "none" | "unavailable"; paths: string[]; sequence: number }>;
  clearIfUnchanged(sequence: number): Promise<boolean>;
}

export interface OsClipboardPortDeps {
  internal: ClipboardPort;
  ipc: OsClipboardIpc;
}

export function createOsClipboardPort(deps: OsClipboardPortDeps): ClipboardPort {
  const { internal, ipc } = deps;
  // Invariant (M-5): a record exists only while the app clipboard is non-empty.
  let record: { sequence: number } | null = null;

  async function readOs(): Promise<{ os: OsRead; sequence: number }> {
    try {
      const r = await ipc.getFiles(false);
      return { os: r.state === "files" ? { state: "files", paths: r.paths } : { state: r.state }, sequence: r.sequence };
    } catch {
      return { os: { state: "unavailable" }, sequence: 0 }; // R-17: never throws
    }
  }

  async function afterMove(failedPaths: readonly string[]): Promise<void> {
    const plan = decideAfterMove({ record, failedPaths });
    if (plan.internal.kind === "clear") {
      await internal.clear();
      record = null;
    } else {
      await internal.set({ paths: plan.internal.paths, origin: "internal-cut" });
    }
    // At most ONE IPC call; its failure is never reported (R-19-6).
    if (plan.os.kind === "clear") {
      try {
        await ipc.clearIfUnchanged(plan.os.sequence);
      } catch {
        // ignored
      }
    } else if (plan.os.kind === "rewrite") {
      try {
        const r = await ipc.setFiles(plan.os.paths, "move", { expectedSequence: plan.os.expectedSequence });
        if (r.ok) record = { sequence: r.sequence };
        else if (r.error !== "changed") record = null; // "changed": the OS was not touched, the record stays
      } catch {
        record = null;
      }
    }
  }

  return {
    async set(content: ClipboardContent): Promise<SetResult> {
      await internal.set(content); // R-15-3: the app clipboard first
      try {
        const r = await ipc.setFiles([...content.paths], osEffectFor(content.origin));
        if (r.ok) {
          record = { sequence: r.sequence };
          return { os: "written" };
        }
      } catch {
        // fall through: an OS failure keeps the app content (CB-06)
      }
      record = null; // a failed write also discards the previous record (R-19-3)
      return { os: "failed" };
    },

    async get(): Promise<ClipboardPasteSource | null> {
      const { os, sequence } = await readOs();
      const held = await internal.get();
      const content: ClipboardContent | null =
        held === null ? null : { paths: held.paths, origin: held.origin === "internal-cut" ? "internal-cut" : "internal-copy" };
      const decision = resolvePasteSource({ os, osSequence: sequence, record, internal: content });
      if (decision.kind === "none") return null;
      const origin = decision.kind === "os" ? "external" : decision.mode === "move" ? "internal-cut" : "internal-copy";
      return decision.notice === undefined
        ? { paths: decision.paths, origin }
        : { paths: decision.paths, origin, notice: decision.notice };
    },

    async clear(): Promise<void> {
      await afterMove([]);
    },

    async hasItems(): Promise<boolean> {
      try {
        // CB-11: asks the OS every time, without opening the clipboard.
        if ((await ipc.getFiles(true)).state === "files") return true;
      } catch {
        // fall back to the app clipboard alone
      }
      return internal.hasItems();
    },

    afterMove,
  };
}
