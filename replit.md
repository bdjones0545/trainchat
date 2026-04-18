# TrainChat — AI Performance Architect

## Overview

TrainChat is an agent-first AI training platform designed to provide personalized, adaptive training programs and proactive insights through an AI chat interface. Its primary purpose is to make expert fitness coaching accessible and adaptable to a wide audience. The platform features a live training workspace for real-time interaction with training programs, aiming to revolutionize personalized fitness by making expert guidance widely available.

## User Preferences

- The product should feel like "vibe coding your training" — a live training workspace, not a standard chatbot.
- 3-panel layout: left sidebar (conversations + nav), center chat, right Live Program Panel.
- The right panel is a tabbed Live Program Panel with: Program, Changes, and History tabs.
- Empty state shows suggestion chips (pill buttons): "Build my program", "Adjust my split", "Swap exercises", "Reduce fatigue", "Add speed work", "5-day program".
- Program panel header shows a pulsing indicator when a program is active/live.
- When a user has an active training system, the input placeholder changes to "Ask me to adjust your program…" and a green "System active" indicator shows.
- Users get 5 free chat messages before seeing a paywall/signup prompt.
- Mobile: left slide panel for sidebar, right slide panel for Live Program (labeled "Live Program" in header).

## System Architecture

The project is a monorepo utilizing `pnpm workspaces`, Node.js 24, and TypeScript 5.9. The backend is built with Express 5, and the frontend uses React, Vite, and Tailwind v4. Data persistence is handled by PostgreSQL with Drizzle ORM, and Zod is employed for data validation. API clients are automatically generated from an OpenAPI specification using Orval. The AI core is powered by OpenAI's GPT-4o, complemented by intelligent fallback mechanisms.

### UI/UX Decisions
The user interface features a dark theme with electric blue accents and the Inter font, structured around a 3-panel chat layout. Key UI components include chat output, insights displays, and various interactive elements.

