// Test folders and files (SPEC-0200-0001 §3.8.14): everything lives under one temporary
// root, `%TEMP%\rf-e2e-<time>\`. The app is only ever pointed at folders inside it, and the
// run refuses to send keys while the app shows a folder outside it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class Fixtures {
  /** `root` only for --attach: reuse the folder the kept app was started with (its backend scope). */
  constructor({ root } = {}) {
    this.root = root ?? fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "rf-e2e-")));
  }

  /** Absolute path of `rel` below the root (no creation). */
  at(...rel) {
    return path.join(this.root, ...rel);
  }

  /** True when `candidate` (a path shown by the app) is the root or inside it. */
  contains(candidate) {
    const normalize = (p) => path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();
    const root = normalize(this.root);
    const c = normalize(candidate);
    return c === root || c.startsWith(root + path.sep);
  }

  exists(...rel) {
    return fs.existsSync(this.at(...rel));
  }

  mkdir(...rel) {
    const dir = this.at(...rel);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** `count` files f001.txt ... in folder `name` (sorted by name = creation order). */
  files(name, count, { prefix = "f", ext = ".txt", digits = 3 } = {}) {
    const dir = this.at(name);
    if (fs.existsSync(dir)) return dir; // created once per run
    this.mkdir(name);
    for (let i = 1; i <= count; i++) {
      fs.writeFileSync(path.join(dir, `${prefix}${String(i).padStart(digits, "0")}${ext}`), "x");
    }
    return dir;
  }

  file(dirRel, fileName, { size = 1, mtime } = {}) {
    const dir = this.mkdir(dirRel);
    const full = path.join(dir, fileName);
    fs.writeFileSync(full, "x");
    if (size > 1) fs.truncateSync(full, size); // sparse file
    if (mtime) fs.utimesSync(full, mtime, mtime);
    return full;
  }

  folder(dirRel, folderName) {
    return this.mkdir(dirRel, folderName);
  }

  dispose() {
    try {
      fs.rmSync(this.root, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
