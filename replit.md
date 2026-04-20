# TrainChat — AI Performance Architect

## Overview

TrainChat is an agent-first AI training platform focused on delivering personalized, adaptive training programs and proactive insights through an AI chat interface. Its core purpose is to make expert fitness coaching widely accessible and adaptable to individual user needs. The platform includes a live training workspace for real-time interaction with programs, aiming to revolutionize personalized fitness by providing expert guidance.

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

The project is a monorepo built with `pnpm workspaces`, Node.js 24, and TypeScript 5.9. The backend uses Express 5, and the frontend is developed with React, Vite, and Tailwind v4. Data is stored in PostgreSQL with Drizzle ORM, and Zod is used for data validation. API clients are automatically generated from an OpenAPI specification using Orval. The AI core leverages OpenAI's GPT-4o, supported by intelligent fallback mechanisms.

### UI/UX Decisions
The user interface features a dark theme with electric blue accents and the Inter font, designed around a 3-panel chat layout. Key UI elements include chat output, insights displays, and interactive components.

### Technical Implementations
- **AI Core**: An AI Service integrates a Training Intelligence Engine, Adaptation Service, Memory Service, and Insights Service, with a rule-based fallback system.
- **User Management**: Includes plan gating, a guest session system with message limits, and Stripe for subscription billing.
- **Training System**: A persistent, structured training program model with a normalized database schema and dedicated API routes.
- **Natural Language Processing**: An engine interprets natural language to generate structured `EditPlan` JSON for program adjustments.
- **Versioning**: A `system_change_log` tracks all operations for historical viewing and state restoration.
- **Intelligence Layers**: Incorporates Daily Readiness Check-Ins, Post-Session Feedback, a Coach Insights Panel, Collaborative Decision Layer, and a Memory-Driven Collaboration Layer.
- **Program Sync**: Converts AI-generated chat programs into the structured training system.
- **Program Library**: Manages active, saved, and builder sessions.
- **Fast Iteration**: Features a "VibeBar" for quick commands and inline quick actions.
- **Onboarding**: A guest-first onboarding flow allows unauthenticated users to interact with the agent, merging data upon registration.
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
- **Hierarchical Program Generation System**: A top-down, 5-layer planning architecture:
  1. **Monthly Block Planner**: Determines block type and outputs `MonthlyBlockPlan`.
  2. **Weekly Block Planner**: Generates 4 `WeeklyBlockPlans` within the monthly context.
  3. **Session Architecture**: Sessions inherit month goal, week emphasis, and session role.
  4. **Exercise Selection**: `selectSlotExercises()` uses `BlockSelectionContext` to enrich intent scoring.
  5. **Reconciliation**: `enforceVariationMandateOnProgram()` as the final enforcement layer.
