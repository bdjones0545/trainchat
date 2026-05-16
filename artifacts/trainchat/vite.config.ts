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
    // Strip crossorigin attribute from Vite-generated module scripts and
    // modulepreload links. Mobile Safari (iOS) enforces strict CORS for ES
    // modules with crossorigin set — if the static CDN doesn't return
    // Access-Control-Allow-Origin headers the entire module graph silently
    // fails to load, leaving a black screen. Same-origin modules load fine
    // without the attribute.
    {
      name: "strip-module-crossorigin",
      transformIndexHtml(html: string): string {
        return html
          .replace(
            /(<script[^>]*type="module"[^>]*?) crossorigin(?:="[^"]*")?/g,
            "$1",
          )
          .replace(
            /(<link[^>]*rel="modulepreload"[^>]*?) crossorigin(?:="[^"]*")?/g,
            "$1",
          )
          .replace(
            /(<link[^>]*rel="stylesheet"[^>]*?) crossorigin(?:="[^"]*")?/g,
            "$1",
          );
      },
    },
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
    // Target Safari 14+ explicitly so Rollup doesn't emit syntax that
    // older mobile Safari engines reject at parse time.
    target: ["es2020", "safari14"],
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

          // NOTE: React (react, react-dom, scheduler) is intentionally NOT
          // assigned its own chunk. Giving React a separate chunk causes a
          // circular chunk dependency on Safari/JavaScriptCore:
          //   vendor-react imports Rollup helpers from vendor
          //   vendor imports React exports from vendor-react
          // V8 (Chrome) tolerates circular ES module live bindings; Safari does
          // not — the live binding is still undefined when React tries to assign
          // `x.Children = {...}`, crashing the entire app silently.
          // React is small enough to live in the shared vendor chunk safely.

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
