import { useLocation } from "wouter";
import { getWhitepaperPdfRoute, getWhitepaperReadRoute } from "@/data/whitepapers";

interface WhitepaperActionsProps {
  slug: string;
  variant: "hub" | "detail";
}

export default function WhitepaperActions({ slug, variant }: WhitepaperActionsProps) {
  const [, navigate] = useLocation();

  if (variant === "hub") {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          navigate(getWhitepaperPdfRoute(slug));
        }}
        className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors flex-shrink-0 border border-border rounded px-2 py-0.5 hover:border-primary"
      >
        Save as PDF
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 py-2 border-y border-border">
      <button
        onClick={() => navigate(getWhitepaperPdfRoute(slug))}
        className="text-xs font-semibold text-primary hover:underline"
      >
        Save as PDF →
      </button>
      <span className="text-muted-foreground/30 text-xs">·</span>
      <span className="text-xs text-muted-foreground">Publication-formatted version for download and sharing</span>
    </div>
  );
}

export function WhitepaperReadLink({ slug, label }: { slug: string; label: string }) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => navigate(getWhitepaperReadRoute(slug))}
      className="block text-sm text-primary hover:underline"
    >
      {label} →
    </button>
  );
}
