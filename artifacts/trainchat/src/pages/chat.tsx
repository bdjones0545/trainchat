import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  SendHorizontal, Zap, PanelLeftClose, PanelLeft, Activity,
  Menu, Target, CreditCard, LogOut, Dumbbell, UserPlus,
  MessageSquare, Plus, RotateCcw, Brain, ChevronDown, ChevronRight,
  CheckCircle2, Library, Trash2, AlertTriangle,
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
import NeuralBadge from "@/components/gamification/NeuralBadge";
import NeuralGrowthOverlay, { type NeuralAwardResult } from "@/components/gamification/NeuralGrowthOverlay";
import SessionLogModal from "@/components/chat/SessionLogModal";
import PaywallModal from "@/components/PaywallModal";
import PricingModal from "@/components/PricingModal";
import AnonymousConversionFloor from "@/components/AnonymousConversionFloor";
import AnonymousUpgradeModal from "@/components/AnonymousUpgradeModal";
import CalibrationModal from "@/components/chat/CalibrationModal";
import CoachMemoryPanel from "@/components/chat/CoachMemoryPanel";
import { useStreamMessage } from "@/hooks/useStreamMessage";
import { clearAuthState, markOnboardingComplete, logRouteDecision, readDeviceId, readOnboardingComplete } from "@/lib/routing";
import { resolveProgramState } from "@/lib/resolveProgramState";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

