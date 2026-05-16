import { useEffect } from "react";

/**
 * Injects a `noindex, nofollow` robots directive while the calling component
 * is mounted, then restores the previous directive on unmount.
 *
 * Use on all private / authenticated-only pages:
 *   login, register, forgot-password, reset-password,
 *   chat, settings, billing, system, admin, billing-success, billing-cancelled
 */
export function useNoIndex() {
  useEffect(() => {
    const robotsMeta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const prevContent = robotsMeta?.getAttribute("content") ?? "";
    let added = false;

    if (robotsMeta) {
      robotsMeta.setAttribute("content", "noindex, nofollow");
    } else {
      const meta = document.createElement("meta");
      meta.name = "robots";
      meta.content = "noindex, nofollow";
      meta.setAttribute("data-dynamic", "noindex");
      document.head.appendChild(meta);
      added = true;
    }

    return () => {
      if (added) {
        const injected = document.querySelector('meta[data-dynamic="noindex"]');
        if (injected) document.head.removeChild(injected);
      } else if (robotsMeta) {
        robotsMeta.setAttribute("content", prevContent || "index, follow");
      }
    };
  }, []);
}
