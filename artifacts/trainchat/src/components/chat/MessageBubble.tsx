import { useMemo } from "react";
import { Share2 } from "lucide-react";
import SystemUpdateCard from "./SystemUpdateCard";
import BuildSummaryCard from "./BuildSummaryCard";
import { buildShareMoment, type ShareMoment } from "@/types/share-moments";

interface Message {
  id: number;
  role: string;
  content: string;
  createdAt: string;
  structuredData?: string | null;
}

interface Props {
  message: Message;
  onProgramGenerated?: () => void;
  onViewProgram?: () => void;
  onShowChange?: () => void;
  onShareMoment?: (moment: ShareMoment) => void;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Renders plain-text content with markdown-like formatting
function RichContent({ text }: { text: string }) {
  const rendered = useMemo(() => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Skip empty lines but add spacing
      if (line.trim() === "") {
        elements.push(<div key={`space-${i}`} className="h-2" />);
        i++;
        continue;
      }

      // Heading (## Heading)
      if (line.startsWith("## ")) {
        elements.push(
          <p key={i} className="font-semibold text-foreground text-[13px] mt-2 mb-0.5">
            {parseInline(line.slice(3))}
          </p>
        );
        i++;
        continue;
      }

      // Heading (# Heading)
      if (line.startsWith("# ")) {
        elements.push(
          <p key={i} className="font-bold text-foreground text-sm mt-2 mb-1">
            {parseInline(line.slice(2))}
          </p>
        );
        i++;
        continue;
      }

      // Bullet list
      if (line.match(/^[-*•]\s/)) {
        const listItems: string[] = [];
        while (i < lines.length && lines[i].match(/^[-*•]\s/)) {
          listItems.push(lines[i].replace(/^[-*•]\s/, ""));
          i++;
        }
        elements.push(
          <ul key={`list-${i}`} className="space-y-1 my-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-[5px] w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                <span>{parseInline(item)}</span>
              </li>
            ))}
          </ul>
        );
        continue;
      }

      // Numbered list
      if (line.match(/^\d+\.\s/)) {
        const listItems: { num: string; text: string }[] = [];
        while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
          const match = lines[i].match(/^(\d+)\.\s(.+)/);
          if (match) listItems.push({ num: match[1], text: match[2] });
          i++;
        }
        elements.push(
          <ol key={`ol-${i}`} className="space-y-1 my-1">
            {listItems.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-semibold text-primary text-[11px] mt-0.5 min-w-[14px]">
                  {item.num}.
                </span>
                <span>{parseInline(item.text)}</span>
              </li>
            ))}
          </ol>
        );
        continue;
      }

      // Regular paragraph line
      elements.push(
        <p key={i} className="leading-relaxed">
          {parseInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  }, [text]);

  return <div className="space-y-0.5 text-sm">{rendered}</div>;
}

// Parse inline bold (**text**) and code (`text`)
function parseInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="text-[11px] bg-primary/10 text-primary px-1 py-0.5 rounded font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

// Parse structuredData to detect system_edit vs program_build vs program vs coaching events
function parseStructuredData(raw: string | null | undefined) {
  if (!raw) return { type: "none" as const };
  try {
    const data = JSON.parse(raw);
    if (data?._type === "system_edit") {
      return { type: "system_edit" as const, data };
    }
    if (data?._type === "block_completed") {
      return { type: "block_completed" as const, data };
    }
    if (data?._type === "week_advanced") {
      return { type: "week_advanced" as const, data };
    }
    if (data?._type === "session_logged") {
      return { type: "session_logged" as const, data };
    }
    if (data?.days && Array.isArray(data.days)) {
      if (data._buildMeta) {
        return { type: "program_build" as const, data };
      }
      return { type: "program" as const, data };
    }
  } catch {
    // ignore
  }
  return { type: "none" as const };
}

