# TrainChat — AI Performance Architect

## Overview

Agent-first AI training platform. The AI chat is the entire interface. Users register, complete a 10-step onboarding, then interact with an AI performance architect in a 3-panel chat layout (sidebar, chat, training output/intelligence panel).

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24 | **TypeScript**: 5.9 | **Package manager**: pnpm
- **API**: Express 5 (`artifacts/api-server`)
- **Frontend**: React + Vite + Tailwind v4 (`artifacts/trainchat`)
- **Database**: PostgreSQL + Drizzle ORM (`lib/db`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from `lib/api-spec/openapi.yaml`)
- **AI**: OpenAI gpt-4o (optional) with intelligent fallback

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run seed:products` — seed Stripe products & prices (run after connecting Stripe; idempotent)

## Database Schema

- `users` — auth + Stripe fields (stripeCustomerId, stripeSubscriptionId, plan, planStatus, messageCount, tenantId)
- `user_profiles` — onboarding profile (10 fields: goal, experience, style, days, duration, equipment, injuries, sport, preferences, avoid)
- `conversations` + `messages` — chat history (messages store structuredData as JSON string)
- `saved_programs` + `program_days` + `exercises` — saved training programs (programs include weekNumber, blockLabel, parentProgramId, versionNotes for evolution)
- `readiness_entries` — daily check-in (sleep/energy/soreness/stress/motivation/pain, 1-5)
- `session_feedback` — post-session feedback (difficulty/pain_response/energy_response, 1-5)
- `user_memories` — long-term coaching memories (type/subject/sentiment/confidence/source/detail)
- `session_logs` — workout completion log (userId, savedProgramId, dayNumber, sessionType, completedAt, difficultyScore, painScore, energyScore, notes) — Phase 6
- `stripe.*` — full Stripe sync schema (27 tables: accounts, customers, products, prices, subscriptions, etc.) managed by stripe-replit-sync

## Architecture

### Training Intelligence Engine (`api-server/src/lib/training-intelligence.ts`)
- 75-exercise library organized by movement pattern, equipment, difficulty, joint stress, goal bias
- `buildTrainingSpec(profile)` — converts profile to detailed training spec
- `buildIntelligenceContext(profile)` — generates rich prompt context for AI injection
- `selectExercises(filter)` — injury-safe, equipment-aware, goal-biased exercise selection
- Split selector: 2-6+ day schedules with goal/experience logic
- Volume, prescription (sets/reps/rest), progression, fatigue management per goal tier

### Adaptation Service (`api-server/src/lib/adaptation.ts`)
- `buildAdaptationContext(userId)` — reads recent readiness + feedback, computes trend signals
- Trend signals: overallReadiness, sleepTrend, recoveryTrend, painTrend, fatigueAccumulation, trainingTolerance
- Adaptive directive: reduce / maintain / progress — injected into every AI message
- Wearable integration scaffold: `WearableData` interface + `ingestWearableData()` hook (Phase 6 ready)

### Memory Service (`api-server/src/lib/memory.ts`) — Phase 5
- `syncMemoriesFromData(userId)` — extracts memories from profile, readiness, feedback; called on every message (non-blocking)
- `upsertMemory(userId, candidate)` — insert or update by userId+type+subject; confidence-protected (never weakens established memories)
- `listMemories(userId)` — list all memories ordered by updatedAt
- `buildMemoryContext(memories)` — builds `## LONG-TERM MEMORY` prompt block for AI injection
- Memory types: exercise_preference, pain_pattern, session_preference, volume_response, split_preference, recovery_pattern, adherence_pattern
- Extraction sources: onboarding profile, readiness entries (≥3), session feedback (≥3)

### Insights Service (`api-server/src/lib/insights.ts`) — Phase 5
- `generateInsights(userId, memories)` — produces up to 4 high-priority proactive suggestions
- Insight types: deload_suggestion, progression_ready, pain_warning, consistency_positive, schedule_review, sleep_impact, recovery_strength, tolerance_building, program_evolution
- Deduplication + priority sort — only the most relevant insights surface
- `buildInsightPromptHint(insights)` — compact hint injected into AI system prompt

