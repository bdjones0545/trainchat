import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation, Redirect } from "wouter";
import { useGuestSession } from "@/hooks/useGuestSession";
import { GUEST_CONFIG } from "@/lib/guestConfig";
import { STORAGE_KEYS, logRouteDecision, readOnboardingComplete, readDeviceId } from "@/lib/routing";
import { GuestPaywallModal } from "@/components/GuestPaywallModal";
import logoSrc from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

// ─── Constants ─────────────────────────────────────────────────────────────────

const FREE_MESSAGE_LIMIT = GUEST_CONFIG.TEASER_TOTAL_LIMIT;
const CHAT_HISTORY_KEY = "trainchat_guest_chat";
const DEVICE_ID_KEY = "trainchat_device_id";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch { return []; }
}

function saveLocalHistory(history: ChatMessage[]) {
  try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history)); } catch {}
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

// Detect whether a message looks like a structured training system preview
function isSystemPreview(content: string): boolean {
  return /Day\s+\d|Upper\s|Lower\s|Push\s|Pull\s|Legs\s|Full Body/.test(content) &&
    /×|\bsets?\b|\breps?\b|4×|3×/.test(content);
}

// ─── Quick-start chips ────────────────────────────────────────────────────────

const QUICK_START = [
  { label: "Build a hypertrophy plan", icon: "💪" },
  { label: "Make me a 4-day split", icon: "📅" },
  { label: "Train for athletic performance", icon: "⚡" },
  { label: "Adjust around an injury", icon: "🩺" },
  { label: "Build around home equipment", icon: "🏠" },
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

function AssistantMessage({ content, isSystemPreviewMsg }: { content: string; isSystemPreviewMsg: boolean }) {
  const lines = content.split("\n");

  return (
    <div className="flex items-start gap-3 max-w-[90%]">
      <AgentAvatar />
      <div style={{ minWidth: 0, flex: 1 }}>
        {isSystemPreviewMsg && (
          <div
            className="inline-flex items-center gap-1.5 mb-2 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest"
            style={{ background: "hsl(199 89% 48% / 0.12)", color: "hsl(199 89% 68%)", border: "1px solid hsl(199 89% 48% / 0.25)" }}
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            System Preview
          </div>
        )}
        <div
          className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed"
          style={{
            background: isSystemPreviewMsg ? "hsl(222 47% 11%)" : "hsl(222 47% 13%)",
            border: isSystemPreviewMsg ? "1px solid hsl(199 89% 48% / 0.25)" : "1px solid hsl(222 47% 20%)",
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GuestStart() {
  const [, navigate] = useLocation();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
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
    if (landingTracked.current || !deviceId) return;
    landingTracked.current = true;
    trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.LANDING_PAGE_VIEWED);
  }, [deviceId]);

  useEffect(() => {
    if (hasInitialized.current || !guestSession) return;
    hasInitialized.current = true;

    if (guestSession.status === "converted") {
      /**
       * A "converted" guest session means this deviceId was linked to an account.
       * The user is NOT authenticated right now (auth already failed).
       * We log the decision here but do NOT navigate — the render path handles
       * the redirect synchronously via <Redirect to="/login" /> so there is
       * zero flash of the guest chat UI before navigation fires.
       */
      logRouteDecision({
        pathname: "/chat",
        authResolved: true,
        hasUser: false,
        authError: false,
        deviceId: readDeviceId(),
        guestSessionStatus: guestSession.status,
        onboardingComplete: readOnboardingComplete(),
        target: "/login",
        reason: "converted guest session — render-path redirect to /login (no flash)",
      });
      // isInitialized intentionally stays false — the render path returns
      // <Redirect to="/login" /> before reaching the main UI gate.
      return;
    }

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
      // Show the paywall/locked UI (isInitialized unlocks the gate)
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
      // Fresh start — the opening line sets the tone for the entire experience
      setMessages([{
        role: "assistant",
        content: "Let's build your training system.",
      }]);
    }

    // Unlock the main UI now that everything is initialized
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

      const assistantMsg: ChatMessage = { role: "assistant", content: data.response };
      const updated = [...newMessages, assistantMsg];
      setMessages(updated);
      saveLocalHistory(updated);

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
   * BOOTSTRAP GATES — three layers to guarantee zero UI flash at startup.
   *
   * Gate 1: guestSession not yet loaded (null) and no error.
   *   → Show spinner. useGuestSession is still resolving from sessionStorage
   *     or waiting for the API response.
   *
   * Gate 2: guestSession loaded with status === "converted".
   *   → Return <Redirect to="/login" /> synchronously IN the render path.
   *     This is critical: returning a Redirect here means the main chat UI
   *     is NEVER included in the render output, so there is zero one-frame
   *     flash before the navigation fires. The navigate() call in useEffect
   *     would fire one render cycle later — too late to prevent the flash.
   *
   * Gate 3: guestSession loaded but initialization useEffect has not yet run.
   *   → Show spinner. The useEffect sets messages, counts, locked state, etc.
   *     before setting isInitialized=true. Without this gate the empty chat
   *     shell (no messages, wrong counts) renders for one frame.
   *
   * If guestSessionError is set we bypass all gates and render normally so
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

  // Gate 2 — converted session: user signed up before, must log back in
  if (guestSession?.status === "converted") {
    return <Redirect to="/login" />;
  }

  // Gate 3 — session loaded but initialization useEffect hasn't run yet
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
    <div className="h-screen flex flex-col" style={{ background: "hsl(222 47% 7%)" }}>

      {/* ── Top nav ────────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid hsl(222 47% 12%)" }}
      >
        {/* Left: logo + guest mode badge */}
        <div className="flex items-center gap-2.5">
          <img src={logoSrc} alt="TrainChat" className="h-6" />
          <span
            className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-widest"
            style={{ background: "hsl(222 47% 14%)", color: "hsl(222 47% 55%)", border: "1px solid hsl(222 47% 20%)" }}
          >
            Guest
          </span>
        </div>

        {/* Right: inputs remaining + auth links */}
        <div className="flex items-center gap-3">
          {/* Free inputs remaining counter — shown once the user has started chatting */}
          {messageCount > 0 && messageCount < FREE_MESSAGE_LIMIT && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
              style={{
                background: messageCount >= FREE_MESSAGE_LIMIT - 1 ? "hsl(25 95% 53% / 0.1)" : "hsl(222 47% 13%)",
                color: messageCount >= FREE_MESSAGE_LIMIT - 1 ? "hsl(25 95% 63%)" : "hsl(222 47% 55%)",
                border: messageCount >= FREE_MESSAGE_LIMIT - 1 ? "1px solid hsl(25 95% 53% / 0.25)" : "1px solid hsl(222 47% 20%)",
              }}
            >
              <span className="hidden sm:inline">{FREE_MESSAGE_LIMIT - messageCount} free {FREE_MESSAGE_LIMIT - messageCount === 1 ? "message" : "messages"} left</span>
              <span className="sm:hidden">{FREE_MESSAGE_LIMIT - messageCount} left</span>
            </span>
          )}
          <button
            onClick={handleSignIn}
            className="text-xs font-medium transition-colors"
            style={{ color: "hsl(222 47% 50%)" }}
            onMouseEnter={(e) => ((e.currentTarget).style.color = "#e4e4e7")}
            onMouseLeave={(e) => ((e.currentTarget).style.color = "hsl(222 47% 50%)")}
          >
            Sign in
          </button>
          <button
            onClick={handleRegister}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: "hsl(199 89% 48% / 0.15)", border: "1px solid hsl(199 89% 48% / 0.3)", color: "hsl(199 89% 68%)" }}
          >
            Get started free
          </button>
        </div>
      </div>

      {/* ── Chat area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col max-w-2xl w-full mx-auto">

        {isBeforeFirstInput ? (
          /* ── Welcome / initial state ─────────────────────────────────── */
          <div className="flex-1 flex flex-col justify-center px-4 py-6 gap-5">

            {/* Opening message */}
            {messages.length > 0 && (
              <div className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-400">
                <AgentAvatar />
                <div
                  className="rounded-2xl rounded-tl-sm px-4 py-4 flex-1"
                  style={{ background: "hsl(222 47% 13%)", border: "1px solid hsl(222 47% 20%)" }}
                >
                  <p className="text-lg font-semibold leading-snug" style={{ color: "#f4f4f5" }}>
                    {messages[0].content}
                  </p>
                  <p className="text-xs mt-1.5" style={{ color: "hsl(222 47% 50%)" }}>
                    Tell me your goal — I'll design it with you.
                  </p>
                </div>
              </div>
            )}

            {/* Quick-start chips */}
            <div
              className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-3 duration-500"
              style={{ animationDelay: "80ms" }}
            >
              {QUICK_START.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => handleSend(opt.label)}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium w-full text-left transition-all duration-150 active:scale-[0.98]"
                  style={{
                    background: "hsl(222 47% 11%)",
                    border: "1px solid hsl(222 47% 20%)",
                    color: "#d4d4d8",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget).style.borderColor = "hsl(199 89% 48% / 0.6)";
                    (e.currentTarget).style.background = "hsl(199 89% 48% / 0.06)";
                    (e.currentTarget).style.color = "#f4f4f5";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget).style.borderColor = "hsl(222 47% 20%)";
                    (e.currentTarget).style.background = "hsl(222 47% 11%)";
                    (e.currentTarget).style.color = "#d4d4d8";
                  }}
                >
                  <span className="text-lg w-7 text-center flex-shrink-0">{opt.icon}</span>
                  <span>{opt.label}</span>
                  <svg className="w-4 h-4 ml-auto flex-shrink-0 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>

            {/* Guest mode note — subtle, non-intrusive */}
            <p
              className="text-center text-[11px] animate-in fade-in duration-700"
              style={{ color: "hsl(222 47% 38%)", animationDelay: "200ms" }}
            >
              You're in guest mode — start building your program now. {FREE_MESSAGE_LIMIT} free messages included.
            </p>
          </div>
        ) : (
          /* ── Conversation view ───────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto px-4 pt-5 pb-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300"
              >
                {msg.role === "assistant"
                  ? <AssistantMessage content={msg.content} isSystemPreviewMsg={isSystemPreview(msg.content)} />
                  : <UserMessage content={msg.content} />
                }
              </div>
            ))}
            {isTyping && (
              <div className="animate-in fade-in duration-200">
                <TypingIndicator turnNumber={currentTurn} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ── Input bar ─────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 px-4 pb-6 pt-3"
          style={{ borderTop: "1px solid hsl(222 47% 13%)" }}
        >
          <div
            className="flex items-end gap-2 rounded-2xl transition-all duration-200"
            style={{
              background: "hsl(222 47% 11%)",
              border: "1px solid hsl(222 47% 22%)",
            }}
            onFocusCapture={(e) => (e.currentTarget.style.borderColor = "hsl(199 89% 48% / 0.5)")}
            onBlurCapture={(e) => (e.currentTarget.style.borderColor = "hsl(222 47% 22%)")}
          >
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={isBeforeFirstInput ? "Describe your goal..." : "Message TrainChat..."}
              className="flex-1 resize-none bg-transparent px-4 py-3.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none leading-relaxed"
              style={{ minHeight: "50px", maxHeight: "120px" }}
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
                background: canSend ? "hsl(199 89% 48%)" : "hsl(222 47% 18%)",
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
