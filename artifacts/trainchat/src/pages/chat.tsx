import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  SendHorizontal, Zap, PanelLeftClose, PanelLeft, Activity,
  Menu, Target, CreditCard, LogOut, Dumbbell,
  MessageSquare, Plus, RotateCcw,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useGetProfile,
  useListConversations,
  useCreateConversation,
  useListMessages,
  useListMemories,
  useListInsights,
  useLogout,
  getListConversationsQueryKey,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import TopNav from "@/components/layout/TopNav";
import MobileSlideLayout, { type SlidePanel } from "@/components/layout/MobileSlideLayout";
import MessageBubble from "@/components/chat/MessageBubble";
import AgentThinking from "@/components/chat/AgentThinking";
import AgentStatusBar from "@/components/chat/AgentStatusBar";
import LiveProgramPanel from "@/components/chat/LiveProgramPanel";
import { type ProgramStructure } from "@/components/chat/ChatOutput";
import ReadinessModal from "@/components/chat/ReadinessModal";
import FeedbackModal from "@/components/chat/FeedbackModal";
import ReadinessSummary from "@/components/chat/ReadinessSummary";
import StreakBadge from "@/components/chat/StreakBadge";
import SessionLogModal from "@/components/chat/SessionLogModal";
import PaywallModal from "@/components/PaywallModal";
import PricingModal from "@/components/PricingModal";
import CalibrationModal from "@/components/chat/CalibrationModal";
import { useStreamMessage } from "@/hooks/useStreamMessage";
import { clearAuthState, clearGuestSessionCache, markOnboardingComplete, logRouteDecision, readDeviceId, readOnboardingComplete } from "@/lib/routing";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

const SUGGESTION_CHIPS = [
  { label: "Build a hypertrophy plan", prompt: "Build me a hypertrophy-focused training program based on my goals and schedule" },
  { label: "Make me a 4-day split", prompt: "Design a 4-day training split for me" },
  { label: "Add speed and power work", prompt: "I want to add speed, power, and athletic development to my program" },
  { label: "Adjust around knee pain", prompt: "I have knee pain and need to modify my program to work around it" },
  { label: "Cut this to 45 minutes", prompt: "My sessions are too long — help me cut them down to 45 minutes" },
  { label: "Swap for home equipment", prompt: "Help me swap exercises to fit a home gym setup" },
  { label: "Build around basketball", prompt: "Build a program designed around basketball performance and athleticism" },
  { label: "Strength without bulk", prompt: "Help me build strength without adding too much size or bulk" },
];

async function fetchSubscription() {
  try {
    return await customFetch<any>("/api/subscription");
  } catch {
    return null;
  }
}

async function fetchStreak() {
  try {
    return await customFetch<any>("/api/streak");
  } catch {
    return null;
  }
}

async function fetchActiveSystem() {
  try {
    return await customFetch<any>("/api/training-system/active");
  } catch {
    return null;
  }
}

async function fetchCurrentWeek() {
  try {
    return await customFetch<any>("/api/training-system/week");
  } catch {
    return null;
  }
}

function transformSystemToProgram(
  systemName: string,
  overarchingGoal: string,
  weekData: any
): ProgramStructure | null {
  if (!weekData) return null;
  const allSessions = weekData.sessions ?? [];
  const sessions = allSessions.filter((s: any) => !s.isRestDay);
  if (sessions.length === 0) return null;

  return {
    programName: systemName,
    description: overarchingGoal ?? "",
    weekNumber: weekData.weekNumber,
    blockLabel: weekData.label ?? weekData.focus ?? undefined,
    days: sessions.map((session: any, idx: number) => ({
      dayNumber: idx + 1,
      name: session.label,
      focus: session.emphasis ?? undefined,
      exercises: (session.exercises ?? []).map((ex: any) => ({
        name: ex.name,
        sets: typeof ex.sets === "number" ? ex.sets : 3,
        reps: ex.reps ?? "10",
        rest: ex.rest ?? "60s",
        notes: ex.notes ?? undefined,
      })),
      notes: session.coachingNotes ?? undefined,
    })),
  };
}

