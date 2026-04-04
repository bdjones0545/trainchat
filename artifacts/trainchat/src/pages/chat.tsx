import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  SendHorizontal, Zap, PanelLeftClose, PanelLeft, Activity,
  Menu, Target, Settings, CreditCard, LogOut, SlidersHorizontal,
  MessageSquare, Plus,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useGetProfile,
  useListConversations,
  useCreateConversation,
  useListMessages,
  useSendMessage,
  useCreateProgram,
  useListMemories,
  useListInsights,
  useLogout,
  getListConversationsQueryKey,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import TopNav from "@/components/layout/TopNav";
import MobileSlideLayout, { type SlidePanel } from "@/components/layout/MobileSlideLayout";
import ChatSidebar from "@/components/chat/ChatSidebar";
import MessageBubble from "@/components/chat/MessageBubble";
import TypingIndicator from "@/components/chat/TypingIndicator";
import ChatOutput, { type ProgramStructure } from "@/components/chat/ChatOutput";
import ReadinessModal from "@/components/chat/ReadinessModal";
import FeedbackModal from "@/components/chat/FeedbackModal";
import ReadinessSummary from "@/components/chat/ReadinessSummary";
import InsightsPanel from "@/components/chat/InsightsPanel";
import StreakBadge from "@/components/chat/StreakBadge";
import SessionLogModal from "@/components/chat/SessionLogModal";
import PaywallModal from "@/components/PaywallModal";
import PricingModal from "@/components/PricingModal";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

