# TrainChat — AI Performance Architect

## Overview

TrainChat is an agent-first AI training platform that uses an AI chat as its primary user interface. It guides users through onboarding and connects them with an AI performance architect to deliver personalized, adaptive training programs and proactive insights. The project aims to revolutionize personalized fitness coaching by making expert guidance accessible and adaptable, with significant market potential in health and fitness technology.

## User Preferences

- I prefer a 3-panel chat layout (sidebar, chat, training output/intelligence panel).
- I like to see detailed training output and intelligence in the right panel.
- The product should feel like "vibe coding your training" from the first screen — no pre-signup onboarding forms.
- Users get 5 free chat messages before seeing a paywall/signup prompt.

## System Architecture

The project is built as a monorepo using `pnpm workspaces`, Node.js 24, and TypeScript 5.9. The backend API uses Express 5, while the frontend is developed with React, Vite, and Tailwind v4. PostgreSQL with Drizzle ORM handles database operations, and Zod is used for validation. API client generation is done via Orval from an OpenAPI spec. The AI core utilizes OpenAI's GPT-4o with an intelligent fallback.

### UI/UX Decisions
The UI features a dark theme with electric blue (HSL(199 89% 48%)) as the primary color and Inter font. The main interface is a 3-panel chat layout. Key components include `chat.tsx` for the main layout, `ChatOutput.tsx` for program display, `InsightsPanel.tsx` for proactive insights, and `MessageBubble.tsx` for chat messages, along with various modals for user interaction.

### Technical Implementations
- **Training Intelligence Engine**: Generates detailed training specifications and AI prompt contexts from user profiles, selecting exercises and managing training parameters like volume and progression.
- **Adaptation Service**: Analyzes user readiness and feedback to generate adaptive directives for AI messages.
- **Memory Service**: Extracts and stores long-term coaching memories from user interactions to enrich AI context.
- **Insights Service**: Generates proactive suggestions based on user memories.
- **AI Service**: Orchestrates AI responses by combining various contexts (user messages, system prompts, user profiles, intelligence, adaptation, memory, insights) and can fall back to a rule-based program generator.
- **Plan Gating**: Manages feature access and message limits based on user subscription plans.
- **Guest Session System**: Supports unauthenticated users with a direct-to-agent experience. Users go straight into a real AI chat with no onboarding forms. They get 5 free messages before seeing a paywall. Chat history is persisted in localStorage and the backend, then restored into the user's account on signup/login via `/api/guest/convert`. The `/api/guest/chat` endpoint handles conversational AI for guests, counting messages and enforcing the 5-message limit. No second onboarding after signup — the agent gathers profile info conversationally.
- **Stripe Subscription Billing**: Full recurring billing with Stripe Checkout (monthly/yearly), webhook handling for all subscription lifecycle events (checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid/payment_failed), billing portal access, and subscription-based access control. DB schema tracks `stripePriceId`, `billingInterval`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `trialEnd`. Webhook handlers are idempotent and two-layer: StripeSync (schema sync) + business logic (users table sync). `/billing` page provides full subscription management UI.
- **"Your System" Training System Foundation**: Implements a persistent, structured training program with a normalized database schema (`training_systems`, `training_phases`, `training_weeks`, `training_sessions`, `session_exercises`) and dedicated API routes for accessing and initializing user training systems.
- **Natural Language Editing Engine**: Interprets natural language modification requests using GPT-4o to generate structured `EditPlan` JSON for modifications, with a rule-based fallback.
- **Interactive Editing Workspace**: Provides contextual edit entry points throughout the "Your System" interface, allowing users to modify specific elements (exercises, sessions, weeks, phases) with an `EditDrawer` component and context-aware quick actions.
- **Versioning, Change History, and Reversibility**: Implements a `system_change_log` table to record all edit operations with `beforeSnapshot` and `afterSnapshot` for each change. Provides API routes for accessing history and restoring previous states, with a dedicated "History" tab in the UI.
- **Phase 5 — Intelligence Layer**:
  - **Daily Readiness Check-In** (`ReadinessCheckIn.tsx`): Bottom sheet with 6 emoji-rated dimensions (sleep, energy, soreness, stress, motivation, pain 1–5). Appears as a prompt at the top of the Today tab when no entry exists for today; replaced by a green "Check-in logged today" status after submission. Submits to `POST /api/readiness`.
  - **Post-Session Feedback** (`SessionFeedback.tsx`): Bottom sheet with 3 quick ratings (difficulty, pain, energy-after). Triggered by "Log completed session" button at the bottom of the Today tab. Submits to `POST /api/session-feedback`.
  - **Coach Insights Panel** (`InsightsPanel.tsx`): Fetches `GET /api/insights` and renders up to 3 proactive coach insight cards on the Today tab. Each card supports Apply (calls `POST /api/insights/apply` → full edit pipeline), Modify (opens EditDrawer pre-filled with insight context), and Dismiss (local state). Hidden when no insights are available.
  - **Adaptive AI Edit Context**: Every `POST /api/training-system/edit` call now runs `buildAdaptationContext(userId)` in parallel, injecting readiness trends, feedback patterns, and coaching memories into the AI system prompt so all edits are contextually aware.
  - **Insight-to-Edit Pipeline** (`POST /api/insights/apply`): Maps insight types to natural language edit instructions and runs them through the full edit engine. Logged as `auto_adjust` source in history.
  - **EditDrawer "system" type**: Added `type: "system"` to EditTargetType to support system-level edits from the InsightsPanel Modify flow.
