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
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const bottomPanelRef = useRef<HTMLDivElement>(null);
  const onPanelCloseRef = useRef(onPanelClose);
  onPanelCloseRef.current = onPanelClose;

  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    } else {
      const top = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      if (top) window.scrollTo(0, parseInt(top, 10) * -1);
    }
    return () => {
      const top = document.body.style.top;
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      if (top) window.scrollTo(0, parseInt(top, 10) * -1);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const activePanelRef =
      activePanel === "left"
        ? leftPanelRef
        : activePanel === "right"
          ? rightPanelRef
          : bottomPanelRef;
    const panel = activePanelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    panel?.querySelector<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onPanelCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [activePanel, isOpen]);

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
          ref={leftPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          aria-hidden={activePanel !== "left"}
          className={`fixed inset-y-0 left-0 z-50 w-[80vw] max-w-xs bg-background border-r border-border flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
            activePanel === "left" ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <span className="text-sm font-bold text-foreground">Menu</span>
            <button
              type="button"
              onClick={onPanelClose}
              aria-label="Close menu"
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
          ref={rightPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Program"
          aria-hidden={activePanel !== "right"}
          className={`fixed inset-y-0 right-0 z-50 w-[85vw] max-w-sm bg-background border-l border-border flex flex-col shadow-2xl transition-transform duration-300 ease-out ${
            activePanel === "right" ? "translate-x-0" : "translate-x-full"
          }`}
          onTouchStart={(e) => {
            touchStartXRef.current = e.touches[0].clientX;
            touchStartYRef.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            if (touchStartXRef.current === null || touchStartYRef.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartXRef.current;
            const dy = Math.abs(e.changedTouches[0].clientY - touchStartYRef.current);
            if (dx > 72 && dy < 50 && activePanel === "right") onPanelClose();
            touchStartXRef.current = null;
            touchStartYRef.current = null;
          }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">Program</span>
              <span className="text-[9px] text-muted-foreground/40 font-medium">swipe → to close</span>
            </div>
            <button
              type="button"
              onClick={onPanelClose}
              aria-label="Close program"
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
          ref={bottomPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Coach panel"
          aria-hidden={activePanel !== "bottom"}
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
              type="button"
              onClick={onPanelClose}
              aria-label="Close coach panel"
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
