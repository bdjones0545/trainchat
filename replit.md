# TrainChat — AI Performance Architect

## Overview

TrainChat is an agent-first AI training platform focused on delivering personalized, adaptive training programs and proactive insights through an AI chat interface. It aims to revolutionize personalized fitness coaching by making expert guidance accessible and adaptable, targeting significant market potential in health and fitness technology. The platform provides a live training workspace for users to interact with their training programs.

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

The project is a monorepo using `pnpm workspaces`, Node.js 24, and TypeScript 5.9. The backend is built with Express 5, and the frontend uses React, Vite, and Tailwind v4. PostgreSQL with Drizzle ORM handles data, and Zod is used for validation. API clients are generated from an OpenAPI spec using Orval. The AI core leverages OpenAI's GPT-4o with intelligent fallback mechanisms.

### UI/UX Decisions
The UI features a dark theme with electric blue accents and the Inter font, centered around a 3-panel chat layout. It includes components for chat output, insights, and interactive elements for editing and feedback.

### Technical Implementations
- **AI Core**: Comprises a Training Intelligence Engine, Adaptation Service, Memory Service, and Insights Service, all orchestrated by an AI Service with a rule-based fallback.
- **User Management & Billing**: Includes Plan Gating, a Guest Session System with message limits, and Stripe Subscription Billing.
- **Training System Foundation**: A persistent, structured training program with a normalized database schema and API routes.
- **Natural Language Editing**: An engine interprets natural language requests to generate structured `EditPlan` JSON, supported by an Interactive Editing Workspace.
- **Versioning & History**: A `system_change_log` tracks operations for history viewing and state restoration.
- **Intelligence Layer**: Incorporates Daily Readiness Check-Ins, Post-Session Feedback, and a Coach Insights Panel.
- **Collaborative Decision Layer**: A Directions Service interprets user intent to offer multiple modification options.
- **Memory-Driven Collaboration Layer**: A Decision Memory Service extracts structured decision history for context-aware AI interactions.
- **Chat-to-Training-System Sync**: Converts chat-generated programs into the structured training system.
- **Fast Iteration Loop (Vibe Coding Flow)**: Features an always-visible "VibeBar" for quick commands and inline quick actions on exercise cards.
- **Onboarding Flow (Guest-First)**: No login wall on entry. Unauthenticated users land directly on the agent at `/chat` via a `ChatPage` component that branches between `Chat` (authenticated) and `GuestStart` (guest). The `/start` route now redirects to `/chat`. `SmartRoot` at `/` sends all visitors to `/chat`. Auth retry on 401 is disabled for instant guest mode transition. GuestStart shows a "GUEST" badge, a free inputs counter in the nav, and a "5 free messages included" note. After 5 messages, a paywall prompts signup. Guest identity is tied to a `deviceId` in `localStorage`, backed by a `guest_sessions` DB record for server-side abuse prevention.
- **Agent Decision Architecture**: Utilizes Intent Classification to categorize user messages and a Decision Tree to resolve `ActionType`, employing a 3-Tier Assumption Confidence system and goal/sport-specific defaults.
- **Exercise Library**: A decision-ready movement system focusing on depth over count, categorized into 12 movement buckets with new schema fields (`role`, `neuralDemand`, `timeCost`, `sportTransferTags`), a Swap Cluster System, and Progression Links.
- **Knowledge Base**: Stores coaching philosophy, exercise intelligence, and system rules in a `coaching_knowledge` DB table with context-aware retrieval and an admin interface.
- **Gamification (Neural Growth Layer)**: Tracks user progress via `neural_profiles` with XP, levels, consistency/progression/recovery scores, and milestones. Features a `NeuralGrowthOverlay` for post-session feedback and a `BrainView` dashboard.
- **Neural Graph Intelligence Layer**: Interprets `graphState` from `neural_profiles` to generate `NeuralInterpretation` (bias, imbalances, adjustments) which influences both fallback and AI-generated programs by injecting structured context.
- **Program Specialist Decision Layer**: A scoped internal coaching agent (`program-specialist.ts`) converts natural language into structured, prioritized program adjustments based on 12 intent types, supporting multi-intent requests and generating human-readable change summaries.
- **Conversation Memory + Coaching Personality Layer**: Extends `memory.ts` with new memory types (sport context, time constraint, communication/training preferences) extracted from messages, which are used to build a memory context for the AI. The base AI prompt is upgraded with a specific coaching personality and rules for memory-aware coaching.
- **Prediction Layer (Coach Forecast)**: A real-time pattern recognition engine (`prediction-service.ts`) generates up to 3 `PredictionSignal`s (e.g., FATIGUE_RISK, MISSED_SESSION_RISK, PLATEAU_RISK, PROGRESSION_OPPORTUNITY) based on user data, displayed in a `CoachForecast.tsx` component that allows users to send suggested actions directly to the AI chat.
- **Auto-Progression Engine**: Utilizes `exercise_logs` to compute `READY_TO_PROGRESS / HOLD / REGRESS` states, goal-differentiated and exercise-role-aware. It also includes deload detection and integrates with the Changes tab.

### System Design Choices
- **Database Schema**: Comprehensive tables for users, profiles, conversations, training programs, readiness, feedback, memories, logs, analytics, Stripe data, and coaching_knowledge.
- **Authentication**: Session-based authentication using `express-session` with a PostgreSQL-backed store.
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