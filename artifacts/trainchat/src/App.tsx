import { Component, useRef, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Chat from "@/pages/chat";
import GuestStart from "@/pages/guest-start";
import AdminDashboard from "@/pages/admin";
import SystemPage from "@/pages/system";
import BillingPage from "@/pages/billing";
import { useGetMe } from "@workspace/api-client-react";
import { computeRoute, readDeviceId, type UserMode } from "@/lib/routing";

export type { UserMode };

/**
 * ChatPage — universal entry point for /chat.
 *
 * Derives UserMode from auth state and renders the correct experience:
 *   • spinner        — auth check still in flight (first load only)
 *   • authenticated  → <Chat />
 *   • auth_required  → <Redirect to="/login" />  (session expired mid-use)
 *   • guest          → <GuestStart />            (no signup required)
 *
 * This is the ONLY place in the app that decides which experience renders.
 * GuestStart has its own two-stage gate so it NEVER flashes an empty shell.
 */
function ChatPage() {
  const { data: me, isLoading } = useGetMe();

  // Track whether this page instance ever had an authenticated user.
  // If me later becomes undefined (session expired), set mode to auth_required
  // rather than silently switching them to guest mode.
  const hadUser = useRef(false);
  if (me && !hadUser.current) hadUser.current = true;

  const userMode: UserMode | "loading" = isLoading
    ? "loading"
    : me
      ? "authenticated"
      : hadUser.current
        ? "auth_required"
        : "guest";

  if (userMode === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (userMode === "auth_required") return <Redirect to="/login" />;
  if (userMode === "authenticated") return <Chat />;

  // userMode === "guest": unauthenticated AND no prior session in this page instance.
  // Guest is a valid, first-class app state — no redirect to login.
  // Includes "converted" sessions (previously signed up, now unauthenticated):
  // they get full guest access; the nav "Sign in" button lets them return voluntarily.
  return <GuestStart userMode={userMode} />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on 401/403 — these are definitive auth failures.
      // Retrying 401 adds a ~1s delay before guest mode can render.
      retry: (failureCount, error: any) => {
        const status = error?.status ?? error?.response?.status;
        if (status === 401 || status === 403) return false;
        return failureCount < 1;
      },
      staleTime: 30_000,
    },
  },
});

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unexpected error";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    try {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          componentStack: info.componentStack,
          url: window.location.href,
          userAgent: navigator.userAgent,
        }),
      }).catch(() => {});
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-muted-foreground text-center">
            Something went wrong. Please refresh the page.
          </p>
          {this.state.message && (
            <p className="text-xs text-muted-foreground/60 text-center max-w-xs font-mono break-all">
              {this.state.message}
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg"
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * SmartRoot — the single authoritative routing gate for the "/" path.
 *
 * All visitors (authenticated or not) are routed to /chat immediately.
 * ChatPage is the single decision point that renders the correct experience
 * based on auth state. No auth check is needed here — ChatPage handles it.
 * A spinner at "/" would only add latency without providing any value.
 */
function SmartRoot() {
  return <Redirect to="/chat" />;
}

/**
 * AuthGuard — wraps authenticated-only routes.
 * Redirects unauthenticated users to /start without rendering the protected page.
 * Authenticated users on /login or /register are redirected to /chat.
 */
function AuthGuard({ children }: { children: ReactNode }) {
  const { data: me, isLoading, isError } = useGetMe();
  const [pathname] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const decision = computeRoute({
    pathname,
    authResolved: true,
    hasUser: !!me,
    authError: isError,
    deviceId: readDeviceId(),
  });

  if (decision) return <Redirect to={decision.target as any} />;
  return <>{children}</>;
}

/**
 * PublicOnlyGuard — wraps pages that should not be accessible when authenticated.
 * If the user is already signed in, send them to /chat.
 */
function PublicOnlyGuard({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useGetMe();
  const [pathname] = useLocation();

  if (isLoading) return null; // Don't flash the form — stay blank briefly

  if (me) {
    computeRoute({ pathname, authResolved: true, hasUser: true, authError: false });
    return <Redirect to="/chat" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={SmartRoot} />
      {/* /start redirects to /chat — agent is now accessible without login */}
      <Route path="/start">{() => <Redirect to="/chat" />}</Route>
      <Route path="/login">
        {() => (
          <PublicOnlyGuard>
            <Login />
          </PublicOnlyGuard>
        )}
      </Route>
      <Route path="/register">
        {() => (
          <PublicOnlyGuard>
            <Register />
          </PublicOnlyGuard>
        )}
      </Route>
      {/* /onboarding is retired — agent handles onboarding through conversation */}
      <Route path="/onboarding">{() => <Redirect to="/chat" />}</Route>
      {/* /chat serves both authenticated (full agent) and guest (limited agent) users */}
      <Route path="/chat" component={ChatPage} />
      <Route path="/billing">
        {() => (
          <AuthGuard>
            <BillingPage />
          </AuthGuard>
        )}
      </Route>
      <Route path="/system">
        {() => (
          <AuthGuard>
            <SystemPage />
          </AuthGuard>
        )}
      </Route>
      <Route path="/admin">
        {() => (
          <AuthGuard>
            <AdminDashboard />
          </AuthGuard>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
