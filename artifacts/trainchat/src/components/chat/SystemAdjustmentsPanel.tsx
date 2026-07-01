/**
 * SystemAdjustmentsPanel
 *
 * Displays what TrainChat has adapted — focus-aware, compact, premium.
 *
 * Role in the intelligence stack:
 * - Coach Insight     → why this decision was made right now
 * - What Coach Learned → ongoing user truths
 * - System Adjustments → actual changes the system made (this component)
 */

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  TrendingDown,
  TrendingUp,
  Shuffle,
  Zap,
  Dumbbell,
  Leaf,
  Activity,
  RotateCcw,
  ChevronRight,
  Layers,
} from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { useFocusMode } from "@/hooks/useFocusMode";
import type { FocusMode } from "@/lib/focusMode";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdjustmentEvent {
  id: number;
  focusMode: string;
  eventType: string;
  title: string;
  summary: string;
  scope: string | null;
  source: string | null;
  visiblePriority: string;
  isNew: boolean;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 2) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// ─── Icon mapping per event type ──────────────────────────────────────────────

type IconName =
  | "Shield"
  | "TrendingDown"
  | "TrendingUp"
  | "Shuffle"
  | "Zap"
  | "Dumbbell"
  | "Leaf"
  | "Activity"
  | "RotateCcw"
  | "Layers";

function getEventIcon(eventType: string): IconName {
  switch (eventType) {
    case "joint_protection_applied":   return "Shield";
    case "fatigue_reduction_applied":  return "TrendingDown";
    case "acceleration_bias_added":    return "TrendingUp";
    case "focus_bias_changed":         return "Shuffle";
    case "block_refocused":            return "Layers";
    case "next_session_adjusted":      return "Activity";
    case "week_load_reduced":          return "TrendingDown";
    case "volume_shifted":             return "RotateCcw";
    case "recovery_flow_bias_added":   return "Leaf";
    case "range_control_emphasized":   return "Leaf";
    case "movement_family_protected":  return "Shield";
    default:                           return "Activity";
  }
}

const ICON_MAP: Record<IconName, React.ComponentType<{ className?: string }>> = {
  Shield: Shield,
  TrendingDown: TrendingDown,
  TrendingUp: TrendingUp,
  Shuffle: Shuffle,
  Zap: Zap,
  Dumbbell: Dumbbell,
  Leaf: Leaf,
  Activity: Activity,
  RotateCcw: RotateCcw,
  Layers: Layers,
};

// ─── Focus color helpers ──────────────────────────────────────────────────────

function getFocusColors(focusMode: string): {
  icon: string;
  dot: string;
  new: string;
  high: string;
} {
  switch (focusMode) {
    case "speed":
      return {
        icon: "text-sky-400",
        dot: "bg-sky-400",
        new: "bg-sky-400/15 text-sky-400 border-sky-400/30",
        high: "border-sky-400/30 bg-sky-400/5",
      };
    case "mobility":
      return {
        icon: "text-emerald-400",
        dot: "bg-emerald-400",
        new: "bg-emerald-400/15 text-emerald-400 border-emerald-400/30",
        high: "border-emerald-400/30 bg-emerald-400/5",
      };
    default:
      return {
        icon: "text-primary",
        dot: "bg-primary",
        new: "bg-primary/15 text-primary border-primary/30",
        high: "border-primary/30 bg-primary/5",
      };
  }
}

// ─── Focus mode icon ─────────────────────────────────────────────────────────

function FocusModeIcon({ mode, className }: { mode: string; className?: string }) {
  const cls = className ?? "w-3 h-3";
  if (mode === "speed") return <Zap className={cls} />;
  if (mode === "mobility") return <Leaf className={cls} />;
  return <Dumbbell className={cls} />;
}

// ─── Single adjustment card ───────────────────────────────────────────────────