### AI Service (`api-server/src/lib/ai.ts`)
- `generateAIResponse(userMessage, history, userId, adaptationContext?, memoryContext?, insightHint?)`
- System prompt = core identity + user profile + intelligence context + adaptation context + long-term memory + insight hints
- Falls back to rule-based program generator using training intelligence engine
- Extracts structured JSON from AI response for right panel display

### Plan Gating (`api-server/src/lib/planGating.ts`) — Phase 6
- `getUserPlanInfo(userId)` — returns plan, planStatus, features, messagesRemaining
- `getPlanFeatures(plan)` — returns feature flags per plan tier
- Plan tiers: free (5 messages), starter (75 messages, no adaptation/memory), pro/elite (unlimited, full context)
- `isPremium = plan === "pro" || plan === "elite"` — controls program day locking and context injection
- Message count incremented per send; 402 returned at limit

### Stripe Backend (`api-server/src/lib`) — Phase 6
- `stripeClient.ts` — Replit connector API pattern (never caches client); falls back to `STRIPE_SECRET_KEY` env var
- `stripeService.ts` — createCustomer, createCheckoutSession, createPortalSession
- `stripeStorage.ts` — reads from `stripe.*` sync tables; getActiveSubscription, listProductsWithPrices, updateUserStripeInfo
- `webhookHandlers.ts` — delegates to StripeSync.processWebhook; validates Buffer payload

### API Endpoints
- `GET /memories` — list user's long-term memories
- `POST /memories/sync` — trigger memory extraction
- `GET /insights` — get proactive training insights
- `GET /subscription` — current plan info + Stripe subscription
- `GET /subscription/products` — list Stripe products with prices (fetched from sync tables)
- `POST /subscription/checkout` — create Stripe checkout session
- `POST /subscription/confirm` — confirm checkout after redirect
- `POST /subscription/portal` — create Stripe billing portal session
- `GET /session-logs` — list user's workout session logs
- `POST /session-logs` — create a session log entry
- `GET /streak` — get current consecutive session streak
- `GET /admin/analytics` — admin metrics (gated by ADMIN_EMAILS env var)
- `POST /stripe/webhook` — Stripe webhook (registered before json() middleware)

## UI Components

- `chat.tsx` — 3-panel layout; wires subscription, streak, paywall, pricing, session-log, readiness, feedback modals
- `ChatOutput.tsx` — right panel: program display with save + feedback + "Log Session" buttons; day locking for free plan; program evolution badge (Week N / Block label)
- `InsightsPanel.tsx` — right panel: insights cards + memory highlights + wearable placeholder (shown when no program)
- `MessageBubble.tsx` — markdown-rendering bubbles
- `ReadinessModal.tsx` — 6-metric daily check-in modal (1-5 score buttons)
- `FeedbackModal.tsx` — post-session feedback modal (difficulty/pain/energy)
- `ReadinessSummary.tsx` — compact readiness display at top of right panel
- `PaywallModal.tsx` — full-screen paywall triggered at 5 messages; shows messages used + upgrade CTA — Phase 6
- `PricingModal.tsx` — 3-tier plan selector (Starter/Pro/Elite) with monthly/yearly toggle; fetches real price IDs from /api/subscription/products — Phase 6
- `StreakBadge.tsx` — consecutive session streak shown in TopNav extraContent slot — Phase 6
- `SessionLogModal.tsx` — workout completion logger (difficulty/pain/energy 1-5 + notes) — Phase 6
- `TopNav.tsx` — accepts `extraContent?: React.ReactNode` prop for streak badge

## Theme

Always dark (no `.dark` toggle — CSS vars in `:root` only). Electric blue primary HSL(199 89% 48%). Inter font. Navy background.

## Auth

Session-based (`express-session`). `SESSION_SECRET` env var required. `credentials: "include"` in `custom-fetch.ts`.

## Guest Session System (Phase 1 Foundation)

