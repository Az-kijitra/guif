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
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
