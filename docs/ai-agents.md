---
title: AI Agent System — Constitution, Orchestrator, Coach & Gates
doc_type: implementation
subsystem: ai-agents
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/api-server/src/agents/trainchat-constitution.ts
  - artifacts/api-server/src/agents/agent-orchestrator.ts
  - artifacts/api-server/src/agents/agent-personas.ts
  - artifacts/api-server/src/agents/ceo-heartbeat.ts
  - artifacts/api-server/src/agents/behavioral-intelligence.ts
  - artifacts/api-server/src/agents/progression-intelligence.ts
  - artifacts/api-server/src/lib/openai-models.ts
  - artifacts/api-server/src/lib/ai.ts
  - artifacts/api-server/src/routes/conversations.ts
related_architecture:
  - "CLAUDE.md §4 AI Architecture — The Three-Agent System"
related_implementation:
  - "docs/db-schema.md (conversations/messages, training_systems, mutation-audit-receipts)"
  - "docs/contract-spine.md (the conversational surface is largely uncontracted — DR-0007)"

last_generated: 2026-06-28
last_verified: 2026-06-28
verified_by: claude (Version 2, Wave 2 doc #3 — keystone)
verified_commit: 78ee536
verification_method: >
  Read in full: trainchat-constitution.ts, agent-personas.ts, agent-orchestrator.ts (900 lines),
  openai-models.ts; read headers/signatures of ceo-heartbeat.ts, behavioral-intelligence.ts,
  progression-intelligence.ts; targeted-read ai.ts buildSystemPrompt head (229–300) and the
  callOpenAI body (3370–3470) and the gate call site (5086). Independently verified wiring with
  grep: counted consumers of every exported symbol in agent-personas/behavioral-intelligence/
  progression-intelligence (all 0 outside their own files); located the single validateArchitectureGate
  call site (ai.ts:5086); confirmed orchestrate() wiring in conversations.ts (1003/1015). NOT done:
  full read of ai.ts (7406 lines) — the complete ~30-layer prompt enumeration and whether coachContext
  is always passed to the gate are partially verified; runtime execution was not performed. Claims
  about runtime behavior are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0011, summary: "agent-personas.ts persona registry is unwired (0 runtime consumers); Coach identity is hardcoded inline in ai.ts", kind: code-vs-architecture, severity: high, status: open }
  - { id: DR-0012, summary: "behavioral-intelligence.ts and progression-intelligence.ts are unwired (0 consumers of exported functions) despite being in the orchestrator's documented flow", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0013, summary: "Two conflicting conflict hierarchies both claim sole authority: constitution's 6-level AUTHORITY_HIERARCHY vs orchestrator's 5-level CONFLICT_RESOLUTION_HIERARCHY (the latter is what CLAUDE.md §4 documents)", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0014, summary: "openai-models.ts comments contradict their own values (mention 'remain on gpt-4o' while all values are gpt-4.1)", kind: doc-vs-code, severity: low, status: open }
  - { id: DR-0015, summary: "Coach Agent system prompt embeds a MANDATORY conversion/sales-strategist identity layer not reflected in CLAUDE.md §4's coaching-only framing", kind: doc-vs-code, severity: medium, status: open }
---

# AI Agent System — Constitution, Orchestrator, Coach & Gates

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Implementation doc, generated from and reconciled against `artifacts/api-server/src/agents/` +
> `lib/ai.ts` + `lib/openai-models.ts` + the conversations route. **Code wins** on disagreement.
> **Target maturity was L4**; newly-discovered **high-severity** discrepancies (unwired persona
> registry, DR-0011) cap this at **L3** until reconciled (per `documentation-maturity-model.md §3`).
> Runtime-behavior claims are marked **(UNVERIFIED)** — no execution was performed.

## 1. Purpose & scope

This documents TrainChat's server-side AI agent system: the **constitution** (shared identity/law
layer), the **orchestrator** (routing + conflict rules + handoff contracts + the architecture gate),
the **Coach Agent** (the live LLM path in `lib/ai.ts`), the **model registry**, and the supporting
quality modules (CEO Heartbeat) — plus an honest account of which documented components are actually
**wired into the live request path** and which are defined-but-unused. It implements `CLAUDE.md §4`.

It does **not** cover: the system-prompt assembly's research/memory sub-layers in depth (see the
planned `research`/`memory`/`context-pipeline` docs), nor mutation execution/verification (see the
planned `mutation-pipeline` doc). The Performance Architect's internals are the `exercise-programming`
doc; here it is treated as the brief-producing handoff partner.

## 2. Source map

