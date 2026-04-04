import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { SendHorizontal, Zap, PanelLeftClose, PanelLeft } from "lucide-react";
import {
  useGetMe,
  useGetProfile,
  useListConversations,
  useCreateConversation,
  useListMessages,
  useSendMessage,
  useCreateProgram,
  getListConversationsQueryKey,
  getListMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import TopNav from "@/components/layout/TopNav";
import ChatSidebar from "@/components/chat/ChatSidebar";
import MessageBubble from "@/components/chat/MessageBubble";
import TypingIndicator from "@/components/chat/TypingIndicator";
import ChatOutput, { type ProgramStructure } from "@/components/chat/ChatOutput";

const STARTER_PROMPTS = [
  "Build me a 4-day push/pull program",
  "I want to get stronger — where do I start?",
  "Design a program for 5 days a week",
  "What's the best split for muscle gain?",
];

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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auth + data
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

  const createConvo = useCreateConversation();
  const sendMessage = useSendMessage();
  const createProgram = useCreateProgram();

  // Auth redirects
  useEffect(() => {
    if (meError) setLocation("/login");
  }, [meError, setLocation]);

  useEffect(() => {
    if (profileError && !profileLoading) setLocation("/onboarding");
  }, [profileError, profileLoading, setLocation]);

  // Auto-select or create first conversation
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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Extract the latest structured program from AI messages
  useEffect(() => {
    const aiMessages = messages.filter((m) => m.role === "assistant" && m.structuredData);
    if (aiMessages.length > 0) {
      const last = aiMessages[aiMessages.length - 1];
      if (last.structuredData) {
        try {
          const parsed = JSON.parse(last.structuredData) as ProgramStructure;
          setLatestProgram(parsed);
          setIsSaved(false); // new program = not yet saved
        } catch {
          // ignore parse errors
        }
      }
    } else {
      // clear program when switching to an empty convo
      if (messages.length === 0) setLatestProgram(null);
    }
  }, [messages]);

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
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setIsTyping(true);

    sendMessage.mutate(
      { id: activeConvoId, data: { content } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(activeConvoId!) });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          setIsTyping(false);
        },
        onError: () => {
          setIsTyping(false);
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

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopNav userName={me?.name ?? "User"} />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <ChatSidebar
            conversations={conversations}
            activeId={activeConvoId}
            onSelect={handleSelectConvo}
            onNew={handleNewConversation}
          />
        )}

        {/* Center chat */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="absolute top-3 left-3 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeft className="w-4 h-4" />
            )}
          </button>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 pt-12 pb-4">
            {messagesLoading ? (
              <div className="flex justify-center items-center h-32">
                <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              /* Empty state */
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

          {/* Input */}
          <div className="flex-shrink-0 px-4 pb-5 pt-3 border-t border-border bg-background/80 backdrop-blur-sm">
            <div className="max-w-2xl mx-auto">
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
              <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>

        {/* Right panel */}
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
            <div className="flex-1 overflow-hidden">
              <ChatOutput
                program={latestProgram}
                onSave={latestProgram ? handleSaveProgram : undefined}
                isSaving={isSaving}
                isSaved={isSaved}
              />
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
  );
}
