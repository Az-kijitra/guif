// SPEC-0300-0023 AC-1722 / AC-1780 .. AC-1783 (the rows of the tuif look; replaces SPEC-0300-0017 §16.5 AC-916 / AC-916-1 / AC-917 / AC-920, see the table
// "置き換えた受入基準" of SPEC-0300-0017 第11版). AC-918 / AC-919 (names are shortened, the extension stays) are kept, measured in the row's own (bold) font.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fitBody } from "./_list.mjs";
import { chOf, openFiles, RGB, rowHeightOf } from "./_util.mjs";

const LONG_ASCII = "averyveryveryverylongname_quarterly_report_final.xlsx";
const LONG_JAPANESE = "とても長い日本語のファイル名_四半期報告書_最終版_確定稿.xlsx";

/** A file of `size` bytes without really storing it (sparse flag when the OS allows it). */
function sparseFile(ctx, dirRel, name, size) {
  const full = ctx.fx.file(dirRel, name);
  spawnSync("fsutil", ["sparse", "setflag", full], { stdio: "ignore" });
  fs.truncateSync(full, size);
  return full;
}

const bold = (weight) => Number(weight) >= 600 || weight === "bold";

// Rows of the list as plain data (R-1780: mark, name, size, time cells).
const ROWS = `[...document.querySelectorAll('.file-list-row')].map((r) => {
  const mark = r.querySelector('.mark');
  const name = r.querySelector('.name');
  const size = r.querySelector('.size');
  const time = r.querySelector('.modified');
  const s = getComputedStyle(r);
  return { id: r.id, label: r.getAttribute('aria-label'), classes: r.className, mark: mark.textContent, nameText: name.textContent, title: name.title,
    nameSW: name.scrollWidth, nameCW: name.clientWidth, cells: r.children.length, text: r.textContent,
    size: size ? size.textContent : null, sizeSW: size ? size.scrollWidth : 0, sizeCW: size ? size.clientWidth : 0, sizeAlign: size ? getComputedStyle(size).textAlign : null,
    time: time ? time.textContent : null, timeSW: time ? time.scrollWidth : 0, timeCW: time ? time.clientWidth : 0,
    color: s.color, background: s.backgroundColor, weight: s.fontWeight, opacity: s.opacity, outline: s.outlineStyle, font: s.font };
})`;
const rows = (ctx) => ctx.ev(ROWS);
const byLabel = (data, label) => data.find((x) => x.label === label);

/** Width of `text` in the font `font` (canvas), as the app measures it (R-1788). */
const measureInPage = (ctx, text, font) =>
  ctx.ev(`(() => { const c = document.createElement('canvas').getContext('2d'); c.font = ${JSON.stringify(font)}; return c.measureText(${JSON.stringify(text)}).width; })()`);

const EMOJI = /[\u{1F4C1}\u{1F4C4}]/u;