| File | Wired? | Responsibility |
|---|---|---|
| `agents/trainchat-constitution.ts` | ✅ (ai.ts) | Identity, 7 hard laws, 6-level `AUTHORITY_HIERARCHY`, communication model, `TRAINCHAT_SYSTEM_BRAIN_PROMPT`, dev-only audit + leakage detection. |
| `agents/agent-orchestrator.ts` | ✅ (conversations.ts) | `OrchestratorRoute`, `resolveOrchestratorRoute`/`orchestrate`, 5-level `CONFLICT_RESOLUTION_HIERARCHY`, typed handoff contracts, `validateArchitectureGate`, observability logging, boundary guards. |
| `lib/openai-models.ts` | ✅ | Single source of truth for model IDs (`gpt-4.1` / `gpt-4.1-mini`). |
| `lib/ai.ts` (7406 lines) | ✅ | The **Coach Agent**: `buildSystemPrompt`, `generateAIResponse`, `callOpenAI`, fallback path, and the **only** call site of `validateArchitectureGate` (5086). |
| `agents/ceo-heartbeat.ts` | ✅ (ai.ts + orchestrator) | `runCEOHeartbeatCheck` — 9 coaching-quality checks; merged into the architecture gate when `coachContext` is supplied. |
| `agents/agent-personas.ts` | ❌ **unwired** | Persona registry (Coach Atlas / Architect Vale / Dr. Sable). **Zero runtime consumers** (DR-0011). |
| `agents/behavioral-intelligence.ts` | ❌ **unwired** | `analyzeBehavioralSignals`, `buildBehavioralCoachingContext` — **0 consumers** (DR-0012). |
| `agents/progression-intelligence.ts` | ❌ **unwired** | `buildProgressionIntelligence`, `formatProgressionBriefSection` — **0 consumers** (DR-0012). |

## 3. The three agents (as defined)

Per the constitution and orchestrator comments, three agents with strict boundaries:

| Agent (internal persona) | Nature | Output | User-facing? |
|---|---|---|---|
| **Coach** (Coach Atlas) | LLM — OpenAI `gpt-4.1` | All user-facing responses + programs | Yes |
| **Performance Architect** (Architect Vale) | **Deterministic, no LLM** | Architecture brief injected into the Coach's prompt | No |
| **Research Librarian** (Dr. Sable) | LLM, **admin-only** | Evidence evaluation written to the research DB | No |

These role definitions match `CLAUDE.md §4`. The **persona text** (tone/skills) lives in
`agent-personas.ts` — but see §7: that file is not actually imported at runtime; the Coach's
identity is **re-declared inline** in `ai.ts`.

## 4. The constitution (shared law layer) — wired

