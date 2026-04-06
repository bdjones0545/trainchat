import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useGuestSession } from "@/hooks/useGuestSession";
import { GUEST_CONFIG } from "@/lib/guestConfig";
import { GuestPaywallModal } from "@/components/GuestPaywallModal";
import logoSrc from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

// ─── Constants ─────────────────────────────────────────────────────────────────

const FREE_MESSAGE_LIMIT = GUEST_CONFIG.TEASER_TOTAL_LIMIT; // 5
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
  try { localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history)); } catch { /* noop */ }
}

function clearLocalHistory() {
  try { localStorage.removeItem(CHAT_HISTORY_KEY); } catch { /* noop */ }
}

async function trackFunnelEvent(deviceId: string, event: string, metadata?: Record<string, unknown>) {
  try {
    await fetch("/api/guest/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, event, ...(metadata ? { metadata } : {}) }),
    });
  } catch { /* silent */ }
}

// ─── Quick-start chips ────────────────────────────────────────────────────────

const QUICK_START = [
  { label: "Build muscle", icon: "💪" },
  { label: "Get stronger", icon: "⚡" },
  { label: "Lose fat", icon: "🔥" },
  { label: "Athletic performance", icon: "🏆" },
  { label: "Reduce pain & train smart", icon: "🩺" },
];

// ─── Message Bubble ───────────────────────────────────────────────────────────

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

