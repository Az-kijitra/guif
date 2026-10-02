// In-page measurement helpers (injected with Runtime.evaluate) and the Node-side wrappers
// (SPEC-0300-0017 §16.0: getComputedStyle / getBoundingClientRect, outline properties compared
// individually, CSS variables trimmed + lower-cased).
//
// The selectors below are a contract with the app (SPEC-0200-0001 §3.8.14): .app-shell,
// .path-bar-row, .tree-panel, .file-list-frame, .file-list, .status-bar and the ARIA roles.
// Renaming one of them in the app means updating the specs here.

export const PAGE_HELPERS = `(() => {
  const q = (sel, i = 0) => document.querySelectorAll(sel)[i] ?? null;
  const OUT = ["outline-width", "outline-style", "outline-color", "outline-offset"];
  window.__m = {
    q,
    count: (sel) => document.querySelectorAll(sel).length,
    rect(sel, i = 0) {
      const e = q(sel, i);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    },
    cs(sel, props, i = 0) {
      const e = q(sel, i);
      if (!e) return null;
      const s = getComputedStyle(e);
      const out = {};
      for (const p of props) out[p] = s.getPropertyValue(p);
      return out;
    },
    outline(sel, i = 0) {
      const e = q(sel, i);
      if (!e) return null;
      const s = getComputedStyle(e);
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor, offset: s.outlineOffset };
    },
    dims(sel, i = 0) {
      const e = q(sel, i);
      if (!e) return null;
      return { clientWidth: e.clientWidth, clientHeight: e.clientHeight, scrollWidth: e.scrollWidth, scrollHeight: e.scrollHeight,
               scrollLeft: e.scrollLeft, scrollTop: e.scrollTop, offsetWidth: e.offsetWidth, clientLeft: e.clientLeft, clientTop: e.clientTop };
    },
    texts(sel) { return [...document.querySelectorAll(sel)].map((e) => e.textContent); },
    cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim().toLowerCase(); },
    center(sel, i = 0) {
      const e = q(sel, i);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    active() {
      const a = document.activeElement;
      if (!a) return null;
      return { tag: a.tagName, role: a.getAttribute("role"), cls: a.className?.toString?.() ?? "", area: a.closest("[data-focus-area]")?.getAttribute("data-focus-area") ?? null };
    },
    statusItems() { return [...document.querySelectorAll(".status-bar .status-item")].map((e) => e.textContent); },
  };
  return true;
})()`;

/** Wrappers that run the helpers in the page and return plain JSON. */
export function measureApi(cdp) {
  const call = (fn, ...args) => cdp.ev(`window.__m.${fn}(${args.map((a) => JSON.stringify(a)).join(", ")})`);
  return {
    rect: (sel, i = 0) => call("rect", sel, i),
    cs: (sel, props, i = 0) => call("cs", sel, props, i),
    outline: (sel, i = 0) => call("outline", sel, i),
    dims: (sel, i = 0) => call("dims", sel, i),
    count: (sel) => call("count", sel),
    texts: (sel) => call("texts", sel),
    cssVar: (name) => call("cssVar", name),
    center: (sel, i = 0) => call("center", sel, i),
    active: () => call("active"),
    statusItems: () => call("statusItems"),
  };
}

export const rgb = (r, g, b) => `rgb(${r}, ${g}, ${b})`;
export const rgba = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${a})`;
