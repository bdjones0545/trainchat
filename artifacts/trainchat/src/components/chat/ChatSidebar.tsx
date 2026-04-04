import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { useDeleteConversation, getListConversationsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: string | null;
}

interface Props {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function ChatSidebar({ conversations, activeId, onSelect, onNew }: Props) {
  const queryClient = useQueryClient();
  const deleteConvo = useDeleteConversation();

  function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    deleteConvo.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
      }
    );
  }

  return (
    <div className="w-60 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      {/* New chat button */}
      <div className="p-3">
        <button
          data-testid="button-new-chat"
          onClick={onNew}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-primary/10 border border-primary/20 text-sm font-medium text-primary hover:bg-primary/15 transition-all duration-150"
        >
          <Plus className="w-4 h-4" />
          New conversation
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <MessageSquare className="w-6 h-6 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground/60">No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((c) => (
              <button
                key={c.id}
                data-testid={`conversation-item-${c.id}`}
                onClick={() => onSelect(c.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg group flex items-start gap-2 transition-all duration-150 ${
                  activeId === c.id
                    ? "bg-accent text-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{c.title}</p>
                  {c.lastMessage && (
                    <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                      {c.lastMessage}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    {formatDate(c.updatedAt)}
                    {c.messageCount > 0 && ` · ${c.messageCount} msg`}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, c.id)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-all duration-150"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
