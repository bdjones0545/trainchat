---
title: Memory Architecture — Layered Stores, Dominance, Constraints & Merge
doc_type: implementation
subsystem: memory
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/api-server/src/lib/memory.ts
  - artifacts/api-server/src/lib/memory-dominance.ts
  - artifacts/api-server/src/lib/constraint-memory.ts
  - artifacts/api-server/src/lib/decision-memory-service.ts
  - artifacts/api-server/src/lib/atlas-memory-extractor.ts
  - artifacts/api-server/src/lib/atlas-memory-store.ts
  - artifacts/api-server/src/lib/adaptation.ts
  - artifacts/api-server/src/lib/anonymousMerge.ts
  - artifacts/api-server/src/routes/atlas-memories.ts
  - artifacts/api-server/src/routes/conversations.ts
  - artifacts/api-server/src/routes/auth.ts
  - artifacts/trainchat/src/lib/AtlasGlobalContextResolver.ts
related_architecture:
  - "CLAUDE.md §5 Memory Architecture"
related_implementation:
  - "docs/db-schema.md (user_memories, atlas_memories, neural_profiles, cascade-from-users)"
  - "docs/ai-agents.md (memory dominance feeds the Coach prompt; safety hard law)"
  - "docs/mutation-pipeline.md (decision-memory + constraint persistence)"
  - "docs/context-pipeline.md (memory blocks are part of buildSystemPrompt)"

last_generated: 2026-06-29
last_verified: 2026-06-29
verified_by: claude (Version 2, Wave 3 doc #6)
verified_commit: 78ee536
verification_method: >
  Read memory-dominance.ts in full; atlas-memory-store.ts + atlas-memory-extractor.ts headers/exports;
  anonymousMerge.ts body; routes/atlas-memories.ts endpoints; memory.ts/constraint-memory.ts/
  decision-memory-service.ts exports. Verified wiring with grep: resolveMemoryConstraints →
  adaptation.ts → conversations.ts; atlas-extractor/store consumers (only routes/atlas-memories.ts);
  chat-path extractor = memory.ts extractMemoriesFromMessage (conversations.ts 684/3414); memory
  injection gated by planInfo.features.memoryContext/adaptationContext; merge touches only
  conversations + training_systems then deletes the anon user; frontend AtlasGlobalContextResolver
  consumes atlasMemories. NOT done: full read of memory.ts (1053) and constraint-memory.ts (703);
  no runtime execution. Such claims are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0024, summary: "Two parallel memory systems: user_memories (server-side, chat-extracted via memory.ts, injected into the Coach prompt) vs atlas_memories (frontend context UI via atlas-memories route + atlas-memory-extractor). The server Coach prompt does NOT read atlas_memories", kind: doc-vs-code, severity: medium, status: open }
  - { id: DR-0025, summary: "Anon→registered merge migrates ONLY conversations + training_systems then deletes the anon user, cascade-deleting user_memories/atlas_memories/neural_profiles/profiles/readiness/session_logs/exercise_logs — silent data loss; contradicts CLAUDE.md §5 'memory merges on signup'", kind: code-vs-architecture, severity: high, status: open }
  - { id: DR-0026, summary: "Memory + adaptation (incl. memory dominance) injection into the Coach prompt is plan-gated (memoryContext/adaptationContext features), not universal as CLAUDE.md §5 implies", kind: doc-vs-code, severity: medium, status: open }
---

# Memory Architecture — Layered Stores, Dominance, Constraints & Merge

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Reconciled against the memory modules + their wiring. **Code wins** on disagreement. `memory.ts`
> and `constraint-memory.ts` were read at export-level, not in full; runtime claims are **(UNVERIFIED)**.

## 1. Purpose & scope

How TrainChat stores, extracts, governs, and injects user memory; and what happens to memory when an
anonymous user becomes registered. Implements `CLAUDE.md §5`. Covers the **live server-side** memory
(user_memories), the **governing** layer (memory dominance + constraint memory), the **decision**
memory used by edits, the **frontend-facing** Atlas memory, and the **merge**. Gamification
(`neural_profiles`) and derived `performance_profiles` are adjacent and noted but get fuller
treatment in `adaptation-loop`/`exercise-programming` docs.

