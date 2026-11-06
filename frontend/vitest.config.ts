/**
 * Frontend.md §11.2 — Vitest unit/component test runner.
 *
 * E2E and accessibility layers (Playwright + axe) are the follow-up tooling
 * approved in the testing strategy; this runner covers the unit and component
 * layers deterministically without a browser.
 */
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
