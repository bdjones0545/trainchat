# TrainChat — AI Performance Architect

## Overview

TrainChat is an agent-first AI training platform delivering personalized, adaptive training programs and proactive insights through an AI chat interface. It aims to revolutionize personalized fitness coaching by making expert guidance accessible and adaptable. The platform provides a live training workspace for users to interact with their training programs.

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

The project is a monorepo using `pnpm workspaces`, Node.js 24, and TypeScript 5.9. The backend uses Express 5, and the frontend uses React, Vite, and Tailwind v4. PostgreSQL with Drizzle ORM handles data, and Zod is used for validation. API clients are generated from an OpenAPI spec using Orval. The AI core leverages OpenAI's GPT-4o with intelligent fallback mechanisms.

### UI/UX Decisions
The UI features a dark theme with electric blue accents and the Inter font, centered around a 3-panel chat layout, including components for chat output, insights, and interactive elements.

### Technical Implementations
- **AI Core**: Comprises a Training Intelligence Engine, Adaptation Service, Memory Service, and Insights Service, orchestrated by an AI Service with a rule-based fallback.
- **User Management & Billing**: Includes Plan Gating, a Guest Session System with message limits, and Stripe Subscription Billing.
- **Training System Foundation**: A persistent, structured training program with a normalized database schema and API routes.
- **Natural Language Editing**: An engine interprets natural language requests to generate structured `EditPlan` JSON.
- **Versioning & History**: A `system_change_log` tracks operations for history viewing and state restoration.
- **Intelligence Layers**: Includes Daily Readiness Check-Ins, Post-Session Feedback, Coach Insights Panel, Collaborative Decision Layer, and a Memory-Driven Collaboration Layer.
- **Chat-to-Training-System Sync**: Converts chat-generated programs into the structured training system.
- **Program Library & Persistence Model**: Separates active, saved, and builder sessions. `CREATE_PROGRAM` and `START_NEW_PROGRAM` archive existing systems, while edit intents update the current system in-place.
- **Fast Iteration Loop**: Features an always-visible "VibeBar" for quick commands and inline quick actions.
- **Guest-First Onboarding Flow**: Unauthenticated users land directly on the agent at `/chat`, with a three-stage bootstrap gate to ensure smooth transitions and handle guest session management.
- **Agent Decision Architecture**: Utilizes Intent Classification, a Decision Tree for `ActionType` resolution, a 3-Tier Assumption Confidence system, and goal/sport-specific defaults.
- **Exercise Library**: A decision-ready movement system categorized into 12 movement buckets with specialized schema fields, a Swap Cluster System, and Progression Links.
- **Knowledge Base**: Stores coaching philosophy, exercise intelligence, and system rules in a `coaching_knowledge` DB table.
- **Gamification (Neural Growth Layer)**: Tracks user progress via `neural_profiles` with XP, levels, and scores, displayed through overlays and a dashboard.
- **Neural Graph Intelligence Layer**: Interprets `graphState` from `neural_profiles` to generate `NeuralInterpretation`, influencing fallback and AI-generated programs.
- **Program Specialist Decision Layer**: A scoped internal coaching agent converts natural language into structured, prioritized program adjustments.
- **Conversation Memory + Coaching Personality Layer**: Extends `memory.ts` with new memory types (sport context, time constraint, communication/training preferences) to build context-aware AI interactions.
- **Prediction Layer (Coach Forecast)**: A real-time pattern recognition engine generates `PredictionSignal`s (e.g., FATIGUE_RISK), displayed in a `CoachForecast.tsx` component.
- **Auto-Progression Engine**: Utilizes `exercise_logs` to compute `READY_TO_PROGRESS / HOLD / REGRESS` states, with deload detection and integration with the Changes tab.
- **Conditioning / Energy System Engine**: Provides real energy system programming, replacing generic conditioning with structured session templates and weekly plans based on energy system types and modalities, integrating with AI prompts and program architecture.
- **Power & Speed Engine**: Offers real power and speed programming intelligence, defining force-velocity zones, sprint types, and power methods, and building structured sprint and power session templates, integrating with AI prompts and program architecture.
- **Re-Entry / Return-to-Training Engine**: Identifies detrained, inconsistent, or returning users to prescribe phased re-entry plans, detecting various re-entry statuses and generating phase architectures with volume, intensity, and progression rules, and integrating as an AI prompt override.
- **Block Periodization Engine**: Upgrades TrainChat to long-horizon coaching architecture by defining training levels, block types (accumulation, intensification, realization, deload), and goal-specific block structures with associated progression models, and injecting this as AI prompt context.
- **Sport-Specific Architecture Engine**: Replaces generic programming with true sport-shaped architecture by defining `SportProfile`s for 10 sports, including physical qualities, conditioning demands, session archetypes, and season modulation, integrating with AI prompts and program architecture.
- **Return-From-Injury Engine**: Handles users actively returning from injury, pain flares, or tissue-specific setbacks with a distinct conservative, region-aware, symptom-sensitive programming mode, detecting injured regions, severity, and stage to build appropriate context and validation rules for AI.
- **Special Considerations Engine**: Intelligently handles users with physical limitations (older adults, Parkinson's, neurological conditions, etc.), detecting various `SpecialConsiderationType`s to generate archetypes and build tailored AI prompt contexts with specific safety rules and validation.
- **Harder/Easier OpenAI Fallback Resolver** (`harder-easier-fallback.ts`): When a user taps Harder/Easier and the local exercise-library graph has no progressions/regressions for that exercise, a dedicated structured OpenAI resolver activates as "Step 3.5" in `interpretEditRequest`. It sends rich context (exercise name, movement pattern, session, program goal, sport, equipment, injuries) and requires a structured `{ changeType, replacementExerciseName, prescriptionAdjustments, reason }` JSON response. Results are validated (no generic placeholder names allowed), converted to an `EditPlan`, and applied normally. Successfully resolved substitutions are logged to `global_learning_events` and `learning_candidates` for future graph promotion, and the `easierVariations`/`harderVariations` arrays in the exercise library are updated immediately so the next request uses the deterministic path. The fast path is preserved: if the library graph already has alternatives, the fallback never runs.

### System Design Choices
- **Database Schema**: Comprehensive tables for users, profiles, conversations, training programs, readiness, feedback, memories, logs, analytics, Stripe data, and coaching knowledge.
- **Authentication**: Session-based authentication using `express-session` with a PostgreSQL-backed store. Anonymous users are identified via a `deviceId` stored in localStorage.
- **Anonymous User Architecture**: Every visitor is immediately bootstrapped into a real anonymous user account with a `deviceId`, and their data is merged on registration/login.
- **Training System Auto-Creation**: After `CREATE_PROGRAM` or `START_NEW_PROGRAM` intents, the streaming handler automatically calls `createTrainingSystemFromProgram` to persist the AI-generated program.
- **Intelligence Unification Sprint**: All AI edit paths share a unified context pipeline (`UIContext`) injected into every AI call, ensuring consistent memory synchronization.
- **DEFAULT EXECUTION LAYER (Anti-Clarification System)**: Resolves natural-language day/session/week references to concrete DB entity IDs before OpenAI is called, reducing over-clarification and improving the edit path.
- **Modularity & Extensibility**: Services are designed as distinct modules with clear extension points.

## External Dependencies

- **OpenAI**: Core AI capabilities (GPT-4o model).
- **PostgreSQL**: Primary database.
- **Stripe**: Payment gateway for subscriptions.
- **Drizzle ORM**: Database interaction.
- **Zod**: Schema validation.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Frontend styling.
- **Orval**: API client and Zod schema generation.