# TrainChat — AI Performance Architect

## Overview

TrainChat is an agent-first AI training platform designed to provide personalized, adaptive training programs and proactive insights through an AI chat interface. Its primary purpose is to revolutionize personalized fitness coaching by making expert guidance accessible and adaptable, targeting significant market potential in health and fitness technology.

## User Preferences

- The product should feel like "vibe coding your training" — a live training workspace, not a standard chatbot.
- 3-panel layout: left sidebar (conversations + nav), center chat, right Live Program Panel.
- The right panel is a tabbed Live Program Panel with: Program, Changes, and History tabs.
- Empty state shows suggestion chips (pill buttons): "Build my program", "Adjust my split", "Swap exercises", "Reduce fatigue", "Add speed work", "5-day program".
- Program panel header shows a pulsing indicator when a program is active/live.
- When a user has an active training system, the input placeholder changes to "Ask me to adjust your program…" and a green "System active" indicator shows.
- Users get 5 free chat messages before seeing a paywall/signup prompt.
- Mobile: left slide panel for sidebar, right slide panel for Live Program (labeled "Live Program" in header).

## Live Program Panel (Right Panel) — Live Program Engine

The right panel uses `LiveProgramPanel.tsx` which has 3 tabs:
1. **Program** — Shows the program from the DB training system OR the chat draft, whichever exists
2. **Changes** — Fetches from `GET /api/training-system/history` and shows recent AI change log entries with scope badges
3. **History** — Shows major version snapshots from the change log; allows restore via `POST /api/training-system/restore/:id`

### Data Sources (priority order)
- `latestProgram` — chat-derived draft (from AI JSON in messages, only when user has no active system)
- `dbSystemProgram` — derived from `/api/training-system/week` via `transformSystemToProgram()`; shown when `hasActiveSystem=true`
- `displayProgram = latestProgram ?? dbSystemProgram` — what the panel actually renders
- `isInSystem = isSaved || (hasActiveSystem && !latestProgram)` — controls save button visibility

### Key behaviors
- When `hasActiveSystem=true`, the messages effect does NOT restore `latestProgram` from message history (DB is source of truth)
- After "Save to My System": clears `latestProgram`, panel transitions to DB-backed display
- After a vibe edit (AI edits DB system): clears `latestProgram`, `weekData` query is invalidated, panel shows updated DB state
- The "Save to My System" button only appears when there is an unsaved chat draft (`latestProgram && !isSaved`)

## System Architecture

The project is a monorepo utilizing `pnpm workspaces`, Node.js 24, and TypeScript 5.9. The backend is built with Express 5, and the frontend uses React, Vite, and Tailwind v4. PostgreSQL with Drizzle ORM handles data, and Zod is used for validation. API clients are generated from an OpenAPI spec using Orval. The AI core leverages OpenAI's GPT-4o with intelligent fallback mechanisms.

### UI/UX Decisions
The UI features a dark theme with electric blue accents and the Inter font, centered around a 3-panel chat layout. It includes components for chat output, insights, and interactive elements like modals and drawers for editing and feedback.

### Technical Implementations
- **AI Core**: The Training Intelligence Engine generates training specifications, the Adaptation Service adjusts programs based on user feedback, the Memory Service extracts long-term coaching memories, and the Insights Service provides proactive suggestions. The AI Service orchestrates responses by combining various contexts and includes a rule-based fallback.
- **User Management & Billing**: Features include Plan Gating for feature access, a Guest Session System for unauthenticated users with message limits and seamless conversion to full accounts, and Stripe Subscription Billing for recurring payments and subscription management.
- **Training System Foundation**: Implements a persistent, structured training program with a normalized database schema and API routes for management.
- **Natural Language Editing**: An engine interprets natural language requests to generate structured `EditPlan` JSON, supported by an Interactive Editing Workspace for contextual modifications within the UI.
- **Versioning & History**: A `system_change_log` tracks all edit operations, allowing for change history viewing and state restoration.
- **Intelligence Layer**: Incorporates Daily Readiness Check-Ins, Post-Session Feedback, and a Coach Insights Panel that provides proactive suggestions. All edits are contextually aware through adaptive AI.
- **Collaborative Decision Layer**: The Directions Service interprets user intent to offer multiple modification options, enhancing user control over changes.
- **Memory-Driven Collaboration Layer**: The Decision Memory Service extracts structured decision history, detects patterns, and generates memory-aware prompts and callouts for the AI, ensuring continuity and context in interactions.
- **Chat-to-Training-System Sync**: Enables conversion of chat-generated programs into the structured training system, ensuring consistency across different interfaces.
- **Fast Iteration Loop (Vibe Coding Flow)**: Features an always-visible "VibeBar" for quick commands and inline quick actions on exercise cards, allowing for rapid, iterative adjustments to the training plan with instant feedback and undo capabilities.
- **Onboarding Flow**: A multi-step form collects user training preferences, directing users to the chat upon completion.
- **Initial Build Polish (Session 2)**: New builds get a rich `BuildSummaryCard` in chat (shows program name, frequency, goal, sport, duration, CTA). Backend attaches `_buildMeta` to `structuredData` for initial builds (both streaming + non-streaming routes). AI prompt improved with `INITIAL BUILD RESPONSE FORMAT` section: specific confirmation + smart refinement question priority (equipment → duration → experience). Day labels now required to reflect performance intent, not just anatomy. Coach notes required to explain why the structure fits the user's actual goal. `LiveProgramPanel` shows transient "Training system created" success banner after first build. Program description styled more prominently in panel header.

