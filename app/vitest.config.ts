import { defineConfig } from "vitest/config";

// Minimal vitest configuration for Phase 1 (file-list / keyboard) unit tests.
// No DOM/Svelte rendering environment is configured here on purpose: the tests
// authored by unit-test-writer target pure logic modules (list layout math,
// selection/navigation/tree logic, keymap resolution, ARIA attribute
// computation as plain data) so that they can run without a browser-like
// environment. code-generator is expected to wire these modules into actual
// Svelte components; component-level rendering tests are out of scope for
// this initial TDD pass (see unit-test-writer's handback report).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: "default",
  },
});
