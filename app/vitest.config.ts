import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// Vitest configuration for the pure-logic unit tests under src/lib/features/**.
//
// Phase 3 (SPEC-0300-0012, search) update: the `sveltekit()` plugin was added
// here (it was absent through Phase 1/Phase 2, see the removed note this
// comment replaces) because this TDD pass introduces the first tests that
// import `*.svelte.ts` feature-local state modules directly
// (`features/file-list/list-state.svelte.ts`'s new `createFileListState`
// export, and the new `features/search/search-state.svelte.ts`). Those
// modules use Svelte 5 runes (`$state`) and the `$lib/*` path alias
// (SPEC-0200-0001 §5.3); without SvelteKit's Vite plugin, `$state(...)`
// remains an uncompiled call to a non-existent global and `$lib/*` imports
// fail to resolve (both confirmed to fail before this change — see the
// unit-test-writer 2026-09-24 handback report / traceability.md).
//
// Adding `sveltekit()` here does not pull in any `$app/*` SvelteKit runtime
// modules (nothing under src/lib/features/** imports those), and the full
// pre-existing suite (20 files / 255 tests as of the Phase 2 handback) was
// re-run after this change with no regressions before this file was
// committed. `environment: "node"` is kept — none of these tests render
// actual Svelte components (no DOM), they only exercise plain exported
// functions/objects, per SPEC-0400-0001 §3's DOM-free pure-logic testing
// policy.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: "default",
  },
});