function AdjustmentCard({
  event,
  activeFocus,
}: {
  event: AdjustmentEvent;
  activeFocus: FocusMode;
}) {
  const colors = getFocusColors(event.focusMode);
  const iconName = getEventIcon(event.eventType);
  const Icon = ICON_MAP[iconName];
  const isHigh = event.visiblePriority === "high";
  const isCurrentFocus = event.focusMode === activeFocus;

  return (
    <div
      className={[
        "relative flex gap-2.5 rounded-lg border px-3 py-2.5 transition-all duration-200",
        isHigh
          ? colors.high
          : "border-border/40 bg-transparent hover:bg-muted/20",
      ].join(" ")}
    >
      {/* Icon */}
      <div className={`flex-shrink-0 mt-0.5 ${isCurrentFocus ? colors.icon : "text-muted-foreground/50"}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1.5 mb-0.5">
          <span className="text-[11px] font-semibold text-foreground leading-tight">
            {event.title}
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            {event.isNew && (
              <span className={`text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${colors.new}`}>
                New
              </span>
            )}
            <span className="text-[9px] text-muted-foreground/50 whitespace-nowrap">
              {formatRelative(event.createdAt)}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {event.summary}
        </p>
        {/* Focus + scope tags */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className={`inline-flex items-center gap-0.5 text-[8.5px] font-semibold uppercase tracking-wide ${isCurrentFocus ? colors.icon : "text-muted-foreground/40"}`}>
            <FocusModeIcon mode={event.focusMode} className="w-2.5 h-2.5" />
            {event.focusMode}
          </span>
          {event.scope && (
            <>
              <span className="text-muted-foreground/30 text-[8px]">·</span>
              <span className="text-[8.5px] text-muted-foreground/40 font-medium capitalize">
                {event.scope}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyAdjustments() {
  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-2">
      <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center mb-1">
        <Activity className="w-4 h-4 text-muted-foreground/30" />
      </div>
      <p className="text-[11px] font-semibold text-foreground/70">No adjustments yet</p>
      <p className="text-[10px] text-muted-foreground/60 max-w-[200px] leading-relaxed">
        As you train and check in, the system will adapt your program. You'll see every meaningful change here.
      </p>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface Props {
  hasActiveSystem?: boolean;
}

export default function SystemAdjustmentsPanel({ hasActiveSystem }: Props) {
  const queryClient = useQueryClient();
  const { focusMode } = useFocusMode();
  const seenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: events = [], isLoading } = useQuery<AdjustmentEvent[]>({
    queryKey: ["system-adjustments", focusMode],
    queryFn: () =>
      customFetch<AdjustmentEvent[]>(
        `/api/system-adjustments?focus=${encodeURIComponent(focusMode)}&limit=20`
      ),
    enabled: !!hasActiveSystem,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const { mutate: markSeen } = useMutation({
    mutationFn: (ids: number[]) =>
      customFetch("/api/system-adjustments/seen", {
        method: "POST",
        body: JSON.stringify({ ids }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-adjustments"] });
    },
  });

  // Auto-mark new events as seen after 4 seconds
  useEffect(() => {
    const newIds = events.filter((e) => e.isNew).map((e) => e.id);
    if (newIds.length === 0) return;
    if (seenTimerRef.current) clearTimeout(seenTimerRef.current);
    seenTimerRef.current = setTimeout(() => {
      markSeen(newIds);
    }, 4000);
    return () => {
      if (seenTimerRef.current) clearTimeout(seenTimerRef.current);
    };
  }, [events, markSeen]);

  const newCount = events.filter((e) => e.isNew).length;

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-bold text-foreground tracking-wide">System Adjustments</p>
            {newCount > 0 && (
              <span className="text-[8px] font-bold uppercase tracking-wide bg-primary/15 text-primary border border-primary/30 px-1.5 py-0.5 rounded-full">
                {newCount} new
              </span>
            )}
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">
            Meaningful changes your system made — what changed and why
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-border/30 mx-3 mb-2" />

      {/* Content */}
      {isLoading ? (
        <div className="px-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/20 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyAdjustments />
      ) : (
        <div className="px-3 pb-4 space-y-2">
          {events.map((event) => (
            <AdjustmentCard
              key={event.id}
              event={event}
              activeFocus={focusMode}
            />
          ))}
        </div>
      )}

      {/* Relationship callout */}
      {events.length > 0 && (
        <div className="mx-3 mb-3 px-3 py-2 rounded-lg bg-muted/15 border border-border/30">
          <p className="text-[9px] text-muted-foreground/50 leading-relaxed">
            <span className="font-semibold text-muted-foreground/70">System Adjustments</span> shows what changed.
            {" "}Check <span className="font-semibold text-muted-foreground/70">Changes</span> for the edit history and <span className="font-semibold text-muted-foreground/70">Forecast</span> for what's coming next.
          </p>
        </div>
      )}
    </div>
  );
}