- **Block Variation Engine**: A 5-module anti-repetition engine preventing repetitive archetypes and exercises, integrated into `buildArchitectureBrief()`.
- **Block Metadata Persistence**: `BlockMetadata` is stored in `training_systems.metadata` JSONB after program generation.
- **Block Phase Hierarchy UI**: Exposes monthly/weekly block context via a breadcrumb line, a compact phase line in the Program tab, and subtle notice bars on specific weeks.
- **Sport-Specific Architecture Engine**: Defines `SportProfile`s for various sports, including physical qualities and season modulation.
- **Return-From-Injury Engine**: Handles users returning from injury with conservative, region-aware programming.
- **Exercise Variation Engine**: Refactored to a family-rotation + exposure-tracking pipeline with a four-tier decision hierarchy for exercise selection, replacing previous penalty-treadmill architecture.
- **Strength Week Expression Engine** (`strength-week-expression.ts`): Library-driven variant selection for 4-week strength blocks. Builds a `ClusterIndex` and `FamilyIndex` from `EXERCISE_EXTENDED_META` at module load. Scores all cluster/family candidates by `complexity`, `stabilityDemand`, and `velocityIntent` for each week role (establish/build/intensify/deload). Returns the top scorer when it outscores the current exercise by ≥ 2 points (`SWAP_THRESHOLD`). W2 always returns null (load progression is the week signal). W4 uses curated-map-first then library fallback for cross-family deload downgrades. The hardcoded `STRENGTH_EXERCISE_VARIANTS` map is now a last-resort fallback only (W3 pause/deficit variants, W4 cross-family downgrades). `TRUNK_ROTATION` and `UPPER_ACCESSORY_ROTATION` pools removed; trunk exercises now have `equivalenceCluster` assignments in the library (`anti-extension-trunk`, `anti-rotation-trunk`, `loaded-carry`, `lateral-trunk`).
- **Harder/Easier OpenAI Fallback Resolver**: A dedicated structured OpenAI resolver for exercise substitutions when local library lacks progressions/regressions.
- **Intent Family System + Transformation Engine**: Structures natural language into 24 `IntentFamily` types with `TargetScope` resolution, mapping to `TransformationBundle`s.
- **Session Identity Sync**: Post-mutation guard ensuring session `label` and `emphasis` consistency.
- **Hierarchical Refinement System**: Extends the edit pipeline with scope-aware mutation routing (`session_scope`, `week_scope`, `block_scope`).
- **Refinement Impact Engine**: Adds intelligent downstream propagation and coach-like acknowledgment to every refinement, classifying impact scopes (`local_only`, `same_week`, `downstream_weeks`, `full_block`).
- **Vibe Coding Interface (Right Panel Behavioral Layer)**: Integrates refinement surfaces (RefinementChips, SessionRefineActions, ProgramRefineInput) into the right panel's Program tab.
- **Sports Intelligence System v2**: Expanded sport registry with new sports and role-based subprofiles, using qualitative AI prompt-injection profiles and quantitative `SportDemandProfile` scoring registry.
- **Support Form System**: Three-mode in-app support modal (Contact, Bug Report, Feature Request) with Postgres persistence and SendGrid email notifications.
- **Agent Settings Integration Layer**: User preferences (tone, proactive insights, auto-adjust, memory) are stored in localStorage and injected into the AI system prompt.
- **Privacy & Terms Pages**: Public `/privacy` and `/terms` routes with policy content.
- **Predictive Adaptation + Memory Dominance**: New features for block projection, next session adjustments based on session logs, and memory dominance for AI overrides.
- **Focus Mode Architecture**: Supports isolated training focus lanes (Strength, Speed, Mobility) with shared core functionalities but isolated programming logic, exercise libraries, and AI prompt contexts. Each mode has its own engine in `artifacts/api-server/src/lib/focus-engines/`. The Strength Architecture Brief (`buildArchitectureBrief`) is gated to `focusMode === "strength"` only so Mobility/Speed modes are never contaminated with strength-specific slot architecture.
- **Mobility Engine**: A complete biomotor logic lane for range of motion restoration, positional control, joint prep, movement quality, end-range control, tissue tolerance, recovery flow, and re-entry support. Implemented in `focus-engines/mobility-engine.ts` with 7 block archetypes, 11 movement families, 8 quick commands, and full monthly block planner integration (`MobilityBlockType` system with 10 variants). The exercise library has 60+ dedicated mobility exercises including Hip/Shoulder/Ankle PAILs/RAILs, CARs, Jefferson Curl, breathing drills, dynamic flows, and recovery protocols.
- **Mobility Intelligence Layer (12-Part Parity)**: Full parity with Strength and Speed engines via `focus-engines/mobility-intelligence.ts`. Implements: (1) `MobilityExposureTracker` class for movement family × exercise × week tracking with penalty rules; (2) 16 `MOBILITY_CLUSTER_DEFINITIONS` (hip rotation, hip flexor, hip articulation, hip PAILs, thoracic rotation, thoracic extension, thoracic CARs, shoulder posterior, shoulder anterior, shoulder CARs, ankle passive, ankle active, ankle calf, breathing reset, dynamic flow, recovery) with suppression rules; (3) `MOBILITY_DOSE_PROFILES` (passive_hold, active_control, cars_articulation, breathing_drill, dynamic_flow, recovery_hold) + `MOBILITY_SESSION_CAPS_BY_WEEK`; (4) `RANGE_PROGRESSION_MODEL` — 4-week arc with range depth, hold durations, complexity, control:range ratio, PAILs/loading gates; (5) `JOINT_DISTRIBUTION_TARGETS` — hip 30%, shoulder 20%, spine 20%, ankle 15%; (6) `buildMobilityPredictiveAdaptationContext` — stiffness/pain/fatigue/adherence signal response rules; (7) `buildMobilitySessionLogInterpretationRules` — maps session feedback to programming decisions; (8) `FLOW_PHASE_SEQUENCE` + `buildFlowContinuityDirective` — enforces tissue_prep → activation_CARs → passive_holds → active_control → dynamic_flow → recovery_exit ordering; (9) `MOBILITY_AGENT_LANGUAGE` — preferred/prohibited vocabulary and coach voice examples; (10) Enhanced `MOBILITY_CONTINUATION_RULES` — 12-entry block transition ladder with escalation/de-escalation rules; (11) `buildMobilityParityCheck()` — runtime validation object; (12) `[MobilityParityCheck]` startup log with `"parity":"FULL_PARITY"` on server boot. Monthly block planner enhanced with week-by-week progression rows and continuation block intelligence per block type.

### System Design Choices
- **Database Schema**: Comprehensive tables for user data, training programs, conversation history, analytics, and coaching knowledge.
- **Authentication**: Session-based using `express-session` with a PostgreSQL store, supporting anonymous users via `deviceId`.
- **Anonymous User Architecture**: All visitors are immediately assigned an anonymous user account, with data merging upon registration.
- **Anonymous → Paid Upgrade Flow**: An `AnonymousUpgradeModal` facilitates inline account creation and data preservation during checkout.
- **Training System Auto-Creation**: Automated persistence of AI-generated programs after `CREATE_PROGRAM` or `START_NEW_PROGRAM` intents.
- **Intelligence Unification**: A unified context pipeline (`UIContext`) ensures consistent memory synchronization for all AI calls.
- **DEFAULT EXECUTION LAYER**: Resolves natural-language references to concrete database entity IDs before AI processing.
- **Modularity**: Services are designed as distinct modules with clear extension points.

## External Dependencies

- **OpenAI**: Provides core AI capabilities, specifically using the GPT-4o model.
- **PostgreSQL**: The primary relational database used for data storage.
- **Stripe**: Utilized as the payment gateway for managing user subscriptions and billing.
- **SendGrid**: Transactional email delivery for welcome emails, support notifications, and user confirmations.
- **Drizzle ORM**: An ORM used for interacting with the PostgreSQL database.
- **Zod**: Employed for schema validation across the application.
- **Vite**: The build tool used for the frontend development environment.
- **Tailwind CSS**: The utility-first CSS framework used for styling the frontend.
- **Orval**: Used for generating API clients and Zod schemas from the OpenAPI specification.
- **html-to-image**: Used for PNG export of share cards in the frontend.