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

// ── Dev/preview-only API proxy ────────────────────────────────────────────────
// In production the frontend and the Express api-server are served on the SAME
// origin (Replit autoscale `router = "application"`), so the app's relative
// `/api/*` calls — including `/api/auth/bootstrap` — reach the backend directly.
//
// In a standalone Vite dev/preview server there is no same-origin backend, so
// those calls would 404, bootstrap would fail, and ChatPage would fall back to
// the guest UI. This proxy forwards `/api/*` to the api-server during dev
// (`vite`) and preview (`vite preview`) only. It has NO effect on `vite build`
// output, so the production bundle is unchanged.
//
// Target precedence: VITE_API_PROXY_TARGET → API_PROXY_TARGET → localhost:8080.
const apiProxyTarget =
  process.env.VITE_API_PROXY_TARGET ??
  process.env.API_PROXY_TARGET ??
  "http://localhost:8080";

const apiProxy = {
  "/api": {
    target: apiProxyTarget,
    changeOrigin: true,
    // Allow self-signed certs if the target is https in a dev tunnel.
    secure: false,
  },
} as const;

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

          // Three.js and the React Three Fiber stack power only the optional
          // empty-chat atmosphere. Leave their chunk placement to Rollup so
          // they stay attached to the lazy NeuralTerrainR3F import instead of
          // becoming a statically imported manual vendor chunk.
          if (
            id.includes("/three/") ||
            id.includes("/@react-three/") ||
            id.includes("/postprocessing/")
          ) {
            return undefined;
          }

          // Let Rollup place remaining dependencies with the routes/features
          // that use them. A catch-all vendor chunk pulled lazy-only libraries
          // into every page and made the initial preload unnecessarily large.
          return undefined;
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    // Dev-only: forward /api to the api-server (see apiProxy above).
    proxy: apiProxy,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    // Preview-only: forward /api to the api-server (see apiProxy above).
    proxy: apiProxy,
  },
});
