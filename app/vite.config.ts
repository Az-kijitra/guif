import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// NOTE: vitest.config.ts (used for `npx vitest run`, the pure-logic unit
// tests under src/lib/features/**) is a separate, standalone config file.
// Vitest resolves `vitest.config.ts` exclusively when present and does not
// merge it with this file, so the SvelteKit app build below and the
// existing vitest suite stay isolated from each other (no $app/* mocking
// needed for the logic-only tests).
export default defineConfig({
  plugins: [sveltekit()],
  clearScreen: false,
  // Dev only: pre-bundle every runtime dependency up front. Otherwise vite discovers them on first
  // use and force-reloads the page ("optimized dependencies changed. reloading"); for the viewer
  // window that reload came AFTER it had consumed the one-shot pending file (R-430), leaving it on
  // "No file selected" the first time a viewer opened after `tauri dev` started (ISS-0203 (b)).
  optimizeDeps: {
    include: [
      "@tauri-apps/api/core",
      "@tauri-apps/api/event",
      "@tauri-apps/api/window",
      "@tauri-apps/api/path",
      "markdown-it",
      // Only the highlight Worker imports these, so without them the first highlighted file would make the dev server
      // discover them late and reload the page (MUST-138, same cause as ISS-0203 (b)).
      "highlight.js/lib/core",
      "highlight.js/lib/languages/c",
      "highlight.js/lib/languages/cpp",
      "highlight.js/lib/languages/rust",
      "highlight.js/lib/languages/javascript",
      "highlight.js/lib/languages/typescript",
      "highlight.js/lib/languages/python",
      "highlight.js/lib/languages/json",
      "highlight.js/lib/languages/markdown",
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