### Architecture
- `lib/db/src/schema/guest-sessions.ts` — `guest_sessions` table
- `artifacts/api-server/src/lib/guestService.ts` — service layer (init, get, update, convert)
- `artifacts/api-server/src/routes/guest.ts` — REST endpoints
- `artifacts/trainchat/src/hooks/useGuestSession.ts` — frontend hook
- `GuestSessionInit` component in `App.tsx` — silent initialization on app load

### guest_sessions Table Fields
id, device_id (unique), status (active/converted/expired/blocked), created_at, updated_at, last_active_at, teaser_uses_count, onboarding_started_at, onboarding_completed_at, first_program_generated_at, paywall_shown_at, converted_at, linked_user_id (FK→users), metadata (jsonb)

### API Endpoints
- `POST /api/guest/session` — init or resume guest session (idempotent; updates lastActiveAt on resume)
- `GET /api/guest/session/:deviceId` — read-only fetch
- `PATCH /api/guest/session/:deviceId` — update markers (for future phases)

### Frontend Hook: useGuestSession(isAuthenticated)
- Generates 32-char hex deviceId via `crypto.getRandomValues()` → stored in `localStorage["trainchat_device_id"]`
- Calls POST /api/guest/session and caches result in `sessionStorage["trainchat_guest_session"]`
- Does nothing when `isAuthenticated = true` — zero interference with logged-in users
- Returns: `{ deviceId, guestSession, guestSessionStatus, loading, error, refresh }`

## Guest Experience Phase 2 — Premium Onboarding + AI Teaser

### New Files
- `artifacts/api-server/src/lib/guestGenerate.ts` — AI generation + fallback service
- `artifacts/trainchat/src/pages/guest-start.tsx` — Multi-step guest experience page

### New API Endpoints
- `POST /api/guest/onboarding` — Saves answers to guest session metadata, marks onboardingCompletedAt
- `POST /api/guest/generate` — Generates personalized AI program from onboarding answers (GPT-4o w/ fallback)
- `POST /api/guest/followup` — Processes one follow-up message with full coach context

### guestGenerate.ts Service
- `generateGuestProgram(deviceId, answers)` — deliberate prompt engineering → GPT-4o → or training-intelligence fallback
- `generateGuestFollowup(deviceId, message)` — context-aware follow-up using stored program + onboarding answers
- Fallback program builder: uses `selectExercises()` from training-intelligence with full/upper-lower split logic

### Guest Onboarding Flow (/start page)
- `idle` → entry hero screen → "Build My Program" CTA  
- `onboarding` → 8 questions, one at a time:  
  1. Primary goal (single-select, auto-advance)  
  2. Experience level (single-select, auto-advance)  
  3. Training frequency (single-select, auto-advance)  
  4. Equipment (multi-select, Continue button)  
  5. Injuries/limitations (text+presets, Continue button)  
  6. Training style (single-select, auto-advance)  
  7. Timeline (single-select, auto-advance)  
  8. Sport/performance focus (single-select, auto-advance → triggers generate)  
- `generating` → animated loading screen ("Your coach is building your plan")  
- `output` → program display with Day 1 expanded + single follow-up input  

### Routing Change (App.tsx)
- Root `/` now uses `SmartRoot`: authenticated → `/chat`, unauthenticated → `/start`
- New route: `/start` → GuestStart page

### Guest Session Fields Used
- `onboardingCompletedAt` — set on POST /api/guest/onboarding
- `firstProgramGeneratedAt` — set on successful generate
- `teaserUsesCount` — 1 after program, 2 after follow-up
- `metadata.onboardingAnswers` — full answer object stored  
- `metadata.firstProgramOutput` — generated GuestProgram stored  

### Phase 2+ Extension Points
- `convertGuestSession(deviceId, userId)` — links guest session to real account post-signup
- `teaserUsesCount` + `status` — ready for teaser/paywall gating logic
- `metadata` (jsonb) — extensible for onboarding answers, analytics markers

## Wearable Integration (Phase 6 ready)

- `WearableData` interface with HRV/restingHR/sleep/readinessScore/trainingLoad/steps
- `ingestWearableData(userId, data)` stub in adaptation.ts
- "Connect wearable" placeholder button in InsightsPanel
