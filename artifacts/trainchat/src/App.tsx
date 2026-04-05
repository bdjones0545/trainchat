import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Chat from "@/pages/chat";
import Onboarding from "@/pages/onboarding";
import GuestStart from "@/pages/guest-start";
import AdminDashboard from "@/pages/admin";
import SystemPage from "@/pages/system";
import BillingPage from "@/pages/billing";
import { useGetMe } from "@workspace/api-client-react";
import { useGuestSession } from "@/hooks/useGuestSession";

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm text-muted-foreground text-center">
            Something went wrong. Please refresh the page.
          </p>
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
 * Initializes the guest session silently on app load.
 * Only runs for unauthenticated visitors — has no effect on logged-in users.
 * Placed inside QueryClientProvider so it can use react-query hooks.
 */
function GuestSessionInit() {
  const { data: me, isLoading: meLoading } = useGetMe();
  const isAuthenticated = !meLoading && !!me;

  useGuestSession(isAuthenticated);

  return null;
}

/**
 * Smart root redirect:
 * - Authenticated + onboarding complete (or existing profile) → /chat
 * - Authenticated + no complete profile → /onboarding (first-time users only)
 * - Unauthenticated → /start (guest experience)
 *
 * The backend self-heals onboardingComplete: any user who already has a
 * complete profile record gets the flag set to true on their next /me call,
 * so returning free users are never bounced back into onboarding.
 */
function SmartRoot() {
  const { data: me, isLoading } = useGetMe();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (me) {
    const destination = me.onboardingComplete ? "/chat" : "/onboarding";
    console.info(
      `[routing] SmartRoot: userId=${me.id} onboardingComplete=${me.onboardingComplete} → ${destination}`,
    );
    return <Redirect to={destination} />;
  }
  return <Redirect to="/start" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={SmartRoot} />
      <Route path="/start" component={GuestStart} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/chat" component={Chat} />
      <Route path="/billing" component={BillingPage} />
      <Route path="/system" component={SystemPage} />
      <Route path="/admin" component={AdminDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <GuestSessionInit />
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