## 2. Source map

| File | Wired into chat? | Responsibility |
|---|---|---|
| `lib/memory.ts` (1053) | ✅ | **user_memories** service: `extractMemoriesFromMessage` (chat-path extraction), `upsertMemory`, `listMemories`, `buildMemoryContext` (prompt block), `decayStaleMemories`, `syncMemoriesFromData`. |
| `lib/memory-dominance.ts` (420) | ✅ (via adaptation) | `resolveMemoryConstraints` — the **governing** layer (hard constraints + active signals → override directive). |
| `lib/adaptation.ts` | ✅ | `buildAdaptationContext` — composes memory dominance into the adaptation context block. |
| `lib/constraint-memory.ts` (703) | ✅ | Hard-constraint loading/enforcement: `loadHardConstraints`, `buildConstraintEnforcementDirective`, `validateAgainstHardConstraints`, `persistConstraintsFromTurn`, `validatePainConstraints`. |
| `lib/decision-memory-service.ts` (355) | ✅ (edits) | `buildDecisionMemory` — recent-edit/decision patterns; feeds the edit pipeline. |
| `lib/atlas-memory-extractor.ts` (178) | ⚠️ route-only | `AtlasMemoryExtractor` — LLM extraction of durable signals (gpt-4.1-mini). Consumed only by `routes/atlas-memories.ts`. |
| `lib/atlas-memory-store.ts` (198) | ⚠️ route-only | atlas_memories upsert/dedup (normalizedKey, confidence cap 5; 7-day re-extraction marker). Consumed only by `routes/atlas-memories.ts`. |
| `lib/anonymousMerge.ts` | ✅ (auth) | `mergeAnonymousToRegistered` — migrates conversations + training_systems, deletes anon user. |
| `trainchat/src/lib/AtlasGlobalContextResolver.ts` | frontend | Consumes `atlasMemories` for client-side context chips / top-memory selection. |

## 3. The live server-side memory: `user_memories`

The memory that actually reaches the Coach is `user_memories` (memory.ts), **not** Atlas (§6):
- **Extraction:** `extractMemoriesFromMessage(userId, content)` runs as `safeBackground(...)` off the
  response path in `conversations.ts` (684 non-SSE / 3414 SSE) — this is the "async, off the SSE
  path" extraction CLAUDE.md §5 describes (it is memory.ts, not the Atlas extractor).
- **Types/sources:** `MemoryType`, sentiment (positive/negative/neutral), source
  (onboarding/feedback/readiness/inferred/conversation); confidence 1–5; lifecycle
  active/monitor/resolved (per `db-schema.md`).
- **Injection:** `listMemories` → `buildMemoryContext` produces the prompt block — **gated by
  `planInfo.features.memoryContext`** (conversations.ts 652/669/673). Free tier → no memory block.
  (DR-0026.)
- **Maintenance:** `decayStaleMemories`, `syncMemoriesFromData`.

## 4. The governing layer: memory dominance

`resolveMemoryConstraints(userId, focusMode)` (memory-dominance.ts) reads `user_memories` + the last
~10 `session_logs` (21-day window) and produces a **MEMORY OVERRIDE** directive in two tiers:
- **TIER 1 — Hard constraints:** `pain_pattern`/negative/confidence≥4 → injury constraint with
  focus-mode-specific affected movement patterns (e.g. knee → squats/lunges/landings; speed mode has
  a separate sprint/plyo map); negative high-confidence `exercise_preference` → equipment constraint.
- **TIER 2 — Active signals:** computed from recent logs — pain frequency ≥0.4, fatigue composite
  ≥3.8, adherence <0.65, difficulty ≥4.4 — each with an override strength (1–5).
- **Output:** a `memoryDominanceContext` string stating *"Memory governs block prescription when they
  conflict."* — the runtime expression of CLAUDE.md §5's "memory is governing, not passive" and of
  the constitution's SAFETY hard law (`ai-agents.md §4`).
