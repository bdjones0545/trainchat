import { useRef, useState, useCallback } from "react";
import { X, Download, Copy, Share2, Check } from "lucide-react";
import { toPng } from "html-to-image";
import ShareMomentCard from "./ShareMomentCard";
import type { ShareMoment } from "@/types/share-moments";
import { customFetch } from "@workspace/api-client-react";

interface Props {
  moment: ShareMoment;
  onClose: () => void;
}

async function logShareAudit(moment: ShareMoment, action: string) {
  try {
    await customFetch("/api/share-moments/audit", {
      method: "POST",
      body: JSON.stringify({
        momentType: moment.type,
        triggerSource: moment.triggerSource,
        dataSource: "live_event",
        shareCardGenerated: true,
        shareActionUsed: action,
        captionGenerated: true,
      }),
    });
  } catch {
    // Non-fatal
  }
}

export default function ShareMomentModal({ moment, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await getImageBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trainchat-moment.png";
      a.click();
      URL.revokeObjectURL(url);
      await logShareAudit(moment, "save_image");
    } finally {
      setExporting(false);
    }
  }

  async function handleNativeShare() {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await getImageBlob();
      const file = blob
        ? new File([blob], "trainchat-moment.png", { type: "image/png" })
        : null;

      const shareData: ShareData = {
        text: moment.captionText,
        title: "TrainChat",
      };
      if (file && navigator.canShare?.({ files: [file] })) {
        shareData.files = [file];
      }

      await navigator.share(shareData);
      await logShareAudit(moment, "native_share");
    } catch {
      // User cancelled or share failed — not an error
    } finally {
      setExporting(false);
    }
  }

  async function handleCopyCaption() {
    try {
      await navigator.clipboard.writeText(moment.captionText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      await logShareAudit(moment, "copy_caption");
    } catch {
      // Clipboard access not available
    }
  }

  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Share this moment</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Screenshot-ready coaching card
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Card preview */}
        <div className="flex justify-center px-5 pb-5">
          <div
            style={{
              borderRadius: 20,
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <ShareMomentCard ref={cardRef} moment={moment} />
          </div>
        </div>

        {/* Caption text */}
        <div className="mx-5 mb-4 px-3 py-3 bg-background rounded-xl border border-border">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Caption
          </div>
          <p className="text-[12px] text-foreground leading-relaxed">{moment.captionText}</p>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 grid grid-cols-3 gap-2.5">
          {/* Save image */}
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

          {/* Copy caption */}
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

          {/* Share sheet (mobile) / fallback */}
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
      </div>
    </div>
  );
}
