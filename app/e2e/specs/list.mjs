// SPEC-0300-0017 §16.5: the file list rows (AC-916 ... AC-920).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { openFiles, RGB } from "./_util.mjs";

const LONG_ASCII = "averyveryveryverylongname_quarterly_report_final.xlsx";
const LONG_JAPANESE = "とても長い日本語のファイル名_四半期報告書_最終版_確定稿.xlsx";

/** A file of `size` bytes without really storing it (sparse flag when the OS allows it). */
function sparseFile(ctx, dirRel, name, size) {
  const full = ctx.fx.file(dirRel, name);
  spawnSync("fsutil", ["sparse", "setflag", full], { stdio: "ignore" });
  fs.truncateSync(full, size);
  return full;
}

// Rows of the list as plain data.
const ROWS = `[...document.querySelectorAll('.file-list-row')].map((r) => {
  const name = r.querySelector('.name-text');
  const size = r.querySelector('.size');
  const time = r.querySelector('.modified');
  return { id: r.id, markers: [...r.querySelectorAll('.marker')].map((e) => e.textContent), nameText: name.textContent, title: r.querySelector('.name').title,
    nameSW: name.scrollWidth, nameCW: name.clientWidth, cells: r.children.length,
    size: size ? size.textContent : null, sizeSW: size ? size.scrollWidth : 0, sizeCW: size ? size.clientWidth : 0,
    time: time ? time.textContent : null, timeSW: time ? time.scrollWidth : 0, timeCW: time ? time.clientWidth : 0 };
})`;
const rows = (ctx) => ctx.ev(ROWS);

/** Width of `text` in the list's own font (canvas), as the app measures it. */
const measureInPage = (ctx, text) =>
  ctx.ev(`(() => { const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(document.querySelector('.file-list')).font; return c.measureText(${JSON.stringify(text)}).width; })()`);

