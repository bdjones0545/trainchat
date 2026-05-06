# TrainChat — AI Performance Architect

## Overview
TrainChat is an agent-first AI training platform that provides personalized, adaptive training programs and proactive insights through an AI chat interface. Its main purpose is to make expert fitness coaching accessible and adaptable to individual user needs, offering a live training workspace for real-time program interaction. The platform aims to revolutionize personalized fitness with AI-driven expert guidance, focusing on a "vibe coding your training" experience rather than a traditional chatbot.

## User Preferences
- The product should feel like "vibe coding your training" — a live training workspace, not a standard chatbot.
- 3-panel layout: left sidebar (conversations + nav), center chat, right Live Program Panel.
- The right panel is a tabbed Live Program Panel with: Program, Adapted, Changes, History, and Forecast tabs.
- **First-run guided entry**: new users (no system, no messages) see "Build your training system" + "Tell me what you want to train, and I'll build it with you." with chips grouped by category — Strength, Speed, Mobility, General. Disappears automatically once a system exists. Returning users continue to see focus-mode-specific chips.
- Empty state (returning users) shows suggestion chips (pill buttons) scoped to the active focus mode.
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
- **Agent Decision Architecture**: Features Intent Classification, a Decision Tree for `ActionType` resolution, and a 3-Tier Assumption Confidence system.
- **Intelligence Layers**: Incorporates Daily Readiness Check-Ins, Post-Session Feedback, Coach Insights Panel, Collaborative Decision Layer, and Memory-Driven Collaboration Layer.
- **Program Generation Engines**: Includes Hierarchical Program Generation, Block Variation, Sport-Specific Architecture, Mobility, Conditioning/Energy System, Power & Speed, and Re-Entry/Return-to-Training engines.
- **Research-Informed Programming Layer**: Translates retrieved research chunks into structured programming constraints injected into the system prompt.
- **Agent Orchestration Layer**: Central coordination layer defining a three-agent architecture (Coach, Performance Architect, Research Librarian) with typed handoff contracts and conflict resolution hierarchy.
- **Conversation Memory**: Extends memory with sport context, time constraints, and preferences for context-aware AI.
- **Adaptive Micro-Reasoning Layer**: Generates short, coach-voiced explanations for key decisions.

### System Design Choices
- **Database Schema**: Comprehensive tables for user data, training programs, conversation history, analytics, and coaching knowledge.
- **Authentication**: Session-based using `express-session` with a PostgreSQL store, supporting anonymous users via `deviceId`.
- **Anonymous User Architecture**: All visitors are immediately assigned an anonymous user account, with data merging upon registration.
- **Intelligence Unification**: A unified context pipeline (`UIContext`) ensures consistent memory synchronization for all AI calls.
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

## UX Clarity Pass (May 2026)
- **Summary card**: Compact identity card above the tab bar when a system is active — shows program name, focus badge, week number, last-updated time, and latest change summary.
- **Specific success banners**: `triggerSuccessOverlay(message)` now accepts a label; each caller passes a contextual string (chip label, "Day 2 shortened", "Exercise swapped", "Made easier", etc.) instead of the generic "Program Updated".
- **Day-level highlights**: When `newChangeSignal` fires with no exercise-specific `changeTargets`, the currently expanded day card gets a brief `ring-primary/50` ring for 3.2 s so session-level edits are visually located.
- **Post-edit chat rule**: CHAT RESPONSE RULE in `ai.ts` now mandates what-changed / why / what-stayed in 2–3 sentences with coach voice; generic "Program updated" is explicitly forbidden.
- **Changes tab**: Both progression and regular entries now surface `decisionMetadata.coachExplanation` (falling back to `whyChanged`) in an italic `↳` line for richer context.
- **Copy safety**: "heavier primary work" → "more challenging primary sessions"; "heavier loads" → "higher intensity"; "heavier rep ranges" → "rep ranges and difficulty shifted upward" across 3 service files.

