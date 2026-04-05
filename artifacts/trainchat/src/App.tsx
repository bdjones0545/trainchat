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
 * - Authenticated + onboarding complete → /chat
 * - Authenticated + onboarding NOT complete → /onboarding
 * - Unauthenticated users → /start (guest experience)
 */
function SmartRoot() {
  const { data: me, isLoading } = useGetMe();

  if (isLoading) return null;

  if (me) {
    if (me.onboardingComplete) return <Redirect to="/chat" />;
    return <Redirect to="/onboarding" />;
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <GuestSessionInit />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
