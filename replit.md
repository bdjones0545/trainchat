# TrainChat — AI Performance Architect

## Overview

TrainChat is an agent-first AI training platform where the AI chat serves as the primary user interface. It guides users through a 10-step onboarding process and then connects them with an AI performance architect. The platform aims to provide personalized training programs, adapt to user performance, and offer proactive insights to optimize fitness journeys. Key capabilities include generating customized workout plans, tracking user progress and readiness, and integrating with external services like Stripe for subscription management. The project vision is to revolutionize personalized fitness coaching through AI, making expert guidance accessible and adaptable to individual needs, with significant market potential in the health and fitness technology sector.

## User Preferences

- I prefer a 3-panel chat layout (sidebar, chat, training output/intelligence panel).
- I like to see detailed training output and intelligence in the right panel.
- I expect a clear onboarding process.

## System Architecture

The project utilizes a monorepo structure managed by `pnpm workspaces`, with Node.js 24 and TypeScript 5.9. The backend API is built with Express 5, and the frontend uses React, Vite, and Tailwind v4. PostgreSQL with Drizzle ORM handles database operations, and Zod is used for validation. API codegen is managed by Orval from an OpenAPI specification. The AI core leverages OpenAI's GPT-4o with an intelligent fallback mechanism.

### UI/UX Decisions
The UI features a consistent dark theme with electric blue (HSL(199 89% 48%)) as the primary color and Inter as the font. The main interface is a 3-panel chat layout. Key UI components include:
- `chat.tsx`: Main layout integrating various modals for subscription, streak, paywall, pricing, session logging, readiness, and feedback.
- `ChatOutput.tsx`: Displays the generated program with options to save, provide feedback, and log sessions.
- `InsightsPanel.tsx`: Shows proactive insights, memory highlights, and a wearable integration placeholder.
- `MessageBubble.tsx`: Renders markdown-formatted chat messages.
- Modals for `Readiness`, `Feedback`, `Paywall`, `Pricing`, and `SessionLog` provide structured user input and information.

### Technical Implementations
- **Training Intelligence Engine**: Converts user profiles into detailed training specifications, generates AI prompt contexts, and selects exercises based on filters like injury safety, equipment availability, and goal bias. It also manages volume, prescription, progression, and fatigue based on goal tiers.
- **Adaptation Service**: Reads recent user readiness and feedback to compute trend signals (e.g., overall readiness, recovery trend) and generate adaptive directives (reduce/maintain/progress) for AI messages.
- **Memory Service**: Extracts and stores long-term coaching memories from user interactions (profile, readiness, feedback) to enrich AI context. Memories are protected against weakening established confidence levels.
- **Insights Service**: Generates proactive, high-priority suggestions based on user memories, such as deload suggestions, progression readiness, or pain warnings.
- **AI Service**: Orchestrates AI responses by combining user messages with system prompts, user profiles, intelligence context, adaptation context, long-term memory, and insight hints. It can fall back to a rule-based program generator and extracts structured JSON for UI display.
- **Plan Gating**: Manages feature access and message limits based on user subscription plans (free, starter, pro/elite).
- **Guest Session System**: Provides a foundation for unauthenticated users, managing guest sessions, device IDs, and tracking onboarding progress and interactions.
- **Guest Experience (Premium Onboarding + AI Teaser)**: Enables guest users to experience personalized program generation and a single AI follow-up, with mechanisms for saving onboarding answers and generated programs.
- **Guest Experience (Paywall + Signup/Conversion)**: Implements paywall triggers, user signup/login flows with guest-to-user merge functionality, and funnel analytics to track guest conversion.
- **Stripe Integration**: Handles subscription management, customer creation, checkout sessions, and billing portal access, syncing data to the local PostgreSQL database.

### System Design Choices
- **Database Schema**: Comprehensive schema including `users`, `user_profiles`, `conversations`, `messages`, `saved_programs`, `readiness_entries`, `session_feedback`, `user_memories`, `session_logs`, and `analytics_events`. Stripe-related tables are also managed.
  - **Phase 1 Training System Tables**: `training_systems`, `training_phases`, `training_weeks`, `training_sessions`, `session_exercises` — a full normalized hierarchy supporting the "Your System" persistent training program concept.
- **Auth**: Session-based authentication using `express-session`.
- **Modularity**: Services like `Training Intelligence`, `Adaptation`, `Memory`, `Insights`, and `AI` are designed as distinct modules within the API server.
  - **Training System Service** (`training-system-service.ts`): Generates and retrieves a structured, persistent training system from user profile data. Supports goal-specific (strength, hypertrophy, fat loss, athletic, endurance, general fitness) exercise libraries for multiple equipment types (full gym, dumbbells, bodyweight, minimal).
- **Extensibility**: The guest session system and wearable integration include clear extension points for future features and data types.