### Technical Implementations
- **AI Core**: Orchestrated by an AI Service, it integrates a Training Intelligence Engine, Adaptation Service, Memory Service, and Insights Service, with a rule-based fallback system.
- **User Management**: Includes plan gating, a guest session system with message limits, and Stripe for subscription billing.
- **Training System**: A persistent, structured training program model with a normalized database schema and dedicated API routes.
- **Natural Language Processing**: An engine interprets natural language requests to generate structured `EditPlan` JSON for program adjustments.
- **Versioning**: A `system_change_log` tracks all operations for historical viewing and state restoration.
- **Intelligence Layers**: Incorporates Daily Readiness Check-Ins, Post-Session Feedback, a Coach Insights Panel, Collaborative Decision Layer, and a Memory-Driven Collaboration Layer.
- **Program Sync**: Converts AI-generated chat programs into the structured training system.
- **Program Library**: Manages active, saved, and builder sessions, with specific handling for program creation and updates.
- **Fast Iteration**: Features a "VibeBar" for quick commands and inline quick actions.
- **Onboarding**: A guest-first onboarding flow ensures unauthenticated users can immediately interact with the agent, with data merging upon registration.
- **Agent Decision Architecture**: Employs Intent Classification, a Decision Tree for `ActionType` resolution, and a 3-Tier Assumption Confidence system.
- **Exercise Library**: A categorized movement system with specialized fields, a Swap Cluster System, and Progression Links.
- **Knowledge Base**: Stores coaching philosophy, exercise intelligence, and system rules in a `coaching_knowledge` database table.
- **Gamification (Neural Growth Layer)**: Tracks user progress via `neural_profiles` with XP, levels, and scores.
- **Neural Graph Intelligence Layer**: Interprets `graphState` from `neural_profiles` to generate `NeuralInterpretation` for AI guidance.
- **Program Specialist Decision Layer**: An internal coaching agent converts natural language into structured program adjustments.
- **Conversation Memory**: Extends memory with new types (sport context, time constraint, preferences) for context-aware AI.
- **Prediction Layer**: A real-time pattern recognition engine generates `PredictionSignal`s (e.g., FATIGUE_RISK).
- **Auto-Progression Engine**: Computes `READY_TO_PROGRESS / HOLD / REGRESS` states based on `exercise_logs`.
- **Conditioning / Energy System Engine**: Provides structured energy system programming and session templates.
- **Power & Speed Engine**: Offers intelligence for power and speed programming, including force-velocity zones and session templates.
- **Re-Entry / Return-to-Training Engine**: Detects detrained users and prescribes phased re-entry plans.
- **Block Periodization Engine**: Defines training levels, block types, and goal-specific structures for long-horizon coaching.
- **Hierarchical Program Generation System**: A top-down, 5-layer planning architecture replacing flat session generation:
  1. **Monthly Block Planner** (`monthly-block-planner.ts`) — Determines block type (accumulation, intensification, strength_emphasis, power_conversion, work_capacity, re_entry_resilience, hypertrophy_support) + special population block families (resilience_block, control_block, re_entry_block, low_impact_strength). Outputs MonthlyBlockPlan with primaryAdaptation, secondaryAdaptation, volume/intensity/neural demand profiles, progressionPhilosophy, sportGoalBias, and 4-week arc description.
  2. **Weekly Block Planner** (`weekly-block-planner.ts`) — Generates 4 WeeklyBlockPlans inside the monthly context (Week 1: establish, Week 2: build, Week 3: intensify, Week 4: deload). Each week defines session roles per day, stressAllocation, intensity/volume bias, coachingNotes, and progressionDirective. Block-type session role overlays (`BLOCK_SESSION_ROLE_OVERLAYS`) differentiate session characteristics (warmup bias, intensity ceiling, RPE ranges, CNS demand) per block type — wired into `assignSessionRoles()` via `applyBlockTypeOverlay()`.
  3. **Session Architecture** (`program-architecture-engine.ts`) — Sessions now inherit month goal + week emphasis + session role from the weekly block planner. Session roles drive CNS flow patterns and loading intent. `_lastMonthlyPlan` side-effect stores the resolved monthly block plan for downstream use.
  4. **Exercise Selection** (`exercise-variation-engine.ts`) — `selectSlotExercises()` receives `BlockSelectionContext` (blockType + weekRole) to enrich intent scoring and drive low-fatigue selection for establish/deload weeks.
  5. **Reconciliation** — `enforceVariationMandateOnProgram()` preserved as the final enforcement layer, now with `[BuildAudit:Reconciliation]` logging.
  - Full audit logging pipeline: `[BuildAudit:MonthlyBlock]` → `[BuildAudit:WeeklyBlock]` → `[BuildAudit:SessionRole]` → `[BuildAudit:SlotLayout]` → `[BuildAudit:ExerciseSelection]` → `[BuildAudit:Reconciliation]`
  - **Block Variation Engine** (`artifacts/api-server/src/lib/programs/`): A 5-module anti-repetition engine that prevents the AI from defaulting to the same 4-5 archetypes and exercises on every build. Sits above the existing monthly planner:
    1. `blockArchetypes.ts` — 4 named archetypes (FOUNDATION_ACCUMULATION, INTENSIFICATION_STRENGTH, POWER_ELASTIC_CONVERSION, REBUILD_DELOAD) with set/rep profiles, neural demand, slot weight adjustments, movement biases, suitable goals, preferred/banned splits, and variation tags. Exports `validateArchetypeCoherence()`.
    2. `splitArchitectures.ts` — 6 weekly split structures (LOWER_UPPER_4DAY, FULL_BODY_3DAY, HIGH_LOW_4DAY, ATHLETIC_TOTAL_BODY_4DAY, LOWER_UPPER_POWER_HYPERTROPHY, MOVEMENT_FAMILY_SPLIT) each with `variationSeedRange` that maps to session template variants. Exports `validateSplitArchitectures()`.
    3. `blockScoring.ts` — 10-dimension scoring engine (goal fit, schedule fit, recovery fit, neural fit, novelty bonus, repetition penalty, deload override + seed tiebreaker). `selectBlockAndSplit()` returns top archetype+split pair with full scoring breakdown. `archetypeToMonthlyBlockType()` maps the winner to the existing MonthlyBlockType enum.
    4. `similarity.ts` — Rolling 8-build fingerprint history. `buildFingerprint()` normalizes a build to a struct (archetype, split, top exercises, neural profile, movement distribution). `computeSimilarity()` returns a 0–1 score with weighted components (archetype 35%, split 25%, exercises 20%, tags 10%, neural 10%). Threshold: 0.70. Anti-repetition counts: `getRecentArchetypeCount/SplitCount/BlockTypeCount()`.
    5. `blockRulesAudit.ts` — DEV-only structured audit logging. Emits `[BlockRulesAudit]` JSON lines (full scoring breakdown, chosen archetype+split, similarity score, fallback details, fingerprint) and `[BlockRulesAuditWarning]` for anomalies. Guarded by `NODE_ENV !== "production"`.
    - Integration in `buildArchitectureBrief()` (program-architecture-engine.ts): Before monthly plan build, calls `selectBlockAndSplit()` → patches `_lastMonthlyPlan.displayName` with archetype label (shown in UI via `blockMetadata.blockDisplayName`) → uses split's `variationSeed` for session template variant → runs similarity check → triggers fallback to second-best archetype if threshold exceeded → records fingerprint → emits `[BlockRulesAudit]` → adds `### BLOCK IDENTITY` header to AI prompt.
    - DEV coherence checks fire once on module load: `validateArchetypeCoherence()` + `validateSplitArchitectures()`.
  - **Block Metadata Persistence**: After program generation, `BlockMetadata` (blockType, blockDisplayName, missionStatement, weekProgressionArc, primaryAdaptation, volumeProfile, intensityProfile) is stored in `training_systems.metadata` JSONB via both `createTrainingSystemFromProgram` and `upsertTrainingSystemFromProgram`. Block metadata is also injected into `structuredData` at the conversation save call-sites in `conversations.ts`.
  - **Block Phase Hierarchy UI**: Three surfaces expose the monthly/weekly block context without cluttering the experience: (1) A hierarchy breadcrumb line directly under the program title — "Strength Block · Week 2 of 4 · Build" — followed by a helper sentence from `WEEK_ROLE_COPY` (e.g. "Higher volume and progressive overload this week."). (2) The active tab context strip below the tab bar switches from generic copy ("Current build · live") to a compact phase line ("Strength Block · Week 2 · Build") when viewing the Program tab. (3) A subtle notice bar before the day cards appears only on Deload (week 4) and Intensify (week 3) weeks. Week role (Establish/Build/Intensify/Deload) is derived client-side from `program.weekNumber` via `getWeekRole()`. Block name comes from `blockMetadata.blockDisplayName` (passed as `(activeSystem as any)?.metadata`). Clutter avoided: chips only on notable weeks, no per-card repetition, no timeline or dashboard elements.
