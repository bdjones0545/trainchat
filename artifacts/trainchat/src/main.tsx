import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Startup diagnostics ────────────────────────────────────────────────────
// These logs are always emitted (prod and dev) so production crashes are
// visible in Safari's Web Inspector and in the /api/client-error endpoint.
// They are tiny strings — no meaningful bundle size impact.
console.log("[TrainChat] bootstrap", {
  env: import.meta.env.MODE,
  base: import.meta.env.BASE_URL,
  ua: navigator.userAgent.slice(0, 80),
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  console.error("[TrainChat] #root element not found — cannot mount React");
} else {
  try {
    console.log("[TrainChat] createRoot");
    createRoot(rootEl).render(<App />);
    console.log("[TrainChat] render scheduled");
  } catch (err) {
    console.error("[TrainChat] createRoot/render threw", err);
  }
}