export const tests = [
  {
    id: "AC-916",
    title: "row (AC-1780 / AC-1781): height 16, padding 0, gap 1ch, no top border; mark 2ch, size cell 10ch right-aligned; folder <DIR>, 1.5 KB / 12.0 MB; * for a selected row; no emoji",
    async run(t, ctx) {
      ctx.fx.folder("sizes", "A");
      ctx.fx.file("sizes", "b.txt", { size: 1536 });
      sparseFile(ctx, "sizes", "c.bin", 12_582_912);
      const dir = ctx.fx.at("sizes");
      await ctx.reload();
      await ctx.nav(dir);
      await ctx.ensureView({ size: true, time: false, tree: true, hidden: false });
      const ch = await chOf(ctx, ".file-list");
      const rowHeight = await rowHeightOf(ctx);
      const r = await ctx.m.cs(".file-list-row", ["height", "padding", "column-gap", "border-top-width", "border-bottom-width"]);
      t.eq(r.height, `${rowHeight}px`, "row height is --list-row-height");
      t.eq(r.height, "16px", "row height 16px");
      t.eq(r.padding, "0px", "row padding");
      t.approx(Number.parseFloat(r["column-gap"]), ch, "row column-gap = 1ch", 0.6);
      t.eq([r["border-top-width"], r["border-bottom-width"]], ["0px", "0px"], "no line between rows (AC-1781)");
      const data = await rows(ctx);
      const folder = byLabel(data, "A");
      const small = byLabel(data, "b.txt");
      const big = byLabel(data, "c.bin");
      t.ok(folder && small && big, "all three entries are listed");
      if (!(folder && small && big)) return;
      t.eq(folder.size, "<DIR>", "folder size cell");
      t.eq(small.size, "1.5 KB", "b.txt size cell");
      t.eq(big.size, "12.0 MB", "c.bin size cell");
      t.eq(small.mark, "  ", "unselected mark is two spaces");
      const index = data.findIndex((x) => x.label === "b.txt");
      const cells = await ctx.ev(`(() => { const r = document.querySelectorAll('.file-list-row')[${index}]; const w = (sel) => r.querySelector(sel).getBoundingClientRect().width; return { mark: w('.mark'), size: w('.size') }; })()`);
      t.approx(cells.mark, 2 * ch, "mark cell is 2ch wide", 0.6);
      t.approx(cells.size, 10 * ch, "size cell is 10ch wide", 0.6);
      t.eq(small.sizeAlign, "right", "size cell is right-aligned");
      const font = (sel) => ctx.m.cs(sel, ["font-family", "font-size"], index);
      const [nameFont, sizeFont] = [await font(".file-list-row .name"), await font(".file-list-row .size")];
      t.eq(nameFont, sizeFont, "the size cell has the same font and size as the name");
      t.ok(!EMOJI.test(data.map((x) => x.text).join("")), "no folder / document emoji in the rows");
      // Select b.txt: the mark becomes "* ".
      await ctx.focusList();
      await ctx.clickSel(".file-list-row", index);
      await ctx.settle(150);
      const after = byLabel(await rows(ctx), "b.txt");
      t.eq(after.mark, "* ", "a selected row starts with '* '");
    },
  },
  {
    id: "AC-916-1",
    title: "'1023.9 MB' / '1023.9 KB' and the date are not truncated in their cells (size cell 10ch, time cell 16ch)",
    async run(t, ctx) {
      sparseFile(ctx, "bigsizes", "huge.bin", 1_073_636_966);
      sparseFile(ctx, "bigsizes", "kilo.bin", 1_048_473);
      await ctx.reload();
      await ctx.nav(ctx.fx.at("bigsizes"));
      await ctx.ensureView({ size: true, time: true, tree: true, hidden: false });
      const data = await rows(ctx);
      const huge = byLabel(data, "huge.bin");
      const kilo = byLabel(data, "kilo.bin");
      t.ok(huge && kilo, "both files are listed");
      if (!(huge && kilo)) return;
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
    title: "row grid (R-1783): mark 2ch | name 1fr | size 10ch | time 16ch, and the cell count per toggle",
    async run(t, ctx) {
      await openFiles(ctx, "many200", 200, { size: false, time: false });
      const ch = await chOf(ctx, ".file-list");
      const cases = [
        { name: "(i) neither", size: false, time: false, fixed: [2, null], cells: 2 },
        { name: "(ii) size", size: true, time: false, fixed: [2, null, 10], cells: 3 },
        { name: "(iii) time", size: false, time: true, fixed: [2, null, 16], cells: 3 },
        { name: "(iv) both", size: true, time: true, fixed: [2, null, 10, 16], cells: 4 },
      ];
      for (const c of cases) {
        await ctx.ensureView({ size: c.size, time: c.time });
        await ctx.settle(150);
        const grid = (await ctx.m.cs(".file-list-row", ["grid-template-columns"]))["grid-template-columns"].split(" ").map(Number.parseFloat);
        t.eq(grid.length, c.fixed.length, `${c.name}: number of grid tracks`);
        c.fixed.forEach((chs, i) => {
          if (chs !== null) t.approx(grid[i], chs * ch, `${c.name}: track ${i + 1} is ${chs}ch`, 0.6);
        });
        t.eq((await rows(ctx))[0].cells, c.cells, `${c.name}: cells per row (mark, name, size, time)`);
      }
    },
  },
  {
    id: "AC-918",
    title: "long names keep their extension: '…' before .xlsx, maximal k measured in the row's own font, title = full name",
    async run(t, ctx) {
      // Enough entries that the list needs several columns; the search brings each long name onto the drawn page.
      ctx.fx.files("names", 100, { prefix: "filler_" });
      ctx.fx.file("names", LONG_ASCII);
      ctx.fx.file("names", LONG_JAPANESE);
      ctx.fx.file("names", "short.txt");
      await ctx.reload();
      await ctx.nav(ctx.fx.at("names"));
      await ctx.ensureView({ size: true, time: true, tree: true, hidden: false });
      await fitBody(ctx, 300, 328); // a narrow list, so that the long names have to be shortened
      for (const [full, head, needle] of [[LONG_ASCII, "ave", "quarterly"], [LONG_JAPANESE, "とて", "四半期"]]) {
        await ctx.focusList();
        await ctx.press.search();
        await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
        await ctx.type(needle);
        await ctx.settle(300);
        const row = byLabel(await rows(ctx), full);
        t.ok(row, `"${full}" is listed (title = full name) after searching "${needle}"`);
        if (row) {
          const shown = row.nameText;
          t.eq(row.title, full, "title = the full name");
          t.ok(shown.endsWith("….xlsx"), `the character before .xlsx is "…"`, shown);
          t.ok(shown.startsWith(head), `shown text starts with "${head}"`, shown);
          t.ok(row.nameSW <= row.nameCW, "no CSS truncation (scrollWidth <= clientWidth)", `${row.nameSW} > ${row.nameCW}`);
          // Maximality in the row's own font (AC-1782: bold rows are measured bold): one more leading character would not fit in the name cell.
          const avail = row.nameCW;
          const k = Array.from(shown).length - Array.from("….xlsx").length;
          const bigger = Array.from(full).slice(0, k + 1).join("") + "….xlsx";
          const widthShown = await measureInPage(ctx, shown, row.font);
          const widthBigger = await measureInPage(ctx, bigger, row.font);
          t.ok(widthShown <= avail + 0.5, "shown text fits the name cell", `${widthShown} vs ${avail}`);
          t.ok(widthBigger > avail - 0.5, "one more character would exceed it (k is maximal)", `${widthBigger} vs ${avail}`);
        }
        await ctx.press.escape();
        await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });
      }
    },
  },
  {
    id: "AC-919",
    title: "a long folder name and an extension-less long file name are end-ellipsized; title = full name",
    async run(t, ctx) {
      const longDir = "a_really_long_directory_name_that_will_never_fit_in_one_column_at_all_for_sure";
      const longFile = "a_really_long_file_name_without_any_extension_at_all_for_sure_not_even_one";
      ctx.fx.files("names2", 100, { prefix: "filler_" });
      ctx.fx.folder("names2", longDir);
      ctx.fx.file("names2", longFile);
      await ctx.reload();
      await ctx.nav(ctx.fx.at("names2"));
      await ctx.ensureView({ size: true, time: true, tree: true, hidden: false });
      for (const [full, needle] of [[longDir, "directory_name"], [longFile, "file_name_without"]]) {
        await ctx.focusList();
        await ctx.press.search();
        await ctx.waitFor(`!!document.querySelector('.search-bar input')`, { label: "the search bar" });
        await ctx.type(needle);
        await ctx.settle(300);
        const row = byLabel(await rows(ctx), full);
        t.ok(row, `"${full}" is listed with its full name as title`);
        if (row) {
          t.eq(row.title, full, "title = the full name");
          t.ok(row.nameText.endsWith("…"), "end is elided", row.nameText);
          t.ok(row.nameText !== full, "the shown text is shortened", row.nameText);
        }
        await ctx.press.escape();
        await ctx.waitFor(`!document.querySelector('.search-bar')`, { label: "the search bar to close" });
      }
    },
  },
  {
    id: "AC-920",
    title: "no emoji in the list or the tree (AC-1780); the mark column only holds spaces or *; folder rows are bold in the folder colour, files normal (AC-1722)",
    async run(t, ctx) {
      ctx.fx.folder("icons", "afolder");
      ctx.fx.file("icons", "bfile.txt");
      await ctx.reload();
      await ctx.nav(ctx.fx.at("icons"));
      await ctx.ensureView({ size: true, time: false, tree: true, hidden: false });
      const data = await rows(ctx);
      const folder = byLabel(data, "afolder");
      const file = byLabel(data, "bfile.txt");
      t.ok(folder && file, "both rows exist");
      if (!(folder && file)) return;
      t.ok(!EMOJI.test(data.map((x) => x.text).join("")), "no folder / document emoji in the list");
      t.ok(data.every((x) => /^( {2}|\* )$/.test(x.mark)), "every mark cell is two spaces or '* '");
      // The cursor row (list focused) is drawn in the cursor colours; check the row that is not the cursor.
      const plain = (x) => !x.classes.includes("cursor");
      if (plain(folder)) t.eq([folder.color, bold(folder.weight)], [RGB.folder, true], "folder row: folder colour, bold");
      if (plain(file)) t.eq([file.color, bold(file.weight)], [RGB.fg, false], "file row: file colour, normal weight");
      const treeTexts = await ctx.m.texts(".tree-node");
      t.ok(!treeTexts.some((x) => EMOJI.test(x)), "no icons in the tree");
    },
  },
  {
    // SPEC-0300-0009 第14版 AC-642 (regression of fd0f15f: Backspace on a drive-root folder went to "C:" = the process's
    // current folder). READ ONLY: the app only SHOWS C:\ and a folder below it; no file is changed (SPEC-0400-0001 R-08).
    // The front end stops this one first, so the backend's rejection is NOT what this test distinguishes (AC-643 / 83 / 387 do).
    id: "AC-642",
    title: "Backspace in a drive-root folder goes to the separator-terminated root (not the process's folder); at the root it does not move; opening a folder keeps the C:\\ prefix",
    async run(t, ctx) {
      const root = `${(process.env.SystemDrive ?? "C:").toUpperCase()}\\`;
      const cwdFiles = ["Cargo.toml", "tauri.conf.json"].filter((n) => !fs.existsSync(root + n)); // names that would only come from app\src-tauri
      const listed = () => ctx.ev(`[...document.querySelectorAll('.file-list-row')].map((r) => ({ title: r.querySelector('.name').title, folder: r.classList.contains('dir') }))`);
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
        // The page shows the part of the root listing around the cursor; the origin folder is the cursor (the list follows it).
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
        const focusedFolder = await ctx.ev(`!!document.querySelector('.file-list-row:is(.cursor,.idle).dir')`);
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
