import type React from "react";
import { LogOut, Settings } from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import trainChatLogo from "@assets/E6D6712F-F281-4EE9-BFBD-DB56B29C39DE_1775264037015.png";

interface Props {
  userName: string;
  extraContent?: React.ReactNode;
}

export default function TopNav({ userName, extraContent }: Props) {
  const [, setLocation] = useLocation();
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

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm flex-shrink-0 z-10">
      {/* Logo */}
      <img
        src={trainChatLogo}
        alt="TrainChat"
        className="h-7 object-contain"
        data-testid="img-logo"
      />

      {/* Center — extra content (e.g. streak badge) */}
      {extraContent && (
        <div className="absolute left-1/2 -translate-x-1/2">{extraContent}</div>
      )}

      {/* Right side */}
      <div className="flex items-center gap-2">
        <button
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <div
            className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary"
            data-testid="text-user-avatar"
          >
            {initials}
          </div>
          <span className="text-xs font-medium text-foreground hidden sm:block">{userName}</span>
        </div>

        <button
          data-testid="button-logout"
          onClick={handleLogout}
          disabled={logout.isPending}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
