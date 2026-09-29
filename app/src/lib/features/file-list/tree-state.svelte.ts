// SPEC-0300-0009 R-40~R-45, R-64~R-66, AC-600~AC-608, AC-612-1. Architecture:
// docs/architecture/proposals/SPEC-0200-0001.md §3.6.3, §3.6.11.4 (MUST-87),
// §3.6.11.7 (MUST-90), §3.6.11.11 (SHOULD-122/124/125). Feature-local state
// for the directory tree panel (a sibling of `list-state.svelte.ts` in the
// same feature directory, but the two modules never import each other,
// MUST-94/MUST-87(f): `isVisible` is an injected function, not a read of
// `list-state.svelte.ts`).

import { pathComparisonKey } from "$lib/shared/path-key";
import { computeTreeRoot, isAncestorPath, pathsEqual, resolveAncestorChain } from "./tree";

export interface TreeStateEntry {
  path: string;
  name: string;
}

export interface TreeStateDeps {
  listDir: (path: string, showHidden: boolean) => Promise<TreeStateEntry[]>;
  isVisible: () => boolean;
  onLoadFailureNotice: (message: string) => void;
}

export interface TreeRowView {
  path: string;
  name: string;
  level: number;
  expanded: boolean;
  loading: boolean;
}

interface InternalNode {
  path: string;
  name: string;
  level: number;
  parentKey: string | null;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  children: string[] | undefined;
  // MUST-90(b): a per-node monotonic token -- only the MOST RECENT fetch
  // attempt for a given node is allowed to apply its result, regardless of
  // which caller (followTo's ancestor walk / lazy fire-and-forget /
  // toggleExpand / applyHiddenFilesChanged) started it.
  fetchToken: number;
}

type FetchResult = { success: true } | { success: false; code: string; stale: boolean };

