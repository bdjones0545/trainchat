import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // text: printed to terminal; json-summary: machine-readable for CI display.
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      // No `include` here — setting include forces all-file scanning and gives ~8.5%
      // which is too noisy. "Imported files" mode (default) gives ~28%, which is
      // meaningful because it only counts files that tests actually reach.
      // See TESTING.md §13 for baseline numbers and the roadmap to thresholds.
    },
  },
});