- **Phase A — Collaborative Decision Layer**:
  - **Directions Service** (`directions-service.ts`): Intercepts edit requests before execution. Uses GPT-4o to interpret user intent and generate 2–4 direction options with label, whatWillChange, whyItMatters, and a concrete editRequest. Highly specific requests (detected via regex + AI) bypass directions and execute directly.
  - **Directions Route** (`POST /api/training-system/directions`): New endpoint that loads system context + adaptation context and returns a `DirectionsResponse` with direction cards, a coach message, and optional continuity/memory callouts.
  - **Multi-Phase EditDrawer**: Redesigned to a 4-phase flow — input → directions (card selection) → executing → success. Specific requests skip phase 2. Back navigation supported.
- **Phase B — Memory-Driven Collaboration Layer**:
  - **Decision Memory Service** (`decision-memory-service.ts`): Extracts structured decision history from the `system_change_log` (last 10 edits), detects patterns (volume trends, intensity escalations, injury flags, structural changes, consistency), generates `continuityPrompt` check-in questions, and builds a `decisionMemoryContext` block for AI injection.
  - **Decision Memory in Directions**: Both the directions and edit routes now load long-term memories + decision history in parallel and inject `decisionMemoryContext` into AI prompts. AI generates memory-aware directions and a `memoryCallout` (e.g. "Earlier we reduced your lower body load — building off that here").
  - **Decision Memory in Edit Engine**: `interpretEditRequest` now accepts `decisionMemoryContext` and injects it into the GPT-4o system prompt, enabling the `changeSummary` to reference past decisions naturally.
  - **UI Memory Surfaces**: EditDrawer's directions phase renders a memory callout (subtle clock icon, italic) when past decisions are relevant, and a continuity prompt (chat bubble icon) at the bottom as a coach check-in question.

- **Chat-to-Training-System Sync**:
  - **Root cause fixed**: Chat saves went to `saved_programs`/`program_days`/`exercises` tables, but `/system` reads from `training_systems`/`training_phases`/`training_weeks`/`training_sessions`/`session_exercises` — entirely separate schemas with no bridge.
  - **`createTrainingSystemFromProgram()`** added to `training-system-service.ts`: converts a `ChatProgram` into the full 4-week training system hierarchy. Archives old active system, creates system → phase → weeks → sessions → exercises with proper category mapping (`classification` → `category`), day-of-week assignment (1–6 day templates), and deload week logic (60% exercise subset for week 4).
  - **`POST /api/training-system/from-chat`** added to `training-system.ts`: accepts `ChatProgram` body, calls `createTrainingSystemFromProgram`, returns `{ success, systemId, systemName }`.
  - **`handleSaveProgram`** in `chat.tsx` updated: now saves to both `/api/programs` (legacy, non-fatal) AND `/api/training-system/from-chat` (main fix). After save, invalidates all five training-system React Query cache keys so the `/system` page auto-refreshes.
  - **`EmptySystemState`** in `system.tsx`: added "Build in Chat" primary CTA (navigates to /chat) alongside the existing "Auto-Generate from Profile" button.
  - **Save button label** updated from "Save" to "Save to My System" in `ChatOutput.tsx`.
  - **Bug fix in `ai.ts` line 705**: `generateFallbackResponse` was called with `null` as the `options` argument (via `currentProgram ?? null`), bypassing the `= {}` default and crashing on destructure. Fixed to pass a proper `{ currentProgram, editIntent, intentResult }` object — matching the pattern already used in the catch block.