### Phase 1 — "Your System" Training System Foundation (April 2026)
- New concept: persistent, structured training system as an "operating system" for the user's training.
- **Database**: 5 new tables (`training_systems`, `training_phases`, `training_weeks`, `training_sessions`, `session_exercises`) with full foreign key relationships and ordering/status fields.
- **API Routes** (all require auth):
  - `GET /api/training-system/active` — shallow active system
  - `GET /api/training-system/full` — full nested system
  - `GET /api/training-system/today` — today's session + exercises
  - `GET /api/training-system/week` — current week + sessions + exercises
  - `GET /api/training-system/block` — current block/phase summary and roadmap
  - `POST /api/training-system/initialize` — idempotent system creation from profile data
- **Frontend**: `/system` page with Today / This Week / Block tabs. Premium card-based layout. Accessible from the TopNav "Your System" button.
- **Navigation**: TopNav updated with persistent Coach | Your System pill navigation (always visible).
- **Phase 2 Readiness**: Each entity has its own ID and status — individual exercise, session, week, and phase objects are addressable for future AI-driven edits. Schema supports partial updates without full regeneration.

### Phase 2 — Natural Language Editing Engine (April 2026)
- **Edit Intent Service** (`edit-intent-service.ts`): Interprets natural language modification requests using GPT-4o (with structured JSON output via `response_format: json_object`). Falls back to a rule-based interpreter when no API key is available. Covers: reduce volume, increase volume, recovery day conversion, exercise swaps, equipment constraints, injury modifications, explosive emphasis, and intensity adjustments. Serializes the full training system hierarchy into a compact context prompt for the AI.
- **Edit Engine** (`edit-engine.ts`): Applies structured `EditPlan` JSON to the database with field allowlists as a safety guard. Supports: `update_exercise`, `replace_exercise`, `delete_exercise`, `update_session`, `update_week`, `update_phase`. Returns applied/skipped counts and change details.
- **Edit API Route**: `POST /api/training-system/edit` — accepts `{ request: string }`, orchestrates interpret → plan → apply → respond with change summary and refreshed data.
- **Frontend Edit Panel**: Collapsible panel at the bottom of the `/system` page. Quick-action suggestion chips + custom textarea input. Shows loading spinner while processing. On success, displays a green `ChangeSummaryBanner` with scope badge and applied count, then auto-dismisses after 12 seconds. Automatically invalidates and refreshes the relevant tab view (Today/Week/Block) based on edit scope.

### Phase 3 — Interactive Editing Workspace (April 2026)
- **Contextual edit entry points**: Every entity in "Your System" now has an AI-powered edit button. Exercise cards show a pencil icon on hover. Session cards have an "Adjust" link. Week summary has "Modify week". Block/phase has "Refocus block". All pass explicit `targetContext` (type + id + label) to the backend.
- **EditDrawer component** (`components/training/EditDrawer.tsx`): A bottom-sheet modal that slides up from the bottom. Shows target type badge (orange=exercise, blue=session, green=week, purple=phase), target label, context-aware quick action chips, and a custom textarea input. Animates in/out with CSS transform transitions. On success: shows green checkmark, coach-summary, and change count, then auto-closes.
- **Context-aware quick actions**: Exercise chips: Swap, Easier variation, Harder variation, Change rep range, Add/Remove set, Make it shoulder-friendly, Add explosive cue. Session chips: Shorten, Lower volume, Recovery emphasis, Equipment-friendly, More explosive, More athletic. Week chips: Deload week, Increase intensity, Reduce fatigue, Travel mode, Add/less volume. Phase chips: Power-focused, Hypertrophy shift, Field-sport, General fitness.
- **targetContext in backend**: `POST /api/training-system/edit` now accepts optional `targetContext: { type, id, label, parentLabel }`. The AI prompt receives an `EDIT FOCUS` section that tells it exactly which entity to target. Rule-based fallback also routes by `targetContext.type`.
- **Change highlighting**: After edits, `changedIds` (exercises, sessions, weeks, phases) are returned from the API and stored in component state as `Set<number>`. Each entity card checks if its ID is highlighted and renders a ring glow + "Updated" badge. Highlights fade after 5 seconds.
- **Session edit history** (`RecentEditsBar`): A collapsible bar between the tabs and content area that appears as soon as any edit is made. Shows "N edits this session", expands to show each edit with scope icon, summary, timestamp, and change count. Stores up to 8 edits in component state (no persistence — Phase 4 will add versioning).
- **changedIds returned from engine**: `edit-engine.ts` now extracts and returns `ChangedIds` from the applied plan, enabling the frontend to know exactly which entity IDs changed.
- **Backend INCREMENT/DECREMENT sentinels**: Edit engine handles `sets: "INCREMENT"` and `sets: "DECREMENT"` from the rule-based fallback for "Add a set" / "Remove a set" targeted exercise edits.
- **Phase 4 readiness**: All edit operations are object-targeted with explicit IDs, edit records have timestamps and scope, `changedIds` structure is ready for before/after snapshots. Extending to a full change log only requires persisting the `EditRecord` array to the DB.

## External Dependencies

- **OpenAI**: Utilized for the core AI performance architect (GPT-4o model).
- **PostgreSQL**: Primary database for all application data.
- **Stripe**: Payment gateway for subscription management, billing, and customer information.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.
- **Zod**: Schema validation library.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Frontend styling framework.
- **Orval**: API client and Zod schema generator from OpenAPI specifications.