- **Sport-Specific Architecture Engine**: Defines `SportProfile`s for various sports, including physical qualities and season modulation.
- **Return-From-Injury Engine**: Handles users returning from injury with a conservative, region-aware programming mode.
- **Exercise Variation Engine — Family Rotation + Decision Hierarchy** (`exercise-variation-engine.ts`): Refactored from penalty-treadmill architecture to a family-rotation + exposure-tracking pipeline with a strict four-tier decision hierarchy.

  **Tier 1 — PRIMARY SELECTORS** (steer which exercise wins):
  - `phaseAffinityFit` (+0 to +2.5): `PHASE_EXERCISE_AFFINITY` table maps `"phase:exerciseName"` → score bonus. Covers establish/build/intensify/deload phases for all major slot families. Example: `"deload:Belt Squat"` = +2.5 → Belt Squat beats Back Squat during deload; `"intensify:Pause Back Squat"` = +2.0 for peak-force weeks.
  - `sportFit`, `blockArchetypeFit`, `intentFit`, `slotIntentFit`, `currentPhaseFit`, `clusterAlternativeBonus`: context-driven positive selection.

  **Tier 2 — ROTATION GATES** (prevent same exercise repeating across weeks):
  - **`BlockExposureTracker`** (exported class): Tracks exercise usage per slot across all 4 weeks of a single build. Intra-block exposure penalties: count=1 → −5, count=2 → −9, count≥3 → −14. Instantiated once per build in `program-architecture-engine.ts`, passed through W1→W4 `selectSlotExercises` calls.
  - **`movementClusterPenalty`**: Cross-family equivalence cluster saturation within a single week. Clusters: `rdl-pattern`, `hip-thrust-pattern`, `deadlift-pattern`, `split-squat-pattern`, `lunge-pattern`, `step-up-pattern`, `horizontal-push`, `vertical-push`. Prevents RDL + SL-RDL same-week domination.

  **Tier 3 — GUARDRAILS** (hard/soft constraints): `equipFit` (−3 hard), `exactRepeatPenalty` (−5 hard), `fatiguePenalty`, `complexityPenalty`, `disallowedFamilyPenalty` (−6), `heroSuppressionPenalty` (−12 max).

  **Tier 4 — SOFT TIEBREAKERS** (demoted cross-build memory, low magnitude):
  - `contrastPenalty`: reduced 3.0/1.5 → 1.5/0.75 (last 2 builds).
  - `slotRepeatPenalty`: reduced 5/3/1.5 → 3/1.5/0.75, high-vis multiplier 1.5 → 1.25 (same slot, last 3 builds).
  - `overusePenalty`: scale reduced 1.2× → 0.4×, cap reduced −6 → −2 (20-build frequency).
  - `noveltyBonus`: was per-exercise anchor-scaled penalty; now a flat +0.5 for ALL exercises (universal soft tiebreaker).

  **Removed entirely:**
  - `ANCHOR_EXTRA_PENALTY` table (Back Squat: −2.5, BSS: −2.5, Zercher: −2.0, etc.) — caused penalty treadmill.
  - `recentUsePenalty` (−2.5 flat for any exercise used in last 5 builds) — superseded by BlockExposureTracker.
  - `isDefaultAnchor` penalty scaling.
  - `getRecentWindowPenalty` function.

  **Audit logs (development only):**
  - `[FamilyRotationAudit]`: per slot pick — slot, week, phase, family, selected, prior block uses, exposure penalty, top-3.
  - `[SelectionDecisionAudit]`: categorised breakdown — `primaryDrivers`, `rotationGates`, `guardrailsApplied`, `legacySignalsApplied`, `phaseAffinityBonus`, `equivalenceClusterHit`.
  - `[ExposureAudit]`: once after all 4 weeks resolve — full slot→exercise→weeks map.