- **Wiring:** consumed by `lib/adaptation.ts` → `buildAdaptationContext` (composed **into** the
  adaptation context, not strictly "before" it), which `conversations.ts` injects — **gated by
  `planInfo.features.adaptationContext`** (DR-0026). The priority hierarchy in the file header
  (hard constraints > active signals > block structure > original intent) is a *fourth* conflict
  framing alongside the two in `ai-agents.md §5` (constitution + orchestrator) — noted, not a new DR
  here since it governs prompt text, not typed routing.

## 5. Constraint & decision memory

- **constraint-memory.ts** operates on the `MemoryEntry[]` from user_memories: `loadHardConstraints`
  + `buildConstraintEnforcementDirective` inject an enforcement block (conversations.ts 688/689);
  `persistConstraintsFromTurn` writes constraint keys (these surface as
  `mutation_audit_receipts.persistedConstraints` — `db-schema.md §4.2`); `validatePainConstraints`/
  `validateAgainstHardConstraints` guard outputs.
- **decision-memory-service.ts** `buildDecisionMemory` summarizes recent edits/decision patterns and
  feeds the **edit pipeline** (consumed by conversations.ts, training-system-edit.ts,
  training-system-directions.ts) — the `decisionMemoryContext` threaded through
  `interpretEditRequest` (`mutation-pipeline.md §2`).

## 6. Atlas memory — a parallel, frontend-facing system (headline finding)

The Atlas pipeline (`atlas-memory-extractor.ts` + `atlas-memory-store.ts` + `atlas_memories` table)
is consumed **only by `routes/atlas-memories.ts`** — `GET /atlas/memories` (read top 20),
`POST /atlas/memories` (extract + `upsertMemory`), `DELETE /atlas/memories/:id`. The **frontend**
`AtlasGlobalContextResolver.ts` consumes `atlasMemories` to build context chips and select a top
memory for display. **The server-side Coach prompt never reads `atlas_memories`.**

So there are **two parallel memory systems**:
- **user_memories** → server-side, chat-extracted (memory.ts), injected into the Coach prompt.
- **atlas_memories** → populated/read via the atlas route, consumed by the **frontend** context UI;
  extracted by a *different* extractor (atlas-memory-extractor).

