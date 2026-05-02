# TrainChat — AI Performance Architect

## Overview
TrainChat is an agent-first AI training platform delivering personalized, adaptive training programs and proactive insights through an AI chat interface. Its core purpose is to make expert fitness coaching widely accessible and adaptable to individual user needs, offering a live training workspace for real-time program interaction. The platform aims to revolutionize personalized fitness with AI-driven expert guidance.

## User Preferences
- The product should feel like "vibe coding your training" — a live training workspace, not a standard chatbot.
- 3-panel layout: left sidebar (conversations + nav), center chat, right Live Program Panel.
- The right panel is a tabbed Live Program Panel with: Program, Adapted, Changes, History, and Forecast tabs.
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
- **AI Core**: Integrates a Training Intelligence Engine, Adaptation Service, Memory Service, and Insights Service with rule-based fallbacks.
- **User Management**: Includes plan gating, guest sessions with message limits, and Stripe for subscriptions.
- **Training System**: Persistent, structured training program model with a normalized database schema and dedicated API routes.
- **Natural Language Processing**: Engine interprets natural language to generate structured `EditPlan` JSON for program adjustments.
- **Versioning**: A `system_change_log` tracks operations for history and state restoration.
- **Intelligence Layers**: Daily Readiness Check-Ins, Post-Session Feedback, Coach Insights Panel, Collaborative Decision Layer, and Memory-Driven Collaboration Layer.
- **Program Sync**: Converts AI-generated chat programs into the structured training system.
- **Program Library**: Manages active, saved, and builder sessions.
- **Fast Iteration**: "VibeBar" for quick commands and inline quick actions.
- **Onboarding**: Guest-first flow, merging data upon registration.
- **Agent Decision Architecture**: Intent Classification, Decision Tree for `ActionType` resolution, and a 3-Tier Assumption Confidence system.
- **Exercise Library**: Categorized movement system with specialized fields, Swap Cluster System, and Progression Links.
- **Knowledge Base**: Stores coaching philosophy, exercise intelligence, and system rules.
- **Shareable Program Card**: AI-generated social card for programs, rendered client-side.
- **Gamification (Neural Growth Layer)**: Tracks user progress via `neural_profiles` with XP, levels, and scores.
- **Neural Graph Intelligence Layer**: Interprets `graphState` from `neural_profiles` for AI guidance.
- **Program Specialist Decision Layer**: Internal coaching agent converts natural language into structured program adjustments.
- **Conversation Memory**: Extends memory with new types (sport context, time constraint, preferences) for context-aware AI.
- **Prediction Layer**: Real-time pattern recognition for `PredictionSignal`s (e.g., FATIGUE_RISK).
- **Auto-Progression Engine**: Computes `READY_TO_PROGRESS / HOLD / REGRESS` states based on `exercise_logs`.
- **Conditioning / Energy System Engine**: Provides structured energy system programming and session templates.
- **Power & Speed Engine**: Offers intelligence for power and speed programming.
- **Re-Entry / Return-to-Training Engine**: Detects detrained users and prescribes phased re-entry plans.
- **Block Periodization Engine**: Defines training levels, block types, and goal-specific structures.
- **Hierarchical Program Generation System**: Top-down, 5-layer planning architecture (Monthly Block Planner, Weekly Block Planner, Session Architecture, Exercise Selection, Reconciliation).
- **Block Variation Engine**: 5-module anti-repetition engine, integrated into `buildArchitectureBrief()`.
- **Block Metadata Persistence**: `BlockMetadata` stored in `training_systems.metadata` JSONB.
- **Block Phase Hierarchy UI**: Exposes monthly/weekly block context in the UI.
- **Sport-Specific Architecture Engine**: Defines `SportProfile`s for various sports.
- **Return-From-Injury Engine**: Handles users returning from injury with conservative, region-aware programming.
- **Exercise Variation Engine**: Refactored to a family-rotation + exposure-tracking pipeline with a four-tier decision hierarchy.
- **Strength Week Expression Engine**: Auditable metadata-first variant selection for 4-week strength blocks with configurable thresholds.
- **Strength Session Depth Expander**: Post-generation hard guarantee that every strength session meets minimum exercise depth.
- **Harder/Easier OpenAI Fallback Resolver**: Dedicated structured OpenAI resolver for exercise substitutions when local library lacks progressions/regressions.
- **Safe Swap Backstop Layer**: Library-first exercise swaps, then approved adjacent movement-family fallbacks, then structured AI proposals.
- **Intent Family System + Transformation Engine**: Structures natural language into 29 `IntentFamily` types with `TargetScope` resolution.
- **Adjustment Intent Classifier**: Richer classification layer producing `AdjustmentIntentClassification` with extracted entities and `PersistenceType`.
- **Adjustment Execution Planner**: Richer entry point calling `classifyAdjustmentIntent` → scope resolution → full `AdjustmentExecutionPlan`.
- **Constraint Compliance Verifier**: Second-layer semantic verification after mutation, checking equipment, movement patterns, and pain regions.
- **Adjustment Response Templates**: Per-family, per-verification-status response strings for all 29 intent families.
- **Session Identity Sync**: Post-mutation guard ensuring session `label` and `emphasis` consistency.
- **Hierarchical Refinement System**: Extends the edit pipeline with scope-aware mutation routing.
- **Refinement Impact Engine**: Adds intelligent downstream propagation and coach-like acknowledgment to every refinement.
- **Vibe Coding Interface**: Integrates refinement surfaces into the right panel's Program tab.
- **Focus-Aware Quick Commands**: Right-panel and edit-drawer quick commands generated through a shared focus/block/session-aware command generator.
- **Sports Intelligence System v2**: Expanded sport registry with new sports and role-based subprofiles.
- **Support Form System**: Three-mode in-app support modal with Postgres persistence and SendGrid email notifications.
- **Agent Settings Integration Layer**: User preferences stored and injected into the AI system prompt.
- **Privacy & Terms Pages**: Public `/privacy` and `/terms` routes with policy content.
- **Predictive Adaptation + Memory Dominance**: Block projection, next session adjustments, and AI override capabilities.
- **Focus Mode Architecture**: Supports isolated training focus lanes (Strength, Speed, Mobility) with dedicated programming logic and AI contexts.
- **Mobility Engine**: Complete biomotor logic lane for range of motion restoration with specific block archetypes, movement families, and exercises.
- **System Adjustments Layer**: Visible adaptation intelligence surface, persisting `SystemAdjustmentEvent` rows and displayed in the "Adapted" tab.
- **Coach Reasoning Layer**: Deterministic, zero-cost template engine generating short 1-2 sentence "Coach Insight" after every build, edit, and check-in adaptation.
- **Mobility Intelligence Layer**: Full parity with Strength and Speed engines, implementing exposure tracking, cluster definitions, dose profiles, progression models, joint distribution targets, and predictive adaptation.
- **Fail-Safe Rules Layer**: Shared guardrail classifier for real-world edge-case inputs, applying deterministic strategies and injecting fail-safe prompt context.
- **Final Response Alignment Verifier**: Synchronous post-generation verifier checking consistency across narration, action contract, mutation outcome, and final payload.
- **Cross-Turn Constraint Memory Enforcement**: Automatically persists user-stated constraints and enforces them in future program generations.
- **Duplicate-Safe Add Exercise Layer**: Blocks same-day duplicate and near-duplicate exercise additions across all producers.
- **Thinking UX Shell**: Upgraded loading/thinking modal into a full conversational agent progress experience with named modes and stage checklists.
- **Adaptive Micro-Reasoning Layer**: Generates short, coach-voiced explanations for key decisions during program generation or mutation.
- **Constraint-Aware Exercise Selection Engine**: Moves constraint enforcement upstream into exercise selection, making invalid selections structurally impossible.
- **Agent Pre-Launch Hardening**: Five production-safety layers: CAT 8 Messy-Language Scenarios, Latency & Reliability Tracking, Production-Safe Fallback Responses, Abuse / Loop Prevention, and Verification Mismatch Fallback.
- **Research-Informed Programming Layer**: Translates retrieved research chunks into structured programming constraints injected directly into the system prompt and mutation prompts. `buildResearchProgrammingGuidance()` maps evidence tags to 7 concrete programming dimensions (volume, intensity, exercise selection, progression, recovery, safety, contraindications) with a `confidenceLevel`. Injected into program generation via `## RESEARCH-INFORMED PROGRAMMING GUIDANCE` section, and also into Harder/Easier and Swap mutation prompts via compact formatters. Dev-only debug logging: `[ResearchProgrammingDebug]`, `[HarderEasierResearchDebug]`, `[SwapResearchDebug]`. Pain/safety constraints always override research suggestions.
- **Weekly Research Update Cycle (Week 1)**: 3 curated pending documents covering the top 3 knowledge gaps identified via gap analysis. Docs: Hypertrophy Science Fundamentals (doc 23, strength_conditioning), Recovery and Fatigue Management Protocols (doc 24, recovery_wellness), Concurrent Training — Strength + Endurance (doc 25, strength_conditioning). All inserted as `status: "pending"`, `isActive: false`, `source: "Weekly Curated Update"`, `librarianRecommendation: "needs_review"`. Yield 5 chunks each = 15 total pending chunks. Admin must approve via `POST /api/admin/research/:id/approve` before they enter retrieval. New retriever tags: `hypertrophy`, `muscle_growth`, `rep_ranges`, `training_frequency`, `concurrent_training`, `interference_effect`, `fatigue_management`. Admin seed route: `POST /api/admin/research/seed-weekly-update-week1`. Week 2 candidates: Protein/Nutrition (nutrition category currently empty), Plyometrics standalone. QA Phase 9 added to `RESEARCH_PROGRAMMING_QA.md`.
- **Strength Research Library**: 10 curated seed documents seeded into `research_documents` + `research_chunks` tables (category: `strength_conditioning`). Topics: Max Strength Programming, Volume + Frequency, Progressive Overload, Rest Periods, Exercise Selection, Beginner Strength, Strength with Pain/Limitations, Strength + Athletic Performance, Strength Periodization, Strength for Older Adults. All docs: `status: "approved"`, `is_active: true`, `trust_level: "high"`. Each yields 5 chunks = 50 total chunks. Retriever tag expansions added for `strength`, `max_strength`, `progressive_overload`, `periodization`, `rest_periods`, `exercise_selection`, `movement_patterns`, `motor_learning`, `athletic_performance`, `deload`, `functional_strength`, `joint_friendly`, `volume`, `frequency`. Programming guidance dimensions (all 7) extended with strength-specific, beginner, older-adult, athletic, and pain-context handlers. Coach identity prompt updated with `## RESEARCH APPLICATION — STRENGTH` section. Admin seed route: `POST /api/admin/research/seed-strength`.
- **Speed + Mobility Research Library**: 12 curated seed documents (6 speed, 6 mobility) seeded into `research_documents` + `research_chunks` tables. Speed topics: Sprint Acceleration, Max Velocity, Plyometric Dosage, COD & Deceleration, Strength-Speed/Force-Velocity, Speed Fatigue Management. Mobility topics: Mobility vs Flexibility, Dynamic Warm-Ups, Hip Mobility, Ankle Mobility, Thoracic Mobility, Mobility + Injury Risk (conservative framing). All documents: `status: "approved"`, `is_active: true`, `trust_level: "high"`, `category: "sport_performance"`. Each document yields 5 chunks (summary, coaching_implications, programming_implications, safety, limitations) — 60 total chunks. Retriever tag expansions added for speed/mobility keywords. Programming guidance dimensions (all 7) extended with speed and mobility handlers. Coach identity prompt updated with `## RESEARCH APPLICATION — SPEED AND MOBILITY` section. Admin seed route: `POST /api/admin/research/seed-speed-mobility`. QA documentation: `RESEARCH_PROGRAMMING_QA.md`.
- **Agent Orchestration Layer**: Central coordination layer (`src/agents/agent-orchestrator.ts`) formally defining the three-agent architecture. Coach Agent (`lib/ai.ts`) = user-facing AI, handles all chat; Performance Architect (`lib/program-architecture-engine.ts`) = deterministic brief generator, invoked on BUILD paths only; Research Librarian (`research/research-librarian-agent.ts`) = admin-only AI agent, never called during user chat. Provides: typed `OrchestratorRoute` enum (DIRECT_EDIT, BUILD_WITH_ARCHITECT, GUIDANCE, RETRIEVE, LIBRARIAN_ADMIN, NO_OP), typed handoff contracts (`CoachToArchitectHandoff`, `ArchitectToCoachHandoff`, `LibrarianToResearchDatabaseHandoff`), typed `CONFLICT_RESOLUTION_HIERARCHY` (5-tier: SAFETY > MOVEMENT_QUALITY > GOAL_OUTPUT > FATIGUE_MANAGEMENT > USER_PREFERENCE), architecture validation gate (`validateArchitectureGate()` — non-blocking, focus-mode-aware), structured observability logging (4 functions, all tagged `[AgentOrchestrator]`), agent boundary guards (`assertLibrarianIsAdminOnly`, `assertArchitectSkippedOnEditPath`). Agent boundary markers added to: `lib/ai.ts`, `lib/program-architecture-engine.ts`, `research/research-librarian-agent.ts`. QA documentation: `AGENT_ORCHESTRATION_QA.md` (27 test scenarios across 5 groups + invariant checklist).

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
- **OpenAI**: Core AI capabilities using GPT-4o.
- **PostgreSQL**: Primary relational database.
- **Stripe**: Payment gateway for subscriptions.
- **SendGrid**: Transactional email delivery.
- **Drizzle ORM**: ORM for PostgreSQL.
- **Zod**: Schema validation.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Frontend styling framework.
- **Orval**: API client and Zod schema generation.
- **html-to-image**: PNG export of share cards.