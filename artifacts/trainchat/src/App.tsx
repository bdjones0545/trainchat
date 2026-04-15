import { Component, useRef, useState, useEffect, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
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
import { useGetMe, getGetMeQueryKey, setDefaultHeaders } from "@workspace/api-client-react";
import { computeRoute, readDeviceId, type UserMode } from "@/lib/routing";
import { getOrCreateDeviceId } from "@/lib/deviceId";

// Attach the device ID to every API request immediately on module load.
// Anonymous users are identified server-side via this header when there is
// no session cookie (e.g. first visit, HTTP dev environment, strict browsers).
setDefaultHeaders({ "X-Device-Id": getOrCreateDeviceId() });

export type { UserMode };

/**
 * ChatPage — universal entry point for /chat.
 *
 * Phase 3 behaviour: every visitor is immediately bootstrapped into a real
 * anonymous user account via POST /api/auth/bootstrap. This means:
 *   • spinner        — bootstrap in flight (typically <300 ms on first load)
 *   • authenticated  → <Chat />   (includes anonymous users with a real session)
 *   • auth_required  → <Redirect to="/login" />   (session expired mid-use)
 *   • fallback       → <GuestStart />  (only if bootstrap completely failed)
 *
 * Anonymous users use the REAL chat, edit engine, training systems, and
 * mutation verification — no separate guest pipeline.
 */
function ChatPage() {
  const queryClient = useQueryClient();
  // Bootstrap fires immediately on mount, before useGetMe resolves.
  // It creates (or resumes) the anonymous session and seeds the me cache.
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    const deviceId = getOrCreateDeviceId();
    fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ deviceId }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          // Seed the React Query cache immediately so useGetMe reads from cache
          queryClient.setQueryData(getGetMeQueryKey(), data.user);
        }
      })
      .catch(() => {})
      .finally(() => setBootstrapped(true));
  }, [queryClient]);

  const { data: me, isLoading } = useGetMe();

  // Track whether this page instance ever had an authenticated user so that
  // session expiry sends them to /login instead of silently showing fallback.
  const hadUser = useRef(false);
  if (me && !hadUser.current) hadUser.current = true;

  // Show loading spinner while bootstrap or auth check is in flight
  if (!bootstrapped || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (me) return <Chat />;

  // Session expired mid-use (had a real user, now 401)
  if (hadUser.current) return <Redirect to="/login" />;

  // Bootstrap completed but no session was created (network error, storage blocked, etc.)
  // Fall back to the legacy guest flow so the user still sees something useful.
  return <GuestStart userMode="guest" />;
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