`CLAUDE.md §5` presents Atlas as "insights asynchronously extracted from chat … by
`atlas-memory-extractor.ts`" feeding coaching — but on the live server path that role belongs to
`memory.ts`/`user_memories`; Atlas is a separate, route-gated, frontend-consumed layer. (DR-0024.)
**(Whether the frontend auto-triggers `POST /atlas/memories` per conversation was not traced — the
extractor's server wiring is route-only; that claim is firm, the trigger cadence is UNVERIFIED.)**

## 7. Anonymous → registered merge (data-loss finding)

`mergeAnonymousToRegistered(anonId, targetId)` (anonymousMerge.ts), called from `auth.ts` on login
(316) and registration:
- If `anonId === targetId` (in-place upgrade) → no-op (no loss).
- Otherwise (anon logs into an existing account) it **reassigns only `conversations` and
  `training_systems`** (`UPDATE … SET user_id = target`), then **`DELETE`s the anonymous `users`
  row**.

Because `user_memories`, `atlas_memories`, `neural_profiles`, `user_profiles`, `readiness_entries`,
`session_logs`, `exercise_logs` all carry a `userId` FK with **`onDelete: cascade`** (`db-schema.md
§5`), deleting the anon user **cascade-deletes all of that data**. So on the login-merge path, an
anonymous user's accumulated **memory, profile, readiness, neural profile, and logs are silently
lost** — only conversations and training systems survive. This directly contradicts `CLAUDE.md §5`'s
"memory merges from anonymous → registered identity on signup." (DR-0025, **high**.)

## 8. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0024 | Two parallel memory systems: user_memories (server prompt) vs atlas_memories (frontend UI). Coach prompt never reads atlas. | doc-vs-code | medium |
| DR-0025 | Merge migrates only conversations + training_systems, then cascade-deletes memory/profile/logs of the anon user — silent data loss; contradicts "memory merges on signup." | code-vs-architecture | **high** |
| DR-0026 | Memory + adaptation/dominance injection is plan-gated (memoryContext/adaptationContext), not universal. | doc-vs-code | medium |

## 9. Cross-references to prior implementation docs

- **`db-schema.md`:** confirms the store shapes (user_memories, atlas_memories' 4 indexes,
  neural_profiles) and is the *cause* of DR-0025 — the user-cascade backbone (db-schema §5) turns the
  anon-user delete into a cascade wipe. `persistedConstraints` (db-schema §4.2) is written by
  constraint-memory.
- **`ai-agents.md`:** memory dominance is how the constitution's SAFETY hard law becomes runtime
  prompt text; it flows into `buildSystemPrompt` via adaptation context.
- **`mutation-pipeline.md`:** decision-memory + constraint-memory feed the edit pipeline
  (`decisionMemoryContext`; `persistConstraintsFromTurn`).
- **`context-pipeline.md`:** the memory/constraint/adaptation blocks are conditional layers of the
  plan-gated `buildSystemPrompt` assembly.

## 10. Recommended CLAUDE.md updates

Proposals only (governance §2/§7), each source-supported:

1. **§5** — Distinguish the **two memory systems**: server-side `user_memories` (chat-extracted,
   prompt-injected) vs frontend-facing `atlas_memories` (route + client context UI). Correct the
   attribution of "chat extraction" to `memory.ts`. (DR-0024.)
2. **§5** — **Correct the merge claim:** only conversations + training_systems migrate; the anon
   user's memory/profile/readiness/neural/logs are **lost via cascade** on the login-merge path.
   (DR-0025 — and consider whether this is intended behavior or a bug to fix.)
3. **§5** — Note that memory + adaptation/dominance injection is **plan-gated** (premium), not
   universal. (DR-0026.)
4. **§5** — Optionally acknowledge memory dominance's hierarchy as a *fourth* conflict framing
   (alongside `ai-agents.md` DR-0013) for prompt-level overrides.

The memory-dominance design (safety/pain/fatigue override block prescription) is well-built and
genuinely wired; the gaps are the dual-system conflation, the merge data loss, and plan-gating.

## 11. Files reviewed

Full: `memory-dominance.ts`, `anonymousMerge.ts` (body). Headers/exports: `memory.ts`,
`constraint-memory.ts`, `decision-memory-service.ts`, `atlas-memory-extractor.ts`,
`atlas-memory-store.ts`, `adaptation.ts`. Endpoints: `routes/atlas-memories.ts`. Wiring:
`routes/conversations.ts`, `routes/auth.ts`; frontend `AtlasGlobalContextResolver.ts`. Consumer
greps across `artifacts/api-server/src` and `artifacts/trainchat/src`.

## 12. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Memory dominance (tiers, signals, output) | **High** | Read in full. |
| Live extraction = memory.ts on chat path | **High** | conversations.ts call sites. |
| Atlas pipeline route-only + frontend-consumed (DR-0024) | **High** | Consumer census + frontend grep. |
| Merge scope + cascade data loss (DR-0025) | **High** | Merge body read; cascade from db-schema. |
| Plan-gating of memory/adaptation (DR-0026) | **High** | conversations.ts feature flags. |
| Internal mechanics of user_memories extraction/decay, constraint validation | **Medium** | Exports read, not full bodies. |
| Atlas extraction trigger cadence (auto vs manual) | **Medium** | Route confirmed; client trigger not traced. |
| **Runtime behavior** | **UNVERIFIED** | No execution. |

Overall: **high confidence in the layered architecture, wiring, and the merge/dual-system findings.**
Open gaps (full memory.ts/constraint-memory.ts read; runtime) keep this at its **L3** target. Note
DR-0025 is `high` — it would block this subsystem from L4 until reconciled.

## 13. Verification record

- Verified at commit `78ee536` (current date 2026-06-29).
- Independent checks: `resolveMemoryConstraints` consumer = adaptation.ts → conversations.ts;
  atlas-extractor/store consumers = routes/atlas-memories.ts only; chat extractor =
  `extractMemoriesFromMessage` (memory.ts); merge updates conversations+training_systems then deletes
  anon user; memory injection gated by `memoryContext`/`adaptationContext`.
- Not run (documented gaps): full memory.ts/constraint-memory.ts read; frontend atlas-trigger trace;
  runtime execution.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
