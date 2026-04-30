import { useMemo } from "react";
import { Share2 } from "lucide-react";
import SystemUpdateCard from "./SystemUpdateCard";
import BuildSummaryCard from "./BuildSummaryCard";
import AgentTurnReport from "./AgentTurnReport";
import { buildShareMoment, type ShareMoment } from "@/types/share-moments";
import { extractProgramData, stripProgramJson, isProgramFragment } from "@/lib/extractProgramArtifact";
import type { CompleteEvent } from "@/hooks/useStreamMessage";

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
  /** Dev-only: CompleteEvent for the last agent turn. Renders AgentTurnReport when present. */
  turnReport?: CompleteEvent | null;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Renders plain-text content with markdown-like formatting
function RichContent({ text }: { text: string }) {
  const rendered = useMemo(() => {
    // Normalize line endings so code-fence detection works on \r\n content
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
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

      // ── Code block (``` ... ```) ─────────────────────────────────────────
      // Intercept fenced code blocks before they fall through to plain-text rendering.
      // JSON blocks that contain a valid program structure are suppressed entirely —
      // the program is shown in the right panel, not in the chat bubble.
      if (line.trimStart().startsWith("```")) {
        const lang = line.trimStart().slice(3).trim().toLowerCase();
        const blockLines: string[] = [];
        i++;
        // Collect lines until we find the closing fence
        while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
          blockLines.push(lines[i]);
          i++;
        }
        i++; // skip the closing ```

        const blockContent = blockLines.join("\n");

        if (lang === "json" || lang === "") {
          // Try to parse: if it's a valid program structure, suppress rendering.
          // The program lives in the sidebar — we never want raw JSON in the chat bubble.
          try {
            const parsed = JSON.parse(blockContent);
            if (parsed?.days && Array.isArray(parsed.days) && parsed.days.length > 0) {
              // Suppress: this is a program JSON block — it is shown in the right panel
              console.log("[RichContent] Suppressing valid program JSON block");
              continue;
            }
          } catch {
            // JSON.parse failed — still suppress if content looks like program JSON.
            // This handles truncated/malformed backend responses (token-limit failures)
            // where the JSON is incomplete and cannot be parsed normally.
          }
          // Belt-and-suspenders: suppress even when JSON is malformed/truncated,
          // if the block has enough program-specific keys to be unmistakably program data.
          if (
            blockContent.includes('"programName"') ||
            (blockContent.includes('"days"') && blockContent.includes('"exercises"')) ||
            (blockContent.includes('"sets"') && blockContent.includes('"reps"') && blockContent.includes('"dayNumber"'))
          ) {
            console.log("[RichContent] Suppressing malformed/truncated program JSON block", { blockLen: blockContent.length, lang });
            continue;
          }
        }

        // For all other code blocks (or non-program JSON), render as a monospace block
        elements.push(
          <pre key={`code-${i}`} className="text-[10px] bg-muted/50 border border-border rounded p-2 overflow-x-auto font-mono my-1 whitespace-pre-wrap break-all">
            {blockContent}
          </pre>
        );
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

export default function MessageBubble({ message, onViewProgram, onShowChange, onShareMoment, turnReport }: Props) {
  const isUser = message.role === "user";
  const parsed = parseStructuredData(message.structuredData);
  const isSystemEdit = !isUser && parsed.type === "system_edit";
  const isBlockComplete = !isUser && parsed.type === "block_completed";
  const isSessionLogged = !isUser && parsed.type === "session_logged";

  // ── MESSAGE-LEVEL PROGRAM-ARTIFACT SUPPRESSION ───────────────────────────
  // Two-tier detection so both valid and truncated/malformed programs are caught.
  //
  // Tier 1 (extractProgramData): fully parsed + valid program → suppress + show in panel
  // Tier 2 (isProgramFragment):  truncated/malformed fence detected → suppress only,
  //   do NOT show in panel (JSON was incomplete, nothing safe to parse)
  const programArtifact = !isUser
    ? extractProgramData(message.structuredData, message.content)
    : null;
  const hasValidProgram = programArtifact !== null;
  // Only run fragment detection when the valid-program path missed (performance)
  const hasFragmentProgram = !isUser && !hasValidProgram
    ? isProgramFragment(message.content)
    : false;
  const isMessageProgramArtifact = hasValidProgram || hasFragmentProgram;

  // isInitialBuild: structuredData-only (needs _buildMeta flag from backend)
  const isInitialBuild = !isUser && parsed.type === "program_build";
  // hasProgram: only when we have a FULLY parsed program (not a truncated fragment)
  const hasProgram = !isUser && (parsed.type === "program" || (hasValidProgram && !isInitialBuild));

  // Strip the JSON blob from content before rendering — leaves conversational
  // text (e.g. "Here's your program!") but removes the raw JSON in every format.
  // stripProgramJson now handles truncated/partial fences too.
  const displayContent = isMessageProgramArtifact
    ? stripProgramJson(message.content)
    : message.content;

  if (!isUser) {
    console.log("[Program render suppression check]", {
      messageId: message.id,
      hasStructuredData: !!message.structuredData,
      parsedType: parsed.type,
      hasValidProgram,
      hasFragmentProgram,
      isMessageProgramArtifact,
      extractedFrom: hasValidProgram
        ? (message.structuredData ? "structuredData" : "content_fallback")
        : hasFragmentProgram ? "fragment_heuristic" : "none",
      suppressionApplied: isMessageProgramArtifact,
      contentLengthBefore: message.content.length,
      contentLengthAfter: displayContent.length,
    });
  }

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
            <RichContent text={displayContent} />

            {/*
              CASE B fallback — fragment detected, no valid program parsed, no conversational text.
              This is the "suppression applied but nothing useful shown" state we must never leave
              the user in. Render a visible retry prompt instead of a blank bubble.
            */}
            {hasFragmentProgram && !hasValidProgram && !displayContent.trim() && (
              <p className="text-[12px] text-muted-foreground leading-relaxed italic">
                I started building your program, but the response was cut off. Please try again.
              </p>
            )}

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
        {/* Dev-only Agent Turn Report — collapsible debug card after last assistant message */}
        {!isUser && turnReport && import.meta.env.DEV && (
          <AgentTurnReport event={turnReport} />
        )}
        <span className={`text-[10px] text-muted-foreground mt-1.5 px-1 block ${isUser ? "text-right" : ""}`}>
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