`TRAINCHAT_SYSTEM_BRAIN_PROMPT` is imported by `ai.ts` (line 124) and prepended to the Coach's
prompt (§6). It contains:
- **Product identity** + **User-Experience Law** ("one unified TrainChat coach; internal agents
  never exposed").
- **7 hard laws** (absolute): safety/pain override all; equipment respected; excluded exercises need
  confirmation; no medical claims; Librarian never in user chat; internal names never surface;
  program state must match the user-facing receipt.
- **A 6-level `AUTHORITY_HIERARCHY`**: 1 SAFETY → 2 USER_CONSTRAINTS → 3 COACH_JUDGMENT →
  4 ARCHITECT_STRUCTURE → 5 RESEARCH_GUIDANCE → 6 STYLE_PERSONA. The file comments call this
  "the single source of truth for conflict resolution across all agents."
- Dev-only observability: `logSystemBrainAudit` (silent in production) and `detectLeakageRisk`
  (regex scan for leaked internal names / "ChatGPT gives you" / "three-agent").

⚠️ This 6-level hierarchy is **not** the hierarchy CLAUDE.md §4 documents (see §5/DR-0013).

## 5. The orchestrator (routing + conflict rules) — wired

`orchestrate()` is a **pure decision function** wired in `conversations.ts` (1003) and logged at
1015. It does **not** call agents or the gate; it returns a typed `OrchestratorDecision` that the
route + `ai.ts` act on.

### 5.1 Routing (`resolveOrchestratorRoute`)
Priority-ordered rules → one of six routes:
1. `isAdminRequest` → **LIBRARIAN_ADMIN** (Librarian only).
2. `intentType === "RETRIEVE_CURRENT_PROGRAM"` → **RETRIEVE** (no AI).
3. `execPlanAction === "NO_OP"` → **NO_OP**.
4. `ASK_CLARIFICATION` → **DIRECT_EDIT** (Coach, fast path).
5. `APPLY_MUTATION` + `mutationType==="structural"` → **BUILD_WITH_ARCHITECT**; `"minor"`/unknown →
   **DIRECT_EDIT**.
6. Build intent (`CREATE_PROGRAM`/`START_NEW_PROGRAM`/`REBUILD_PROGRAM`/`isFreshBuildSession`) →
   **BUILD_WITH_ARCHITECT**; else **GUIDANCE** (default).

Boundary guards exist as pure checks: `assertLibrarianIsAdminOnly`, `assertArchitectSkippedOnEditPath`.

### 5.2 Conflict hierarchy (`CONFLICT_RESOLUTION_HIERARCHY`) — the one CLAUDE.md documents
A **5-level** typed hierarchy with trigger conditions, agent behavior, and example violations:
1 SAFETY → 2 MOVEMENT_QUALITY → 3 GOAL_OUTPUT → 4 FATIGUE_MANAGEMENT → 5 USER_PREFERENCE. Its
comment also claims to be "the authoritative source for all typed conflict resolution in the
codebase." `resolveConflict(a,b)` ranks two priorities. `orchestrate()` reports
`conflictRulesApplied` = always `[SAFETY, MOVEMENT_QUALITY, …, USER_PREFERENCE]`, adding
`GOAL_OUTPUT`+`FATIGUE_MANAGEMENT` only on build paths.

⚠️ **Two hierarchies, both claiming sole authority** (constitution's 6-level vs orchestrator's
5-level), using different axes (agent-authority vs programming-conflict) and different terms
(`USER_CONSTRAINTS` rank 2 vs `USER_PREFERENCE` rank 5). CLAUDE.md §4 documents only the
orchestrator's. (DR-0013.)

### 5.3 Typed handoff contracts
`CoachToArchitectHandoff` (days/sport/goal/message/focusMode/variationSeed/hardConstraints),
`ArchitectToCoachHandoff` (`architectureBriefText` + locked selections + weekly architecture +
`briefSource` + `briefGenerated`/`briefError`), and `LibrarianToResearchDatabaseHandoff` with
`triggeredBy: "admin"` as a literal type — a compile-time guarantee the Librarian handoff never
originates from a user turn.

### 5.4 Architecture validation gate
`validateArchitectureGate(input)` is **non-blocking** (never throws; caller decides). Structural
checks: empty program / day-count mismatch / empty days = **critical**; <4 exercises = **warning**;
missing trunk / missing unilateral / focus-bleed = **info** (explicitly downgraded — "creative
programming allowed"). When `coachContext` is passed, the **9 CEO Heartbeat checks run inside the
gate**: safety concerns → critical, others → warning. So in practice the gate blocks (sets
`hasCriticalIssues`) mainly on empty/day-count failures and CEO safety concerns; stylistic checks
only inform. **It is called from `ai.ts:5086`, not from the orchestrator or the route** (§6).

## 6. The Coach Agent (`lib/ai.ts`) — the live LLM path

- **`buildSystemPrompt(profile, userMessage, routing)`** assembles the prompt: it logs a
  `[SystemBrainAudit]`, then returns `TRAINCHAT_SYSTEM_BRAIN_PROMPT + coreIdentity + …` where
  `coreIdentity` is a **hardcoded "INTERNAL IDENTITY — COACH ATLAS" block inlined in ai.ts** (not
  imported from `agent-personas.ts`). Conditional layers observed include research programming
  guidance (`buildResearchProgrammingGuidance`/`formatResearchGuidanceForPrompt`), periodization
  context (`buildPeriodizationContext` when `needsPeriodizationContext`), and a **mandatory
  conversion/sales-strategist identity** ("You are also a HIGH-LEVEL SALES STRATEGIST… CONVERSION
  IDENTITY — MANDATORY LAYER"). A `PROMPT_SIZE_WARN_THRESHOLD = 22000` chars logs `[BuildPerfWarning]`.
  **(The full layer set — CLAUDE.md's "~30 layers" — was not exhaustively enumerated; partially
  verified.)**
- **`callOpenAI`** posts to `${baseUrl}/chat/completions` with `model: OPENAI_MODELS.CORE`
  (`gpt-4.1`), `temperature: 0.6`, dynamic `max_tokens`, a **25-second per-attempt timeout**
  (AbortController), and **`maxRetries = 1`** — retrying only on 429/5xx/network/timeout, never on
  parse failures. Key resolution: `OPENAI_API_KEY` → `api.openai.com/v1`; else
  `AI_INTEGRATIONS_OPENAI_API_KEY` + `AI_INTEGRATIONS_OPENAI_BASE_URL` (the Replit AI-integration
  fallback). **If no key is present, it returns a deterministic `generateFallbackResponse`** — the
  Coach degrades to a non-LLM path rather than failing.
- **Gate invocation:** `generateAIResponse` calls `validateArchitectureGate` at `ai.ts:5086` and
  logs via `logValidationGateResult`. So the gate is **internal to the Coach generation function**,
  not a separate orchestration stage.
- **Two response paths** exist in `conversations.ts`: non-SSE (`generateAIResponse` @2821) and SSE
  streaming (@5188), each with a retry fallback path.

## 7. Wiring reality: what is live vs. defined-but-unused (headline finding)

Verified by exhaustive consumer grep (every exported symbol):

| Component | Live? | Evidence |
|---|---|---|
| `trainchat-constitution.ts` (brain prompt, audit, leakage) | ✅ | imported by `ai.ts` |
| `agent-orchestrator.ts` (`orchestrate`, gate, handoffs) | ✅ | imported by `conversations.ts`; gate called in `ai.ts` |
| `ceo-heartbeat.ts` (`runCEOHeartbeatCheck`) | ✅ | imported by `ai.ts` + orchestrator |
| `openai-models.ts` | ✅ | imported by `ai.ts` and others |
| **`agent-personas.ts`** | ❌ | **0 imports anywhere**; `COACH_ATLAS`/`ARCHITECT_VALE`/`DR_SABLE`/`getPersonaPromptBlock` have **0 external references**. Coach identity is re-declared inline in `ai.ts`. (DR-0011) |
| **`behavioral-intelligence.ts`** | ❌ | `analyzeBehavioralSignals`, `buildBehavioralCoachingContext` → **0 consumers** (DR-0012) |
| **`progression-intelligence.ts`** | ❌ | `buildProgressionIntelligence`, `formatProgressionBriefSection` → **0 consumers** (DR-0012) |

The orchestrator's own Phase-8 flow comment lists "Behavioral Intelligence signals" and
"Progression Intelligence" as pipeline stages — but **no live code calls them**. The persona
registry is a parallel, unused definition of identities the Coach actually hardcodes. The
constitution, orchestrator, gate, CEO Heartbeat, and model registry **are** live; the persona +
intelligence layers are **scaffolding not yet connected**. This corroborates the Knowledge Base's
standing caution that the `*_QA.md` audits (which report these as "fully implemented") are partly
aspirational.

## 8. Model registry

`OPENAI_MODELS` is the declared single source of truth (matches CLAUDE.md §4). **Only two model IDs
are actually used:** `gpt-4.1` (CORE, GUEST_RESPONSE, PROGRAM_GENERATION, EDIT_ENGINE, EDIT_INTENT,
DIRECTIONS, EXERCISE_FALLBACK, SWAP_BACKSTOP, SHARE_MOMENTS) and `gpt-4.1-mini` (ROUTING,
INTENT_INTERPRETER, MEMORY_EXTRACTOR). ⚠️ Several comments still say "Edit and fallback services
remain on gpt-4o" though **no value is `gpt-4o`** — the comments are stale (DR-0014). This sharpens
**DR-0001** (`replit.md` cites GPT-4o; reality is the gpt-4.1 family).

## 9. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0011 | `agent-personas.ts` registry is unwired (0 consumers); Coach identity is hardcoded inline in `ai.ts` → drift risk between the documented persona and the live prompt. | code-vs-architecture | **high** |
| DR-0012 | `behavioral-intelligence.ts` + `progression-intelligence.ts` are unwired (0 consumers) despite appearing in the orchestrator's documented flow. | code-vs-architecture | medium |
| DR-0013 | Two conflict hierarchies both claim sole authority (constitution 6-level `AUTHORITY_HIERARCHY` vs orchestrator 5-level `CONFLICT_RESOLUTION_HIERARCHY`); CLAUDE.md §4 documents only the latter. | code-vs-architecture | medium |
| DR-0014 | `openai-models.ts` comments contradict their values ("gpt-4o" referenced; all values are gpt-4.1). | doc-vs-code | low |
| DR-0015 | Coach prompt embeds a MANDATORY conversion/sales-strategist identity not reflected in CLAUDE.md §4. | doc-vs-code | medium |

DR-0011's `high` severity reflects a real maintenance hazard: editing `agent-personas.ts` (the
"obvious" place) changes nothing at runtime, while the live Coach identity sits in a 7400-line file.

## 10. Cross-references to prior implementation docs

- **`docs/contract-spine.md` (DR-0007):** the rich AI behavior behind the contracted `sendMessage`
  operation — orchestration, SSE streaming, the gate — is **not** described by the OpenAPI contract;
  only the basic request/response shape is. The agent system is a prime example of the uncontracted
  surface.
- **`docs/db-schema.md`:** the Coach reads `conversations`/`messages` and (on build paths, via the
  Architect) writes into the **canonical `training_systems`** hierarchy, while mutations write
  `mutation_audit_receipts` — persistence detail belongs to the planned `mutation-pipeline` doc.
  The Coach's hard law "program state and user-facing receipt must always agree" is the constitution
  twin of db-schema's receipt-first design.

## 11. Recommended CLAUDE.md updates

Proposals only (governance §2/§7), each directly supported by source:

1. **§4** — Note that the **persona registry (`agent-personas.ts`) is currently unwired**; the
   Coach's runtime identity is inlined in `lib/ai.ts`. State which file is authoritative for the
   live prompt. (DR-0011.)
2. **§4** — Mark "Behavioral Intelligence" and "Progression Intelligence" as **defined but not yet
   wired** (or remove from the live-architecture description until connected). (DR-0012.)
3. **§4** — Acknowledge **two conflict frameworks**: the constitution's 6-level authority hierarchy
   *and* the orchestrator's 5-level programming-conflict hierarchy; clarify their relationship and
   which governs what. (DR-0013.)
4. **§4 / §9** — Replace lingering "GPT-4o" references; the live registry is `gpt-4.1` /
   `gpt-4.1-mini` only. Also note the deterministic no-API-key fallback path. (DR-0014 / DR-0001.)
5. **§4** — Document that the Coach Agent carries a **mandatory conversion/sales identity layer** for
   unauthenticated/non-paying users — it is a first-class part of the prompt, not just a coach.
   (DR-0015.)
6. **§4** — Clarify the gate is invoked **inside `generateAIResponse` (`ai.ts`)**, not by the
   orchestrator, and that its stylistic checks are `info`-severity (non-blocking); only empty/
   day-count failures and CEO safety concerns are `critical`.

No change is recommended to the *three-agent design intent* — it is sound; the gaps are **wiring and
documentation fidelity**, not architecture.

## 12. Files reviewed

`agents/{trainchat-constitution.ts (full), agent-personas.ts (full), agent-orchestrator.ts (full,
900 lines), ceo-heartbeat.ts (signatures), behavioral-intelligence.ts (header), progression-intelligence.ts
(header)}`; `lib/openai-models.ts (full)`; `lib/ai.ts` (targeted: 229–300 buildSystemPrompt head,
3370–3470 callOpenAI, 5086 gate call, import region); `routes/conversations.ts` (orchestrate +
generateAIResponse wiring). Consumer-census greps across all `artifacts/api-server/src`.

## 13. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Constitution contents (laws, 6-level hierarchy, audit) | **High** | Read in full. |
| Orchestrator routing, 5-level hierarchy, handoffs, gate | **High** | Read in full. |
| Persona registry unwired (DR-0011) | **High** | 0 imports / 0 symbol references (grep-conclusive). |
| Intelligence modules unwired (DR-0012) | **High** | 0 consumers of all exported symbols. |
| Two-hierarchy conflict (DR-0013) | **High** | Both files read directly. |
| Model registry (2 IDs; stale comments) | **High** | Read in full. |
| callOpenAI mechanics (model/temp/timeout/retry/fallback) | **High** | Read the function body. |
| Full system-prompt layer set ("~30 layers") | **Medium** | Head + grep markers read; not all ~1670 prompt lines. |
| Whether `coachContext` is always passed → CEO checks always run | **Medium** | Gate call site read; caller branches not fully traced. |
| **Runtime behavior** (actual calls/outputs) | **UNVERIFIED** | No execution. |

Overall: **high confidence in structure and the wiring findings.** Open gaps (full prompt
enumeration, runtime execution) plus the newly-opened **high-severity DR-0011** cap this keystone at
**L3**; it can reach its **L4** target once DR-0011 is reconciled and the prompt layering is fully
verified.

## 14. Verification record

- Verified at commit `78ee536`.
- Independent re-derivation: consumer counts for `agent-personas`, `behavioral-intelligence`,
  `progression-intelligence` exported symbols = **0** each; `validateArchitectureGate` external call
  sites = **1** (`ai.ts:5086`); `orchestrate` wired in `conversations.ts:1003`.
- Model census: values in `openai-models.ts` ∈ {`gpt-4.1`, `gpt-4.1-mini`}; zero `gpt-4o` values
  despite comment references.
- Not run (documented gaps): full `ai.ts` read; runtime execution; exhaustive prompt-layer count.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
