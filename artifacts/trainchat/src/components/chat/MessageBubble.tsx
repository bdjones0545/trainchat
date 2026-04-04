interface Message {
  id: number;
  role: string;
  content: string;
  createdAt: string;
}

interface Props {
  message: Message;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex items-start gap-3 mb-4 message-animate ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold ${
          isUser
            ? "bg-primary/20 border border-primary/40 text-primary"
            : "bg-primary/20 border border-primary/30"
        }`}
      >
        {isUser ? (
          <span>U</span>
        ) : (
          <div className="w-2 h-2 rounded-full bg-primary" />
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[70%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-card border border-border text-foreground rounded-tl-sm"
          }`}
        >
          {message.content}
        </div>
        <span className="text-[10px] text-muted-foreground mt-1 px-1">
          {formatTime(message.createdAt)}
        </span>
      </div>
    </div>
  );
}
