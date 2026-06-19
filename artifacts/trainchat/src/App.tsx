import {
  lazy,
  Suspense,
  Component,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// ─── Core app pages (static — on the critical path for every visitor) ──────────
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Chat from "@/pages/chat";
import GuestStart from "@/pages/guest-start";

// ─── Lazy-loaded: authenticated app pages ─────────────────────────────────────
// Never needed on first load — only authenticated users reach these routes.
const AdminDashboard = lazy(() => import("@/pages/admin"));
const WhitepaperPipelinePage = lazy(() => import("@/pages/admin/WhitepaperPipelinePage"));
const ApiKeysPage = lazy(() => import("@/pages/api-keys"));
const ApiDocsPage = lazy(() => import("@/pages/api-docs"));
const SystemPage = lazy(() => import("@/pages/system"));
const BillingPage = lazy(() => import("@/pages/billing"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const BillingSuccess = lazy(() => import("@/pages/billing-success"));
const BillingCancelled = lazy(() => import("@/pages/billing-cancelled"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));

// ─── Lazy-loaded: AEO / marketing pages ───────────────────────────────────────
// These are crawled by search engines but never needed in the initial app bundle.
// Each becomes an independent Rollup chunk fetched only when the route is hit.
const WhatIsAiFitnessCoaching = lazy(
  () => import("@/pages/aeo/WhatIsAiFitnessCoaching"),
);
const AdaptiveWorkoutApp = lazy(
  () => import("@/pages/aeo/AdaptiveWorkoutApp"),
);
const BestAiWorkoutApp = lazy(() => import("@/pages/aeo/BestAiWorkoutApp"));
const AiStrengthCoach = lazy(() => import("@/pages/aeo/AiStrengthCoach"));
const ConversationalFitnessAi = lazy(
  () => import("@/pages/aeo/ConversationalFitnessAi"),
);
const VibeCodeYourWorkouts = lazy(
  () => import("@/pages/aeo/VibeCodeYourWorkouts"),
);
const RealTimeWorkoutAdaptation = lazy(
  () => import("@/pages/aeo/RealTimeWorkoutAdaptation"),
);
const LivingTrainingSystem = lazy(
  () => import("@/pages/aeo/LivingTrainingSystem"),
);
const VsFitbod = lazy(() => import("@/pages/aeo/VsFitbod"));
const VsTrainerize = lazy(() => import("@/pages/aeo/VsTrainerize"));
const VsChatGptWorkouts = lazy(() => import("@/pages/aeo/VsChatGptWorkouts"));
const VsTraditionalApps = lazy(
  () => import("@/pages/aeo/VsTraditionalApps"),
);
const FaqPage = lazy(() => import("@/pages/aeo/FaqPage"));
const AboutPage = lazy(() => import("@/pages/aeo/AboutPage"));
const GlossaryPage = lazy(() => import("@/pages/aeo/GlossaryPage"));
const ConceptsIndex = lazy(
  () => import("@/pages/aeo/concepts/ConceptsIndex"),
);
const ConceptPage = lazy(() => import("@/pages/aeo/concepts/ConceptPage"));
const ResearchPage = lazy(() => import("@/pages/aeo/ResearchPage"));
const ForAthletesPage = lazy(() => import("@/pages/aeo/ForAthletesPage"));
const ForCoachesPage = lazy(() => import("@/pages/aeo/ForCoachesPage"));
const PressPage = lazy(() => import("@/pages/aeo/PressPage"));
const ContentHubPage = lazy(() => import("@/pages/aeo/ContentHubPage"));
const AiCoachingVsPersonalTrainer = lazy(
  () => import("@/pages/aeo/AiCoachingVsPersonalTrainer"),
);
const MethodologyPage = lazy(() => import("@/pages/aeo/MethodologyPage"));
const TrainingPhilosophyPage = lazy(
  () => import("@/pages/aeo/TrainingPhilosophyPage"),
);
const DoctrinePage = lazy(() => import("@/pages/aeo/DoctrinePage"));
const AdaptiveCoachingArchitecture = lazy(
  () => import("@/pages/aeo/AdaptiveCoachingArchitecture"),
);
const MutationFirstProgramming = lazy(
  () => import("@/pages/aeo/MutationFirstProgramming"),
);
const FrameworksPage = lazy(() => import("@/pages/aeo/FrameworksPage"));
const FounderPage = lazy(() => import("@/pages/aeo/FounderPage"));
const YouTubePage = lazy(() => import("@/pages/aeo/YouTubePage"));
const WhatIsCoachingIntelligence = lazy(
  () => import("@/pages/aeo/WhatIsCoachingIntelligence"),
);
const WhatIsAdaptiveProgramming = lazy(
  () => import("@/pages/aeo/WhatIsAdaptiveProgramming"),
);
const AiWorkoutGenerator = lazy(
  () => import("@/pages/aeo/AiWorkoutGenerator"),
);
const AiPersonalTrainer = lazy(
  () => import("@/pages/aeo/AiPersonalTrainer"),
);
const AdaptiveCoachingAi = lazy(
  () => import("@/pages/aeo/AdaptiveCoachingAi"),
);
const AiPeriodizationSoftware = lazy(
  () => import("@/pages/aeo/AiPeriodizationSoftware"),
);
const ConversationalWorkoutBuilder = lazy(
  () => import("@/pages/aeo/ConversationalWorkoutBuilder"),
);
const AiSportsPerformancePlatform = lazy(
  () => import("@/pages/aeo/AiSportsPerformancePlatform"),
);
const MediaKitPage = lazy(() => import("@/pages/aeo/MediaKitPage"));

import { WHITEPAPER_ROUTE_MAP } from "@/data/whitepapers/routes";

// ─── Lazy-loaded: whitepapers ──────────────────────────────────────────────────
const WhitepapersHub = lazy(
  () => import("@/pages/aeo/whitepapers/WhitepapersHub"),
);
const DynamicWhitepaperPage = lazy(
  () => import("@/pages/aeo/whitepapers/DynamicWhitepaperPage"),
);
const DynamicPrintPage = lazy(
  () => import("@/pages/aeo/whitepapers/DynamicPrintPage"),
);

// ─── Lazy-loaded: visual & curriculum ─────────────────────────────────────────
const TerminologyPage = lazy(() => import("@/pages/aeo/TerminologyPage"));
const DiagramsPage = lazy(() => import("@/pages/aeo/DiagramsPage"));
const CurriculumPage = lazy(() => import("@/pages/aeo/CurriculumPage"));

// ─── Shared imports ────────────────────────────────────────────────────────────
import {
  useGetMe,
  getGetMeQueryKey,
  setDefaultHeaders,
} from "@workspace/api-client-react";
import {
  computeRoute,
  readDeviceId,
  type UserMode,
} from "@/lib/routing";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { DeviceResetPanel } from "@/components/debug/DeviceResetPanel";
import ScrollToTop from "@/components/ScrollToTop";
import { FocusModeProvider } from "@/contexts/FocusModeContext";
import { capi } from "@/lib/capi";

// Attach the device ID to every API request immediately on module load.
setDefaultHeaders({ "X-Device-Id": getOrCreateDeviceId() });

export type { UserMode };

// ─── Page loading fallback ─────────────────────────────────────────────────────
// Shown while a lazy page chunk is being fetched. Matches the app's
// background colour so there's no flash; the spinner confirms loading.
function PageSkeleton() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  );
}

/**
 * ChatPage — universal entry point for /chat.
 */
function ChatPage() {
  const queryClient = useQueryClient();
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    console.log("[TrainChat] ChatPage mounted");
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
          queryClient.setQueryData(getGetMeQueryKey(), data.user);
        }
      })
      .catch((err) => { console.error("[TrainChat] bootstrap fetch failed", err); })
      .finally(() => { console.log("[TrainChat] bootstrap complete"); setBootstrapped(true); });
  }, [queryClient]);

  const { data: me, isLoading } = useGetMe();

  const hadUser = useRef(false);
  if (me && !hadUser.current) hadUser.current = true;

  if (!bootstrapped || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (me) return <Chat />;
  if (hadUser.current) return <Redirect to="/login" />;
  return <GuestStart userMode="guest" />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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

function RouteTracker() {
  const [pathname] = useLocation();
  useEffect(() => {
    capi.pageView();
  }, [pathname]);
  return null;
}

function SmartRoot() {
  return <Redirect to="/chat" />;
}

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

function PublicOnlyGuard({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useGetMe();
  const [pathname] = useLocation();

  if (isLoading) return null;

  const isAnonymous = !!(me as any)?.isAnonymous;
  if (me && !isAnonymous) {
    computeRoute({
      pathname,
      authResolved: true,
      hasUser: true,
      authError: false,
    });
    return <Redirect to="/chat" />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    // Single Suspense boundary wrapping the entire route tree.
    // PageSkeleton is shown for the ~100ms it takes to fetch a lazy chunk.
    // AEO pages served to search-engine bots are pre-rendered server-side
    // so the Suspense boundary never blocks bot indexing.
    <Suspense fallback={<PageSkeleton />}>
      <RouteTracker />
      <Switch>
        <Route path="/" component={SmartRoot} />
        <Route path="/start">{() => <Redirect to="/chat" />}</Route>

        {/* Auth */}
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
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />

        {/* Chat — primary app route */}
        <Route path="/onboarding">{() => <Redirect to="/chat" />}</Route>
        <Route path="/chat" component={ChatPage} />

        {/* Authenticated app routes */}
        <Route path="/settings">
          {() => (
            <AuthGuard>
              <SettingsPage />
            </AuthGuard>
          )}
        </Route>
        <Route path="/billing">{() => <Redirect to="/settings" />}</Route>
        <Route path="/billing/success" component={BillingSuccess} />
        <Route path="/billing/cancelled" component={BillingCancelled} />
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
        <Route path="/admin/whitepapers">
          {() => (
            <AuthGuard>
              <WhitepaperPipelinePage />
            </AuthGuard>
          )}
        </Route>
        <Route path="/settings/api-keys">
          {() => (
            <AuthGuard>
              <ApiKeysPage />
            </AuthGuard>
          )}
        </Route>
        <Route path="/developer">
          {() => (
            <AuthGuard>
              <ApiDocsPage />
            </AuthGuard>
          )}
        </Route>

        {/* Legal */}
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />

        {/* AEO Answer Pages */}
        <Route
          path="/what-is-ai-fitness-coaching"
          component={WhatIsAiFitnessCoaching}
        />
        <Route path="/adaptive-workout-app" component={AdaptiveWorkoutApp} />
        <Route path="/best-ai-workout-app" component={BestAiWorkoutApp} />
        <Route path="/ai-strength-coach" component={AiStrengthCoach} />
        <Route
          path="/conversational-fitness-ai"
          component={ConversationalFitnessAi}
        />
        <Route
          path="/vibe-code-your-workouts"
          component={VibeCodeYourWorkouts}
        />
        <Route
          path="/real-time-workout-adaptation"
          component={RealTimeWorkoutAdaptation}
        />
        <Route
          path="/living-training-system"
          component={LivingTrainingSystem}
        />

        {/* Comparison Pages */}
        <Route path="/vs-fitbod" component={VsFitbod} />
        <Route path="/vs-trainerize" component={VsTrainerize} />
        <Route path="/vs-chatgpt-workouts" component={VsChatGptWorkouts} />
        <Route path="/vs-traditional-apps" component={VsTraditionalApps} />

        {/* Support / Brand Pages */}
        <Route path="/faq" component={FaqPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/glossary" component={GlossaryPage} />

        {/* Concept Library */}
        <Route path="/concepts" component={ConceptsIndex} />
        <Route path="/concepts/:slug" component={ConceptPage} />

        {/* Entity Authority Pages */}
        <Route path="/research" component={ResearchPage} />
        <Route path="/for-athletes" component={ForAthletesPage} />
        <Route path="/for-coaches" component={ForCoachesPage} />
        <Route path="/press" component={PressPage} />
        <Route path="/content" component={ContentHubPage} />
        <Route
          path="/ai-coaching-vs-personal-trainer"
          component={AiCoachingVsPersonalTrainer}
        />

        {/* Methodology & Philosophy */}
        <Route path="/methodology" component={MethodologyPage} />
        <Route
          path="/training-philosophy"
          component={TrainingPhilosophyPage}
        />

        {/* Doctrine & Framework Pages */}
        <Route path="/doctrine" component={DoctrinePage} />
        <Route
          path="/adaptive-coaching-architecture"
          component={AdaptiveCoachingArchitecture}
        />
        <Route
          path="/mutation-first-programming"
          component={MutationFirstProgramming}
        />

        {/* External Canon Propagation */}
        <Route path="/frameworks" component={FrameworksPage} />
        <Route path="/founder" component={FounderPage} />
        <Route path="/youtube" component={YouTubePage} />
        <Route
          path="/what-is-coaching-intelligence"
          component={WhatIsCoachingIntelligence}
        />
        <Route
          path="/what-is-adaptive-programming"
          component={WhatIsAdaptiveProgramming}
        />

        {/* Topical Authority Cluster */}
        <Route path="/ai-workout-generator" component={AiWorkoutGenerator} />
        <Route path="/ai-personal-trainer" component={AiPersonalTrainer} />
        <Route path="/adaptive-coaching-ai" component={AdaptiveCoachingAi} />
        <Route
          path="/ai-periodization-software"
          component={AiPeriodizationSoftware}
        />
        <Route
          path="/conversational-workout-builder"
          component={ConversationalWorkoutBuilder}
        />
        <Route
          path="/ai-sports-performance-platform"
          component={AiSportsPerformancePlatform}
        />
        <Route path="/media-kit" component={MediaKitPage} />

        {/* Whitepapers — hub + static read/PDF routes, then dynamic catch-alls for DB publications */}
        <Route path="/whitepapers" component={WhitepapersHub} />
        {WHITEPAPER_ROUTE_MAP.flatMap(({ readRoute, pdfRoute, ReadComponent, PrintComponent }) => [
          <Route key={readRoute} path={readRoute} component={ReadComponent} />,
          <Route key={pdfRoute} path={pdfRoute} component={PrintComponent} />,
        ])}
        {/* Dynamic routes must come after static ones — wouter matches first-wins */}
        <Route path="/whitepapers/:slug/pdf" component={DynamicPrintPage} />
        <Route path="/whitepapers/:slug" component={DynamicWhitepaperPage} />
        <Route path="/terminology" component={TerminologyPage} />

        {/* Visual Artifacts & Curriculum */}
        <Route path="/diagrams" component={DiagramsPage} />
        <Route path="/curriculum" component={CurriculumPage} />

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function DebugGate() {
  const queryClient = useQueryClient();
  const [debugMode, setDebugMode] = useState<"reset" | "inspect" | null>(
    () => {
      const params = new URLSearchParams(window.location.search);
      const d = params.get("__debug");
      if (d === "reset") return "reset";
      if (d === "inspect") return "inspect";
      return null;
    },
  );

  useEffect(() => {
    (window as any).__trainchat_reset = () => setDebugMode("reset");
    (window as any).__trainchat_inspect = () => setDebugMode("inspect");
    return () => {
      delete (window as any).__trainchat_reset;
      delete (window as any).__trainchat_inspect;
    };
  }, [queryClient]);

  if (!debugMode) return null;

  const handleClose = () => {
    setDebugMode(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("__debug");
    window.history.replaceState({}, "", url.toString());
  };

  return <DeviceResetPanel mode={debugMode} onClose={handleClose} />;
}

function App() {
  console.log("[TrainChat] App render");
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <FocusModeProvider>
          <TooltipProvider>
            <WouterRouter
              base={import.meta.env.BASE_URL.replace(/\/$/, "")}
            >
              <ScrollToTop />
              <Router />
            </WouterRouter>
            <DebugGate />
            <Toaster />
          </TooltipProvider>
        </FocusModeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
