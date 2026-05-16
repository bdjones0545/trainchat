import { useVirtualizer } from "@tanstack/react-virtual";
import type { RefObject } from "react";

// ─── Threshold ────────────────────────────────────────────────────────────────
// Conversations below this count render normally (zero virtualizer overhead).
// At 40+ messages the DOM cost of mounting every bubble becomes measurable on
// mid-range mobile devices.
export const VIRTUALIZE_THRESHOLD = 40;

interface VirtualMessageListProps<T> {
  /** The full message array to virtualize. */
  items: T[];
  /** The scrollable container that wraps the entire chat column. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Extract a stable key for React and the virtualizer item cache. */
  getKey: (item: T, index: number) => string | number;
  /**
   * Height estimate in px per index used for the initial layout pass.
   * `measureElement` corrects the estimate after first paint and caches the
   * result per item key — stable messages are only measured once.
   * A good-faith estimate reduces visible layout shift on first render.
   */
  estimateSize: (index: number) => number;
  /** Renders a single message. Wrapped in an absolutely-positioned row div. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /**
   * Number of off-screen items to keep mounted above and below the viewport.
   * Higher values = smoother fast-fling scroll at the cost of more DOM nodes.
   * 5 is a good default; consider 8 on high-refresh-rate devices.
   */
  overscan?: number;
}

/**
 * VirtualMessageList
 *
 * Drop-in replacement for `messages.map(…)` in long conversations.
 * Activates automatically when message count exceeds `VIRTUALIZE_THRESHOLD`.
 *
 * Uses @tanstack/react-virtual with `measureElement` so variable-height
 * assistant messages (rich cards, program receipts, training blocks) are
 * measured accurately after mount and cached for the lifetime of the session.
 *
 * ── Streaming safety guarantee ─────────────────────────────────────────────
 * Only *completed* messages are virtualised. The in-progress streaming state
 * is rendered by <AgentThinking> outside this component, directly below the
 * virtual list wrapper. The virtualizer therefore never observes a growing
 * item — all items have stable, measurable heights.
 *
 * ── Scroll / anchor compatibility ──────────────────────────────────────────
 * The existing `messagesEndRef.scrollIntoView` auto-scroll and
 * `userScrolledUpRef` scroll detection remain untouched. The sentinel div
 * lives below this component in the DOM, so scrollIntoView always reaches the
 * true bottom of the container regardless of virtual list height.
 */
export function VirtualMessageList<T>({
  items,
  scrollRef,
  getKey,
  estimateSize,
  renderItem,
  overscan = 5,
}: VirtualMessageListProps<T>) {
  const virtualizer = useVirtualizer({
    count: items.length,
    // getScrollElement is called on every scroll event — return the ref's
    // current value rather than capturing it at render time so the virtualizer
    // picks up the element even if the ref resolved after the initial render.
    getScrollElement: () => scrollRef.current,
    estimateSize,
    getItemKey: (index) => getKey(items[index], index),
    overscan,
    // measureElement: invoked after each row mounts. Results are cached by key
    // so stable (completed) messages are only measured once per session.
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    // The outer div establishes a positioned context and reserves the full
    // computed height so the scroll container maintains an accurate scrollHeight.
    // This is what makes the existing scroll detection and messagesEndRef
    // sentinel work correctly — the container's true scroll range is preserved.
    <div
      style={{
        position: "relative",
        height: `${virtualizer.getTotalSize()}px`,
        width: "100%",
      }}
    >
      {virtualItems.map((virtualItem) => (
        <div
          key={virtualItem.key}
          // data-index lets the virtualizer's IntersectionObserver (if enabled)
          // and any external debugging tools identify each row.
          data-index={virtualItem.index}
          // ref callback tells the virtualizer to measure this element after
          // it mounts. The measurement is stored keyed by virtualItem.key so
          // remounted items (after scroll-away/back) reuse the cached size.
          ref={virtualizer.measureElement}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            // translateY is preferred over setting `top` directly: it triggers
            // the compositor instead of the layout engine, keeping scroll
            // smooth on mobile even with many visible items.
            transform: `translateY(${virtualItem.start}px)`,
          }}
        >
          {renderItem(items[virtualItem.index], virtualItem.index)}
        </div>
      ))}
    </div>
  );
}
