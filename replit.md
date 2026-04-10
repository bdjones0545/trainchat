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

## Live Program Panel (Right Panel)

The right panel uses `LiveProgramPanel.tsx` which has 3 tabs:
1. **Program** — Shows the draft program from chat (day cards with exercises, save button, paywall for free users)
2. **Changes** — Fetches from `GET /api/training-system/history` and shows recent AI change log entries with scope badges
3. **History** — Shows major version snapshots from the change log; allows restore via `POST /api/training-system/restore/:id`

The panel shows `InsightsPanel` instead when there is no draft program AND no active training system.

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

### System Design Choices
- **Database Schema**: Comprehensive tables for users, profiles, conversations, training programs, readiness, feedback, memories, logs, analytics, and Stripe data.
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