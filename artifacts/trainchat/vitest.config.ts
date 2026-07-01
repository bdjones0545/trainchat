import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

function stubImagePlugin(): Plugin {
  return {
    name: "stub-images",
    transform(_code, id) {
      if (/\.(png|jpg|jpeg|gif|svg|webp)$/.test(id)) {
        return { code: 'export default "stub-image";', map: null };
      }
    },
  };
}

export default defineConfig({
  plugins: [stubImagePlugin(), react()],
  test: {
    environment: "happy-dom",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      // No `include` here — setting include forces all-file scanning (all-files baseline
      // is ~0.6% for trainchat). "Imported files" mode gives ~65%, which is meaningful
      // because it only covers the 3 files the 2 test suites actually import.
      // See TESTING.md §13 for baseline numbers and the roadmap to thresholds.
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
  },
});