export const tests = [
  {
    id: "AC-916",
    title: "row: height 28, padding 4px 6px, gap 2px, top border; size cell right-aligned muted nowrap; folder size empty",
    async run(t, ctx) {
      ctx.fx.folder("sizes", "a_folder");
      ctx.fx.file("sizes", "b_file.txt", { size: 2048 });
      const dir = ctx.fx.at("sizes");
      await ctx.reload();
      await ctx.nav(dir);
      await ctx.ensureView({ size: true, time: false, tree: true, hidden: false });
      const r = await ctx.m.cs(".file-list-row", ["height", "padding", "column-gap", "border-top-width", "border-top-style", "border-top-color"]);
      t.eq(r.height, "28px", "row height");
      t.eq(r.padding, "4px 6px", "row padding");
      t.eq(r["column-gap"], "2px", "row column-gap");
      t.eq([r["border-top-width"], r["border-top-style"], r["border-top-color"]], ["1px", "solid", RGB.borderMuted], "row border-top");
      const colWidth = (await ctx.m.cs(".file-list", ["--list-col-width"]))["--list-col-width"].trim();
      const rowWidth = (await ctx.m.rect(".file-list-row")).width;
      t.approx(rowWidth, Number.parseFloat(colWidth), "row width = --list-col-width");
      const data = await rows(ctx);
      const folder = data.find((x) => x.nameText.includes("a_folder"));
      const file = data.find((x) => x.nameText.includes("b_file.txt"));
      t.ok(folder && file, "both entries are listed");
      t.eq(folder.size, "", "folder size cell is empty");
      const fileIndex = data.findIndex((x) => x === file || x.id === file.id);
      const s = await ctx.m.cs(".file-list-row .size", ["text-align", "color", "white-space"], fileIndex);
      t.eq(s["text-align"], "right", "size cell text-align");
      t.eq(s.color, RGB.muted, "size cell colour");
      t.eq(s["white-space"], "nowrap", "size cell white-space");
    },
  },
  {
    id: "AC-916-1",
    title: "'1023.9 MB' / '1023.9 KB' and the date are not truncated in their cells",
    async run(t, ctx) {
      sparseFile(ctx, "bigsizes", "huge.bin", 1_073_636_966);
      sparseFile(ctx, "bigsizes", "kilo.bin", 1_048_473);
      await ctx.reload();
      await ctx.nav(ctx.fx.at("bigsizes"));
      await ctx.ensureView({ size: true, time: true, tree: true, hidden: false });
      const data = await rows(ctx);
      const huge = data.find((x) => x.nameText.includes("huge.bin"));
      const kilo = data.find((x) => x.nameText.includes("kilo.bin"));
      t.ok(huge && kilo, "both files are listed");
      t.eq(huge.size, "1023.9 MB", "MB text");
      t.eq(kilo.size, "1023.9 KB", "KB text");
      for (const [label, row] of [["MB", huge], ["KB", kilo]]) {
        t.ok(row.sizeSW <= row.sizeCW, `${label} size cell not truncated`, `${row.sizeSW} > ${row.sizeCW}`);
        t.ok(row.timeSW <= row.timeCW, `${label} time cell not truncated`, `${row.timeSW} > ${row.timeCW}`);
        t.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(row.time), `${label} time format`, row.time);
      }
    },
  },
  {
    id: "AC-917",
    title: "W=760 H=560, 200 entries: grid-template-columns 160 / 174+64 / 166+140 / 180+64+140 and cell counts",
    async run(t, ctx) {
      await openFiles(ctx, "many200", 200, { size: false, time: false });
      await ctx.setFrameSize(760, 566);
      const cases = [
        { name: "(i) neither", size: false, time: false, columns: "160px", cells: 1 },
        { name: "(ii) size", size: true, time: false, columns: "174px 64px", cells: 2 },
        { name: "(iii) time", size: false, time: true, columns: "166px 140px", cells: 2 },
        { name: "(iv) both", size: true, time: true, columns: "180px 64px 140px", cells: 3 },
      ];
      for (const c of cases) {
        await ctx.ensureView({ size: c.size, time: c.time });
        await ctx.setFrameSize(760, 566);
        const grid = await ctx.m.cs(".file-list-row", ["grid-template-columns"]);
        t.eq(grid["grid-template-columns"], c.columns, `${c.name}: grid-template-columns`);
        t.eq((await rows(ctx))[0].cells, c.cells, `${c.name}: cells per row`);
      }
    },
  },
  {
    id: "AC-918",
    title: "long names keep their extension: '…' before .xlsx, maximal k, title = full name, search still finds them",
    async run(t, ctx) {
      // Enough entries that the list needs several columns (column width = minCol 400, name cell 180).
      ctx.fx.files("names", 100, { prefix: "filler_" });
      ctx.fx.file("names", LONG_ASCII);
      ctx.fx.file("names", LONG_JAPANESE);
      ctx.fx.file("names", "short.txt");
      await ctx.reload();
      await ctx.nav(ctx.fx.at("names"));
      await ctx.ensureView({ size: true, time: true, tree: true, hidden: false });
      const data = await rows(ctx);
      const nameAvail = async () => ctx.ev(`document.querySelector('.file-list-row .name').clientWidth`);
      for (const [full, head] of [[LONG_ASCII, "avery"], [LONG_JAPANESE, "とても"]]) {
        const row = data.find((x) => x.title === full);
        t.ok(row, `"${full}" is listed (title = full name)`);
        if (!row) continue;
        const shown = row.nameText.slice(3); // drop "📁 " / "📄 " (an emoji is 2 UTF-16 units + a space)
        t.ok(shown.endsWith("….xlsx") || shown.endsWith(".xlsx"), `shown text ends with .xlsx`, shown);
        t.ok(shown.endsWith("….xlsx"), `the character before .xlsx is "…"`, shown);
        t.ok(shown.startsWith(head), `shown text starts with "${head}"`, shown);
        t.ok(row.nameSW <= row.nameCW, "no CSS truncation (scrollWidth <= clientWidth)", `${row.nameSW} > ${row.nameCW}`);
        // Maximality: one more leading character would not fit in the name cell.
        // Rows that carry an edge marker (◀ / ▶) have that much less room (design G1).
        let avail = (await nameAvail()) - (await measureInPage(ctx, "📄 "));
        for (const marker of row.markers) avail -= await measureInPage(ctx, marker);
        const k = Array.from(shown).length - Array.from("….xlsx").length;
        const bigger = Array.from(full).slice(0, k + 1).join("") + "….xlsx";
        const widthShown = await measureInPage(ctx, shown);
        const widthBigger = await measureInPage(ctx, bigger);
        t.ok(widthShown <= avail + 0.5, "shown text fits the available width", `${widthShown} vs ${avail}`);
        t.ok(widthBigger > avail - 0.5, "one more character would exceed it (k is maximal)", `${widthBigger} vs ${avail}`);
      }
      // The search matches the full name, not the shortened text.
      for (const [needle, full] of [["final", LONG_ASCII], ["確定稿", LONG_JAPANESE]]) {
        await ctx.focusList();
        await ctx.press.search();
        await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
        await ctx.type(needle);
        await ctx.settle(300);
        const found = (await rows(ctx)).some((x) => x.title === full);
        t.ok(found, `searching "${needle}" shows "${full}"`);
        await ctx.press.escape();
        await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });
      }
    },
  },
  {
    id: "AC-919",
    title: "a long folder name and an extension-less long file name are end-ellipsized; title = full name",
    async run(t, ctx) {
      const longDir = "a_really_long_directory_name_that_will_never_fit_in_one_column";
      const longFile = "a_really_long_file_name_without_any_extension_at_all_for_sure";
      ctx.fx.files("names2", 100, { prefix: "filler_" });
      ctx.fx.folder("names2", longDir);
      ctx.fx.file("names2", longFile);
      await ctx.reload();
      await ctx.nav(ctx.fx.at("names2"));
      await ctx.ensureView({ size: true, time: true, tree: true, hidden: false });
      const data = await rows(ctx);
      for (const full of [longDir, longFile]) {
        const row = data.find((x) => x.title === full);
        t.ok(row, `"${full}" is listed with its full name as title`);
        if (!row) continue;
        const shown = row.nameText.slice(3);
        t.ok(shown.endsWith("…") || row.nameSW > row.nameCW, "end is elided", shown);
        t.ok(shown !== full, "the shown text is shortened", shown);
      }
    },
  },
  {
    id: "AC-920",
    title: "folder rows start with the folder emoji, file rows with the document emoji; the tree has no icons",
    async run(t, ctx) {
      ctx.fx.folder("icons", "afolder");
      ctx.fx.file("icons", "bfile.txt");
      await ctx.reload();
      await ctx.nav(ctx.fx.at("icons"));
      await ctx.ensureView({ size: true, time: false, tree: true, hidden: false });
      const data = await rows(ctx);
      const folder = data.find((x) => x.title === "afolder");
      const file = data.find((x) => x.title === "bfile.txt");
      t.ok(folder && file, "both rows exist");
      t.ok(folder.nameText.startsWith("📁"), "folder icon", folder.nameText);
      t.ok(file.nameText.startsWith("📄"), "file icon", file.nameText);
      const treeTexts = await ctx.m.texts(".tree-node");
      t.ok(!treeTexts.some((x) => /[📁📄]/u.test(x)), "no icons in the tree");
    },
  },
  {
    // SPEC-0300-0009 第14版 AC-642 (regression of fd0f15f: Backspace on a drive-root folder went to "C:" = the process's
    // current folder). READ ONLY: the app only SHOWS C:\ and a folder below it; no file is changed (SPEC-0400-0001 R-08).
    // The front end stops this one first, so the backend's rejection is NOT what this test distinguishes (AC-643 / 83 / 387 do).
    id: "AC-642",
    title: "Backspace in a drive-root folder goes to the separator-terminated root (not the process's folder); at the root it does not move; opening a folder keeps the C:\ prefix",
    async run(t, ctx) {
      const root = `${(process.env.SystemDrive ?? "C:").toUpperCase()}\\`;
      const cwdFiles = ["Cargo.toml", "tauri.conf.json"].filter((n) => !fs.existsSync(root + n)); // names that would only come from app\\src-tauri
      const listed = () => ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r) => ({ title: r.querySelector('.name').title, folder: (r.querySelector('.name-text')?.textContent ?? '').startsWith('📁') }))`);
      const shown = async () => (await ctx.pathBarState())?.value ?? "";
      const same = (a, b) => a.toLowerCase() === b.toLowerCase();
      try {
        await ctx.nav(root);
        const top = await listed();
        const folder = ["Users", "Windows"].find((n) => top.some((r) => r.folder && r.title === n)) ?? top.find((r) => r.folder)?.title;
        t.ok(folder !== undefined, `a folder directly below ${root} exists`);
        if (folder === undefined) return;
        const dir = root + folder;
        await ctx.nav(dir);
        t.ok((await shown()).toLowerCase().startsWith(root.toLowerCase()), `showing ${dir}`, await shown());
        await ctx.focusList();
        await ctx.viewKey("Backspace");
        await ctx.waitFor(`!document.querySelector('.list-notice') && document.querySelector('.path-bar-row input')?.value === ${JSON.stringify(root)}`, { label: "the path bar to show the drive root", timeout: 8000 }).catch(() => {});
        t.ok(same(await shown(), root), "after Backspace the path bar shows the root WITH its separator", await shown());
        await ctx.settle(300);
        const atRoot = await listed();
        t.ok(atRoot.some((r) => r.folder && r.title === folder), `the list holds the origin folder "${folder}" (drive-root content)`);
        t.ok(!atRoot.some((r) => cwdFiles.includes(r.title)), "the list is not the process's current folder (no Cargo.toml / tauri.conf.json)", atRoot.slice(0, 8).map((r) => r.title).join(", "));

        await ctx.focusList();
        await ctx.viewKey("Backspace");
        await ctx.settle(700);
        t.ok(same(await shown(), root), "Backspace at the root does not move", await shown());
        t.eq((await listed()).length, atRoot.length, "the list is unchanged after the second Backspace");

        // "open a folder": Enter on the focused row, only when it is a folder row
        await ctx.focusList();
        const focusedFolder = await ctx.ev(`(document.querySelector('.file-list-row.focused .name-text')?.textContent ?? '').startsWith('📁')`);
        if (!focusedFolder) {
          t.fail("the focused row at the root is not a folder row, cannot open a folder with Enter");
        } else {
          await ctx.viewKey("Enter");
          await ctx.waitFor(`!document.querySelector('.list-notice') && (document.querySelector('.path-bar-row input')?.value ?? '') !== ${JSON.stringify(root)}`, { label: "the folder to open", timeout: 8000 }).catch(() => {});
          const now = await shown();
          t.ok(now.toLowerCase().startsWith(root.toLowerCase()) && now.length > root.length, `opening a folder shows an absolute path starting with ${root}`, now);
        }
      } finally {
        await ctx.nav(ctx.fx.mkdir("ac642-back")); // leave the drive: the next tests start from the test folder
      }
    },
  },
];
