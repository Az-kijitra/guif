import { describe, expect, it, vi } from "vitest";

// [単体] Spec: SPEC-0300-0015 第8版 R-466-5 (over 1,000,000 characters: not sent, nothing announced), R-466-6 / R-431 (a result that
//   arrives after the user switched file is thrown away; no stale colours on the new file), R-466-9 (the processor failing to load =
//   plain text, no error), R-466-4 (a chunk outside the accepted grammar is discarded), AC-527, AC-529 (the unit part).
// Architecture: SPEC-0200-0001 §3.14.7 (Web Worker, `{ requestId, language, code }` in, `{ requestId, chunks }` out, accept only the
//   current requestId, `terminate()` and recreate on a switch), §3.14.12-2 (`routes/viewer/highlight-wiring.ts` owns the Worker, the
//   requestId, terminate(), the acceptance through `isSafeHighlightHtml`; the page sees only `createHighlighter()` ->
//   `request(code, lang)` / `dispose()`).
//
// A fake Worker is injected (no real Worker, no DOM).
//
// Contract assumed (reported to the implementer):
//   createHighlighter(deps: { createWorker: () => WorkerLike }): {
//     request(code: string, language: string): Promise<string[] | null>;   // chunks, or null = "leave the body uncoloured"
//     dispose(): void;
//   }
//   WorkerLike = { postMessage(m: { requestId: number; language: string; code: string }): void; terminate(): void;
//                  onmessage / onerror (property) and/or addEventListener("message" | "error", fn) }   -- both styles are fed by the fake
//   Result rules: null when (code.length > 1_000_000) [and then the Worker is not created / not posted to]; a newer request() makes
//   every older pending promise resolve null; a reply whose requestId is not the current one is ignored; a reply with ANY chunk failing
//   isSafeHighlightHtml resolves null (all or nothing); createWorker() throwing, a Worker `error` event, or a reply carrying `error`
//   resolves null; dispose() terminates the Worker and resolves a pending promise with null. Never rejects, never throws.
//
// Module under test (not yet implemented): ./highlight-wiring.ts

import { createHighlighter } from "./highlight-wiring";

interface Posted {
  requestId: number;
  language: string;
  code: string;
}

