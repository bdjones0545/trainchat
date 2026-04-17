import type React from "react";
import { LogOut, Settings, Target, MessageSquare, UserPlus } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

interface Props {
  userName: string;
  isAnonymous?: boolean;
  extraContent?: React.ReactNode;
}

export default function TopNav({ userName, isAnonymous = false, extraContent }: Props) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout();

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    });
  }

  const initials = isAnonymous
    ? "TC"
    : userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

  const isOnSystem = location === "/system";
  const isOnChat = location === "/chat";

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm flex-shrink-0 z-10">
      {/* Logo — home/agent anchor */}
      <button
        onClick={() => setLocation("/chat")}
        aria-label="Return to TrainChat agent"
        className="flex items-center justify-center rounded-xl px-2 py-1 transition-all duration-150 active:scale-95 active:opacity-70 hover:opacity-80"
      >
        <img
          src={trainChatLogo}
          alt="TrainChat"
          className="h-7 object-contain"
          data-testid="img-logo"
        />
      </button>

      {/* Center — primary nav (always visible) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1 border border-border">
          <button
            onClick={() => setLocation("/chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isOnChat
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="nav-chat"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Coach</span>
          </button>
          <button
            onClick={() => setLocation("/system")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
              isOnSystem
                ? "bg-background text-foreground shadow-sm border border-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid="nav-system"
          >
            <Target className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Your System</span>
          </button>
        </div>

        {/* Extra content (e.g. streak badge) rendered beside the nav pill */}
        {extraContent && (
          <div className="hidden sm:flex items-center">{extraContent}</div>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {!isAnonymous && (
          <button
            onClick={() => setLocation("/billing")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div
            className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary"
            data-testid="text-user-avatar"
          >
            {initials}
          </div>
          <span className="text-xs font-medium text-foreground hidden sm:block">
            {isAnonymous ? "Guest" : userName}
          </span>
        </div>

        {isAnonymous ? (
          <button
            data-testid="button-create-account"
            onClick={() => setLocation("/register")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 transition-all duration-150"
            title="Create a free account"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Create Account</span>
          </button>
        ) : (
          <button
            data-testid="button-logout"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
