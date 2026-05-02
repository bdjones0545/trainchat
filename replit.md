# TrainChat — AI Performance Architect

## Overview
TrainChat is an agent-first AI training platform that provides personalized, adaptive training programs and proactive insights through an AI chat interface. Its main purpose is to make expert fitness coaching accessible and adaptable to individual user needs, offering a live training workspace for real-time program interaction. The platform aims to revolutionize personalized fitness with AI-driven expert guidance, focusing on a "vibe coding your training" experience rather than a traditional chatbot.

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