class FakeWorker {
  posted: Posted[] = [];
  terminated = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  private listeners: Record<string, ((e: never) => void)[]> = { message: [], error: [] };
  postMessage(m: Posted): void {
    if (this.terminated) throw new Error("postMessage after terminate");
    this.posted.push(m);
  }
  terminate(): void {
    this.terminated = true;
  }
  addEventListener(type: string, fn: (e: never) => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (e: never) => void): void {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  // test-side delivery: reaches whichever style the implementation used
  reply(data: unknown): void {
    const e = { data };
    this.onmessage?.(e);
    for (const f of this.listeners.message ?? []) (f as (x: unknown) => void)(e);
  }
  fail(): void {
    const e = { message: "boom" };
    this.onerror?.(e);
    for (const f of this.listeners.error ?? []) (f as (x: unknown) => void)(e);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const createWorker = vi.fn(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  const hl = createHighlighter({ createWorker: createWorker as never });
  const lastPost = (): Posted => {
    for (let i = workers.length - 1; i >= 0; i--) if (workers[i].posted.length > 0) return workers[i].posted[workers[i].posted.length - 1];
    throw new Error("nothing was posted");
  };
  const posts = (): Posted[] => workers.flatMap((w) => w.posted);
  return { hl, workers, createWorker, lastPost, posts };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

function track<T>(p: Promise<T>): { settled: () => boolean; value: () => T | undefined; promise: Promise<T> } {
  let done = false;
  let v: T | undefined;
  void p.then((x) => {
    done = true;
    v = x;
  });
  return { settled: () => done, value: () => v, promise: p };
}

const OK = ['<span class="hljs-keyword">fn</span>\n', "x"];

describe("a normal request", () => {
  it("posts { requestId, language, code } to a Worker and resolves with the chunks of the reply that carries that requestId", async () => {
    const { hl, lastPost, workers } = setup();
    const t = track(hl.request("fn x() {}", "rust"));
    await flush();
    const m = lastPost();
    expect(m).toMatchObject({ language: "rust", code: "fn x() {}" });
    expect(typeof m.requestId).toBe("number");
    workers[workers.length - 1].reply({ requestId: m.requestId, chunks: OK });
    await expect(t.promise).resolves.toEqual(OK);
  });

  it("the Worker is created lazily: nothing is created until the first request (R-466-1: no cost for files that are not highlighted)", () => {
    const { createWorker } = setup();
    expect(createWorker).not.toHaveBeenCalled();
  });

  it("requestIds differ between requests", async () => {
    const { hl, posts, workers } = setup();
    const a = hl.request("a", "c");
    await flush();
    const first = posts()[0].requestId;
    workers[workers.length - 1].reply({ requestId: first, chunks: ["a"] });
    await a;
    const b = hl.request("b", "c");
    await flush();
    const second = posts()[posts().length - 1].requestId;
    expect(second).not.toBe(first);
    workers[workers.length - 1].reply({ requestId: second, chunks: ["b"] });
    await b;
  });
});

describe("R-466-5 / AC-527: the 1,000,000-character limit", () => {
  it("1,000,001 characters: resolves null and nothing is posted (the Worker does no work, and nothing is announced)", async () => {
    const { hl, posts } = setup();
    await expect(hl.request("x".repeat(1_000_001), "typescript")).resolves.toBeNull();
    expect(posts()).toEqual([]);
  });

  it("1,000,000 characters exactly: posted", async () => {
    const { hl, posts, workers } = setup();
    const t = track(hl.request("x".repeat(1_000_000), "typescript"));
    await flush();
    expect(posts().length).toBe(1);
    workers[workers.length - 1].reply({ requestId: posts()[0].requestId, chunks: ["ok"] });
    await expect(t.promise).resolves.toEqual(["ok"]);
  });
});

describe("AC-529 / R-466-6 / R-431: stale results are dropped", () => {
  it("a result for the OLD request (a.ts) that arrives after the NEW request (b.txt-like switch) never resolves the new one and never reaches the page", async () => {
    const { hl, posts, workers } = setup();
    const a = track(hl.request("const a = 1;", "typescript"));
    await flush();
    const idA = posts()[0].requestId;
    const b = track(hl.request("fn b() {}", "rust"));
    await flush();
    const idB = posts()[posts().length - 1].requestId;
    expect(idB).not.toBe(idA);

    // the old request is settled immediately as "no colour" when it is superseded
    await a.promise;
    expect(a.value()).toBeNull();

    // the old worker (terminated) or the current one delivers A's late reply
    for (const w of workers) w.reply({ requestId: idA, chunks: ['<span class="hljs-keyword">const</span> a = 1;'] });
    await flush();
    expect(b.settled()).toBe(false); // B is still waiting for ITS reply

    workers[workers.length - 1].reply({ requestId: idB, chunks: ["B-chunk"] });
    await expect(b.promise).resolves.toEqual(["B-chunk"]);
  });

  it("a switch while a request is pending terminates the running Worker (a synchronous highlight cannot be interrupted) and uses a fresh one", async () => {
    const { hl, workers, createWorker } = setup();
    void hl.request("const a = 1;", "typescript");
    await flush();
    const first = workers[0];
    void hl.request("let b;", "javascript");
    await flush();
    expect(first.terminated).toBe(true);
    expect(createWorker.mock.calls.length).toBeGreaterThanOrEqual(2);
    const live = workers[workers.length - 1];
    expect(live).not.toBe(first);
    expect(live.terminated).toBe(false);
    expect(live.posted[live.posted.length - 1]).toMatchObject({ code: "let b;" });
  });

  it("a reply with an unknown requestId is ignored", async () => {
    const { hl, posts, workers } = setup();
    const t = track(hl.request("x", "c"));
    await flush();
    workers[workers.length - 1].reply({ requestId: posts()[0].requestId + 999, chunks: ["evil"] });
    await flush();
    expect(t.settled()).toBe(false);
    workers[workers.length - 1].reply({ requestId: posts()[0].requestId, chunks: ["good"] });
    await expect(t.promise).resolves.toEqual(["good"]);
  });
});

describe("R-466-4: only accepted markup is handed to the page", () => {
  it("a chunk containing a <script> element resolves null (all or nothing)", async () => {
    const { hl, posts, workers } = setup();
    const t = hl.request("x", "javascript");
    await flush();
    workers[workers.length - 1].reply({ requestId: posts()[0].requestId, chunks: ["fine\n", "<script>alert(1)</script>"] });
    await expect(t).resolves.toBeNull();
  });

  it("a chunk with an attribute other than class resolves null", async () => {
    const { hl, posts, workers } = setup();
    const t = hl.request("x", "javascript");
    await flush();
    workers[workers.length - 1].reply({ requestId: posts()[0].requestId, chunks: ['<span class="a" onclick="x()">y</span>'] });
    await expect(t).resolves.toBeNull();
  });

  it("a reply whose chunks are not an array of strings resolves null", async () => {
    const { hl, posts, workers } = setup();
    const t = hl.request("x", "javascript");
    await flush();
    workers[workers.length - 1].reply({ requestId: posts()[0].requestId, chunks: "not-an-array" });
    await expect(t).resolves.toBeNull();
  });
});

describe("R-466-9 / AC-529: failures leave the body uncoloured, silently", () => {
  it("createWorker() throwing (the processor could not be loaded): resolves null, never rejects", async () => {
    const hl = createHighlighter({
      createWorker: (() => {
        throw new Error("Worker is not available");
      }) as never,
    });
    await expect(hl.request("x", "rust")).resolves.toBeNull();
  });

  it("the Worker reporting an error event: resolves null", async () => {
    const { hl, workers } = setup();
    const t = hl.request("x", "rust");
    await flush();
    workers[workers.length - 1].fail();
    await expect(t).resolves.toBeNull();
  });

  it("a reply carrying `error` instead of chunks: resolves null", async () => {
    const { hl, posts, workers } = setup();
    const t = hl.request("x", "rust");
    await flush();
    workers[workers.length - 1].reply({ requestId: posts()[0].requestId, error: "highlight failed" });
    await expect(t).resolves.toBeNull();
  });

  it("after a failure the next request still works (a new Worker is made)", async () => {
    const { hl, posts, workers } = setup();
    const t1 = hl.request("x", "rust");
    await flush();
    workers[workers.length - 1].fail();
    await t1;
    const t2 = track(hl.request("y", "rust"));
    await flush();
    const m = posts()[posts().length - 1];
    expect(m.code).toBe("y");
    workers[workers.length - 1].reply({ requestId: m.requestId, chunks: ["y"] });
    await expect(t2.promise).resolves.toEqual(["y"]);
  });
});

describe("dispose (the viewer window closes / the page is destroyed)", () => {
  it("terminates the Worker and settles a pending request with null", async () => {
    const { hl, workers } = setup();
    const t = hl.request("x", "rust");
    await flush();
    hl.dispose();
    expect(workers[workers.length - 1].terminated).toBe(true);
    await expect(t).resolves.toBeNull();
  });

  it("is safe to call twice and before any request", () => {
    const { hl } = setup();
    expect(() => {
      hl.dispose();
      hl.dispose();
    }).not.toThrow();
  });
});

describe("cancel (the body became something that is not coloured: an image, an error, an over-limit text)", () => {
  it("terminates the running Worker and settles the pending request with null", async () => {
    const { hl, workers } = setup();
    const t = hl.request("x", "rust");
    await flush();
    hl.cancel();
    expect(workers[workers.length - 1].terminated).toBe(true);
    await expect(t).resolves.toBeNull();
  });

  it("does nothing when nothing is pending, and the next request gets a fresh Worker", async () => {
    const { hl, workers, posts } = setup();
    expect(() => hl.cancel()).not.toThrow();
    const t = hl.request("x", "rust");
    await flush();
    hl.cancel();
    const t2 = track(hl.request("y", "rust"));
    await flush();
    const live = workers[workers.length - 1];
    expect(live.terminated).toBe(false);
    live.reply({ requestId: posts()[posts().length - 1].requestId, chunks: ["y"] });
    await t;
    await expect(t2.promise).resolves.toEqual(["y"]);
  });
});
