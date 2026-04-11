import { Component, type ReactNode } from "react";
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
import { computeRoute, readDeviceId, logRouteDecision, readOnboardingComplete } from "@/lib/routing";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
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
 * Priority: auth state always wins. Guest state is never consulted here.
 *
 * We gate on TWO conditions before deciding:
 *   1. isLoading — no data in cache yet (first ever visit)
 *   2. isFetching && !me — a background refetch is in flight and we have no
 *      confirmed user yet (handles stale error state from a previous 401)
 *
 * Without condition 2, a returning user with a stale 401 cache entry would
 * be immediately sent to /start while their valid session is being confirmed
 * in the background, causing a flash of the guest experience.
 */
function SmartRoot() {
  const { data: me, isLoading, isError, isFetching } = useGetMe();
  const [pathname] = useLocation();

  // Wait for definitive auth state before routing.
  // "isFetching && !me" covers the case where React Query has a stale 401
  // error in cache and is currently re-confirming it in the background.
  if (isLoading || (isFetching && !me)) {
    logRouteDecision({
      pathname,
      authResolved: false,
      hasUser: false,
      authError: isError,
      deviceId: readDeviceId(),
      guestSessionStatus: null,
      onboardingComplete: readOnboardingComplete(),
      target: "loading",
      reason: isLoading ? "initial auth load" : "background refetch in progress — awaiting confirmation",
    });
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  computeRoute({
    pathname,
    authResolved: true,
    hasUser: !!me,
    authError: isError,
    deviceId: readDeviceId(),
  });

  if (me) return <Redirect to="/chat" />;
  return <Redirect to="/start" />;
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
      <Route path="/start">
        {() => (
          <PublicOnlyGuard>
            <GuestStart />
          </PublicOnlyGuard>
        )}
      </Route>
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
      <Route path="/chat" component={Chat} />
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