const SUGGESTION_CHIPS = [
  { label: "Build a 4-day strength system", prompt: "Design a 4-day strength training system for me", highlight: true },
  { label: "Work around pain or injury", prompt: "Help me train around an injury or pain", highlight: false },
  { label: "Add speed & explosiveness", prompt: "I want to add speed, power, and athletic explosiveness to my program", highlight: false },
  { label: "Build for a home gym", prompt: "Build a program using only home gym equipment", highlight: false },
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

async function fetchProgramLibrary() {
  try {
    return await customFetch<any[]>("/api/training-system/library");
  } catch {
    return [];
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
      dayOfWeek: session.dayOfWeek ?? undefined,
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
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showReadiness, setShowReadiness] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showSessionLog, setShowSessionLog] = useState(false);
  const [sessionLogSubmitting, setSessionLogSubmitting] = useState(false);
  const [neuralOverlay, setNeuralOverlay] = useState<NeuralAwardResult | null>(null);
  const [messagesUsed, setMessagesUsed] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<SlidePanel>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showMemoryPanel, setShowMemoryPanel] = useState(false);
  const [calibrationNudgeShown, setCalibrationNudgeShown] = useState(false);
  const [corePulseActive, setCorePulseActive] = useState(false);
  const corePulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoChangeLogId, setUndoChangeLogId] = useState<number | null>(null);
  const [undoVerificationStatus, setUndoVerificationStatus] = useState<"verified" | "partial" | "unclear" | null>(null);
  const [lastChangeSummary, setLastChangeSummary] = useState<string | null>(null);
  const [paywallIsAnon, setPaywallIsAnon] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const operationErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newChangeSignal, setNewChangeSignal] = useState(0);
  const [newProgramSignal, setNewProgramSignal] = useState(0);
  const [changeTargets, setChangeTargets] = useState<Array<{
    type: "exercise_swap" | "exercise_update" | "exercise_added";
    originalExercise?: string;
    newExercise: string;
    exerciseId: number;
  }>>([]);
  const [showProgramLibrary, setShowProgramLibrary] = useState(false);
  const [isSwitchingProgram, setIsSwitchingProgram] = useState(false);
  const [anonymousUpgradePlan, setAnonymousUpgradePlan] = useState<{ planId: string; priceId: string } | null>(null);
  // Delete confirmation state — tracks which item is pending user confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: "program" | "convo";
    id: number;
    name: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  /**
   * True when the user has just clicked "New Build" / "New Builder Session".
   * Keeps the right panel in clean-slate state (no old program shown) and
   * tells the backend to treat this as a fresh build context — not an edit
   * of the previous program. Cleared once the new program is saved.
   */
  const [isNewBuildSession, setIsNewBuildSession] = useState(false);

  // Startup state: fail-safe lets the agent render even if auth hangs
  const [forceReady, setForceReady] = useState(false);
  // Calibration nudge guard: one-shot, never auto-triggers twice
  const hasCheckedCalibrationNudge = useRef(false);
  /**
   * Tracks which assistant message ID was produced by the AI streaming in THIS
   * browser session on the active conversation. Only that specific message is
   * allowed to populate latestProgram. All other program structuredData in
   * conversation history is treated as historical (not a live draft) and is
   * NOT rendered in the sidebar. Cleared on convo switch or DB reset.
   */
  const sessionDraftMsgIdRef = useRef<number | null>(null);
  /**
   * Brief flag set immediately after stream.send() returns. Consumed by the
   * messages effect on its next run to detect "stream just produced a program".
   * Auto-resets after 5s as a safety net.
   */
  const streamJustFinishedRef = useRef(false);
  // Right-panel auto-open guard: opens panel once on load if user already has a program.
  // Prevents the panel from re-opening after conversational (non-mutation) messages.
  const hasAutoOpenedPanelRef = useRef(false);
  const [showCalibrationNudge, setShowCalibrationNudge] = useState(false);

  const logout = useLogout();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const agentSectionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Tracks whether the user has intentionally scrolled up in the messages container.
  // When true, we do not force-scroll to the bottom during streaming or message updates.
  // Resets to false any time the user sends a message.
  const userScrolledUpRef = useRef(false);

  const { data: me, isError: meError, isLoading: meLoading, isFetching: meFetching } = useGetMe();
  const { data: profile } = useGetProfile({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!me } as any,
  });
  const { data: conversations = [], isLoading: convosLoading } = useListConversations({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!me } as any,
  });
  const { data: messages = [], isLoading: messagesLoading } = useListMessages(
    activeConvoId!,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { query: { enabled: !!activeConvoId } as any }
  );
  const { data: memories = [], isLoading: memoriesLoading } = useListMemories({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!me } as any,
  });
  const { data: insights = [], isLoading: insightsLoading } = useListInsights({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!me } as any,
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
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: programLibrary = [] } = useQuery({
    queryKey: ["training-system-library"],
    queryFn: fetchProgramLibrary,
    enabled: !!me,
    staleTime: 30000,
  });

  const { data: weekData } = useQuery({
    // Include activeSystem.id so React Query creates a NEW cache entry whenever
    // the program changes — prevents stale exercises from a previous system
    // leaking into the sidebar after a new program build.
    queryKey: ["training-system-week", activeSystem?.id ?? null],
    queryFn: fetchCurrentWeek,
    enabled: !!me && !!activeSystem?.id,
    staleTime: 0,
    refetchOnMount: "always",
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

  // Single authoritative resolver — the ONLY place display source/program are decided.
  // Never compute source or program inline elsewhere; always call resolveProgramState.
  //
  // activeSystem arg is the already-derived DB program, nulled out during a new build
  // so the panel shows a clean slate while the AI is streaming a replacement.
  const { source: displayProgramSource, program: displayProgram } = resolveProgramState({
    activeSystem: hasActiveSystem && !isNewBuildSession ? dbSystemProgram : null,
    latestProgram,
    sessionDraftMsgId: sessionDraftMsgIdRef.current,
  });

  // The program is "in system" if explicitly saved this session OR if
  // we're showing the DB-backed program (no chat draft, system active, not a new build).
  const isInSystem = isSaved || (!isNewBuildSession && hasActiveSystem && !latestProgram);

  // FIX 8: log auth/user state transitions for debugging
  useEffect(() => {
    console.log("[Chat] auth state:", { hasUser: !!me, meLoading, meError });
  }, [me, meLoading, meError]);

  // ── State integrity assertions + audit log (DEV ONLY) ───────────────────
  // Always calls resolveProgramState — never recomputes source/program inline.
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const { source: programSource, program: resolvedProgram } = resolveProgramState({
      activeSystem: hasActiveSystem && !isNewBuildSession ? dbSystemProgram : null,
      latestProgram,
      sessionDraftMsgId: sessionDraftMsgIdRef.current,
    });

    // ── ASSERTION 1: Ghost draft ───────────────────────────────────────────
    // latestProgram must never coexist with an active DB system —
    // the messages effect clears it when hasActiveSystem = true.
    if (hasActiveSystem && latestProgram) {
      console.error(
        "[STATE VIOLATION] Ghost draft detected — latestProgram is non-null while activeSystem exists. " +
        "The messages effect should have cleared it.",
        { activeSystemId: activeSystem?.id, latestProgramName: latestProgram.programName }
      );
    }

    // ── ASSERTION 2: Unauthorized draft source ─────────────────────────────
    // latestProgram.messageId MUST match sessionDraftMsgIdRef.current.
    // resolveProgramState enforces this, but assert explicitly so violations surface even
    // if latestProgram was set via a path that bypassed the helper.
    if (latestProgram) {
      if (latestProgram.messageId === undefined) {
        console.error(
          "[STATE VIOLATION] Unauthorized draft source — latestProgram has no messageId. " +
          "It was set without going through the session-draft gate.",
          { latestProgramName: latestProgram.programName }
        );
      } else if (latestProgram.messageId !== sessionDraftMsgIdRef.current) {
        console.error(
          "[STATE VIOLATION] Unauthorized draft source — messageId mismatch.",
          {
            latestProgramMessageId: latestProgram.messageId,
            sessionDraftMsgId: sessionDraftMsgIdRef.current,
          }
        );
      }
    }

    // ── ASSERTION 3: Program visible without valid source ──────────────────
    // resolvedProgram should only be non-null when source is "live" or "draft".
    if (resolvedProgram && programSource === "none") {
      console.error(
        "[STATE VIOLATION] resolveProgramState returned a program with source 'none'. " +
        "This is a bug in the resolver itself.",
        { resolvedProgramName: resolvedProgram.programName }
      );
    }

    // ── Canonical audit log ────────────────────────────────────────────────
    console.log("[ProgramStateAudit]", {
      activeSystemId: activeSystem?.id ?? null,
      latestProgramMessageId: latestProgram?.messageId ?? null,
      sessionDraftMsgId: sessionDraftMsgIdRef.current,
      programSource,
      messagesCount: messages.length,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveSystem, activeSystem?.id, dbSystemProgram, latestProgram, isNewBuildSession, messages.length]);

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

  // Auth failure is handled by the ChatPage wrapper in App.tsx which re-renders
  // GuestStart when me is null. No redirect needed here — Chat only renders
  // when the user is confirmed authenticated.

  // Conversation bootstrap: select the first existing convo when the list loads.
  // We no longer auto-create a "New Session" here — deleted sessions must stay
  // deleted across reloads. The user can start a new conversation deliberately
  // via the "New conversation" button or by sending a message.
  useEffect(() => {
    if (!me || convosLoading) return;
    console.log("[SessionHistorySourceAudit]", {
      source: "listConversations query (DB)",
      sessionIds: conversations.map((c: any) => c.id),
      titles: conversations.map((c: any) => c.title),
    });
    if (conversations.length > 0) {
      if (!activeConvoId) setActiveConvoId(conversations[0].id);
      return;
    }
    // conversations is empty — clear active pointer so the empty state shows
    if (activeConvoId) setActiveConvoId(null);
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

  // ── Paywall trigger watcher ─────────────────────────────────────────────────
  // Watches stream.state.paywallTriggered to show the correct conversion modal.
  // This useEffect is required to avoid stale closure issues: handleSend captures
  // stream.state at render time, so reading it inside the async callback after
  // `await stream.send()` returns always sees the pre-send snapshot.
  // A useEffect that reacts to the live state update is the correct pattern.
  useEffect(() => {
    if (stream.state.paywallTriggered) {
      setPaywallIsAnon(stream.state.paywallIsAnonymous);
      setShowPaywall(true);
    }
  }, [stream.state.paywallTriggered, stream.state.paywallIsAnonymous]);

  // ── Scroll handler: detect intentional upward scroll ───────────────────────
  // Attaches to the messages container. If the user scrolls more than 80px above
  // the bottom we mark them as "scrolled up" so we stop fighting their scroll.
  // The flag resets when they send a message (see handleSend).
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    function onScroll() {
      if (!container) return;
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      userScrolledUpRef.current = distanceFromBottom > 80;
    }

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // ── Auto-scroll to bottom on new messages / stream activity ─────────────────
  // Uses the sentinel div at the end of the message list for reliable anchoring.
  // Only scrolls if the user has not intentionally scrolled up.
  useEffect(() => {
    if (!userScrolledUpRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, stream.isActive, stream.state.phase, stream.state.acknowledgment, me]);


  // Panel auto-open rules:
  // 1. On load — opens once when the user's first program is detected (see useEffect below).
  // 2. After a mutation — opens when result.systemSaved or result.systemEdit.applied (see handleSend).
  // 3. NEVER opens for conversational, clarification, or failure outcomes.
  // The right panel is NOT triggered by stream.isActive so chatting never forces it open.

  const buildingState = {
    isBuilding: stream.isActive,
    stage: stream.state.buildStage,
    actionType: stream.state.actionType,
  };

  // ── DB-reset guard: when activeSystem disappears, invalidate any session draft ──
  // Without this, the messages effect would re-read old structuredData from
  // conversation history and ghost the sidebar after a DB wipe or program delete.
  useEffect(() => {
    if (!hasActiveSystem) {
      sessionDraftMsgIdRef.current = null;
    }
  }, [hasActiveSystem]);

  useEffect(() => {
    // When the user has an active DB training system, the database is the
    // source of truth. Clear any stale chat-derived program so the right panel
    // shows the live system via dbSystemProgram instead of old message history.
    if (hasActiveSystem) {
      // Consume the stream flag so it can't ghost on a future state change
      streamJustFinishedRef.current = false;
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

      // If the stream just finished, the newest program message is a fresh
      // draft built in this browser session — register it so the sidebar can show it.
      if (streamJustFinishedRef.current) {
        streamJustFinishedRef.current = false;
        sessionDraftMsgIdRef.current = last.id;
      }

      // ── GHOST PREVENTION ─────────────────────────────────────────────────
      // Only populate latestProgram when the last program message matches the
      // one generated in THIS session. Historical structuredData from previous
      // builds (or the same conversation after a DB reset) must NOT populate
      // the sidebar — that is the "ghost program" bug this block fixes.
      if (sessionDraftMsgIdRef.current !== null && sessionDraftMsgIdRef.current === last.id) {
        if (last.structuredData) {
          try {
            const parsed = JSON.parse(last.structuredData) as ProgramStructure;
            const safe: ProgramStructure = {
              ...parsed,
              // Stamp the source message ID so resolveProgramState and the assertion
              // layer can verify this draft came from the registered session message.
              messageId: last.id,
              days: Array.isArray(parsed.days) ? parsed.days.map((d) => ({
                ...d,
                exercises: Array.isArray(d.exercises) ? d.exercises : [],
              })) : [],
            };
            setLatestProgram(safe);
            setIsSaved(false);
          } catch {
            // ignore malformed JSON
          }
        }
      } else {
        // Historical program from a previous build or a different session —
        // do NOT ghost the sidebar. Clear any stale draft.
        setLatestProgram(null);
      }
    } else {
      // No program messages in this conversation — always clear.
      // (The previous code only cleared when messages.length === 0, which left
      // ghost programs visible when switching between conversations.)
      setLatestProgram(null);
    }
  }, [messages, hasActiveSystem]);

  // Auto-open the right panel exactly ONCE on load when the user already has a
  // program (active DB system or a program in chat history). This ensures returning
  // users see their program immediately without the panel auto-opening for every
  // message they send. Subsequent opens are mutation-gated (systemSaved / systemEdit.applied).
  useEffect(() => {
    if (hasAutoOpenedPanelRef.current) return;
    if (hasActiveSystem || latestProgram) {
      hasAutoOpenedPanelRef.current = true;
      setRightPanelOpen(true);
    }
  }, [hasActiveSystem, latestProgram]);

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

  useEffect(() => {
    if (messages.length === 0 && !messagesLoading) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [messages.length, messagesLoading]);

  function handleNewConversation() {
    createConvo.mutate(
      { data: { title: "New Session" } },
      {
        onSuccess: (convo) => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          setActiveConvoId(convo.id);
          // ── New Build Clean Slate ──────────────────────────────────────────
          // Reset all build-scoped state so the new session starts fresh.
          // isNewBuildSession suppresses the old DB program from the right panel
          // and signals the backend to treat this as a clean-context build.
          setLatestProgram(null);
          setIsSaved(false);
          setIsNewBuildSession(true);
          setChangeTargets([]);
          setLastChangeSummary(null);
          setUndoChangeLogId(null);
          setUndoVerificationStatus(null);
          setOperationError(null);
          // Clear session draft refs so the new convo starts with a blank slate
          sessionDraftMsgIdRef.current = null;
          streamJustFinishedRef.current = false;
          // ─────────────────────────────────────────────────────────────────
        },
      }
    );
  }

  function triggerCorePulse() {
    if (corePulseTimerRef.current) clearTimeout(corePulseTimerRef.current);
    setCorePulseActive(true);
    corePulseTimerRef.current = setTimeout(() => setCorePulseActive(false), 500);
  }

  async function handleSend(text?: string, extraContext?: Record<string, unknown>) {
    const content = (text ?? inputText).trim();
    if (!content || stream.isActive) return;

    // If there is no active conversation (e.g. user deleted all sessions), auto-create
    // one now so the first message lands in a fresh conversation.
    let resolvedConvoId = activeConvoId;
    if (!resolvedConvoId) {
      try {
        const newConvo = await new Promise<{ id: number }>((resolve, reject) => {
          createConvo.mutate(
            { data: { title: "New Session" } },
            {
              onSuccess: (convo) => {
                queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
                setActiveConvoId(convo.id);
                resolve(convo);
              },
              onError: reject,
            }
          );
        });
        resolvedConvoId = newConvo.id;
      } catch {
        setOperationError("Couldn't start a new session. Please try again.");
        return;
      }
    }

    setInputText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Reset intentional-scroll tracking so send always anchors chat to the bottom.
    userScrolledUpRef.current = false;
    // Immediately scroll to the bottom sentinel so the user message is visible.
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }

    // During a new build session: strip old program identity from the UI context
    // so the backend cannot inject the old program name into the AI system prompt.
    const chatUIContext = {
      page: "chat",
      activeProgramId: isNewBuildSession ? null : (activeSystem?.id ?? null),
      activeProgramName: isNewBuildSession ? null : ((activeSystem as any)?.programName ?? null),
      // Signal backend to use only this conversation's history for intent routing
      newBuildSession: isNewBuildSession || undefined,
      // Extra context from panel actions (source, dayIndex, exerciseId, etc.)
      ...(extraContext ?? {}),
    };
    const result = await stream.send(resolvedConvoId, content, chatUIContext);

    if (!result) {
      // Paywall and error display is handled by the useEffect that watches
      // stream.state.paywallTriggered — reading stream.state here would see
      // a stale closure snapshot from before the async send completed.
      return;
    }

    // Stream completed — process result.
    // Signal the messages effect that a new message just arrived via streaming.
    // If that message contains program structuredData it will be registered as
    // the session draft (sessionDraftMsgIdRef) so the sidebar can display it.
    // The flag is consumed on the next messages-effect run (or after 5s).
    if (!result.systemSaved && !result.systemEdit?.applied) {
      // Conversational or draft response — may contain a program preview
      streamJustFinishedRef.current = true;
      setTimeout(() => { streamJustFinishedRef.current = false; }, 5000);
    }

    queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(resolvedConvoId) });
    queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });

    if (result.planInfo?.messagesRemaining !== undefined) {
      setMessagesUsed(messagesUsed + 1);
    }

    // Error toasts fire ONLY for true_failure outcomes where the mutation was NOT applied.
    // clarification_needed and conversation_only are never errors — the agent
    // replied normally and may be asking for more information.
    // no_changes_applied is classified as clarification_needed on the backend,
    // so it does NOT trigger an error toast here.
    // If a non-OpenAI path (deterministic / library_progression / rule_based) was used,
    // treat it as success regardless of OpenAI outcome.
    // If the OpenAI path was used, only show error if mutationApplied is explicitly false.
    if (result.outcomeType === "true_failure") {
      const pathUsed = result.routeDebug?.pathUsed;
      const nonOpenAIPath = pathUsed && pathUsed !== "openai";
      const mutationApplied = nonOpenAIPath || result.mutationApplied === true;
      if (!mutationApplied) {
        if (operationErrorTimeoutRef.current) clearTimeout(operationErrorTimeoutRef.current);
        let msg = "Something went wrong while applying that change. Your program has not been modified.";
        if (result.editFailure?.reason === "verification_failed") {
          msg = "That change was processed but couldn't be confirmed in your program. Try again with more specifics.";
        } else if (result.saveFailure) {
          msg = "Your program couldn't be saved due to a system error. Please try again.";
        }
        setOperationError(msg);
        operationErrorTimeoutRef.current = setTimeout(() => setOperationError(null), 7000);
      }
    }

    if (result.systemEdit?.applied || result.systemSaved) {
      // Force-refetch the active system (not just invalidate) so activeSystem.id
      // updates immediately. This triggers the weekData query key to change
      // (["training-system-week", newId]) which forces a fresh cache entry —
      // eliminating any risk of stale exercises from the old program.
      queryClient.refetchQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-library"] });
      // Partial key match: invalidates all ["training-system-week", *] entries
      // so any observer re-fetches with the current active system.
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });

      if (result.systemSaved) {
        setIsSaved(true);
        // New program was successfully saved — the build session is complete.
        // Clear the new-build flag so subsequent edits work normally against
        // the newly saved program (not treated as another fresh build).
        if (isNewBuildSession) {
          setIsNewBuildSession(false);
        }
      }
      // Vibe edit mutated the DB system — clear the chat draft so the
      // right panel switches to showing the live DB-backed program
      if (result.systemEdit?.applied) {
        setLatestProgram(null);
      }
      // After a new program build: switch to Program tab to show the result.
      // Also open the panel (mutation_applied) so the user sees their new program.
      if (result.systemSaved) {
        setNewProgramSignal((n) => n + 1);
        setRightPanelOpen(true);
        setMobilePanel("right");
      }
      // After a program modification (edit): switch to Program tab, highlight, and open panel
      if (result.systemEdit?.applied) {
        if (result.systemEdit?.changeTargets?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setChangeTargets(result.systemEdit.changeTargets as any);
        }
        setNewChangeSignal((n) => n + 1);
        // Auto-open right panel so the change is immediately visible
        setRightPanelOpen(true);
        setMobilePanel("right");
        // Track last change summary for continuity chip in panel header
        if (result.systemEdit.changeSummary) {
          setLastChangeSummary(result.systemEdit.changeSummary);
        }
      }
      // After any AI rebuild (systemSaved) that produced a change log entry,
      // also animate the Changes tab so the new entry is visible
      if (result.systemSaved && !result.systemEdit?.applied && result.changeLogId) {
        setNewChangeSignal((n) => n + 1);
      }
      // Show undo toast for 8 seconds after any successful program change
      // Gate on verificationStatus — only show for verified/partial/unclear (not failed, which has applied:false anyway)
      const logId = result.changeLogId ?? result.systemEdit?.changeLogId;
      const vs = result.systemEdit?.verificationStatus ?? null;
      if (logId) {
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setUndoChangeLogId(logId);
        setUndoVerificationStatus(vs === "partial" || vs === "unclear" ? vs : "verified");
        undoTimeoutRef.current = setTimeout(() => { setUndoChangeLogId(null); setUndoVerificationStatus(null); }, 8000);
      }
    }
  }

  async function handleUndo() {
    if (!undoChangeLogId || isUndoing) return;
    setIsUndoing(true);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setUndoChangeLogId(null);
    setUndoVerificationStatus(null);
    try {
      await customFetch<any>(`/api/training-system/restore/${undoChangeLogId}`, { method: "POST" });
      queryClient.refetchQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
    } catch {
      if (operationErrorTimeoutRef.current) clearTimeout(operationErrorTimeoutRef.current);
      setOperationError("Undo failed — your program may not have been restored. Please try again.");
      operationErrorTimeoutRef.current = setTimeout(() => setOperationError(null), 7000);
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
            exercises: (day.exercises ?? []).map((ex) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const exAny = ex as any;
              return {
                name: ex.name,
                classification: exAny.classification ?? undefined,
                sets: typeof ex.sets === "number" ? ex.sets : 3,
                reps: ex.reps ?? "10",
                rest: ex.rest ?? "60 sec",
                intent: exAny.intent ?? undefined,
                notes: ex.notes ?? undefined,
              };
            }),
          })),
        }),
      });

      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-week"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-library"] });

      setIsSaving(false);
      setIsSaved(true);
      // Clear the chat draft — panel will now show the live DB system
      setLatestProgram(null);
      // Clear session draft ref so a future unsaved build starts clean
      sessionDraftMsgIdRef.current = null;
      // Manual save also completes the new build session
      setIsNewBuildSession(false);
    } catch (err) {
      console.error("[SaveProgram] Failed:", err);
      setIsSaving(false);
    }
  }

  async function handleSwitchProgram(systemId: number) {
    if (isSwitchingProgram) return;
    setIsSwitchingProgram(true);
    try {
      await customFetch<any>(`/api/training-system/set-active/${systemId}`, { method: "POST" });
      // Clear draft state immediately so the panel falls through to dbSystemProgram
      setLatestProgram(null);
      setIsSaved(false);
      setShowProgramLibrary(false);
      setMobilePanel(null);
      // Refetch the two queries that drive the main panel display, then
      // invalidate the rest so they refresh in the background.
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["training-system-active"] }),
        queryClient.refetchQueries({ queryKey: ["training-system-week"] }),
      ]);
      queryClient.invalidateQueries({ queryKey: ["training-system-library"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
      setLocation("/system");
    } catch (err) {
      console.error("[SwitchProgram] Failed:", err);
    } finally {
      setIsSwitchingProgram(false);
    }
  }

  async function handleSessionLog(data: any) {
    setSessionLogSubmitting(true);
    try {
      await postSessionLog(data);
      queryClient.invalidateQueries({ queryKey: ["streak"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["neural-profile"] });
      setShowSessionLog(false);
      // Award XP and show neural overlay
      customFetch<NeuralAwardResult>("/api/neural-profile/award", {
        method: "POST",
        body: JSON.stringify({
          sessionStatus: data.sessionStatus ?? "completed",
          difficultyScore: data.difficultyScore,
          streakDays: currentStreak,
          isPerfect: false,
        }),
      })
        .then((result) => setNeuralOverlay(result))
        .catch(() => null);
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

    // Anonymous users must create an account before checkout
    if (isAnonymousUser) {
      setAnonymousUpgradePlan({ planId, priceId });
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
    // Switching to an existing conversation is NOT a new build — clear the flag
    // so the right panel shows whatever program that conversation has in context.
    setIsNewBuildSession(false);
    // Clear session draft: historical messages in the new conversation must not
    // auto-populate the sidebar. A new draft only forms if the user builds in this session.
    sessionDraftMsgIdRef.current = null;
    streamJustFinishedRef.current = false;
  }

  async function handleDeleteProgram(id: number) {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await customFetch<{ success: boolean; wasActive: boolean; newActiveSystemId: number | null }>(
        `/api/training-system/${id}`,
        { method: "DELETE" }
      );
      // Invalidate all training system queries so the UI reflects the deletion
      queryClient.invalidateQueries({ queryKey: ["training-system-library"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-active"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-today"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-block"] });
      queryClient.invalidateQueries({ queryKey: ["training-system-history"] });
      queryClient.refetchQueries({ queryKey: ["training-system-week"] });
      // If the deleted system had a live draft in the right panel, clear it
      if (result.wasActive) {
        setLatestProgram(null);
        setIsSaved(false);
      }
    } catch (err) {
      console.error("[DeleteProgram] Failed:", err);
      if (operationErrorTimeoutRef.current) clearTimeout(operationErrorTimeoutRef.current);
      setOperationError("Couldn't delete that program. Please try again.");
      operationErrorTimeoutRef.current = setTimeout(() => setOperationError(null), 5000);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  }

  async function handleDeleteConversation(id: number) {
    if (isDeleting) return;
    const target = conversations.find((c: any) => c.id === id);
    console.log("[SessionDeleteAudit] started", {
      clickedSessionId: id,
      clickedTitle: target?.title ?? "unknown",
      modalOpened: true,
      confirmed: true,
      deleteSource: "db",
    });
    setIsDeleting(true);
    try {
      await customFetch(`/api/conversations/${id}`, { method: "DELETE" });
      // Repair active pointer: if we just deleted the active conversation,
      // switch to the most recent remaining one. If none remain, clear the
      // pointer and show the empty state — do NOT auto-create a ghost session.
      if (id === activeConvoId) {
        const remaining = conversations.filter((c: any) => c.id !== id);
        if (remaining.length > 0) {
          handleSelectConvo(remaining[0].id);
        } else {
          setActiveConvoId(null);
        }
      }
      // Invalidate and refetch so sidebar reflects the persisted DB state
      await queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      const remaining = conversations.filter((c: any) => c.id !== id);
      console.log("[SessionDeleteAudit] success", {
        clickedSessionId: id,
        deleteSucceeded: true,
        invalidatedQueryKeys: [getListConversationsQueryKey()],
        remainingSessionIds: remaining.map((c: any) => c.id),
      });
    } catch (err) {
      console.error("[SessionDeleteAudit] failed", { clickedSessionId: id, deleteSucceeded: false, error: err });
      if (operationErrorTimeoutRef.current) clearTimeout(operationErrorTimeoutRef.current);
      setOperationError("Couldn't delete that session. Please try again.");
      operationErrorTimeoutRef.current = setTimeout(() => setOperationError(null), 5000);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
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
          target: "/chat",
          reason: "explicit logout — guest mode will render",
        });
        setLocation("/chat");
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

  const rawUserName = me?.name ?? "User";
  const isAnonymousUser = !!(me as any)?.isAnonymous || rawUserName === "Anonymous";
  const userName = rawUserName;
  const displayName = isAnonymousUser
    ? (activeSystem?.name ? activeSystem.name.split(" ").slice(0, 4).join(" ") : "Your Workspace")
    : rawUserName;
  const firstName = isAnonymousUser ? "Athlete" : (rawUserName.split(" ")[0] ?? "Athlete");
  const initials = isAnonymousUser ? "TC" : rawUserName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  // ─── Sidebar content ────────────────────────────────────────────────────────

  const chatLeftPanel = (
    <div className="flex flex-col h-full">
      {/* User identity */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0 shadow-[0_0_10px_rgba(var(--primary-rgb,99,102,241),0.25)]">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
            <p className="text-[10px] text-muted-foreground/60">
              AI Coach Active
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
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/35 px-3 mb-2">Training System</p>
          <div className="h-px bg-border/60 mx-3" />
        </div>
        <button
          onClick={() => { setLocation("/system"); setMobilePanel(null); }}
          className="relative w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-foreground bg-primary/8 border border-primary/15 hover:bg-primary/12 active:scale-[0.98] transition-all text-left overflow-hidden"
        >
          <span className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl bg-primary/60" />
          <Dumbbell className="w-4 h-4 text-primary/70 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-foreground">Active Program</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasActiveSystem ? "bg-green-400" : "bg-muted-foreground/30"}`} />
              <span className="text-[10px] text-muted-foreground/60 font-normal">
                {hasActiveSystem ? "Live system" : "Ready"}
              </span>
            </div>
          </div>
        </button>
        <button
          type="button"
          style={{ touchAction: "manipulation" }}
          onClick={() => setShowProgramLibrary((v) => !v)}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 active:scale-[0.98] transition-all text-left"
        >
          <Library className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Saved Programs</span>
          {programLibrary.length > 0 && (
            <span className="ml-auto text-[10px] bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground flex-shrink-0">
              {programLibrary.length}
            </span>
          )}
          {showProgramLibrary ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          )}
        </button>
        {showProgramLibrary && programLibrary.length === 0 && (
          <div className="ml-2 px-3 py-3">
            <p className="text-[11px] text-muted-foreground/60">No saved programs yet</p>
          </div>
        )}
        {showProgramLibrary && programLibrary.length > 0 && (
          <div className="ml-2 space-y-0.5 mb-1">
            {programLibrary.map((prog: any) => (
              <div key={prog.id} className="group relative">
                <button
                  type="button"
                  style={{ touchAction: "manipulation" }}
                  onClick={() => {
                    if (prog.status === "active") {
                      setLocation("/system");
                      setMobilePanel(null);
                    } else if (!isSwitchingProgram) {
                      handleSwitchProgram(prog.id);
                    }
                  }}
                  disabled={isSwitchingProgram && prog.status !== "active"}
                  className={`w-full flex items-start gap-2.5 px-3 py-2.5 pr-8 rounded-lg text-left transition-all ${
                    prog.status === "active"
                      ? "bg-primary/8 border border-primary/20 hover:bg-primary/12 cursor-pointer"
                      : isSwitchingProgram
                      ? "opacity-50 cursor-default"
                      : "hover:bg-muted/60 active:bg-muted/80 cursor-pointer"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[11px] font-semibold text-foreground truncate">{prog.name}</p>
                      {prog.status === "active" && (
                        <CheckCircle2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                      {[prog.weeklyFrequency ? `${prog.weeklyFrequency}x/week` : null, prog.trainingStyle].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {new Date(prog.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  {prog.status === "active" ? (
                    <span className="text-[9px] text-primary/70 flex-shrink-0 mt-0.5">View</span>
                  ) : !isSwitchingProgram ? (
                    <span className="text-[9px] text-primary/70 flex-shrink-0 mt-0.5">Load</span>
                  ) : null}
                </button>
                {/* Delete icon — visible on hover */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm({ type: "program", id: prog.id, name: prog.name });
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground/40 hover:!text-destructive active:!text-destructive hover:bg-destructive/10 active:bg-destructive/10 transition-all"
                  title="Delete program"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => { handleNewConversation(); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 active:scale-[0.98] transition-all text-left"
        >
          <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>New Program</span>
        </button>

        {/* Tools */}
        <div className="my-3 h-px bg-border" />
        <button
          onClick={() => { setShowReadiness(true); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 active:scale-[0.98] transition-all text-left"
        >
          <Activity className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Check-In</span>
        </button>
        {!isAnonymousUser && (
          <button
            onClick={() => { setMobilePanel(null); setLocation("/billing"); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 active:scale-[0.98] transition-all text-left"
          >
            <CreditCard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span>Settings</span>
          </button>
        )}
        {!isPremium && (
          <button
            onClick={() => { setShowPricing(true); setMobilePanel(null); }}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 active:bg-primary/10 active:scale-[0.98] transition-all text-left"
          >
            <Zap className="w-4 h-4 flex-shrink-0" />
            <span>Upgrade to Pro</span>
          </button>
        )}

        {/* Session History — de-emphasized */}
        <div className="mt-3 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/35 px-3 mb-2">Session History</p>
          <div className="h-px bg-border/60 mx-3" />
        </div>
        {conversations.length === 0 ? (
          <div className="px-3 py-2">
            <p className="text-[11px] text-muted-foreground/50">No sessions yet</p>
            <p className="text-[10px] text-muted-foreground/35 mt-0.5">Start a program to begin your history</p>
          </div>
        ) : (
          conversations.slice(0, 12).map((convo: any) => (
            <div key={convo.id} className="group relative">
              <button
                onClick={() => { handleSelectConvo(convo.id); setMobilePanel(null); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 pr-8 rounded-xl text-sm transition-all text-left active:scale-[0.98] ${
                  convo.id === activeConvoId
                    ? "bg-primary/10 text-primary font-semibold"
                    : "font-medium text-foreground hover:bg-muted/60 active:bg-muted/80"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                <span className="truncate">{convo.title ?? "Session"}</span>
              </button>
              {/* Delete icon — visible on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirm({ type: "convo", id: convo.id, name: convo.title ?? "Session" });
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground/40 hover:!text-destructive active:!text-destructive hover:bg-destructive/10 active:bg-destructive/10 transition-all"
                title="Delete session"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Account actions */}
      <div className="border-t border-border px-3 py-3 space-y-1">
        {isAnonymousUser ? (
          <>
            <button
              onClick={() => { setLocation("/register"); setMobilePanel(null); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-primary hover:bg-primary/5 active:bg-primary/10 transition-all text-left"
            >
              <UserPlus className="w-4 h-4 flex-shrink-0" />
              <span>Create Account</span>
            </button>
            <button
              onClick={handleLogout}
              disabled={logout.isPending}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all text-left"
            >
              <RotateCcw className="w-4 h-4 flex-shrink-0" />
              <span>Start Fresh</span>
            </button>
          </>
        ) : (
          <button
            onClick={handleLogout}
            disabled={logout.isPending}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-red-400 hover:bg-red-500/5 transition-all text-left"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Sign Out</span>
          </button>
        )}
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
          programSource={displayProgramSource}
          buildingState={buildingState}
          onSave={latestProgram && !isSaved ? handleSaveProgram : undefined}
          onFeedback={() => { setShowFeedback(true); setMobilePanel(null); }}
          onLogSession={() => { setShowSessionLog(true); setMobilePanel(null); }}
          onUpgrade={() => { setShowPricing(true); setMobilePanel(null); }}
          onSendMessage={(msg, opts) => handleSend(msg, opts)}
          onClose={() => setMobilePanel(null)}
          isSaving={!!latestProgram && isSaving}
          isSaved={isInSystem}
          isPremium={isPremium}
          hasActiveSystem={hasActiveSystem || !!latestProgram}
          trainingGoal={activeSystem?.overarchingGoal ?? undefined}
          newChangeSignal={newChangeSignal}
          newProgramSignal={newProgramSignal}
          changeTargets={changeTargets}
          pendingChangeHint={
            stream.isActive && stream.state.actionType === "DIRECT_MUTATION"
              ? (stream.state.acknowledgment || undefined)
              : undefined
          }
          lastChangeSummary={lastChangeSummary ?? undefined}
        />
      </div>
    </div>
  );

  return (
    <>
    <div ref={agentSectionRef} style={{ overflowAnchor: "none" }}>
    <MobileSlideLayout
      activePanel={mobilePanel}
      onPanelClose={() => setMobilePanel(null)}
      leftPanel={chatLeftPanel}
      rightPanel={liveProgramPanel}
    >
      {/* ─── Delete Confirmation Modal ─── */}
      {/* z-[60] keeps this above the sidebar/panel which sits at z-50 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isDeleting && setDeleteConfirm(null)} />
          <div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-[#0c1220] shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-destructive/40 to-transparent rounded-t-2xl" />
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {deleteConfirm.type === "program" ? "Delete program?" : "Delete session?"}
                </h3>
                <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                  <span className="font-medium text-foreground/80">"{deleteConfirm.name}"</span>
                  {deleteConfirm.type === "program"
                    ? " and all its versions will be permanently removed."
                    : " and all its messages will be permanently removed."}
                  {" "}This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-border text-muted-foreground hover:bg-muted/40 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === "program") handleDeleteProgram(deleteConfirm.id);
                  else handleDeleteConversation(deleteConfirm.id);
                }}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-destructive/90 text-white hover:bg-destructive active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Deleting…
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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
          isAnonymous={paywallIsAnon}
          onUpgrade={() => {
            setShowPaywall(false);
            if (paywallIsAnon) {
              setLocation("/register?from=paywall");
            } else {
              setShowPricing(true);
            }
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
      {anonymousUpgradePlan && (
        <AnonymousUpgradeModal
          planId={anonymousUpgradePlan.planId}
          priceId={anonymousUpgradePlan.priceId}
          onClose={() => setAnonymousUpgradePlan(null)}
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
      {showMemoryPanel && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowMemoryPanel(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
            <CoachMemoryPanel onClose={() => setShowMemoryPanel(false)} />
          </div>
        </div>
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
        <button
          onClick={() => setMobilePanel(null)}
          aria-label="Return to TrainChat agent"
          className="flex items-center justify-center rounded-xl px-2 py-1 transition-all duration-150 active:scale-95 active:opacity-70"
          style={stream.isActive ? { filter: "drop-shadow(0 0 6px hsl(199 89% 48% / 0.55))" } : undefined}
        >
          <img src={trainChatLogo} alt="TrainChat" className="h-6 object-contain" />
        </button>
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
        <TopNav
          userName={displayName}
          isAnonymous={isAnonymousUser}
          extraContent={
            <div className="flex items-center gap-2">
              <StreakBadge streak={currentStreak} />
              {isPremium && (
                <button
                  onClick={() => setShowMemoryPanel(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors border border-transparent hover:border-border/40"
                  title="Coaching Memory — what TrainChat knows about you"
                >
                  <Brain className="w-3 h-3" />
                  <span className="hidden lg:inline">Memory</span>
                </button>
              )}
              <NeuralBadge isPremium={isPremium} />
            </div>
          }
        />
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


          {/* Compact sticky context bar — shows when a program exists */}
          {displayProgram && (
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-background/90 backdrop-blur-sm">
              <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    buildingState.isBuilding ? "bg-primary animate-pulse" : "bg-green-400"
                  }`}
                />
                <span className="text-[11px] font-semibold text-foreground truncate">
                  {displayProgram.programName}
                </span>
                <span className="text-[10px] text-muted-foreground hidden sm:block flex-shrink-0">
                  {[
                    displayProgram.days?.length ? `${displayProgram.days.length} days/wk` : null,
                    displayProgram.blockLabel ?? null,
                    displayProgram.weekNumber ? `Week ${displayProgram.weekNumber}` : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
              <button
                onClick={() => {
                  setMobilePanel("right");
                  setRightPanelOpen(true);
                }}
                className="flex-shrink-0 text-[10px] font-semibold text-primary px-2.5 py-1 rounded-lg hover:bg-primary/10 active:bg-primary/15 transition-all ml-2"
              >
                View →
              </button>
            </div>
          )}

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-4 pt-4 md:pt-12 pb-4"
            style={{ overscrollBehaviorY: "contain", overflowAnchor: "none" }}
          >
            {messagesLoading ? (
              <div className="flex justify-center items-center h-32">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              /* ─── Empty state ─── */
              <div className="flex flex-col items-center justify-center h-full py-8 px-4 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* System core — TrainChat logo with living glow field */}
                <div className="relative mb-5 flex items-center justify-center" style={{ width: 88, height: 88 }}>
                  {/* Outer radial glow halo */}
                  <div
                    className="system-core-halo absolute rounded-full pointer-events-none"
                    style={{
                      inset: -16,
                      background: "radial-gradient(ellipse at center, hsl(var(--primary)/0.35) 0%, transparent 70%)",
                      filter: "blur(18px)",
                    }}
                  />
                  {/* Core shell — pulses + drifts in idle state, reacts on interaction */}
                  <div
                    className={corePulseActive ? "system-core-react" : "system-core-idle"}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {/* Inner container — subtle border glow */}
                    <div
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 22,
                        background: "radial-gradient(ellipse at 40% 35%, hsl(var(--primary)/0.18) 0%, hsl(var(--primary)/0.06) 100%)",
                        border: "1px solid hsl(var(--primary)/0.28)",
                        boxShadow: "0 0 18px hsl(var(--primary)/0.22), inset 0 1px 1px hsl(var(--primary)/0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <img
                        src={trainChatLogo}
                        alt="TrainChat"
                        style={{ width: 46, height: 46, objectFit: "contain" }}
                      />
                    </div>
                  </div>
                </div>

                <h2 className="text-base font-semibold text-foreground mb-1">
                  Build your training system
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-4">
                  Describe your goal, constraints, or sport — I'll build it live.
                </p>

                {/* System status strip */}
                <div className="flex items-center gap-2 mb-6 px-3.5 py-2 rounded-full bg-card border border-border/60">
                  {hasActiveSystem ? (
                    <>
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        <span className="text-foreground font-medium">Active system: {activeSystem?.name ?? "Your Program"}</span>
                        {" · "}Ready to refine or rebuild
                      </span>
                    </>
                  ) : latestProgram ? (
                    <>
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        <span className="text-foreground font-medium">Draft system ready</span>
                        {" · "}Continue building or save it to your system
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        No active system yet · Start building to generate your first program
                      </span>
                    </>
                  )}
                </div>

                {/* Quick action chips */}
                <div className="flex flex-wrap justify-center gap-2 w-full max-w-sm">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => { triggerCorePulse(); handleSend(chip.prompt); }}
                      className={`px-3.5 py-2 text-xs font-medium rounded-full active:scale-95 transition-all duration-150 ${
                        chip.highlight
                          ? "text-primary border border-primary/50 bg-primary/10 hover:bg-primary/20 hover:border-primary/70 hover:shadow-sm"
                          : "text-foreground bg-card border border-border hover:border-primary/40 hover:text-primary hover:bg-primary/5 hover:shadow-sm"
                      }`}
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
                    onShowChange={() => {
                      setRightPanelOpen(true);
                      setMobilePanel("right");
                      if (changeTargets.length > 0) setNewChangeSignal((n) => n + 1);
                    }}
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

                {/* Limit approach nudge — subtle in-chat message when near limit */}
                {!isPremium && subscription?.messagesRemaining !== undefined && subscription?.messagesRemaining !== null && subscription.messagesRemaining <= 2 && subscription.messagesRemaining > 0 && (
                  <div className="flex items-start gap-3 mb-5">
                    <div className="w-7 h-7 rounded-full bg-card border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-2 h-2 rounded-full bg-primary/40" />
                    </div>
                    <div className="max-w-[90%] px-4 py-3 rounded-2xl rounded-tl-sm bg-card border border-primary/15 text-foreground">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        You've built something real here.{" "}
                        <button
                          onClick={() => setShowPricing(true)}
                          className="text-primary font-semibold hover:underline"
                        >
                          Unlock full access
                        </button>{" "}
                        to keep evolving it — your program doesn't stop here.
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
                {undoVerificationStatus === "partial" ? (
                  <span className="text-[11px] text-amber-500">Partially updated — check your program</span>
                ) : undoVerificationStatus === "unclear" ? (
                  <span className="text-[11px] text-muted-foreground">Updated (verify changes)</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Program updated</span>
                )}
                <span className="text-muted-foreground/40 text-[11px]">·</span>
                <button
                  onClick={() => {
                    setRightPanelOpen(true);
                    setMobilePanel("right");
                    if (changeTargets.length > 0) setNewChangeSignal((n) => n + 1);
                  }}
                  className="flex items-center gap-1 text-[11px] font-semibold text-primary/70 hover:text-primary transition-colors"
                >
                  Show →
                </button>
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

          {/* Operation error banner — honest failures for edit/save/undo */}
          {operationError && (
            <div className="flex-shrink-0 px-4 py-2 flex justify-center">
              <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-full shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                <span className="text-[11px] text-destructive font-medium">{operationError}</span>
                <button
                  onClick={() => setOperationError(null)}
                  className="text-[11px] text-destructive/70 hover:text-destructive transition-colors ml-1"
                  aria-label="Dismiss"
                >
                  ✕
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

          {/* Input bar — safe-area aware, always visible above Safari chrome */}
          <div
            className="flex-shrink-0 px-4 pt-3 border-t border-border bg-background/80 backdrop-blur-sm"
            style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
          >
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
              <div className="relative flex items-end gap-2 bg-card border border-border rounded-2xl focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 focus-within:shadow-sm transition-all duration-200">
                <textarea
                  ref={inputRef}
                  data-testid="input-message"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Describe your goal, sport, or constraints…"
                  disabled={stream.isActive}
                  onFocus={() => { if (messages.length === 0) triggerCorePulse(); }}
                  className="flex-1 resize-none bg-transparent px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none leading-relaxed max-h-40 overflow-y-auto disabled:opacity-60"
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
                  disabled={!inputText.trim() || stream.isActive}
                  className="m-2 p-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-150 active:scale-95 flex-shrink-0 shadow-sm"
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
                  programSource={displayProgramSource}
                  buildingState={buildingState}
                  onSave={latestProgram && !isSaved ? handleSaveProgram : undefined}
                  onFeedback={() => setShowFeedback(true)}
                  onLogSession={() => setShowSessionLog(true)}
                  onUpgrade={() => setShowPricing(true)}
                  onSendMessage={(msg, opts) => handleSend(msg, opts)}
                  onClose={() => setRightPanelOpen(false)}
                  isSaving={!!latestProgram && isSaving}
                  isSaved={isInSystem}
                  isPremium={isPremium}
                  hasActiveSystem={hasActiveSystem || !!latestProgram}
                  trainingGoal={activeSystem?.overarchingGoal ?? undefined}
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

      {/* ─── Neural growth overlay ─── */}
      {neuralOverlay && (
        <NeuralGrowthOverlay
          result={neuralOverlay}
          streakDays={currentStreak}
          onDismiss={() => {
            setNeuralOverlay(null);
            queryClient.invalidateQueries({ queryKey: ["neural-profile"] });
          }}
        />
      )}
    </MobileSlideLayout>
    </div>

    {/* ─── Anonymous conversion floor ─────────────────────────────────────
        Rendered below the 100dvh workspace for anonymous deviceId users only.
        Signed-in users never see this. The page becomes naturally scrollable
        to reveal this content while the agent stays anchored at the top.
    ──────────────────────────────────────────────────────────────────────── */}
    {isAnonymousUser && (
      <AnonymousConversionFloor
        onCreateAccount={() => setLocation("/register?from=conversion-floor")}
      />
    )}
    </>
  );
}
