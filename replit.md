# TrainChat — AI Performance Architect

## Overview

TrainChat is an agent-first AI training platform that uses an AI chat as its primary user interface. It guides users through onboarding and connects them with an AI performance architect to deliver personalized, adaptive training programs and proactive insights. The project aims to revolutionize personalized fitness coaching by making expert guidance accessible and adaptable, with significant market potential in health and fitness technology.

## User Preferences

- I prefer a 3-panel chat layout (sidebar, chat, training output/intelligence panel).
- I like to see detailed training output and intelligence in the right panel.
- I expect a clear onboarding process.

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
- **Guest Session System**: Supports unauthenticated users, tracking onboarding and interactions, with a guest-to-user merge functionality upon signup/conversion.
- **Stripe Integration**: Manages subscriptions, customer creation, and billing portal access, syncing data to PostgreSQL.
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

### System Design Choices
- **Database Schema**: Includes comprehensive tables for users, profiles, conversations, messages, saved programs, readiness entries, session feedback, user memories, session logs, analytics, and Stripe-related data.
- **Auth**: Session-based authentication using `express-session`.
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