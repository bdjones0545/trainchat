import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Raise the warning threshold — individual AEO page chunks will be small,
    // but the chat bundle is legitimately large due to the AI interface.
    chunkSizeWarningLimit: 1_200,
    rollupOptions: {
      output: {
        // Vendor splitting: isolate stable third-party code into long-lived
        // cacheable chunks. Visitors who return get instant cache hits on
        // React, Framer Motion, and Radix without re-downloading them.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;

          // React runtime — the most stable, most shared dependency
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }

          // Framer Motion — large animation library, isolated for cache efficiency
          if (id.includes("/framer-motion/")) {
            return "vendor-motion";
          }

          // TanStack Query — shared across chat and auth flows
          if (id.includes("/@tanstack/")) {
            return "vendor-query";
          }

          // Radix UI primitives + Lucide icons — UI component dependencies
          if (
            id.includes("/@radix-ui/") ||
            id.includes("/lucide-react/")
          ) {
            return "vendor-ui";
          }

          // Remaining node_modules: wouter, zod, sonner, etc.
          // Grouped into a single "vendor" chunk rather than inlining into app.
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
