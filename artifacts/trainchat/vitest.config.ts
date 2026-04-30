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
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
  },
});
