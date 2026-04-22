import { useRef, useState, useCallback, useEffect } from "react";
import { X, Download, Copy, Share2, Check, Loader2 } from "lucide-react";
import { toPng } from "html-to-image";
import ProgramShareCard, { type ProgramCardData } from "./ProgramShareCard";
import { customFetch } from "@workspace/api-client-react";
import type { FocusMode } from "@/lib/focusMode";

interface Day {
  dayNumber: number;
  name: string;
  exercises: Array<{ name: string; sets?: number | null; reps?: string | null }>;
}

interface ProgramInput {
  programName: string;
  daysPerWeek: number;
  blockLengthWeeks?: number | null;
  blockPhases?: string[] | null;
  day1: Day;
  focusMode?: FocusMode | null;
}

interface Props {
  program: ProgramInput;
  onClose: () => void;
}

async function logShareAudit(action: string) {
  try {
    await customFetch("/api/share-moments/audit", {
      method: "POST",
      body: JSON.stringify({
        momentType: "PROGRAM_GENERATED",
        triggerSource: "program_share_button",
        dataSource: "live_program",
        shareCardGenerated: true,
        shareActionUsed: action,
        captionGenerated: true,
      }),
    });
  } catch {
    // Non-fatal
  }
}

export default function ProgramShareModal({ program, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<ProgramCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      try {
        setLoading(true);
        setError(null);
        const result = await customFetch("/api/share-moments/program-card", {
          method: "POST",
          body: JSON.stringify(program),
        });
        if (!cancelled) {
          setCard(result as ProgramCardData);
        }
      } catch {
        if (!cancelled) {
          setError("Could not generate card. Try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    generate();
    return () => { cancelled = true; };
  }, []);

  const getImageBlob = useCallback(async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 3,
        backgroundColor: "transparent",
      });
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      return null;
    }
  }, []);

  async function handleSaveImage() {
    if (exporting || !card) return;
    setExporting(true);
    try {
      const blob = await getImageBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trainchat-program.png";
      a.click();
      URL.revokeObjectURL(url);
      await logShareAudit("save_image");
    } finally {
      setExporting(false);
    }
  }

  async function handleNativeShare() {
    if (exporting || !card) return;
    setExporting(true);
    try {
      const blob = await getImageBlob();
      const file = blob
        ? new File([blob], "trainchat-program.png", { type: "image/png" })
        : null;

      const shareData: ShareData = {
        text: card.caption,
        title: "TrainChat",
      };
      if (file && navigator.canShare?.({ files: [file] })) {
        shareData.files = [file];
      }

      await navigator.share(shareData);
      await logShareAudit("native_share");
    } catch {
      // User cancelled
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyCaption() {
    if (!card) return;
    try {
      await navigator.clipboard.writeText(card.caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await logShareAudit("copy_caption");
    } catch {
      // Clipboard access not available
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end sm:justify-center">
      {/* Backdrop — always tappable to close */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet — constrained to viewport, scrollable inside */}
      <div
        className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 flex flex-col bg-card border border-border rounded-2xl shadow-2xl"
        style={{ maxHeight: "90dvh", maxHeight: "90vh" } as React.CSSProperties}
      >
        {/* Header — always visible at top, never scrolls away */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
          <div>
            <div className="text-sm font-semibold text-foreground">Share your program</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Screenshot-ready program card
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* Card preview */}
          <div className="flex justify-center px-5 pt-5 pb-5">
            {loading ? (
              <div
                style={{ width: 320, minHeight: 280 }}
                className="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-border bg-muted/30"
              >
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-[11px] text-muted-foreground font-medium">Building your card…</span>
              </div>
            ) : error ? (
              <div
                style={{ width: 320, minHeight: 120 }}
                className="flex flex-col items-center justify-center gap-3 rounded-[20px] border border-red-500/20 bg-red-500/5"
              >
                <span className="text-[11px] text-red-400 font-medium">{error}</span>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                  }}
                  className="text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : card ? (
              <div
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                }}
              >
                <ProgramShareCard
                  ref={cardRef}
                  card={card}
                  focusMode={program.focusMode ?? "strength"}
                />
              </div>
            ) : null}
          </div>

          {/* Caption */}
          {card && !loading && (
            <div className="mx-5 mb-4 px-3 py-3 bg-background rounded-xl border border-border">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Caption
              </div>
              <p className="text-[12px] text-foreground leading-relaxed whitespace-pre-line">{card.caption}</p>
            </div>
          )}
        </div>

        {/* Actions — always visible at bottom, never scrolls away */}
        {card && !loading && (
          <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-border/50 grid grid-cols-3 gap-2.5">
            <button
              onClick={handleSaveImage}
              disabled={exporting}
              className="flex flex-col items-center gap-1.5 py-3 px-2 bg-muted hover:bg-muted/80 rounded-xl transition-colors disabled:opacity-50"
            >
              <Download size={16} className="text-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground text-center">
                {exporting ? "Saving…" : "Save image"}
              </span>
            </button>

            <button
              onClick={handleCopyCaption}
              className="flex flex-col items-center gap-1.5 py-3 px-2 bg-muted hover:bg-muted/80 rounded-xl transition-colors"
            >
              {copied ? (
                <Check size={16} className="text-primary" />
              ) : (
                <Copy size={16} className="text-foreground" />
              )}
              <span className="text-[10px] font-medium text-muted-foreground text-center">
                {copied ? "Copied!" : "Copy text"}
              </span>
            </button>

            {canNativeShare ? (
              <button
                onClick={handleNativeShare}
                disabled={exporting}
                className="flex flex-col items-center gap-1.5 py-3 px-2 bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50"
              >
                <Share2 size={16} className="text-primary-foreground" />
                <span className="text-[10px] font-medium text-primary-foreground text-center">
                  Share
                </span>
              </button>
            ) : (
              <button
                onClick={handleSaveImage}
                disabled={exporting}
                className="flex flex-col items-center gap-1.5 py-3 px-2 bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50"
              >
                <Download size={16} className="text-primary-foreground" />
                <span className="text-[10px] font-medium text-primary-foreground text-center">
                  Download
                </span>
              </button>
            )}
          </div>
        )}

        {/* Loading state — placeholder actions */}
        {loading && (
          <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-border/50 grid grid-cols-3 gap-2.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-14 rounded-xl bg-muted/40 animate-pulse"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
