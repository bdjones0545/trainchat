import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGuestSession } from "@/hooks/useGuestSession";
import { GUEST_CONFIG } from "@/lib/guestConfig";
import { STORAGE_KEYS, logRouteDecision, readOnboardingComplete, readDeviceId, type UserMode } from "@/lib/routing";
import { GuestPaywallModal } from "@/components/GuestPaywallModal";
import logoSrc from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";
import { stripProgramJson, extractProgramData, isProgramFragment } from "@/lib/extractProgramArtifact";

// ─── Constants ─────────────────────────────────────────────────────────────────

const FREE_MESSAGE_LIMIT = GUEST_CONFIG.TEASER_TOTAL_LIMIT;
const CHAT_HISTORY_KEY = "trainchat_guest_chat";
const DEVICE_ID_KEY = "trainchat_device_id";
const PROGRAM_JSON_KEY = "trainchat_guest_program";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface GuestChatProgram {
  programName: string;
  description?: string;
  splitType?: string;
  progressionStrategy?: string;
  days: Array<{
    dayNumber: number;
    name: string;
    focus?: string;
    exercises: Array<{
      name: string;
      sets: number;
      reps: string;
      rest: string;
      notes?: string;
    }>;
    notes?: string;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDeviceId(): string | null {
  try { return localStorage.getItem(DEVICE_ID_KEY); } catch { return null; }
}

function loadLocalHistory(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((msg: ChatMessage) => {
      if (msg.role === "assistant") {
        // Strip raw artifact JSON that may have been stored before the
        // suppression contract was in place (old data migration path).
        const needsStrip = !!extractProgramData(null, msg.content) || isProgramFragment(msg.content);
        if (needsStrip) {
          const stripped = stripProgramJson(msg.content);
          // If stripping left nothing (message was only the JSON block), replace
          // with a safe placeholder so the bubble is never blank on reload.
          const safe = stripped.trim() || "Program generated — see your saved program above.";
          return { ...msg, content: safe };
        }
      }
      return msg;
    });
  } catch { return []; }
}

function saveLocalHistory(history: ChatMessage[]) {
  try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history)); } catch {}
}

function loadLocalProgram(): GuestChatProgram | null {
  try {
    const raw = localStorage.getItem(PROGRAM_JSON_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.days && Array.isArray(parsed.days)) return parsed as GuestChatProgram;
    return null;
  } catch { return null; }
}

function saveLocalProgram(program: GuestChatProgram) {
  try { localStorage.setItem(PROGRAM_JSON_KEY, JSON.stringify(program)); } catch {}
}

async function trackFunnelEvent(deviceId: string, event: string, metadata?: Record<string, unknown>) {
  try {
    await fetch("/api/guest/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, event, ...(metadata ? { metadata } : {}) }),
    });
  } catch {}
}

// ─── Quick-start chips ────────────────────────────────────────────────────────
// label   – compact text shown on the chip button
// prompt  – full conversational sentence sent to the AI when tapped

const QUICK_START = [
  { label: "Build me like a strength athlete",          prompt: "Build me like a strength athlete — design a system around getting seriously strong",                        icon: "📅", highlight: true },
  { label: "Train hard without making my injury worse", prompt: "Help me train hard while working around my injury or pain",                                                icon: "🩺", highlight: false },
  { label: "Make me more explosive and athletic",       prompt: "Make me more explosive and athletic — I want to move better and hit harder",                               icon: "⚡", highlight: false },
  { label: "Get me results with what I have at home",  prompt: "Get me results with what I have at home — no gym required",                                                icon: "🏠", highlight: false },
];

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AgentAvatar() {
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ background: "hsl(199 89% 48%)" }}
    >
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    </div>
  );
}

// ─── Rich message renderer ────────────────────────────────────────────────────

function parseInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} style={{ color: "#f4f4f5", fontWeight: 600 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function AssistantMessage({ content }: { content: string }) {
  const isProgram = !!extractProgramData(null, content) || isProgramFragment(content);
  const stripped = isProgram ? stripProgramJson(content) : content;
  // Defensive: if suppression left nothing visible (old data or edge case),
  // never render a blank bubble — show a safe generic placeholder instead.
  const displayContent = (isProgram && !stripped.trim())
    ? "Program generated — see your saved program above."
    : stripped;
  console.log("[GuestChat] AssistantMessage render suppression check:", { isProgram, originalLen: content.length, displayLen: displayContent.length });
  const lines = displayContent.split("\n");

  return (
    <div className="flex items-start gap-3 max-w-[90%]">
      <AgentAvatar />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed"
          style={{
            background: "hsl(222 47% 13%)",
            border: "1px solid hsl(222 47% 20%)",
            color: "#d4d4d8",
          }}
        >
          {lines.map((line, i) => {
            // Bold-only lines (section headers like "**Your 4-Day Upper/Lower**")
            if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
              return (
                <p key={i} style={{ fontWeight: 700, color: "#f4f4f5", marginBottom: "6px", marginTop: i > 0 ? "10px" : 0 }}>
                  {line.slice(2, -2)}
                </p>
              );
            }
            // Day lines (e.g. "Day 1 — Upper Strength: ...")
            if (line.match(/^(Day\s+\d|Upper|Lower|Push|Pull|Legs|Full Body)/)) {
              return (
                <p key={i} style={{ color: "#a1a1aa", fontSize: "12px", marginBottom: "3px", marginTop: i > 0 ? "6px" : 0 }}>
                  {parseInline(line)}
                </p>
              );
            }
            // Bullet
            if (line.startsWith("- ") || line.startsWith("• ")) {
              return (
                <p key={i} style={{ paddingLeft: "12px", color: "#a1a1aa", marginBottom: "2px" }}>
                  · {parseInline(line.slice(2))}
                </p>
              );
            }
            // Empty line
            if (line.trim() === "") {
              return <div key={i} style={{ height: "6px" }} />;
            }
            // Normal text
            return (
              <p key={i} style={{ marginBottom: "4px" }}>
                {parseInline(line)}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed max-w-[82%]"
        style={{ background: "hsl(199 89% 48%)", color: "#fff" }}
      >
        {content}
      </div>
    </div>
  );
}

// ─── Typing indicator — context-aware ────────────────────────────────────────

function TypingIndicator({ turnNumber }: { turnNumber: number }) {
  const label =
    turnNumber <= 1
      ? "Building your system"
      : turnNumber === 2
      ? "Mapping your structure"
      : "Updating";

  return (
    <div className="flex items-start gap-3">
      <AgentAvatar />
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2.5"
        style={{ background: "hsl(222 47% 13%)", border: "1px solid hsl(222 47% 20%)" }}
      >
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: "hsl(199 89% 48%)", animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
        <span className="text-xs text-zinc-500">{label}…</span>
      </div>
    </div>
  );
}

// ─── Locked Screen (return visitor who exhausted messages) ────────────────────

function LockedScreen({ onUnlock, onSignIn }: { onUnlock: () => void; onSignIn: () => void }) {
  return (
    <div className="h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-6">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: "hsl(199 89% 48% / 0.12)", border: "1px solid hsl(199 89% 48% / 0.25)" }}
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="hsl(199 89% 68%)" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{GUEST_CONFIG.LOCKED_HEADLINE}</h2>
          <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{GUEST_CONFIG.LOCKED_BODY}</p>
        </div>
        <div className="space-y-3">
          <button
            onClick={onUnlock}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90"
            style={{ background: "hsl(199 89% 48%)" }}
          >
            {GUEST_CONFIG.LOCKED_CTA}
          </button>
          <button
            onClick={onSignIn}
            className="w-full py-2.5 text-sm font-medium transition-colors"
            style={{ color: "hsl(199 89% 58%)" }}
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Guest Program Panel ─────────────────────────────────────────────────────
// Shows the structured training program alongside chat once it's been generated.
// This makes the program feel real and persistent, not text-buried in chat.

function GuestProgramPanel({ program }: { program: GuestChatProgram }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className="mx-4 mb-4 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-400"
      style={{ border: "1px solid hsl(199 89% 48% / 0.30)", background: "hsl(222 47% 9%)" }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        style={{ borderBottom: expanded ? "1px solid hsl(199 89% 48% / 0.15)" : "none" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "hsl(199 89% 48% / 0.15)" }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="hsl(199 89% 68%)" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="text-[12px] font-semibold" style={{ color: "#f4f4f5" }}>{program.programName}</div>
            {program.splitType && (
              <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.40)" }}>{program.splitType}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ background: "hsl(199 89% 48% / 0.12)", color: "hsl(199 89% 68%)", border: "1px solid hsl(199 89% 48% / 0.2)" }}
          >
            Live
          </span>
          <svg
            className="w-3.5 h-3.5 transition-transform"
            style={{ color: "rgba(255,255,255,0.35)", transform: expanded ? "rotate(180deg)" : "none" }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Body */}
      {expanded && (
        <div className="divide-y divide-[hsl(222_47%_14%)]">
          {program.days.map((day) => (
            <div key={day.dayNumber} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-[11px] font-semibold" style={{ color: "#f4f4f5" }}>
                    Day {day.dayNumber} — {day.name}
                  </span>
                  {day.focus && (
                    <span className="ml-2 text-[10px]" style={{ color: "rgba(255,255,255,0.38)" }}>{day.focus}</span>
                  )}
                </div>
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                  {day.exercises.length} exercises
                </span>
              </div>
              <div className="space-y-1.5">
                {day.exercises.map((ex, j) => (
                  <div key={j} className="flex items-start justify-between gap-2">
                    <span className="text-[11px]" style={{ color: "#d4d4d8" }}>{ex.name}</span>
                    <span
                      className="text-[10px] font-medium flex-shrink-0"
                      style={{ color: "rgba(255,255,255,0.45)" }}
                    >
                      {ex.sets}×{ex.reps}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {program.progressionStrategy && (
            <div className="px-4 py-2.5">
              <p className="text-[10px] leading-relaxed" style={{ color: "rgba(255,255,255,0.35)" }}>
                {program.progressionStrategy}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GuestStart({ userMode }: { userMode: UserMode }) {
  const [, navigate] = useLocation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  /** Phase 3: structured program JSON extracted from AI responses */
  const [currentProgram, setCurrentProgram] = useState<GuestChatProgram | null>(null);
  // Bootstrap gate: prevents main UI from rendering before the initialization
  // useEffect has run. This eliminates the one-frame flash where the empty
  // chat shell appears before we know the session status.
  const [isInitialized, setIsInitialized] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);
  const landingTracked = useRef(false);

  const { deviceId, guestSession, error: guestSessionError } = useGuestSession(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (landingTracked.current || !deviceId) return;
    landingTracked.current = true;
    trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.LANDING_PAGE_VIEWED);
  }, [deviceId]);

  useEffect(() => {
    if (hasInitialized.current || !guestSession) return;
    hasInitialized.current = true;

    // "converted" sessions (previously signed up, now unauthenticated) are
    // treated as valid guest sessions. The backend allows them to chat as
    // long as teaserUsesCount < TEASER_TOTAL_LIMIT. The "Sign in" button in
    // the nav gives them a path back to their account — we never force it.
    logRouteDecision({
      pathname: "/chat",
      authResolved: true,
      hasUser: false,
      authError: false,
      deviceId: readDeviceId(),
      guestSessionStatus: guestSession.status,
      onboardingComplete: readOnboardingComplete(),
      target: "guest_agent",
      reason: `guest session status=${guestSession.status} — allowing guest access`,
    });

    const savedCount = guestSession.teaserUsesCount ?? 0;
    setMessageCount(savedCount);
    setCurrentTurn(savedCount);

    if (savedCount >= FREE_MESSAGE_LIMIT) {
      const localHistory = loadLocalHistory();
      if (localHistory.length > 0) {
        setMessages(localHistory);
        setShowPaywall(true);
      } else {
        setIsLocked(true);
      }
      setIsInitialized(true);
      return;
    }

    const localHistory = loadLocalHistory();
    if (localHistory.length > 0) {
      setMessages(localHistory);
      if (deviceId) {
        trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.GUEST_RETURNED);
      }
    } else {
      setMessages([{
        role: "assistant",
        content: "Tell me what you want to train — I'll build the system around you.",
      }]);
    }

    // Phase 3: Restore structured program panel if available
    const storedProgram = loadLocalProgram();
    if (storedProgram) {
      setCurrentProgram(storedProgram);
    }

    setIsInitialized(true);
  }, [guestSession, deviceId]);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isTyping) return;

    const id = deviceId ?? getDeviceId();
    if (!id) return;

    setInputText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    const userMsg: ChatMessage = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveLocalHistory(newMessages);

    trackFunnelEvent(id, GUEST_CONFIG.EVENTS.GUEST_CHAT_MESSAGE, { messageCount: messageCount + 1 });

    // Advance turn immediately so typing indicator shows the right label
    setCurrentTurn((t) => t + 1);
    setIsTyping(true);

    try {
      const historyForApi = newMessages.slice(-20, -1);

      const res = await fetch("/api/guest/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: id,
          message: content,
          history: historyForApi,
        }),
      });

      setIsTyping(false);

      if (res.status === 402) {
        setShowPaywall(true);
        setMessageCount(FREE_MESSAGE_LIMIT);
        trackFunnelEvent(id, GUEST_CONFIG.EVENTS.PAYWALL_SHOWN, { trigger: "message_limit" });
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Guest chat error:", err);
        const fallback: ChatMessage = { role: "assistant", content: "Something went wrong. Please try again." };
        const updated = [...newMessages, fallback];
        setMessages(updated);
        saveLocalHistory(updated);
        return;
      }

      const data = await res.json();
      const newCount = data.messageCount ?? messageCount + 1;
      setMessageCount(newCount);

      const rawResponse: string = data.response ?? "";

      // ── Artifact state machine — Case A / B / C ───────────────────────────
      // CASE A: backend returned a valid structured program (data.guestProgram set)
      // CASE B: response looks like a truncated/malformed program (fragment heuristic)
      // CASE C: normal conversational response — render as-is
      const isValidCommit = !!(data.guestProgram?.days?.length);
      const isFragment = !isValidCommit && (!!extractProgramData(null, rawResponse) || isProgramFragment(rawResponse));
      const responseHasProgram = isValidCommit || isFragment;
      let cleanedResponse = responseHasProgram ? stripProgramJson(rawResponse) : rawResponse;

      // Never leave a blank bubble — if stripping removed all visible text, insert
      // a context-appropriate fallback so the user always sees something useful.
      if (responseHasProgram && !cleanedResponse.trim()) {
        if (isValidCommit) {
          // CASE A: program committed to panel, no surrounding conversational text
          cleanedResponse = "Your program is ready — see the panel above.";
        } else {
          // CASE B: fragment/truncated — do NOT commit, show retry guidance
          cleanedResponse = "I started building your program, but the response was cut off. Please try again.";
        }
      }

      console.log("[GuestChat] Artifact state machine:", {
        caseLabel: isValidCommit ? "CASE_A_valid_program" : isFragment ? "CASE_B_fragment" : "CASE_C_no_program",
        hadGuestProgram: !!data.guestProgram,
        responseHasProgram,
        rawLen: rawResponse.length,
        cleanLen: cleanedResponse.length,
      });
      const assistantMsg: ChatMessage = { role: "assistant", content: cleanedResponse };
      const updated = [...newMessages, assistantMsg];
      setMessages(updated);
      saveLocalHistory(updated);

      // Phase 3: If the response included a structured program, update the panel
      if (data.guestProgram && data.guestProgram.days && data.guestProgram.days.length > 0) {
        setCurrentProgram(data.guestProgram);
        saveLocalProgram(data.guestProgram);
        if (deviceId) trackFunnelEvent(id, GUEST_CONFIG.EVENTS.PROGRAM_GENERATED, { programName: data.guestProgram.programName });
      }

      if (data.limitReached) {
        setTimeout(() => {
          setShowPaywall(true);
          trackFunnelEvent(id, GUEST_CONFIG.EVENTS.PAYWALL_SHOWN, { trigger: "message_limit" });
        }, 800);
      }
    } catch (err) {
      setIsTyping(false);
      console.error("Guest chat network error:", err);
      const fallback: ChatMessage = { role: "assistant", content: "Connection interrupted. Please try again." };
      const updated = [...newMessages, fallback];
      setMessages(updated);
      saveLocalHistory(updated);
    }
  }, [inputText, messages, isTyping, deviceId, messageCount]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRegister = useCallback(() => {
    const id = deviceId ?? getDeviceId();
    if (id) trackFunnelEvent(id, GUEST_CONFIG.EVENTS.PAYWALL_CTA_CLICKED);
    navigate("/register?from=teaser");
  }, [navigate, deviceId]);

  const handleSignIn = useCallback(() => {
    const id = deviceId ?? getDeviceId();
    if (id) trackFunnelEvent(id, GUEST_CONFIG.EVENTS.PAYWALL_SIGNIN_CLICKED);
    navigate("/login?from=teaser");
  }, [navigate, deviceId]);

  /**
   * BOOTSTRAP GATES — two layers to guarantee zero UI flash at startup.
   *
   * Gate 1: guestSession not yet loaded (null) and no error.
   *   → Show spinner. useGuestSession is still resolving from sessionStorage
   *     or waiting for the API response.
   *
   * Gate 2: guestSession loaded but initialization useEffect has not yet run.
   *   → Show spinner. The useEffect sets messages, counts, locked state, etc.
   *     before setting isInitialized=true. Without this gate the empty chat
   *     shell (no messages, wrong counts) renders for one frame.
   *
   * NOTE: "converted" sessions (previously signed up) are treated as valid
   * guest sessions. The backend does NOT block them from chatting — only the
   * teaserUsesCount limit applies. The "Sign in" button in the nav lets them
   * recover their account voluntarily. We never force them to the login page.
   *
   * If guestSessionError is set we bypass both gates and render normally so
   * the user is never permanently stuck on a loading screen.
   */

  // Gate 1 — waiting for session from sessionStorage/API
  if (!guestSession && !guestSessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(222 47% 7%)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  // Gate 2 — session loaded but initialization useEffect hasn't run yet
  if (!isInitialized && !guestSessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(222 47% 7%)" }}>
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (isLocked) {
    return (
      <div className="min-h-screen" style={{ background: "hsl(222 47% 7%)" }}>
        <LockedScreen onUnlock={handleRegister} onSignIn={handleSignIn} />
      </div>
    );
  }

  const isBeforeFirstInput = messages.length <= 1;
  const canSend = inputText.trim().length > 0 && !isTyping;

  return (
    /* 100dvh instead of 100vh — accounts for Safari's collapsible address bar */
    <div className="flex flex-col" style={{ background: "hsl(222 47% 7%)", height: "100dvh" }}>

      {/* ── Top nav — tight, touch-friendly ────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Left: logo + subtle guest badge */}
        <div className="flex items-center gap-2">
          <img src={logoSrc} alt="TrainChat" className="h-5" />
          <span
            className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-widest"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            Guest
          </span>
        </div>

        {/* Right: message counter (after first message) + auth links */}
        <div className="flex items-center gap-2.5">
          {messageCount > 0 && messageCount < FREE_MESSAGE_LIMIT && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                background: messageCount >= FREE_MESSAGE_LIMIT - 1 ? "hsl(25 95% 53% / 0.12)" : "rgba(255,255,255,0.05)",
                color: messageCount >= FREE_MESSAGE_LIMIT - 1 ? "hsl(25 95% 68%)" : "rgba(255,255,255,0.50)",
                border: messageCount >= FREE_MESSAGE_LIMIT - 1 ? "1px solid hsl(25 95% 53% / 0.25)" : "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <span className="hidden sm:inline">{FREE_MESSAGE_LIMIT - messageCount} {FREE_MESSAGE_LIMIT - messageCount === 1 ? "message" : "messages"} left</span>
              <span className="sm:hidden">{FREE_MESSAGE_LIMIT - messageCount} left</span>
            </span>
          )}
          <button
            onClick={handleSignIn}
            className="text-[11px] font-medium transition-colors min-h-[36px] px-1 flex items-center"
            style={{ color: "rgba(255,255,255,0.42)" }}
            onMouseEnter={(e) => ((e.currentTarget).style.color = "rgba(255,255,255,0.88)")}
            onMouseLeave={(e) => ((e.currentTarget).style.color = "rgba(255,255,255,0.42)")}
          >
            Sign in
          </button>
          <button
            onClick={handleRegister}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all min-h-[32px] flex items-center"
            style={{ background: "hsl(199 89% 48% / 0.16)", border: "1px solid hsl(199 89% 48% / 0.35)", color: "hsl(199 89% 72%)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "hsl(199 89% 48% / 0.24)";
              (e.currentTarget as HTMLButtonElement).style.color = "hsl(199 89% 82%)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "hsl(199 89% 48% / 0.16)";
              (e.currentTarget as HTMLButtonElement).style.color = "hsl(199 89% 72%)";
            }}
          >
            Get started free
          </button>
        </div>
      </div>

      {/* ── Chat area — fills remaining viewport height ─────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-2xl w-full mx-auto">

        {isBeforeFirstInput ? (
          /* ── Welcome / initial state ─────────────────────────────────── */
          /*
           * Layout: hero + chips pushed toward the input at the bottom, with
           * open space above (premium, focused feeling). Same pattern as
           * ChatGPT / Claude empty state. On very small phones the chips stay
           * just above the input without any scrolling.
           */
          <div className="flex-1 flex flex-col justify-end items-center px-5 pb-6 sm:pb-10 gap-4 sm:gap-5">

            {/* Agent hero — compact on phones, slightly larger on sm+ */}
            <div
              className="flex flex-col items-center text-center gap-3 w-full max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-350"
            >
              <div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: "hsl(199 89% 48%)" }}
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                {/* Primary — strongest text on the screen */}
                <p className="text-lg sm:text-xl font-bold leading-snug" style={{ color: "rgba(255,255,255,0.93)" }}>
                  Build your training system
                </p>
                {/* Secondary — readable, clearly supporting the headline */}
                <p className="text-xs sm:text-sm mt-1.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.60)" }}>
                  Describe your goal, constraints, or sport — I'll build it live.
                </p>
              </div>
            </div>

            {/* Quick-start chips — clearly tappable, elevated surface */}
            <div
              className="flex flex-wrap gap-1.5 justify-center w-full max-w-md animate-in fade-in duration-400"
              style={{ animationDelay: "80ms" }}
            >
              {QUICK_START.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => handleSend(opt.prompt)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all duration-150 active:scale-[0.96]"
                  style={opt.highlight ? {
                    background: "hsl(199 89% 48% / 0.18)",
                    border: "1px solid hsl(199 89% 48% / 0.55)",
                    color: "rgba(255,255,255,0.95)",
                    minHeight: "30px",
                  } : {
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.13)",
                    color: "rgba(255,255,255,0.65)",
                    minHeight: "30px",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget).style.borderColor = "hsl(199 89% 48% / 0.55)";
                    (e.currentTarget).style.background = "hsl(199 89% 48% / 0.18)";
                    (e.currentTarget).style.color = "rgba(255,255,255,0.95)";
                  }}
                  onMouseLeave={(e) => {
                    if (opt.highlight) {
                      (e.currentTarget).style.borderColor = "hsl(199 89% 48% / 0.55)";
                      (e.currentTarget).style.background = "hsl(199 89% 48% / 0.18)";
                      (e.currentTarget).style.color = "rgba(255,255,255,0.95)";
                    } else {
                      (e.currentTarget).style.borderColor = "rgba(255,255,255,0.13)";
                      (e.currentTarget).style.background = "rgba(255,255,255,0.06)";
                      (e.currentTarget).style.color = "rgba(255,255,255,0.65)";
                    }
                  }}
                >
                  <span className="text-xs">{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>

            {/* Guest mode note — tertiary, subtle status line */}
            <p
              className="text-[10px] tracking-wide animate-in fade-in duration-600"
              style={{ color: "rgba(255,255,255,0.30)", animationDelay: "200ms" }}
            >
              Guest mode · {FREE_MESSAGE_LIMIT} free messages
            </p>
          </div>
        ) : (
          /* ── Conversation view ───────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto pt-5 pb-4 space-y-4">
            {/* Chat messages */}
            <div className="space-y-4 px-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className="animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  {msg.role === "assistant"
                    ? <AssistantMessage content={msg.content} />
                    : <UserMessage content={msg.content} />
                  }
                </div>
              ))}
              {isTyping && (
                <div className="animate-in fade-in duration-200">
                  <TypingIndicator turnNumber={currentTurn} />
                </div>
              )}
            </div>

            {/* Phase 3: Structured program panel — appears below chat once program is built */}
            {currentProgram && !isTyping && (
              <GuestProgramPanel program={currentProgram} />
            )}

            <div ref={bottomRef} />
          </div>
        )}

        {/* ── Input bar — safe-area aware, always above Safari chrome ────── */}
        <div
          className="flex-shrink-0 px-3 pt-2"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.07)",
            paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          }}
        >
          {/* Input container — visibly elevated above page, clear focus ring */}
          <div
            className="flex items-end gap-2 rounded-2xl transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
            onFocusCapture={(e) => (e.currentTarget.style.borderColor = "hsl(199 89% 48% / 0.55)")}
            onBlurCapture={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)")}
          >
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Try: Build me a 4-day strength program"
              className="flex-1 resize-none bg-transparent px-4 py-3 text-sm focus:outline-none leading-relaxed placeholder:text-zinc-500"
              style={{
                minHeight: "46px",
                maxHeight: "120px",
                color: "rgba(255,255,255,0.92)",
              }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = "auto";
                t.style.height = Math.min(t.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!canSend}
              className="m-2 p-2 rounded-xl text-white transition-all duration-150 active:scale-95 flex-shrink-0"
              style={{
                background: canSend ? "hsl(199 89% 48%)" : "rgba(255,255,255,0.07)",
                opacity: canSend ? 1 : 0.4,
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Paywall modal ────────────────────────────────────────────────── */}
      {showPaywall && (
        <GuestPaywallModal
          deviceId={deviceId}
          onRegister={handleRegister}
          onSignIn={handleSignIn}
        />
      )}
    </div>
  );
}
