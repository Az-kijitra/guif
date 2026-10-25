// SPEC-0400-0001 AC-06 / SPEC-0300-0017 AC-947 (the part an E2E run can observe).
import fs from "node:fs";

export const tests = [
  {
    id: "AC-947",
    title: "the settings of this run went to the override folder (GUIF_CONFIG_DIR); the stderr line was verified at launch",
    async run(t, ctx) {
      if (!ctx.handle.cfgDir) throw new Error("the settings folder of this run is unknown (attached without a record)");
      // The app saves with a debounce: give it a moment after the last state change.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const files = fs.readdirSync(ctx.handle.cfgDir);
      t.ok(files.includes("ui-state.toml"), "ui-state.toml was written to the override folder", files.join(", "));
      t.ok(files.includes("navigation.toml"), "navigation.toml was written to the override folder", files.join(", "));
      // SHOULD-156: WEBVIEW2_USER_DATA_FOLDER was honoured (the throw-away folder received WebView2's data).
      if (ctx.handle.userData) {
        const webviewFiles = fs.readdirSync(ctx.handle.userData);
        t.ok(webviewFiles.length > 0, "the temporary WebView2 user-data folder was used", webviewFiles.join(", "));
      }
      const stderr = ctx.handle.logDir ? fs.readFileSync(`${ctx.handle.logDir}/app.err.log`, "utf8") : "";
      const lines = stderr.split(/\r?\n/).filter((l) => l.startsWith("[config] override dir:"));
      t.eq(lines.length, 1, "exactly one `[config] override dir:` line on stderr");
      t.eq(lines[0]?.slice("[config] override dir: ".length).toLowerCase(), ctx.handle.cfgDir.toLowerCase(), "the line names the test folder");
    },
  },
];