### Agent Decision Architecture
- **Intent Classification** (`intent.ts`): Classifies every user message into structured intent types (CREATE_PROGRAM, EDIT_PROGRAM, ADJUST_FOR_PAIN, etc.) using regex-based pattern matching. Includes `detectSport()` for sport-specific routing.
- **Decision Tree** (`decision.ts`): Resolves `ActionType` (DIRECT_MUTATION, STRUCTURAL_REBUILD, etc.) from the classified intent. The fallback for vague structural requests is always `STRUCTURAL_REBUILD` — never a clarifying question.
- **3-Tier Assumption Confidence**: System prompt encodes TIER 1 (high confidence → act immediately), TIER 2 (medium → smart default + act), TIER 3 (low → one question, then act).
- **Goal-Specific Defaults**: Strength, hypertrophy, athletic/performance, and fat-loss all have explicit assumption defaults baked into the system prompt.
- **Sport-Specific Defaults**: Soccer, basketball, baseball, tennis, track, swimming, and combat sports all have explicit programming biases in the system prompt.

### Knowledge Base (Admin Education System)
- **DB Table**: `coaching_knowledge` — stores philosophy notes, exercise intelligence, system rules, and sport templates.
- **Retrieval** (`knowledge-retrieval.ts`): Context-aware retrieval that scores entries by goal, sport, body region, and tag overlap. Top matching entries are injected into the system prompt at build time.
- **Admin API**: CRUD endpoints at `/api/admin/knowledge` (GET, POST, PUT/:id, DELETE/:id) — all protected by `requireAdmin`.
- **Admin UI**: Knowledge Base tab in `/admin` — add, edit, activate/deactivate, and delete coaching knowledge entries with type, sport, goal, body region, and tag filters.

### Gamification — Neural Growth Layer
- **DB Table**: `neural_profiles` — per-user level, XP, consistency/progression/recovery scores, neural connection count, unlocked milestones (JSONB array), timestamps
- **Backend Service** (`neural-profile-service.ts`): XP award engine with level computation (formula: each level costs 100 more XP than previous, starting 500 for Level 2), milestone detection (8 milestones: first session, 5/20/50 sessions, 3/7/14/30-day streaks), score computation from real session + exercise + readiness data, `awardXpForSession()`, `getOrCreateProfile()`
- **API Routes**: `GET /api/neural-profile` (fetch or auto-create profile), `POST /api/neural-profile/award` (award XP for a session — checks status, streak, perfect session detection, milestone unlocks)
- **NeuralGrowthOverlay** (`gamification/NeuralGrowthOverlay.tsx`): Post-session coaching feedback card. Slides up from bottom. Shows 3 metrics (neural output, movement efficiency, force production) with direction arrows (↑/→/↓/⟳), system update bullets, and connections count. Auto-dismisses at 6s. No XP, no levels, no arcade language.
- **BrainView** (`gamification/BrainView.tsx`): Neural System dashboard modal. SVG network with 16 nodes + up to 40 pulsing active edges. Maturity stage label + progress bar (replaces "level"). Three score bars: Consistency, Progression, Recovery. Sessions logged + "Patterns Formed" count.
- **NeuralBadge** (`gamification/NeuralBadge.tsx`): Compact consistency ring in TopNav (desktop, premium, ≥1 session). Ring fill % = consistencyScore. Color: green (≥70%), amber (40-70%), muted (developing). Small center dot, no level number. Tapping opens BrainView.
- **Wiring**: `SessionFeedback.tsx` calls both `/api/session-logs` and `/api/neural-profile/award` in parallel on submit. Overlay shown after "Got it" button. `handleSessionLog` in `chat.tsx` also awards XP (legacy modal path). `queryClient.invalidateQueries(["neural-profile"])` on dismiss.
- **Tone**: Performance-driven, scientific, coaching language only. No XP, no levels in UI. Every displayed metric traces to real behavior.
- **Internal vs External**: XP/level math is retained internally as a proxy for training volume, but the public API returns only coaching-language data (`maturityLabel`, `maturityProgress`, `neuralFeedback`, performance scores).
- **NeuralFeedback generation** (`generateNeuralFeedback()`): server-side coaching text generator. Produces 3 metrics (neural output, movement efficiency, force production) with direction arrows (↑/→/↓/⟳) and 2-4 system update bullets based on session quality, progression score, readiness, and streak continuity.