function AssistantMessage({ content }: { content: string }) {
  // Render simple markdown-ish formatting
  const lines = content.split("\n");
  return (
    <div className="flex items-start gap-3 max-w-[88%]">
      <AgentAvatar />
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed min-w-0"
        style={{ background: "hsl(222 47% 13%)", border: "1px solid hsl(222 47% 20%)", color: "#e4e4e7" }}
      >
        {lines.map((line, i) => {
          if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
            return <p key={i} className="font-semibold text-white mb-1">{line.slice(2, -2)}</p>;
          }
          if (line.startsWith("- ") || line.startsWith("• ")) {
            return <p key={i} className="pl-3 text-zinc-300 mb-0.5">· {line.slice(2)}</p>;
          }
          if (line === "") return <div key={i} className="h-2" />;
          return <p key={i} className="mb-0.5 text-zinc-300">{line}</p>;
        })}
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

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar />
      <div
        className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1"
        style={{ background: "hsl(222 47% 13%)", border: "1px solid hsl(222 47% 20%)" }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: "hsl(199 89% 48%)", animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Message Counter ──────────────────────────────────────────────────────────

function MessageCounter({ used, limit }: { used: number; limit: number }) {
  const remaining = limit - used;
  if (used === 0) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full"
      style={{
        color: remaining <= 1 ? "hsl(38 92% 65%)" : "hsl(222 47% 45%)",
        background: remaining <= 1 ? "hsl(38 92% 65% / 0.08)" : "transparent",
        border: remaining <= 1 ? "1px solid hsl(38 92% 65% / 0.2)" : "none",
      }}
    >
      <span>{remaining} free {remaining === 1 ? "message" : "messages"} left</span>
    </div>
  );
}

// ─── Locked Screen (return visitor) ──────────────────────────────────────────

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

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // Refs
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);
  const landingTracked = useRef(false);

  const { deviceId, guestSession } = useGuestSession(false);

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Track landing page view ────────────────────────────────────────────────
  useEffect(() => {
    if (landingTracked.current || !deviceId) return;
    landingTracked.current = true;
    trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.LANDING_PAGE_VIEWED);
  }, [deviceId]);

  // ── Initialize: restore state or show welcome ──────────────────────────────
  useEffect(() => {
    if (hasInitialized.current || !guestSession) return;
    hasInitialized.current = true;

    // Converted users go directly to chat
    if (guestSession.status === "converted") {
      navigate("/chat");
      return;
    }

    const savedCount = guestSession.teaserUsesCount ?? 0;
    setMessageCount(savedCount);

    // Return visitor who used all messages → locked
    if (savedCount >= FREE_MESSAGE_LIMIT) {
      // Try restoring from localStorage first
      const localHistory = loadLocalHistory();
      if (localHistory.length > 0) {
        setMessages(localHistory);
        setShowPaywall(true);
      } else {
        setIsLocked(true);
      }
      return;
    }

    // Restore existing conversation from localStorage
    const localHistory = loadLocalHistory();
    if (localHistory.length > 0) {
      setMessages(localHistory);
      if (deviceId) {
        trackFunnelEvent(deviceId, GUEST_CONFIG.EVENTS.GUEST_RETURNED);
      }
      return;
    }

    // Fresh start — show the welcome message
    setMessages([{
      role: "assistant",
      content: "What do you want to build today?",
    }]);
  }, [guestSession, deviceId, navigate]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isTyping) return;

    const id = deviceId ?? getDeviceId();
    if (!id) return;

    setInputText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Add user message immediately
    const userMsg: ChatMessage = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    saveLocalHistory(newMessages);

    // Track message send
    trackFunnelEvent(id, GUEST_CONFIG.EVENTS.GUEST_CHAT_MESSAGE, { messageCount: messageCount + 1 });

    setIsTyping(true);

    try {
      // Send only recent history to API (last 20 messages for context)
      const historyForApi = newMessages.slice(-20, -1); // exclude the just-added user message

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
        // Hit paywall — show it
        setShowPaywall(true);
        setMessageCount(FREE_MESSAGE_LIMIT);
        trackFunnelEvent(id, GUEST_CONFIG.EVENTS.PAYWALL_SHOWN, { trigger: "message_limit" });
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Guest chat error:", err);
        // Show a fallback message
        const fallback: ChatMessage = {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        };
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
        // Show paywall after rendering this last response
        setTimeout(() => {
          setShowPaywall(true);
          trackFunnelEvent(id, GUEST_CONFIG.EVENTS.PAYWALL_SHOWN, { trigger: "message_limit" });
        }, 800);
      }
    } catch (err) {
      setIsTyping(false);
      console.error("Guest chat network error:", err);
      const fallback: ChatMessage = {
        role: "assistant",
        content: "Connection interrupted. Please try again.",
      };
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

  // ── Locked: return visitor who exhausted all messages ─────────────────────
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
      {/* ── Top nav ──────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid hsl(222 47% 12%)" }}
      >
        <img src={logoSrc} alt="TrainChat" className="h-6" />
        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="text-xs font-medium transition-colors"
            style={{ color: "hsl(222 47% 50%)" }}
            onMouseEnter={(e) => ((e.currentTarget).style.color = "#e4e4e7")}
            onMouseLeave={(e) => ((e.currentTarget).style.color = "hsl(222 47% 50%)")}
          >
            Sign in
          </a>
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
          /* ── Welcome / initial state ──────────────────────────────────── */
          <div className="flex-1 flex flex-col justify-center px-4 py-6 gap-5">
            {/* Agent welcome message */}
            {messages.length > 0 && (
              <div className="flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-400">
                <AgentAvatar />
                <div
                  className="rounded-2xl rounded-tl-sm px-4 py-3.5 text-base leading-relaxed font-medium flex-1"
                  style={{ background: "hsl(222 47% 13%)", border: "1px solid hsl(222 47% 20%)", color: "#e4e4e7" }}
                >
                  {messages[0].content}
                </div>
              </div>
            )}

            {/* Quick-start chips */}
            <div
              className="flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-3 duration-500"
              style={{ animationDelay: "100ms" }}
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
                  <svg className="w-4 h-4 ml-auto flex-shrink-0 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Full conversation view ──────────────────────────────────── */
          <div className="flex-1 overflow-y-auto px-4 pt-5 pb-4 space-y-4">
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
                <TypingIndicator />
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}

        {/* ── Input bar ───────────────────────────────────────────────────── */}
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
              placeholder={isBeforeFirstInput ? "Or describe your goal..." : "Message TrainChat..."}
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

      {/* ── Paywall modal ─────────────────────────────────────────────────── */}
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
