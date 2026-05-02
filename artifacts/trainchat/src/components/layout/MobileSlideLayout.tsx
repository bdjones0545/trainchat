import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export type SlidePanel = "left" | "right" | "bottom" | null;

interface MobileSlideLayoutProps {
  activePanel: SlidePanel;
  onPanelClose: () => void;
  leftPanel?: React.ReactNode;
  rightPanel?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  bottomPanelHeight?: string;
  children: React.ReactNode;
}

export default function MobileSlideLayout({
  activePanel,
  onPanelClose,
  leftPanel,
  rightPanel,
  bottomPanel,
  bottomPanelHeight = "85vh",
  children,
}: MobileSlideLayoutProps) {
  const isOpen = activePanel !== null;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  return (
    <div className="relative flex flex-col bg-background overflow-hidden" style={{ height: "100dvh", overscrollBehavior: "none" }}>
      {children}

      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px] transition-opacity duration-300 ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onPanelClose}
      />

      {/* Left panel */}
      {leftPanel && (
        <div
          className={`fixed inset-y-0 left-0 z-50 w-[80vw] max-w-xs bg-background border-r border-border flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
            activePanel === "left" ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <span className="text-sm font-bold text-foreground">Menu</span>
            <button
              type="button"
              onClick={onPanelClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* No overflow-y-auto here — chatLeftPanel owns its own scroll container.
              Nesting two overflow-y-auto elements causes iOS to swallow inner taps. */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {leftPanel}
          </div>
        </div>
      )}

      {/* Right panel */}
      {rightPanel && (
        <div
          className={`fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm bg-background border-l border-border flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
            activePanel === "right" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <span className="text-sm font-bold text-foreground">Live Program</span>
            <button
              onClick={onPanelClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div
            className="flex-1 min-h-0 overflow-y-auto"
            style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
          >
            {rightPanel}
          </div>
        </div>
      )}

      {/* Bottom panel */}
      {bottomPanel && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border flex flex-col shadow-2xl transition-transform duration-300 ease-out rounded-t-2xl`}
          style={{
            height: bottomPanelHeight,
            transform: activePanel === "bottom" ? "translateY(0)" : "translateY(100%)",
          }}
        >
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-1 rounded-full bg-muted-foreground/30 mx-auto" />
            </div>
            <span className="text-sm font-bold text-foreground absolute left-1/2 -translate-x-1/2">Agent</span>
            <button
              onClick={onPanelClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {bottomPanel}
          </div>
        </div>
      )}
    </div>
  );
}
