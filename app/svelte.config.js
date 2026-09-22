import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// SPEC-0200-0001 §2/§4.1: routes/ is a thin SvelteKit layer. adapter-static
// with an SPA fallback is used because the Tauri window has no server to
// render against at runtime (SPEC-0300-0009/0010 §-, MVP Phase 1 vertical
// slice — see app/src/routes/+layout.ts for the matching `ssr = false`).
/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
  },
};

export default config;