const STARTER_PROMPTS = [
  "Build me a 4-day push/pull program",
  "I want to get stronger — where do I start?",
  "Design a program for 5 days a week",
  "What's the best split for muscle gain?",
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
  const [isTyping, setIsTyping] = useState(false);
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

  const logout = useLogout();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: me, isError: meError, isLoading: meLoading } = useGetMe();
  const { data: profile, isError: profileError, isLoading: profileLoading } = useGetProfile({
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

  const createConvo = useCreateConversation();
  const sendMessage = useSendMessage();
  const createProgram = useCreateProgram();

  const isPremium = subscription?.plan === "pro" || subscription?.plan === "elite";
  const currentPlan = subscription?.plan ?? "free";
  const currentStreak = streakData?.currentStreak ?? 0;

  useEffect(() => {
    if (meError) setLocation("/login");
  }, [meError, setLocation]);

  useEffect(() => {
    if (profileError && !profileLoading) setLocation("/onboarding");
  }, [profileError, profileLoading, setLocation]);

  useEffect(() => {
    if (!me || convosLoading) return;
    if (conversations.length > 0 && !activeConvoId) {
      setActiveConvoId(conversations[0].id);
    } else if (conversations.length === 0 && !convosLoading && !createConvo.isPending) {
      createConvo.mutate(
        { data: { title: "New Session" } },
        {
          onSuccess: (convo) => {
            queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
            setActiveConvoId(convo.id);
          },
        }
      );
    }
  }, [me, conversations, convosLoading, activeConvoId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    const aiMessages = messages.filter((m) => m.role === "assistant" && m.structuredData);
    if (aiMessages.length > 0) {
      const last = aiMessages[aiMessages.length - 1];
      if (last.structuredData) {
        try {
          const parsed = JSON.parse(last.structuredData) as ProgramStructure;
          setLatestProgram(parsed);
          setIsSaved(false);
        } catch {
          // ignore
        }
      }
    } else {
      if (messages.length === 0) setLatestProgram(null);
    }
  }, [messages]);

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
    if (!content || !activeConvoId || sendMessage.isPending) return;

    setInputText("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setIsTyping(true);

    sendMessage.mutate(
      { id: activeConvoId, data: { content } },
      {
        onSuccess: (data: any) => {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(activeConvoId!) });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          setIsTyping(false);

          if (data?.planInfo?.messagesRemaining !== undefined) {
            setMessagesUsed(data.planInfo.messageCount ?? messagesUsed + 1);
          }
        },
        onError: (err: any) => {
          setIsTyping(false);
          if (err?.response?.status === 402 || err?.status === 402 || err?.message?.includes("402")) {
            setShowPaywall(true);
          }
        },
      }
    );
  }

  async function handleSaveProgram() {
    if (!latestProgram || !activeConvoId || isSaving || isSaved) return;
    setIsSaving(true);

    createProgram.mutate(
      {
        data: {
          name: latestProgram.programName,
          description: latestProgram.description ?? "",
          conversationId: activeConvoId,
          days: latestProgram.days.map((day) => ({
            dayNumber: day.dayNumber,
            name: day.name,
            notes: day.notes ?? undefined,
            exercises: day.exercises.map((ex, idx) => ({
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rest: ex.rest,
              notes: ex.notes ?? undefined,
              orderIndex: idx,
            })),
          })),
        },
      },
      {
        onSuccess: () => {
          setIsSaving(false);
          setIsSaved(true);
        },
        onError: () => {
          setIsSaving(false);
        },
      }
    );
  }

  async function handleSessionLog(data: any) {
    setSessionLogSubmitting(true);
    try {
      await postSessionLog(data);
      queryClient.invalidateQueries({ queryKey: ["streak"] });
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

  if (meLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const firstName = me?.name?.split(" ")[0] ?? "Athlete";
  const userName = me?.name ?? "User";
  const initials = userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    });
  }

  const chatLeftPanel = (
    <div className="flex flex-col h-full">
      {/* User identity */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{userName}</p>
            <p className="text-[11px] text-muted-foreground">
              {currentStreak > 0 ? `${currentStreak} day streak 🔥` : "Performance Athlete"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Navigate</p>
        <button
          onClick={() => { setLocation("/chat"); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-semibold bg-primary/10 text-primary transition-all text-left"
        >
          <MessageSquare className="w-4 h-4 flex-shrink-0" />
          <span>Coach Chat</span>
        </button>
        <button
          onClick={() => { setLocation("/system"); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Target className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Your System</span>
        </button>

        {/* New conversation */}
        <div className="my-3 h-px bg-border" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Conversations</p>
        <button
          onClick={() => { handleNewConversation(); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>New Conversation</span>
        </button>
        {conversations.slice(0, 8).map((convo: any) => (
          <button
            key={convo.id}
            onClick={() => { handleSelectConvo(convo.id); setMobilePanel(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all text-left ${
              convo.id === activeConvoId
                ? "bg-primary/10 text-primary font-semibold"
                : "font-medium text-foreground hover:bg-muted/60 active:bg-muted/80"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
            <span className="truncate">{convo.title ?? "Conversation"}</span>
          </button>
        ))}

        <div className="my-3 h-px bg-border" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 px-3 mb-3">Account</p>
        <button
          onClick={() => { setShowReadiness(true); setMobilePanel(null); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <Activity className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Daily Check-In</span>
        </button>
        {!isPremium && (
          <button
            onClick={() => { setShowPricing(true); setMobilePanel(null); }}
            className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 active:bg-primary/10 transition-all text-left"
          >
            <Zap className="w-4 h-4 flex-shrink-0" />
            <span>Upgrade to Pro</span>
          </button>
        )}
        <button
          onClick={() => { setMobilePanel(null); setLocation("/billing"); }}
          className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-sm font-medium text-foreground hover:bg-muted/60 active:bg-muted/80 transition-all text-left"
        >
          <CreditCard className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span>Manage Billing</span>
        </button>
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

  const chatRightPanel = (
    <div className="flex flex-col h-full">
      <ReadinessSummary />
      <div className="flex-1 overflow-y-auto min-h-0">
        {latestProgram ? (
          <ChatOutput
            program={latestProgram}
            onSave={handleSaveProgram}
            onFeedback={() => { setShowFeedback(true); setMobilePanel(null); }}
            onLogSession={() => { setShowSessionLog(true); setMobilePanel(null); }}
            onUpgrade={() => { setShowPricing(true); setMobilePanel(null); }}
            isSaving={isSaving}
            isSaved={isSaved}
            isPremium={isPremium}
          />
        ) : (
          <InsightsPanel
            insights={insights}
            memories={memories}
            isLoading={insightsLoading || memoriesLoading}
          />
        )}
      </div>
    </div>
  );

  return (
    <MobileSlideLayout
      activePanel={mobilePanel}
      onPanelClose={() => setMobilePanel(null)}
      leftPanel={chatLeftPanel}
      rightPanel={chatRightPanel}
    >
      {/* ─── Modals (always rendered, portal-like) ─── */}
      {showReadiness && (
        <ReadinessModal
          onClose={() => setShowReadiness(false)}
          onSubmit={() => setShowReadiness(false)}
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
          programName={latestProgram?.programName}
          dayNumber={undefined}
          onClose={() => setShowSessionLog(false)}
          onSubmit={handleSessionLog}
          isSubmitting={sessionLogSubmitting}
        />
      )}

      {/* ─── Mobile header (mobile only) ─── */}
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
            latestProgram
              ? "text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          } active:bg-muted/80`}
          aria-label="Training output"
        >
          <SlidersHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* ─── Desktop TopNav (desktop only) ─── */}
      <div className="hidden md:block">
        <TopNav userName={userName} extraContent={<StreakBadge streak={currentStreak} />} />
      </div>

      {/* ─── Main chat area ─── */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Desktop Sidebar (desktop only) */}
        <div className="hidden md:block">
          {sidebarOpen && (
            <ChatSidebar
              conversations={conversations}
              activeId={activeConvoId}
              onSelect={handleSelectConvo}
              onNew={handleNewConversation}
            />
          )}
        </div>

        {/* Center chat column */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Desktop sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="hidden md:flex absolute top-3 left-3 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeft className="w-4 h-4" />
            )}
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
              <div className="flex flex-col items-center justify-center h-full py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5">
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-base font-semibold text-foreground mb-2">
                  Ready, {firstName}.
                </h2>
                <p className="text-sm text-muted-foreground max-w-xs leading-relaxed mb-8">
                  Tell me what you're working toward and we'll build your program together.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-sm">
                  {STARTER_PROMPTS.map((msg) => (
                    <button
                      key={msg}
                      onClick={() => handleSend(msg)}
                      className="text-left px-3.5 py-3 text-xs text-muted-foreground bg-card border border-border rounded-xl hover:border-primary/40 hover:text-foreground hover:bg-accent transition-all duration-150"
                    >
                      {msg}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="flex-shrink-0 px-4 pb-5 pt-3 border-t border-border bg-background/80 backdrop-blur-sm">
            <div className="max-w-2xl mx-auto">
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setShowReadiness(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-muted-foreground border border-border hover:text-foreground hover:border-primary/30 transition-all duration-150"
                >
                  <Activity className="w-3 h-3" />
                  Check-In
                </button>
              </div>
              <div className="relative flex items-end gap-2 bg-card border border-border rounded-2xl focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all duration-200">
                <textarea
                  ref={inputRef}
                  data-testid="input-message"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Message your performance architect..."
                  disabled={isTyping || sendMessage.isPending}
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
                  disabled={!inputText.trim() || sendMessage.isPending || isTyping || !activeConvoId}
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

        {/* Desktop right panel (desktop only) */}
        <div className="hidden md:flex">
          {rightPanelOpen ? (
            <div className="w-72 flex-shrink-0 border-l border-border flex flex-col bg-background overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Training Output
                </span>
                <button
                  onClick={() => setRightPanelOpen(false)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Hide
                </button>
              </div>
              <ReadinessSummary />
              <div className="flex-1 overflow-hidden">
                {latestProgram ? (
                  <ChatOutput
                    program={latestProgram}
                    onSave={handleSaveProgram}
                    onFeedback={() => setShowFeedback(true)}
                    onLogSession={() => setShowSessionLog(true)}
                    onUpgrade={() => setShowPricing(true)}
                    isSaving={isSaving}
                    isSaved={isSaved}
                    isPremium={isPremium}
                  />
                ) : (
                  <InsightsPanel
                    insights={insights}
                    memories={memories}
                    isLoading={insightsLoading || memoriesLoading}
                  />
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setRightPanelOpen(true)}
              className="flex-shrink-0 w-8 border-l border-border bg-background flex items-center justify-center hover:bg-accent transition-all duration-150 group"
              title="Show training output"
            >
              <span className="text-[9px] text-muted-foreground group-hover:text-foreground font-semibold uppercase tracking-widest rotate-90 whitespace-nowrap transition-colors">
                Output
              </span>
            </button>
          )}
        </div>
      </div>
    </MobileSlideLayout>
  );
}