export default function MessageBubble({ message, onViewProgram, onShowChange, onShareMoment }: Props) {
  const isUser = message.role === "user";
  const parsed = parseStructuredData(message.structuredData);
  const isSystemEdit = !isUser && parsed.type === "system_edit";
  const hasProgram = !isUser && parsed.type === "program";
  const isInitialBuild = !isUser && parsed.type === "program_build";
  const isBlockComplete = !isUser && parsed.type === "block_completed";
  const isSessionLogged = !isUser && parsed.type === "session_logged";

  // Determine if a session log is "wow" worthy (meaningful adaptation signal)
  const sessionLogIsWow = isSessionLogged && (() => {
    const d = parsed.data as any;
    const difficulty = d?.difficultyScore ?? 0;
    const energy = d?.energyScore ?? 3;
    const pain = d?.painScore ?? 0;
    return difficulty >= 4 || energy <= 2 || pain >= 4;
  })();

  function handleBlockCompleteShare() {
    if (!onShareMoment) return;
    const data = parsed.data as any;
    const fromWeek = data?.fromWeek ?? null;
    const moment = buildShareMoment({
      type: "BLOCK_COMPLETE",
      agentQuote: message.content.length < 200 ? message.content : undefined,
      blockWeek: fromWeek,
      triggerSource: "block_completed_message",
    });
    onShareMoment(moment);
  }

  function handleSessionLogShare() {
    if (!onShareMoment) return;
    const moment = buildShareMoment({
      type: "SESSION_LOG_ADAPTATION",
      agentQuote: message.content.length < 200 ? message.content : undefined,
      triggerSource: "session_logged_message",
    });
    onShareMoment(moment);
  }

  return (
    <div className={`flex items-start gap-3 mb-5 message-animate ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isUser
            ? "bg-primary/20 border border-primary/40"
            : "bg-card border border-primary/30"
        }`}
      >
        {isUser ? (
          <span className="text-[10px] font-bold text-primary">U</span>
        ) : (
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" style={{ animationDuration: "3s" }} />
        )}
      </div>

      {/* Content */}
      <div className={`min-w-0 flex-1 ${isUser ? "items-end flex flex-col" : ""}`}>
        {isUser ? (
          <div className="inline-block max-w-[75%] px-4 py-3 rounded-2xl rounded-tr-sm bg-primary text-primary-foreground text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        ) : isSystemEdit ? (
          /* MUTATION-FIRST: SystemUpdateCard is the primary artifact — rendered standalone above text */
          <div className="min-w-0 max-w-[95%]">
            <SystemUpdateCard data={parsed.data} onShowChange={onShowChange} />
            {message.content && (
              <p className="text-[12px] text-muted-foreground/75 leading-relaxed mt-2 px-1">
                {message.content}
              </p>
            )}
          </div>
        ) : (
          /* Standard assistant bubble for all non-edit messages */
          <div className="max-w-[90%] px-4 py-3 rounded-2xl rounded-tl-sm bg-card border border-border text-foreground">
            <RichContent text={message.content} />

            {/* Build summary card — shown for new initial program builds */}
            {isInitialBuild && (
              <BuildSummaryCard data={parsed.data} onViewProgram={onViewProgram} />
            )}

            {/* Program generated indicator — shown for subsequent program updates (not first build) */}
            {hasProgram && (
              <div className="mt-3 pt-2.5 border-t border-border">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">
                    Program updated — see right panel
                  </span>
                </div>
              </div>
            )}

            {/* Block completion share CTA */}
            {isBlockComplete && onShareMoment && (
              <div className="mt-3 pt-2.5 border-t border-border">
                <button
                  onClick={handleBlockCompleteShare}
                  className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors"
                >
                  <Share2 size={11} />
                  Share block completion
                </button>
              </div>
            )}

            {/* Session log adaptation share CTA — only for notable sessions */}
            {sessionLogIsWow && onShareMoment && (
              <div className="mt-3 pt-2.5 border-t border-border">
                <button
                  onClick={handleSessionLogShare}
                  className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground hover:text-primary transition-colors"
                >
                  <Share2 size={11} />
                  Share what changed
                </button>
              </div>
            )}
          </div>
        )}
        <span className={`text-[10px] text-muted-foreground mt-1.5 px-1 block ${isUser ? "text-right" : ""}`}>
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