### Neural Graph Intelligence Layer (Phase 3) — Program Influence

- **`neural-graph-interpreter.ts`** (new) — pure function module, no DB calls:
  - `interpretNeuralGraph(graphState)` → `NeuralInterpretation { bias, imbalances, adjustments, promptContext, hasMeaningfulData }`
  - `NeuralBias` struct: `{ powerBias, trunkBias, recoveryBias, simplicityBias, strengthBias, lowerBodyBias, upperBodyBias, isActive }` — all 0-1, higher = more emphasis needed
  - Imbalance detection: lower_trunk_gap, strength_power_gap, strength_quality_gap, adherence_risk, upper_lower_gap
  - `applyNeuralBiasToProgram(program, bias, imbalances)` → `{ adapted: ProgramStructure, changeLog: string[] }` — post-hoc program adapter
  - `buildNeuralAdjustmentSummary(adjustments, imbalances)` → coaching-language change log summary
- **Integration points**:
  - `ai.ts`: `AIResponseOptions` + `FallbackOptions` accept `neuralContext`, `neuralBias`, `neuralImbalances`
  - `neuralContext` is injected into the AI system prompt extras array (same level as adaptationContext, memoryContext)
  - `generateFallbackResponse` wraps every `buildIntelligentProgram()` call with `applyNeural()` (applies post-hoc bias when active)
  - `conversations.ts` route loads `graph_state` from `neural_profiles` before every `generateAIResponse` call, interprets it, and passes the three neural params
- **Effect on fallback programs** (when no OpenAI key or API failure):
  - `powerBias > 0.55` → adds a second power exercise (Broad Jump / Lateral Bound / Med Ball Scoop Toss) to each session
  - `trunkBias > 0.55` → increases trunk exercise sets + adds Pallof Press or Dead Bug earlier in session
  - `recoveryBias > 0.6` → removes last conditioning exercise from each session to protect recovery
  - `simplicityBias > 0.65` → removes lowest-priority accessory work
- **Effect on AI programs** (when OpenAI key exists): Neural interpretation is injected as a structured context block in the system prompt. The AI receives node status labels, detected imbalances, and specific programming guidance in coaching language. No raw scores are exposed.
- **Safety**: Neural loading is wrapped in try/catch. If the profile doesn't exist or fails to load, the route proceeds as normal without bias.

### Prediction Layer (Phase 4) — Coach Forecast

- **`prediction-service.ts`** (new) — real-time pattern recognition engine, no DB writes, no stored predictions:
  - `generatePredictions(userId)` → `{ predictions: PredictionSignal[], generatedAt: Date }` — max 3 signals, sorted high→medium→low severity
  - **FATIGUE_RISK**: triggers on elevated average soreness (≥3.5/5), poor sleep (≤2.5/5), low energy, or 3+ recent hard sessions. Evidence text traces back to exact check-in data.
  - **MISSED_SESSION_RISK**: triggers on 2+ skipped/rescheduled sessions in last 10, or partial completions, or low consistency score. Actionable prompt: simplify next session.
  - **PLATEAU_RISK**: detects exercises logged 3+ times with load variation <2.5 lbs AND repeated hard/failed status. Groups by exercise name from exercise_logs.
  - **PROGRESSION_OPPORTUNITY**: triggers when recent sessions all completed, avg energy+motivation ≥3.8/5, ≥65% of reps rated solid/easy, avg session difficulty ≤3.2. Only surfaces when no fatigue risk detected (prevents conflicting signals).
  - **RECOVERY_DIP_RISK**: triggers on declining sleep trend or rising stress trend over last 7 readiness entries. Suppressed if fatigue risk already present.
  - Each `PredictionSignal`: `{ id, type, severity, confidence, title, explanation, evidence, suggestedAction, actionPrompt }`