## QA Bug Fixes (May 2026 batch)
- **BUG-01** — `VAGUE_IMPROVEMENT_PATTERNS` guard in `execution-planner.ts` (STEP 3.6): "make it better / improve it / optimize it" always routes to `ASK_CLARIFICATION`, never `REBUILD_PROGRAM`.
- **BUG-02** — Mobility session regression: `focusMode === "mobility"` + resolved day + "shorter/easier/gentler" → deterministic `day_regression` mutation, avoids AI edit-plan failure path.
- **BUG-03** — Changes tab free preview: non-premium users see `FreeChangesPreview` (last 3 entries + upgrade CTA at bottom) instead of a full `TabLockedView` lock screen. History and Forecast remain fully gated.
- **BUG-04** — Tab bar scroll: `overflow-x-auto` + `flex-shrink-0 whitespace-nowrap` on each tab button — all 5 tabs reachable on 400 px mobile.
- **BUG-05** — Locked day cards (Days 2+): exercise names visible at `opacity-50`, sets×reps shown, "Upgrade to edit & adapt all days" CTA below list. No longer blank opaque cards.
- **AgentTurnReport** — Suppressed entirely when `!receipt && !panelReceipt` (avoids "NO RECEIPT" noise on normal edit paths in DEV).

## Research Discovery Pipeline (May 2026)
- **Tables**: `research_discovery_runs` (run audit log) + `research_paper_candidates` (pre-approval staging).
- **Discovery service**: `research-discovery-service.ts` — searches PubMed XML API + Semantic Scholar in parallel per 21 query categories, deduplicates by DOI/PubMed ID/normalized title, stores candidates, runs Librarian Agent pre-screening. Optional Crossref enrichment for journal/year/author normalization.
- **Status flow**: `discovered → librarian_reviewed → pending_admin → approved | rejected`. No paper is retrievable without Librarian evaluation + explicit admin approval.
- **Admin routes**: `POST /discovery/run`, `GET /discovery/runs`, `GET /candidates` (filterable), `POST /candidates/:id/approve`, `POST /candidates/:id/reject`.
- **isFoundational flag**: `research_documents.is_foundational` (boolean) exempts papers from the freshness age penalty in retrieval scoring. Toggle via `POST /admin/research/:id/toggle-foundational`.
- **Retrieval scoring layers** (additive): tag overlap ×3 | trust (gold +2, high +1) | evidence type (meta-analysis +4, systematic review/position stand +3, RCT +2, review/cohort +1) | freshness (≤3yr +2, ≤7yr +1, >12yr −1 unless foundational) | chunk type (librarian +2, coaching/programming implications +1) | injury boost +2 | population boost +3 | warning penalties.
- **Score breakdown log**: every retrieval hit logs a `scoreBreakdowns[]` array with per-field values for each chunk (tagOverlap, trustBoost, evidenceBoost, freshnessBoost, chunkTypeBoost, injuryBoost, populationBoost, warningPenalty, finalScore).
- **Admin UX**: evidence-type badges with quality-hierarchy colors, DOI/source links open externally, ★ foundational badge + toggle button, inferred evidence-type label from publicationTypes for candidates.

## Live Program Mutation Flow (Phases 1–9)
- **Dedicated sidebar mutation endpoint**: `POST /api/training-system/mutate` in `artifacts/api-server/src/routes/training-system-mutate.ts` handles right-sidebar "Add Exercise" and "Remove Exercise" operations without touching the chat stream.
- **No chat failure bubbles**: Panel mutations never create assistant messages or trigger chat failure toasts — all feedback is a local panel toast only.
- **Immediate cache invalidation**: On success the frontend invalidates `["training-system-week"]`, `["live-panel-week-ids"]`, `["week-view-select"]`, `["training-system-today"]`, and `["training-system-active"]` so the panel re-renders instantly.
- **Per-button loading state**: `panelMutating` state in `LiveProgramPanel.tsx` tracks which session-pill is actively mutating; the spinner shows on the exact clicked button and all other pills are disabled while the request is in flight.
- **Auto-fill exercise selection**: `autoFillExerciseName()` from `architect-patch-generator.ts` picks a contextually appropriate exercise based on session label, session type, and focus mode.
- **Post-write verification**: `applyEditPlan` re-reads the inserted row and surfaces `verified: true/false` in the response and receipt.
- **Receipt-first feedback**: Response always contains a `MutationSuccessReceipt` or `MutationFailureReceipt`; the frontend uses `receipt.message` for toast copy.
- **Focus mismatch guard**: Endpoint rejects mutations where the requested `focusMode` does not match the resolved active system's focus lane.