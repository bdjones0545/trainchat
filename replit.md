# TrainChat — AI Performance Architect

## Overview

Agent-first AI training platform. The AI chat is the entire interface. Users register, complete a 10-step onboarding, then interact with an AI performance architect in a 3-panel chat layout (sidebar, chat, training output panel).

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

## Database Schema

- `users` — auth
- `user_profiles` — onboarding profile (10 fields including injuries, sport focus, equipment)
- `conversations` + `messages` — chat history (messages store structuredData as JSON string)
- `saved_programs` + `program_days` + `exercises` — saved training programs
- `readiness_entries` — daily check-in (sleep/energy/soreness/stress/motivation/pain, 1-5)
- `session_feedback` — post-session feedback (difficulty/pain_response/energy_response, 1-5)

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
- Adaptive directive: reduce / maintain / progress
- Injected into AI system prompt alongside training intelligence context
- Wearable integration scaffold: `WearableData` interface + `ingestWearableData()` hook

### AI Service (`api-server/src/lib/ai.ts`)
- `generateAIResponse(userMessage, history, userId, adaptationContext?)` 
- Builds system prompt = core identity + user profile + intelligence context + adaptation context
- Falls back to rule-based program generator using training intelligence engine
- Extracts structured JSON from AI response for right panel display

## UI Components

- `chat.tsx` — 3-panel layout, readiness check-in button, wires all modals
- `ChatOutput.tsx` — right panel: program display with save + feedback buttons
- `MessageBubble.tsx` — markdown-rendering bubbles
- `ReadinessModal.tsx` — 6-metric daily check-in modal (1-5 score buttons)
- `FeedbackModal.tsx` — post-session feedback modal (difficulty/pain/energy)
- `ReadinessSummary.tsx` — compact readiness display in right panel

## Theme

Always dark (no `.dark` toggle — CSS vars in `:root` only). Electric blue primary HSL(199 89% 48%). Inter font. Navy background.

## Auth

Session-based (`express-session`). `SESSION_SECRET` env var required. `credentials: "include"` in `custom-fetch.ts`.

## Phase Scaffold Hooks (Phase 5 ready)

- `ReadinessInput`, `PriorSessionFeedback`, `ProgressionMemory` types in training-intelligence.ts
- `applyReadinessModulation()`, `processSessionFeedback()` stubs
- `WearableData` interface + `ingestWearableData()` stub in adaptation.ts