- **Route**: `GET /api/predictions` (auth required) — no DB writes, read-only from readiness, session, exercise, neural_profiles tables
- **`CoachForecast.tsx`** (new frontend component):
  - React Query with 10-minute stale time. Renders 0-3 prediction cards sorted by severity.
  - Each card: type icon, title, one-line explanation, severity badge, "Show Why" toggle (expands evidence detail), action button
  - "Show Why" → inline expanded evidence panel — specific numbers, session counts, score trends
  - Action button sends `signal.actionPrompt` (pre-written coaching request) directly into the AI chat via `onSendMessage`
  - Three states: active predictions, "All clear" empty state, "Building your pattern" insufficient data state
  - Tone: coaching-language throughout. No diagnostic or alarming framing.
- **`LiveProgramPanel.tsx`** updates:
  - Added `"forecast"` to `Tab` type — fourth tab alongside Program/Changes/History
  - Added `onSendMessage?: (message: string) => void` prop — threads through from `chat.tsx`
  - Added `{ id: "forecast", label: "Forecast", icon: Zap }` to tab bar
  - Tab content: `<CoachForecast onSendMessage={onSendMessage} />` when active
- **`chat.tsx`** update: both `LiveProgramPanel` instances receive `onSendMessage={(msg) => handleSend(msg)}`
- **Data sources read**: `readiness_entries` (sleep, soreness, stress, energy, motivation), `session_logs` (completion status, difficulty), `exercise_logs` (load, reps, completion status), `neural_profiles` (consistencyScore)
- **Safety**: predictions are entirely computed in memory from existing records. No new DB tables, no stored prediction state, no schema changes needed.

### Auto-Progression Engine (exercise-logs.ts + progression.ts)
- **DB Table**: `exercise_logs` — per-exercise performance log (load, reps, sets, RPE, completion status, exercise role)
- **Progression Service** (`progression.ts`): Computes READY_TO_PROGRESS / HOLD / REGRESS state from recent logs. Goal-differentiated (strength: load, hypertrophy: reps/volume, performance: quality+load). Exercise-role-aware (power: intent only; compound: +5-10 lbs; unilateral: +2.5 lbs; accessory: lowest priority).
- **API Routes**: `POST /api/exercise-logs` (log performance), `GET /api/exercise-logs/targets` (get next session targets), `GET /api/exercise-logs/history/:exerciseName` (per-exercise history)
- **Frontend**: `ExerciseLogInline.tsx` — compact inline component per exercise row (premium+saved only). Quick buttons: Easy/Solid/Hard/Failed. Optional expand for weight + reps. Shows "Last: 185 lbs × 5 → Target: 190 lbs × 5". Auto-refetches targets after log.
- **Deload Detection**: detectDeload() — triggers systemChangeLog entry if 3+ failed sets or high overload pattern across recent 10 logged exercises.
- **Changes tab integration**: Deload signals logged as workout_feedback entries in system_change_log.

### System Design Choices
- **Database Schema**: Comprehensive tables for users, profiles, conversations, training programs, readiness, feedback, memories, logs, analytics, Stripe data, and coaching_knowledge.
- **Authentication**: Session-based authentication using `express-session` with a PostgreSQL-backed store, configured for secure operation across environments, including Replit.
- **Modularity & Extensibility**: Services are designed as distinct modules with clear extension points for future integrations.

## External Dependencies

- **OpenAI**: Core AI capabilities (GPT-4o model).
- **PostgreSQL**: Primary database.
- **Stripe**: Payment gateway for subscriptions.
- **Drizzle ORM**: Database interaction.
- **Zod**: Schema validation.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Frontend styling.
- **Orval**: API client and Zod schema generation.