- **Phase C — Fast Iteration Loop (Vibe Coding Flow)**:
  - **VibeBar** (`system.tsx`): Replaces the collapsed GlobalEditPanel with an always-visible, always-expanded command strip at the bottom of the system page. Three-state machine: `idle → submitting → result`. Idle shows a single-line input + quick-fire chips. Submitting shows a spinner. Result shows the first sentence of the changeSummary with inline refinement chips ("Too much", "More", "Undo", "Refine ↩"). Clicking any refinement chip immediately submits a follow-up edit. "Refine ↩" resets to idle and focuses the input. "Undo" calls the restore API with the `changeLogId` from the last edit result.
  - **Quick-Fire Chips** (VibeBar): Six predefined one-tap commands — "More intense", "Less volume", "Rest day", "Shorter session", "Travel mode", "More explosive" — each wired directly to a full edit request. No drawer, no confirmation. Executes instantly.
  - **Exercise Inline Quick Actions** (`ExerciseCard`): Each exercise card now expands on tap to reveal five action chips: `+Set`, `-Set`, `Swap`, `Easier`, `Harder`. Each chip calls the edit API directly with a targeted request and shows a loading spinner on the active chip. Collapses on completion, highlights the exercise in-place. "Full edit" chip opens the standard EditDrawer for complex requests.
  - **Highlight duration extended** from 5s to 8s to give more time to see what changed.
  - **`changeLogId` added to `EditResult`** type — the backend already returned it, now the frontend uses it for one-click undo in the VibeBar.
  - **`submitQuickEdit` + `restoreChange`** API helpers added to system.tsx for direct exercise quick actions and undo support.

### Onboarding Flow
- The `/onboarding` route renders a 10-step form (`onboarding.tsx`) that collects user training preferences and saves them via `POST /api/profile`.
- Steps 1–6 are required (training goal, experience, style, days/week, session duration, equipment).
- Steps 7–10 are optional text fields (injuries, sport focus, exercise preferences, exercises to avoid) and are submitted as `null` when blank.
- After completing onboarding, users are redirected to `/chat`.
- Routing: unauthenticated → `/start`; authenticated without profile → `/onboarding`; authenticated with profile → `/chat`.
- Registration without a guest session routes to `/onboarding` to collect the profile. Login with `onboardingComplete: false` also routes to `/onboarding`.

### System Design Choices
- **Database Schema**: Includes comprehensive tables for users, profiles, conversations, messages, saved programs, readiness entries, session feedback, user memories, session logs, analytics, Stripe-related data, and `user_sessions` (PostgreSQL session store).
- **Auth**: Session-based authentication using `express-session` with a **PostgreSQL-backed session store** (`connect-pg-simple`, `user_sessions` table). `app.set("trust proxy", 1)` is set so Replit's reverse proxy is trusted. Sessions are explicitly saved via `req.session.save()` before responding in register/login endpoints to prevent race conditions with async stores. Session cookie: `httpOnly`, 7-day TTL. Cookie `secure` and `SameSite` are controlled by `isHttpsContext` (true when `NODE_ENV=production` OR `REPLIT_DOMAINS` is set), so on Replit (dev and prod) the cookie is always `Secure; SameSite=none` — required for iOS Safari / WebKit ITP to send it across Replit's HTTPS proxy. `connect-pg-simple` is externalized from the esbuild bundle to prevent `__dirname` path resolution breakage when it tries to read its internal `table.sql` file.
- **Modularity**: Services are designed as distinct modules within the API server for better organization and maintainability.
- **Extensibility**: Designed with clear extension points for future features like wearable integration.

## External Dependencies

- **OpenAI**: For the core AI performance architect (GPT-4o model).
- **PostgreSQL**: Primary database.
- **Stripe**: Payment gateway for subscriptions.
- **Drizzle ORM**: For database interaction.
- **Zod**: For schema validation.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Frontend styling.
- **Orval**: API client and Zod schema generation.