- **Harder/Easier OpenAI Fallback Resolver**: A dedicated structured OpenAI resolver that activates when the local exercise library lacks progressions/regressions, providing rich context and structured JSON responses for exercise substitutions, with learning integration.
- **Intent Family System + Transformation Engine**: Structures natural language into 24 `IntentFamily` types with `TargetScope` resolution, mapping to `TransformationBundle`s with structural change counts, primary/secondary change types, anti-patterns, validation rules, and precise `aiDirective` injection.
- **Session Identity Sync**: A post-mutation guard that ensures session `label` and `emphasis` remain consistent with the session's training intent after any refinement, using both AI prompt instructions and a deterministic fallback with rule-based templates.
- **Hierarchical Refinement System**: Extends the edit pipeline with scope-aware mutation routing. `refinement-scope-resolver.ts` (pattern-only, no LLM) classifies each user message into `session_scope | week_scope | block_scope`. For `week_scope`, `hierarchical-refine-engine.ts` applies a transformation (power/strength/hypertrophy/endurance/recovery/reduce_time) to all exercises in the target week, updating `session_exercises.reps/rest` and `training_sessions.label/emphasis`. For `block_scope`, it rebuilds the `MonthlyBlockPlan` via `buildMonthlyBlockPlanForType`, applies the block-equivalent transformation to all sessions across the entire program, and updates `training_systems.metadata` with the new block info. Both APPLY_MUTATION branches in `conversations.ts` (non-streaming line ~1234, SSE-streaming line ~2621) check scope first and short-circuit to the hierarchical engine when scope > session.
- **Refinement Impact Engine** (`refinement-impact-engine.ts`): Adds intelligent downstream propagation and coach-like acknowledgment to every refinement. Classifies each refinement into one of four impact scopes: `local_only` (cosmetic swap/note), `same_week` (week-level change without progression consequence), `downstream_weeks` (difficulty or pain change that warrants adjusting future weeks), or `full_block` (block-level). Detects movement families (squat/lunge, hinge/deadlift, push/press, pull/row, carry, jump/plyometric, core, conditioning) from exercise names to scope downstream propagation. Detects pain/injury signals and maps them to affected movement families. For `downstream_weeks` scope, automatically softens rest periods in related future exercises (when made easier) or adds monitoring notes (when pain-related). Generates natural, coach-like responses that describe both the immediate change and any downstream effects. Emits `[RefinementImpactAudit]` structured log entries for every refinement for traceability. Integrated into all four edit response points in `conversations.ts`: direct and streaming paths for both hierarchical and session-scope edits.
- **Vibe Coding Interface (Right Panel Behavioral Layer)**: Integrates three refinement surfaces directly into the right panel's Program tab—RefinementChips, SessionRefineActions, and ProgramRefineInput—all routing through the existing `POST /conversations/:id/messages/stream` pipeline for contextual program adjustments.