function errorCodeOf(e: unknown): string {
  if (e !== null && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "other";
}

function basenameOf(path: string): string {
  const trimmed = path.replace(/\\+$/, "");
  const idx = trimmed.lastIndexOf("\\");
  return idx === -1 ? trimmed : trimmed.slice(idx + 1);
}

export function createTreeState(deps: TreeStateDeps) {
  let root = $state<string | null>(null);
  let currentDirPath = $state("");
  let focusedPath = $state<string | null>(null);
  let rawHasFocus = $state(false);
  let showHidden = false;
  let rootGeneration = 0;
  let followSeq = 0;
  const nodes = new Map<string, InternalNode>();
  // Bumped on every state-shape change so Svelte's reactivity
  // (`visibleRows()`) can recompute -- `nodes`/`InternalNode` are plain
  // (non-runed) mutable objects for simplicity.
  let version = $state(0);
  function touch(): void {
    version += 1;
  }

  function keyOf(path: string): string {
    return pathComparisonKey(path);
  }

  function makeNode(path: string, name: string, level: number, parentKey: string | null): InternalNode {
    return { path, name, level, parentKey, expanded: false, loaded: false, loading: false, children: undefined, fetchToken: 0 };
  }

  function applyChildren(node: InternalNode, entries: TreeStateEntry[]): void {
    const childKeys: string[] = [];
    for (const entry of entries) {
      const k = keyOf(entry.path);
      childKeys.push(k);
      const existing = nodes.get(k);
      if (existing === undefined) {
        nodes.set(k, makeNode(entry.path, entry.name, node.level + 1, keyOf(node.path)));
      } else {
        // AC-602: an already-visited node's own expanded/loaded state
        // survives a re-list of its parent; only its display fields refresh.
        existing.path = entry.path;
        existing.name = entry.name;
        existing.level = node.level + 1;
        existing.parentKey = keyOf(node.path);
      }
    }
    node.children = childKeys;
    node.loaded = true;
  }

  // MUST-90(a)/(b)/(c): fetches `node`'s children. `node.loading` is always
  // cleared on completion. The result is applied only when BOTH the whole-
  // tree generation and this node's own fetch token are still current;
  // otherwise it is silently discarded (but the caller may still need to
  // know whether to notify, hence `stale` on failures).
  function fetchInto(node: InternalNode, generation: number, showHiddenAtCall: boolean): Promise<FetchResult> {
    node.fetchToken += 1;
    const myToken = node.fetchToken;
    node.loading = true;
    touch();
    return deps.listDir(node.path, showHiddenAtCall).then(
      (entries) => {
        node.loading = false;
        const stale = generation !== rootGeneration || myToken !== node.fetchToken;
        if (stale) {
          touch();
          return { success: false, code: "stale", stale: true } as const;
        }
        applyChildren(node, entries);
        touch();
        return { success: true } as const;
      },
      (e) => {
        node.loading = false;
        touch();
        const stale = generation !== rootGeneration || myToken !== node.fetchToken;
        if (stale) return { success: false, code: "stale", stale: true } as const;
        return { success: false, code: errorCodeOf(e), stale: false } as const;
      },
    );
  }

  function notifyIfNeeded(result: { success: false; code: string; stale: boolean }): void {
    if (result.stale) return;
    if (result.code === "access_denied" || result.code === "not_found") return; // R-40-3: silent
    deps.onLoadFailureNotice("Some folders could not be listed.");
  }

  // R-40/R-40-1/R-40-5/R-40-7/AC-600~AC-608: build/extend the tree toward
  // `path` and highlight the deepest node we could confirm.
  async function followTo(path: string, opts?: { rebuild?: boolean }): Promise<void> {
    const mySeq = ++followSeq;
    const rootResult = computeTreeRoot(path);
    const targetRoot = rootResult.singleNodeOnly ? path : (rootResult.root as string);
    const sameRoot = root !== null && pathsEqual(targetRoot, root) && opts?.rebuild !== true;

    if (!sameRoot) {
      rootGeneration += 1;
      nodes.clear();
      root = targetRoot;
      nodes.set(keyOf(targetRoot), makeNode(targetRoot, targetRoot, 0, null));
      touch();
    }
    const myGeneration = rootGeneration;
    const isCurrent = () => mySeq === followSeq;

    if (rootResult.singleNodeOnly) {
      if (!isCurrent()) return;
      currentDirPath = targetRoot;
      focusedPath = targetRoot;
      return;
    }

    const chain = resolveAncestorChain(path, targetRoot);
    let confirmed = targetRoot;

    for (let i = 0; i < chain.length - 1; i++) {
      const parentPath = chain[i];
      const childPath = chain[i + 1];
      const isFinal = i === chain.length - 2;
      const parentNode = nodes.get(keyOf(parentPath));
      if (parentNode === undefined) break;

      if (!parentNode.loaded) {
        const result = await fetchInto(parentNode, myGeneration, showHidden);
        if (!isCurrent()) return;
        if (!result.success) {
          notifyIfNeeded(result);
          break;
        }
      }
      if (!parentNode.expanded) {
        parentNode.expanded = true;
        // `nodes` is a plain Map: without touch() the last ancestor's
        // expansion (whose children were already loaded earlier in this
        // loop) never reaches `visibleRows()` readers (found on a real
        // device, 2026-09-29).
        touch();
      }

      // Ensure a node exists for `childPath` -- normally created by
      // `applyChildren` from the parent's real listing; falls back to a bare
      // node synthesized from the path segment so navigation still works
      // even when the parent's listing did not literally include it (a
      // race, or a caller that only models the exact paths it cares about).
      let childNode = nodes.get(keyOf(childPath));
      if (childNode === undefined) {
        childNode = makeNode(childPath, basenameOf(childPath), parentNode.level + 1, keyOf(parentPath));
        nodes.set(keyOf(childPath), childNode);
        parentNode.children = [...(parentNode.children ?? []), keyOf(childPath)];
        touch();
      }

      if (isFinal) {
        // R-42 注記/AC-30: the current folder's OWN node stays collapsed and
        // unloaded until the user explicitly expands it (R-64) -- R-40-1
        // only expands the ANCESTOR chain, never the target itself. Its
        // children are therefore deliberately NOT fetched here (not even in
        // the background): doing so would perform an unbudgeted fetch (and
        // a possible stray notification outside R-40-3's "batch into one"
        // window) for data the tree never displays until R-64 asks for it.
        confirmed = childPath;
        break;
      }

      if (!childNode.loaded) {
        const result = await fetchInto(childNode, myGeneration, showHidden);
        if (!isCurrent()) return;
        if (!result.success) {
          notifyIfNeeded(result);
          break;
        }
      }
      confirmed = childPath;
    }

    if (!isCurrent()) return;
    currentDirPath = confirmed;
    focusedPath = confirmed;
  }

  // MUST-94/MUST-87(b): clears state WITHOUT performing any fetch.
  function clear(): void {
    rootGeneration += 1;
    followSeq += 1;
    root = null;
    currentDirPath = "";
    focusedPath = null;
    nodes.clear();
    touch();
  }

  // R-64: clicking the caret always re-lists (a fresh fetch every time the
  // node transitions to expanded, even if it was already loaded once before
  // -- the user is explicitly asking to see current contents).
  function toggleExpand(path: string): void {
    const node = nodes.get(keyOf(path));
    if (node === undefined) return;
    if (node.expanded) {
      node.expanded = false;
      touch();
      return;
    }
    const generation = rootGeneration;
    void fetchInto(node, generation, showHidden).then((result) => {
      if (result.success) {
        node.expanded = true;
        touch();
      } else {
        notifyIfNeeded(result);
      }
    });
  }

  // R-65: on-demand expansion, or focus the first child of an already-
  // expanded node.
  function handleMoveRight(): void {
    if (focusedPath === null) return;
    const node = nodes.get(keyOf(focusedPath));
    if (node === undefined) return;
    if (!node.loaded || !node.expanded) {
      toggleExpand(node.path);
      return;
    }
    const firstChildKey = node.children?.[0];
    if (firstChildKey === undefined) return;
    const child = nodes.get(firstChildKey);
    if (child !== undefined) focusedPath = child.path;
  }

  // R-66: collapse an expanded node, or focus its parent.
  function handleMoveLeft(): void {
    if (focusedPath === null) return;
    const node = nodes.get(keyOf(focusedPath));
    if (node === undefined) return;
    if (node.expanded) {
      node.expanded = false;
      touch();
      return;
    }
    if (node.parentKey === null) return;
    const parent = nodes.get(node.parentKey);
    if (parent !== undefined) focusedPath = parent.path;
  }

  function visibleRows(): TreeRowView[] {
    // touch() bumps `version`; reading it here makes this function reactive
    // to in-place mutations of the plain `nodes` map under Svelte 5 runes.
    void version;
    if (root === null) return [];
    const rootNode = nodes.get(keyOf(root));
    if (rootNode === undefined) return [];
    const rows: TreeRowView[] = [];
    const visit = (node: InternalNode): void => {
      rows.push({ path: node.path, name: node.name, level: node.level, expanded: node.expanded, loading: node.loading });
      if (node.expanded && node.children) {
        for (const childKey of node.children) {
          const child = nodes.get(childKey);
          if (child !== undefined) visit(child);
        }
      }
    };
    visit(rootNode);
    return rows;
  }

  function moveFocus(direction: "up" | "down"): void {
    const rows = visibleRows();
    if (rows.length === 0) return;
    const idx = rows.findIndex((r) => focusedPath !== null && pathsEqual(r.path, focusedPath));
    const safeIdx = idx === -1 ? 0 : idx;
    const next = direction === "down" ? Math.min(safeIdx + 1, rows.length - 1) : Math.max(safeIdx - 1, 0);
    focusedPath = rows[next].path;
  }

  function moveFocusPage(direction: "up" | "down", pageSize: number): void {
    const rows = visibleRows();
    if (rows.length === 0) return;
    const idx = rows.findIndex((r) => focusedPath !== null && pathsEqual(r.path, focusedPath));
    const safeIdx = idx === -1 ? 0 : idx;
    const step = Math.max(pageSize, 1);
    const next = direction === "down" ? Math.min(safeIdx + step, rows.length - 1) : Math.max(safeIdx - step, 0);
    focusedPath = rows[next].path;
  }

  function selectFocused(): { path: string } | null {
    return focusedPath === null ? null : { path: focusedPath };
  }

  // R-40-4/MUST-90(b): re-fetch every already-expanded, already-loaded
  // node's children with the new showHidden flag; a superseded (stale)
  // result never overwrites a later one (each fetch bumps that node's own
  // fetchToken).
  function applyHiddenFilesChanged(newShowHidden: boolean): void {
    showHidden = newShowHidden;
    const generation = rootGeneration;
    for (const node of nodes.values()) {
      if (node.loaded && node.expanded) {
        void fetchInto(node, generation, newShowHidden).then((result) => {
          if (!result.success) notifyIfNeeded(result);
        });
      }
    }
  }

  function setContainerFocus(focused: boolean): void {
    rawHasFocus = focused;
  }

  return {
    get root() {
      return root;
    },
    get currentDirPath() {
      return currentDirPath;
    },
    get focusedPath() {
      return focusedPath;
    },
    get hasFocus() {
      return deps.isVisible() && rawHasFocus;
    },
    followTo,
    clear,
    toggleExpand,
    handleMoveRight,
    handleMoveLeft,
    moveFocus,
    moveFocusPage,
    selectFocused,
    applyHiddenFilesChanged,
    visibleRows,
    setContainerFocus,
  };
}

// Re-exported for callers that only need the ancestor-relationship check
// (e.g. deciding whether a path move stays under the currently tracked root).
export { isAncestorPath };
