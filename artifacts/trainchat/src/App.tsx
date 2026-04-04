import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Onboarding from "@/pages/onboarding";
import Chat from "@/pages/chat";
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

function Router() {
  return (
    <Switch>
      <Route path="/">
        <Redirect to="/chat" />
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/chat" component={Chat} />
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
