// Helpers shared by the specs (not a spec file itself: it exports no `tests`).

/** Reload, show `count` files of fixture folder `name`, put the display toggles into `view`. */
export async function openFiles(ctx, name, count, view = {}, fileOptions) {
  const dir = ctx.fx.files(name, count, fileOptions);
  await ctx.reload();
  await ctx.nav(dir);
  await ctx.ensureView({ size: true, time: false, hidden: false, tree: true, ...view });
  return dir;
}

export const BORDER_SIDES = ["top", "right", "bottom", "left"];

/** Computed border properties of all four sides, as one comparable object. */
export async function borders(ctx, selector, index = 0) {
  const props = [];
  for (const side of BORDER_SIDES) props.push(`border-${side}-width`, `border-${side}-style`, `border-${side}-color`);
  props.push("border-radius");
  return ctx.m.cs(selector, props, index);
}

/** Expected `borders()` for a 1px solid frame in `color` with no radius. */
export function expectedBorders(color) {
  const out = { "border-radius": "0px" };
  for (const side of BORDER_SIDES) {
    out[`border-${side}-width`] = "1px";
    out[`border-${side}-style`] = "solid";
    out[`border-${side}-color`] = color;
  }
  return out;
}

export const RGB = {
  bg: "rgb(245, 245, 245)",
  surface: "rgb(255, 255, 255)",
  surface2: "rgb(240, 240, 240)",
  surface3: "rgb(232, 240, 255)",
  border: "rgb(208, 208, 208)",
  borderStrong: "rgb(207, 207, 207)",
  borderMuted: "rgb(238, 238, 238)",
  muted: "rgb(102, 102, 102)",
  hover: "rgb(232, 240, 255)",
  selected: "rgb(219, 233, 255)",
  focused: "rgb(122, 167, 255)",
  error: "rgb(176, 0, 32)",
  backdrop: "rgba(0, 0, 0, 0.35)",
};

export const FRAME_FOCUS = { width: "1px", style: "solid", color: RGB.focused, offset: "-1px" };
export const NO_OUTLINE_STYLE = "none";

const SORT_LABELS = { name: "Name", size: "Size", type: "Type", modified: "Modified" };
const SORT_STATUS_KEYS = { 名前: "name", サイズ: "size", 種類: "type", 更新日時: "modified" };

/** Current sort as shown by the status bar item `並び替え: {キー} {↑|↓}`. */
export async function currentSort(ctx) {
  const text = (await ctx.m.statusItems()).find((x) => x.startsWith("並び替え: "));
  const match = /^並び替え: (\S+) (↑|↓)$/.exec(text ?? "");
  if (!match) throw new Error(`unexpected sort status item: ${text}`);
  return { key: SORT_STATUS_KEYS[match[1]], order: match[2] === "↑" ? "asc" : "desc" };
}

/** Choose a sort through the sort menu (s, arrows, Enter); selecting the current key toggles its order. */
export async function setSort(ctx, key, order) {
  const choose = async (target) => {
    await ctx.focusList();
    await ctx.press.sortMenu();
    await ctx.waitFor(`!!document.querySelector('.sort-menu')`, { label: "the sort menu" });
    for (let i = 0; i < 5; i++) {
      const highlighted = await ctx.ev(`document.querySelector('.sort-menu-item.highlighted .label')?.textContent`);
      if (highlighted === SORT_LABELS[target]) break;
      await ctx.press.down();
    }
    await ctx.press.enter();
    await ctx.waitFor(`!document.querySelector('.sort-menu')`, { label: "the sort menu to close" });
    await ctx.settle(300);
  };
  let now = await currentSort(ctx);
  if (now.key !== key) {
    await choose(key);
    now = await currentSort(ctx);
  }
  if (now.order !== order) await choose(key);
  now = await currentSort(ctx);
  if (now.key !== key || now.order !== order) throw new Error(`could not set the sort to ${key} ${order} (now ${now.key} ${now.order})`);
}