async function postSessionLog(data: any) {
  return await customFetch<any>("/api/session-logs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function postCheckout(priceId: string) {
  return await customFetch<any>("/api/subscription/checkout", {
    method: "POST",
    body: JSON.stringify({ priceId }),
  });
}

export default function Chat() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [activeConvoId, setActiveConvoId] = useState<number | null>(null);
  const [inputText, setInputText] = useState("");
  const [latestProgram, setLatestProgram] = useState<ProgramStructure | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showReadiness, setShowReadiness] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showSessionLog, setShowSessionLog] = useState(false);
  const [sessionLogSubmitting, setSessionLogSubmitting] = useState(false);
  const [messagesUsed, setMessagesUsed] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<SlidePanel>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [calibrationNudgeShown, setCalibrationNudgeShown] = useState(false);
  const [undoChangeLogId, setUndoChangeLogId] = useState<number | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newChangeSignal, setNewChangeSignal] = useState(0);
  const [newProgramSignal, setNewProgramSignal] = useState(0);
  const [changeTargets, setChangeTargets] = useState<Array<{
    type: "exercise_swap" | "exercise_update" | "exercise_added";
    originalExercise?: string;
    newExercise: string;
    exerciseId: number;
  }>>([]);

  // Startup state: fail-safe lets the agent render even if auth hangs
  const [forceReady, setForceReady] = useState(false);
  // Conversation creation guard: prevents duplicate conversations on fast re-renders
  const hasAttemptedConvoCreate = useRef(false);
  // Calibration nudge guard: one-shot, never auto-triggers twice
  const hasCheckedCalibrationNudge = useRef(false);
  const [showCalibrationNudge, setShowCalibrationNudge] = useState(false);

  const logout = useLogout();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: me, isError: meError, isLoading: meLoading, isFetching: meFetching } = useGetMe();
  const { data: profile } = useGetProfile({
    query: { enabled: !!me },
  });
  const { data: conversations = [], isLoading: convosLoading } = useListConversations({
    query: { enabled: !!me },
  });
  const { data: messages = [], isLoading: messagesLoading } = useListMessages(
    activeConvoId!,
    { query: { enabled: !!activeConvoId } }
  );
  const { data: memories = [], isLoading: memoriesLoading } = useListMemories({
    query: { enabled: !!me },
  });
  const { data: insights = [], isLoading: insightsLoading } = useListInsights({
    query: { enabled: !!me },
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
    enabled: !!me,
    staleTime: 60000,
  });

  const { data: streakData } = useQuery({
    queryKey: ["streak"],
    queryFn: fetchStreak,
    enabled: !!me,
    staleTime: 300000,
  });

  const { data: activeSystem } = useQuery({
    queryKey: ["training-system-active"],
    queryFn: fetchActiveSystem,
    enabled: !!me,
    staleTime: 60000,
  });

  const { data: weekData } = useQuery({
    queryKey: ["training-system-week"],
    queryFn: fetchCurrentWeek,
    enabled: !!me && !!activeSystem?.id,
    staleTime: 30000,
  });

  const { data: profileRaw } = useQuery({
    queryKey: ["profile"],
    queryFn: () => customFetch<any>("/api/profile").catch(() => null),
    enabled: !!me,
    staleTime: 60000,
  });

  const calibrationScore: number = profileRaw?.calibrationScore ?? 0;

  const createConvo = useCreateConversation();
  const stream = useStreamMessage();

  const isPremium = subscription?.plan === "pro" || subscription?.plan === "elite";
  const currentPlan = subscription?.plan ?? "free";
  const currentStreak = streakData?.currentStreak ?? 0;
  const hasActiveSystem = !!activeSystem?.id;

  // ── Live Program Engine ───────────────────────────────────────────────────
  // When the user has a real DB training system, derive a displayable ProgramStructure
  // from the live week data so the right panel reflects the actual DB state.
  const dbSystemProgram: ProgramStructure | null =
    hasActiveSystem && activeSystem && weekData
      ? transformSystemToProgram(activeSystem.name, activeSystem.overarchingGoal, weekData)
      : null;

  // Priority: chat-derived draft > DB system > null (empty state)
  const displayProgram = latestProgram ?? dbSystemProgram;

  // The program is "in system" if explicitly saved this session OR if
  // we're showing the DB-backed program (no chat draft, system active)
  const isInSystem = isSaved || (hasActiveSystem && !latestProgram);

  // FIX 8: log auth/user state transitions for debugging
  useEffect(() => {
    console.log("[Chat] auth state:", { hasUser: !!me, meLoading, meError });
  }, [me, meLoading, meError]);

  // FIX 7: fail-safe — fires ONCE on mount; if auth is still unresolved after 4s,
  // force the agent shell to render so the user is never stuck on a spinner.
  useEffect(() => {
    const id = setTimeout(() => {
      setForceReady((prev) => {
        if (prev) return prev;
        console.warn("[Chat] startup timeout — forcing agent render");
        return true;
      });
    }, 4000);
    return () => clearTimeout(id);
  }, []); // intentionally empty — runs once on mount only

  // Only redirect on CONFIRMED auth failure (not during loading, fetching, or transient errors).
  // The `!meFetching` guard prevents acting on a stale error cache entry while a
  // background refetch (triggered by login) is still in flight.
  useEffect(() => {
    if (!meLoading && !meFetching && meError && !me) {
      /**
       * Clear the sessionStorage guest session cache before redirecting to /start.
       * This ensures GuestStart always fetches the authoritative status from the
       * API rather than replaying a potentially stale sessionStorage cache.
       *
       * We clear the guest session cache (not the full auth state) because:
       *   - We keep localStorage.onboardingComplete so GuestStart has a hint
       *     that this device has been used by a registered user before.
       *   - The guest session API will return the true "converted" status which
       *     GuestStart uses to redirect to /login rather than showing the
       *     guest onboarding experience.
       *
       * We do NOT clear localStorage.onboardingComplete here because that is
       * only cleared on explicit logout.
       */
      clearGuestSessionCache();
      logRouteDecision({
        pathname: "/chat",
        authResolved: true,
        hasUser: false,
        authError: true,
        deviceId: readDeviceId(),
        guestSessionStatus: null,
        onboardingComplete: readOnboardingComplete(),
        target: "/start",
        reason: "auth failure confirmed — session expired or invalid",
      });
      setLocation("/start");
    }
  }, [meLoading, meFetching, meError, me, setLocation]);

  // Conversation bootstrap: select the first existing convo, or create one.
  // FIX: hasAttemptedConvoCreate ref prevents creating duplicate conversations on
  // fast re-renders while the invalidation refetch is in flight.
  useEffect(() => {
    if (!me || convosLoading) return;
    if (conversations.length > 0) {
      if (!activeConvoId) setActiveConvoId(conversations[0].id);
      return;
    }
    // conversations is empty — create one, but only once
    if (!hasAttemptedConvoCreate.current && !createConvo.isPending) {
      hasAttemptedConvoCreate.current = true;
      console.log("[Chat] creating starter conversation");
      createConvo.mutate(
        { data: { title: "New Session" } },
        {
          onSuccess: (convo) => {
            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
            setActiveConvoId(convo.id);
          },
          onError: () => {
            // Reset guard on failure so a manual retry can succeed
            hasAttemptedConvoCreate.current = false;
          },
        }
      );
    }
  }, [me, conversations, convosLoading, activeConvoId]);

  // FIX 5: calibration nudge — evaluated ONCE after a program is generated.
  // Uses state, not an IIFE in render, to avoid modifying refs during render phase.
  useEffect(() => {
    if (hasCheckedCalibrationNudge.current) return;
    if (!latestProgram) return;

    hasCheckedCalibrationNudge.current = true;

    const onboardingComplete = readOnboardingComplete();
    console.log("[Chat] calibration nudge check:", { calibrationScore, onboardingComplete });

    // Only show the nudge if calibration is low AND the user is not already
    // flagged as complete in localStorage (undefined config ≠ force modal)
    if (calibrationScore < 40 && !onboardingComplete) {
      setShowCalibrationNudge(true);
    }
  }, [latestProgram, calibrationScore]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, stream.isActive, stream.state.phase]);

  // Auto-open the program panel when a build starts so users see it animate live
  useEffect(() => {
    if (stream.isActive) {
      setRightPanelOpen(true);
      if (!latestProgram) {
        setMobilePanel("right");
      }
    }
  }, [stream.isActive]);

  const buildingState = {
    isBuilding: stream.isActive,
    stage: stream.state.buildStage,
    actionType: stream.state.actionType,
  };

  useEffect(() => {
    // When the user has an active DB training system, the database is the
    // source of truth. Clear any stale chat-derived program so the right panel
    // shows the live system via dbSystemProgram instead of old message history.
    if (hasActiveSystem) {
      setLatestProgram(null);
      return;
    }

    const programMessages = messages.filter((m) => {
      if (m.role !== "assistant" || !m.structuredData) return false;
      try {
        const data = JSON.parse(m.structuredData);
        if (data?._type === "system_edit") return false;
        return data?.days && Array.isArray(data.days);
      } catch {
        return false;
      }
    });

    if (programMessages.length > 0) {
      const last = programMessages[programMessages.length - 1];
      if (last.structuredData) {
        try {
          const parsed = JSON.parse(last.structuredData) as ProgramStructure;
          const safe: ProgramStructure = {
            ...parsed,
            days: Array.isArray(parsed.days) ? parsed.days.map((d) => ({
              ...d,
              exercises: Array.isArray(d.exercises) ? d.exercises : [],
            })) : [],
          };
          setLatestProgram(safe);
          setIsSaved(false);
        } catch {
          // ignore
        }
      }
    } else {
      if (messages.length === 0) setLatestProgram(null);
    }
  }, [messages, hasActiveSystem]);

  // Check for checkout success in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");
    if (checkout === "success" && sessionId) {
      customFetch("/api/subscription/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
        window.history.replaceState({}, "", "/");
      }).catch(() => {});
    }
  }, []);

  function handleNewConversation() {
    createConvo.mutate(
      { data: { title: "New Session" } },
      {
        onSuccess: (convo) => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          setActiveConvoId(convo.id);
          setLatestProgram(null);
          setIsSaved(false);
        },
      }
    );
  }

  async function handleSend(text?: string) {
    const content = (text ?? inputText).trim();
    if (!content || !activeConvoId || stream.isActive) return;

    setInputText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    const result = await stream.send(activeConvoId, content);

    if (!result) {
      // Check if it was a paywall error (phase = error means stream errored)
      if (stream.state.error?.includes("402") || stream.state.error?.toLowerCase().includes("limit")) {
        setShowPaywall(true);
      }
      return;
    }

    // Stream completed — process result
    queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(activeConvoId!) });
    queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });

    if (result.planInfo?.messagesRemaining !== undefined) {
      setMessagesUsed(messagesUsed + 1);
    }

    if (result.systemEdit?.applied || result.systemSaved) {
      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
      if (result.systemSaved) {
        setIsSaved(true);
      }
      // Vibe edit mutated the DB system — clear the chat draft so the
      // right panel switches to showing the live DB-backed program
      if (result.systemEdit?.applied) {
        setLatestProgram(null);
      }
      // After a new program build: switch to Program tab to show the result
      if (result.systemSaved) {
        setNewProgramSignal((n) => n + 1);
      }
      // After a program modification (edit): switch to Program tab and highlight what changed
      if (result.systemEdit?.applied) {
        if (result.systemEdit?.changeTargets?.length) {
          setChangeTargets(result.systemEdit.changeTargets);
        }
        setNewChangeSignal((n) => n + 1);
      }
      // Show undo toast for 8 seconds after any program change
      const logId = result.changeLogId ?? result.systemEdit?.changeLogId;
      if (logId) {
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setUndoChangeLogId(logId);
        undoTimeoutRef.current = setTimeout(() => setUndoChangeLogId(null), 8000);
      }
    }
  }

  async function handleUndo() {
    if (!undoChangeLogId || isUndoing) return;
    setIsUndoing(true);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoChangeLogId(null);
    try {
      await customFetch<any>(`/api/training-system/restore/${undoChangeLogId}`, { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
    } catch {
      // Non-fatal: undo failed silently
    } finally {
      setIsUndoing(false);
    }
  }

  async function handleSaveProgram() {
    if (!latestProgram || !activeConvoId || isSaving || isSaved) return;
    setIsSaving(true);

    try {
      await customFetch<any>("/api/programs", {
        method: "POST",
        body: JSON.stringify({
          name: latestProgram.programName,
          description: latestProgram.description ?? "",
          conversationId: activeConvoId,
          days: (latestProgram.days ?? []).map((day) => ({
            dayNumber: day.dayNumber,
            name: day.name,
            notes: day.notes ?? undefined,
            exercises: (day.exercises ?? []).map((ex, idx) => ({
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rest: ex.rest,
              notes: ex.notes ?? undefined,
              orderIndex: idx,
            })),
          })),
        }),
      }).catch((err) => {
        console.warn("[SaveProgram] saved_programs save failed (non-fatal):", err);
      });

      await customFetch<any>("/api/training-system/from-chat", {
        method: "POST",
        body: JSON.stringify({
          programName: latestProgram.programName,
          description: latestProgram.description ?? "",
          progressionStrategy: latestProgram.progressionStrategy ?? undefined,
          splitType: latestProgram.splitType ?? undefined,
          days: (latestProgram.days ?? []).map((day) => ({
            dayNumber: day.dayNumber,
            name: day.name,
            focus: day.focus ?? undefined,
            notes: day.notes ?? undefined,
            exercises: (day.exercises ?? []).map((ex) => ({
              name: ex.name,
              classification: ex.classification ?? undefined,
              sets: typeof ex.sets === "number" ? ex.sets : 3,
              reps: ex.reps ?? "10",
              rest: ex.rest ?? "60 sec",
              intent: ex.intent ?? undefined,
              notes: ex.notes ?? undefined,
            })),
          })),
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });

      setIsSaving(false);
      setIsSaved(true);
      // Clear the chat draft — panel will now show the live DB system
      setLatestProgram(null);
    } catch (err) {
      console.error("[SaveProgram] Failed:", err);
      setIsSaving(false);
    }
  }

  async function handleSessionLog(data: any) {
    setSessionLogSubmitting(true);
    try {
      await postSessionLog(data);
      queryClient.invalidateQueries({ queryKey: ["streak"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      setShowSessionLog(false);
    } catch {
      // silently fail
    } finally {
      setSessionLogSubmitting(false);
    }
  }

  async function handleSelectPlan(planId: string, priceId?: string) {
    setShowPricing(false);

    if (!priceId) {
      alert("Stripe products are not yet configured. Please connect your Stripe account and create products first.");
      return;
    }

    try {
      const { url } = await postCheckout(priceId);
      if (url) window.location.href = url;
    } catch {
      alert("Failed to start checkout. Please try again.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSelectConvo(id: number) {
    setActiveConvoId(id);
    setLatestProgram(null);
    setIsSaved(false);
  }

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        /**
         * Clear ALL auth-derived routing state so the app cannot end up in a
         * half-guest / half-auth limbo after logout:
         *
         *  - localStorage.onboardingComplete  — prevents GuestStart from routing
         *    a future new user on this device straight to /login
         *  - sessionStorage.trainchat_guest_session — clears the cached guest
         *    session so GuestStart does not immediately replay a stale
         *    "converted" redirect on the very next /start visit
         *
         * We intentionally keep localStorage.trainchat_device_id so that
         * analytics / re-engagement tracking is preserved across sessions.
         */
        clearAuthState();
        logRouteDecision({
          pathname: "/chat",
          authResolved: true,
          hasUser: false,
          authError: false,
          deviceId: readDeviceId(),
          guestSessionStatus: null,
          onboardingComplete: false,
          target: "/start",
          reason: "explicit logout",
        });
        setLocation("/start");
      },
    });
  }

  // FIX 1: loading gate blocks ONLY on meLoading — the auth check.
  // profileLoading is intentionally excluded: it starts loading AFTER me resolves,
  // so including it causes a second flash (gate clears → profileLoading starts → gate flashes again).
  // Profile data (calibrationScore, etc.) hydrates in the background without blocking the agent.
  if (meLoading && !forceReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  // Mark this device as having completed onboarding once the authenticated user
  // reaches the agent screen. Used by GuestStart to distinguish "session expired,
  // please log in again" from a brand-new unregistered device. Cleared on logout.
  if (me) markOnboardingComplete();

  const firstName = me?.name?.split(" ")[0] ?? "Athlete";
  const userName = me?.name ?? "User";
  const initials = userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  // ─── Sidebar content ────────────────────────────────────────────────────────

  const chatLeftPanel = (
    <div className="flex flex-col h-full">
      {/* User identity */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
            <p className="text-[11px] text-muted-foreground">
              {currentStreak > 0 ? `${currentStreak} day streak 🔥` : "Performance Athlete"}
            </p>
          </div>
          {calibrationScore > 0 && (
            <button
              onClick={() => setShowCalibration(true)}
              title="Refine My Plan"
              className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-lg border transition-all ${
                calibrationScore >= 70
                  ? "text-green-400 border-green-400/30 bg-green-400/10"
                  : calibrationScore >= 40
                  ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
                  : "text-muted-foreground border-border bg-muted/20"
              }`}
            >
              {calibrationScore}%
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {/* Training System — primary nav */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Training System</p>
        <button
          onClick={() => { setLocation("/system"); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Dumbbell className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Active Program</span>
          {hasActiveSystem && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
          )}
        </button>
        <button
          onClick={() => { setLocation("/system"); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Saved Programs</span>
        </button>
        <button
          onClick={() => { handleNewConversation(); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>New Builder Session</span>
        </button>

        {/* Tools */}
        <div className="my-3 h-px bg-border" />
        <button
          onClick={() => { setShowReadiness(true); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Activity className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Check-In</span>
        </button>
        <button
          onClick={() => { setMobilePanel(null); setLocation("/billing"); }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <CreditCard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Settings</span>
        </button>
        {!isPremium && (
          <button
            onClick={() => { setShowPricing(true); setMobilePanel(null); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-all text-left"
          >
            <Zap className="w-4 h-4 flex-shrink-0" />
            <span>Upgrade to Pro</span>
          </button>
        )}

        {/* Session History — de-emphasized */}
        <div className="my-3 h-px bg-border" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Session History</p>
        {conversations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50 px-3 py-2">No sessions yet</p>
        ) : (
          conversations.slice(0, 12).map((convo: any) => (
            <button
              key={convo.id}
              onClick={() => { handleSelectConvo(convo.id); setMobilePanel(null); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left ${
                convo.id === activeConvoId
                  ? "bg-primary/10 text-primary font-semibold"
                  : "font-medium text-foreground hover:bg-muted/60 active:bg-muted/80"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
              <span className="truncate">{convo.title ?? "Session"}</span>
            </button>
          ))
        )}
      </div>

      {/* Logout */}
      <div className="border-t border-border px-3 py-3">
        <button
          onClick={handleLogout}
          disabled={logout.isPending}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-all text-left"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  // ─── Right panel content ────────────────────────────────────────────────────

  const liveProgramPanel = (
    <div className="flex flex-col h-full overflow-hidden">
      <ReadinessSummary />
      <div className="flex-1 min-h-0 overflow-hidden">
        <LiveProgramPanel
          program={displayProgram}
          buildingState={buildingState}
          onSave={latestProgram && !isSaved ? handleSaveProgram : undefined}
          onFeedback={() => { setShowFeedback(true); setMobilePanel(null); }}
          onLogSession={() => { setShowSessionLog(true); setMobilePanel(null); }}
          onUpgrade={() => { setShowPricing(true); setMobilePanel(null); }}
          isSaving={!!latestProgram && isSaving}
          isSaved={isInSystem}
          isPremium={isPremium}
          hasActiveSystem={hasActiveSystem || !!latestProgram}
          newChangeSignal={newChangeSignal}
          newProgramSignal={newProgramSignal}
          changeTargets={changeTargets}
        />
      </div>
    </div>
  );

  return (
    <MobileSlideLayout
      activePanel={mobilePanel}
      onPanelClose={() => setMobilePanel(null)}
      leftPanel={chatLeftPanel}
      rightPanel={liveProgramPanel}
    >
      {/* ─── Modals ─── */}
      {showReadiness && (
        <ReadinessModal
          onClose={() => setShowReadiness(false)}
          onSubmit={(adaptation) => {
            setShowReadiness(false);
            if (adaptation && adaptation.changesApplied > 0) {
              queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
              queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
              queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
            }
          }}
        />
      )}
      {showFeedback && (
        <FeedbackModal
          onClose={() => setShowFeedback(false)}
          onSubmit={() => setShowFeedback(false)}
        />
      )}
      {showPaywall && (
        <PaywallModal
          plan={currentPlan}
          messagesUsed={messagesUsed}
          onUpgrade={() => {
            setShowPaywall(false);
            setShowPricing(true);
          }}
          onClose={() => setShowPaywall(false)}
        />
      )}
      {showPricing && (
        <PricingModal
          onClose={() => setShowPricing(false)}
          onSelectPlan={handleSelectPlan}
          currentPlan={currentPlan}
        />
      )}
      {showSessionLog && (
        <SessionLogModal
          programName={displayProgram?.programName}
          dayNumber={undefined}
          onClose={() => setShowSessionLog(false)}
          onSubmit={handleSessionLog}
          isSubmitting={sessionLogSubmitting}
        />
      )}
      {showCalibration && (
        <CalibrationModal
          onClose={() => {
            setShowCalibration(false);
            queryClient.invalidateQueries({ queryKey: ["profile"] });
          }}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ["profile"] });
          }}
        />
      )}

      {/* ─── Mobile header ─── */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm flex-shrink-0 z-10">
        <button
          onClick={() => setMobilePanel("left")}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <img src={trainChatLogo} alt="TrainChat" className="h-6 object-contain" />
        <button
          onClick={() => setMobilePanel("right")}
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all ${
            latestProgram || hasActiveSystem
              ? "text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          } active:bg-muted/80`}
          aria-label="View live program"
        >
          <Dumbbell className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Desktop TopNav ─── */}
      <div className="hidden md:block">
        <TopNav userName={userName} extraContent={<StreakBadge streak={currentStreak} />} />
      </div>

      {/* ─── Main layout ─── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Desktop Sidebar */}
        {sidebarOpen && (
          <div className="hidden md:flex w-60 flex-shrink-0 border-r border-border h-full overflow-hidden flex-col">
            {chatLeftPanel}
          </div>
        )}

        {/* Center chat column */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="hidden md:flex absolute top-3 left-3 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>

          {/* Free tier indicator */}
          {!isPremium && subscription !== null && subscription?.plan === "free" && (
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => setShowPricing(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-primary/70 border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all"
              >
                <Zap className="w-3 h-3" />
                {subscription?.messagesRemaining !== undefined
                  ? `${subscription.messagesRemaining} free left`
                  : "Upgrade"}
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 pt-4 md:pt-12 pb-4">
            {messagesLoading ? (
              <div className="flex justify-center items-center h-32">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              /* ─── Empty state ─── */
              <div className="flex flex-col items-center justify-center h-full py-12 px-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                  <Dumbbell className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-base font-semibold text-foreground mb-1.5">
                  Build your training system
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
                  Tell me your goal, schedule, equipment, and any limitations. I'll structure your program in real time.
                </p>
                <div className="flex flex-wrap justify-center gap-2 w-full max-w-md">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => handleSend(chip.prompt)}
                      className="px-3.5 py-2 text-xs font-medium text-foreground bg-card border border-border rounded-full hover:border-primary/40 hover:text-primary hover:bg-primary/5 active:scale-95 transition-all duration-150"
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto">
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onViewProgram={() => setMobilePanel("right")}
                  />
                ))}
                {stream.isActive && (
                  <AgentThinking
                    acknowledgment={stream.state.acknowledgment || undefined}
                    buildStage={stream.state.buildStage}
                    stageLabel={stream.state.stageLabel}
                    stageHistory={stream.state.stageHistory}
                    actionType={stream.state.actionType}
                  />
                )}

                {/* Calibration nudge — shown at most once per session after a program
                    is generated. State is managed by the useEffect above so this
                    is a pure conditional render with no side effects. */}
                {showCalibrationNudge && !calibrationNudgeShown && (
                  <div className="flex items-start gap-3 mb-5">
                    <div className="w-7 h-7 rounded-full bg-card border border-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    </div>
                    <div className="max-w-[90%] px-4 py-3 rounded-2xl rounded-tl-sm bg-card border border-border text-foreground">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Want me to dial this in more precisely? Tap{" "}
                        <button
                          onClick={() => {
                            setShowCalibration(true);
                            setCalibrationNudgeShown(true);
                            setShowCalibrationNudge(false);
                          }}
                          className="text-primary font-semibold hover:underline"
                        >
                          Refine My Plan
                        </button>{" "}
                        to share your training background — I'll sharpen your program right after.
                      </p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Undo toast — appears briefly after a program change */}
          {undoChangeLogId && (
            <div className="flex-shrink-0 px-4 py-2 flex justify-center">
              <div className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-full shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                <span className="text-[11px] text-muted-foreground">Program updated</span>
                <span className="text-muted-foreground/40 text-[11px]">·</span>
                <button
                  onClick={handleUndo}
                  disabled={isUndoing}
                  className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo
                </button>
              </div>
            </div>
          )}

          {/* Agent status bar — persistent working state */}
          <AgentStatusBar
            phase={stream.state.phase}
            buildStage={stream.state.buildStage}
            actionType={stream.state.actionType}
            error={stream.state.error}
          />

          {/* Input bar */}
          <div className="flex-shrink-0 px-4 pb-5 pt-3 border-t border-border bg-background/80 backdrop-blur-sm">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowReadiness(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-muted-foreground border border-border hover:text-foreground hover:border-primary/30 transition-all duration-150"
                  >
                    <Activity className="w-3 h-3" />
                    Check-In
                  </button>
                  <button
                    onClick={() => setShowCalibration(true)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all duration-150 ${
                      calibrationScore >= 70
                        ? "text-green-400 border-green-400/30 hover:bg-green-400/10"
                        : "text-primary border-primary/30 bg-primary/5 hover:bg-primary/10"
                    }`}
                  >
                    <Zap className="w-3 h-3" />
                    {calibrationScore > 0 ? `${calibrationScore}% Calibrated` : "Refine My Plan"}
                  </button>
                </div>
                {hasActiveSystem && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <span className="text-[10px] text-muted-foreground hidden sm:block">System active — edits go live instantly</span>
                  </div>
                )}
              </div>
              <div className="relative flex items-end gap-2 bg-card border border-border rounded-2xl focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200">
                <textarea
                  ref={inputRef}
                  data-testid="input-message"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Describe the training you want to build or adjust…"
                  disabled={stream.isActive}
                  className="flex-1 resize-none bg-transparent px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none leading-relaxed max-h-40 overflow-y-auto disabled:opacity-60"
                  style={{ minHeight: "52px" }}
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = "auto";
                    t.style.height = Math.min(t.scrollHeight, 160) + "px";
                  }}
                />
                <button
                  data-testid="button-send"
                  onClick={() => handleSend()}
                  disabled={!inputText.trim() || stream.isActive || !activeConvoId}
                  className="m-2 p-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 flex-shrink-0"
                >
                  <SendHorizontal className="w-4 h-4" />
                </button>
              </div>
              <p className="hidden md:block text-[10px] text-muted-foreground/40 text-center mt-2">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>

        {/* Desktop right panel */}
        <div className="hidden md:flex">
          {rightPanelOpen ? (
            <div className="w-80 flex-shrink-0 border-l border-border flex flex-col bg-background overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${hasActiveSystem || latestProgram ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} style={{ animationDuration: "3s" }} />
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    Live Program
                  </span>
                </div>
                <button
                  onClick={() => setRightPanelOpen(false)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Hide
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <LiveProgramPanel
                  program={displayProgram}
                  buildingState={buildingState}
                  onSave={latestProgram && !isSaved ? handleSaveProgram : undefined}
                  onFeedback={() => setShowFeedback(true)}
                  onLogSession={() => setShowSessionLog(true)}
                  onUpgrade={() => setShowPricing(true)}
                  isSaving={!!latestProgram && isSaving}
                  isSaved={isInSystem}
                  isPremium={isPremium}
                  hasActiveSystem={hasActiveSystem || !!latestProgram}
                  newChangeSignal={newChangeSignal}
                  newProgramSignal={newProgramSignal}
                  changeTargets={changeTargets}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRightPanelOpen(true)}
              className="flex-shrink-0 w-8 border-l border-border bg-background flex items-center justify-center hover:bg-accent transition-all duration-150 group"
              title="Show live program"
            >
              <span className="text-[9px] text-muted-foreground group-hover:text-foreground font-semibold uppercase tracking-widest rotate-90 whitespace-nowrap transition-colors">
                Program
              </span>
            </button>
          )}
        </div>
      </div>
    </MobileSlideLayout>
  );
}