- **Support Form System**: Three-mode in-app support modal (Contact, Bug Report, Feature Request) accessible from Settings. Submissions are persisted to a `support_submissions` table in Postgres. Powered by SendGrid (`artifacts/api-server/src/lib/email.ts`) — sends an internal admin notification to `Bryan.jones@trainchat.ai` and a branded confirmation email to the user for every submission type. Welcome email fires automatically on new account registration. Gracefully logs and skips email delivery if `SENDGRID_API_KEY` is not configured.
- **Agent Settings Integration Layer**: User preferences (tone, proactive insights, auto-adjust, memory) stored in localStorage are resolved server-side and injected into the AI system prompt for every request. The `suggest_only` intercept prevents plan mutations when Coach Memory is disabled.
- **Privacy & Terms Pages**: Public `/privacy` and `/terms` routes with full policy content, dark theme, mobile-friendly sticky headers, accessible from the billing/settings page.

### System Design Choices
- **Database Schema**: Comprehensive tables for user data, training programs, conversation history, analytics, and coaching knowledge.
- **Authentication**: Session-based using `express-session` with a PostgreSQL store, supporting anonymous users via `deviceId`.
- **Anonymous User Architecture**: All visitors are immediately assigned an anonymous user account, with data merging upon registration.
- **Anonymous → Paid Upgrade Flow**: An `AnonymousUpgradeModal` intercepts checkout for anonymous users, facilitating inline account creation and data preservation during the upgrade process.
- **Training System Auto-Creation**: Automated persistence of AI-generated programs after `CREATE_PROGRAM` or `START_NEW_PROGRAM` intents.
- **Intelligence Unification**: A unified context pipeline (`UIContext`) for all AI calls ensures consistent memory synchronization.
- **DEFAULT EXECUTION LAYER**: Resolves natural-language references to concrete database entity IDs before AI processing to reduce over-clarification.
- **Modularity**: Services are designed as distinct modules with clear extension points.

## External Dependencies

- **OpenAI**: Provides core AI capabilities, specifically using the GPT-4o model.
- **PostgreSQL**: The primary relational database used for data storage.
- **Stripe**: Utilized as the payment gateway for managing user subscriptions and billing.
- **SendGrid**: Transactional email delivery for welcome emails, support notifications, and user confirmations. Configured via `SENDGRID_API_KEY`, `EMAIL_FROM`, and `EMAIL_SUPPORT_TO` environment variables.
- **Drizzle ORM**: An ORM used for interacting with the PostgreSQL database.
- **Zod**: Employed for schema validation across the application.
- **Vite**: The build tool used for the frontend development environment.
- **Tailwind CSS**: The utility-first CSS framework used for styling the frontend.
- **Orval**: Used for generating API clients and Zod schemas from the OpenAPI specification.