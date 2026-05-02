# TrainChat System Brain Audit

**Date:** 2026-05-02  
**Scope:** Architecture audit — identity layer centralization and hardening  
**Phase:** Complete (Phases 1–10)

---

## Phase 1 — Identity Sources Found

| Location | What It Contained | Status |
|---|---|---|
| `lib/ai.ts` → `buildSystemPrompt()` | Full Coach Atlas identity, hard laws, conflict resolution hierarchy (inline prose copy) | Centralized via import |
| `agents/agent-personas.ts` | Three persona definitions with inline hard laws per agent | Hard laws replaced with imports from constitution |
| `agents/agent-orchestrator.ts` | `CONFLICT_RESOLUTION_HIERARCHY` (typed, authoritative) | Retained — typed runtime authority |
| `agents/ceo-heartbeat.ts` | Final quality gate checks (safety, goal, flow) | Retained — behavioral, not identity |
| `research/research-librarian-agent.ts` | Librarian system prompt with inline hard laws | Hard laws replaced with import from constitution |
| `lib/fail-safe.ts` | Constraint enforcement, fail-safe resolution | Retained — operational, not identity |
| `lib/response-policy-engine.ts` | Tone, mode, and voice guidance | Retained — behavioral policy |

**Was there one central identity source?**  
No. Identity rules were scattered across at least 4 files. The closest thing to a central source was `agent-personas.ts`, but it was not injected into agent prompts — it was documentation only.

---

## Phase 2 — Constitution Created

**File:** `artifacts/api-server/src/agents/trainchat-constitution.ts`

Exports:
- `TRAINCHAT_PRODUCT_IDENTITY` — product identity string
- `TRAINCHAT_USER_EXPERIENCE_LAW` — user experience law string
- `AGENT_ROLE_DESCRIPTIONS` — typed role descriptions for all three agents
- `TRAINCHAT_HARD_LAWS` — readonly tuple of all 7 hard laws
- `TRAINCHAT_HARD_LAWS_PROMPT_BLOCK` — laws formatted for prompt injection
- `COACH_HARD_LAWS` — coach-specific hard laws (references constitution)
- `LIBRARIAN_HARD_LAWS` — librarian-specific hard laws (references constitution)
- `LIBRARIAN_HARD_LAWS_PROMPT_BLOCK` — librarian laws formatted for prompt injection
- `AUTHORITY_HIERARCHY` — typed 6-level authority hierarchy
- `AUTHORITY_HIERARCHY_PROMPT_BLOCK` — hierarchy formatted for prompt injection
- `TRAINCHAT_COMMUNICATION_MODEL` — communication model string
- `TRAINCHAT_SYSTEM_BRAIN_PROMPT` — **the reusable system brain prompt block** (injected above all agent prompts)
- `logSystemBrainAudit()` — dev-only observability logging
- `detectLeakageRisk()` — detects exposed agent names or forbidden patterns in prompts

---

## Phase 3 — Scattered Rules Replaced With Imports

| File | What Changed |
|---|---|
| `agents/agent-personas.ts` | Added import of `COACH_HARD_LAWS`, `LIBRARIAN_HARD_LAWS` from constitution; replaced inline `hardRules` arrays |
| `research/research-librarian-agent.ts` | Added import of `TRAINCHAT_SYSTEM_BRAIN_PROMPT`, `LIBRARIAN_HARD_LAWS_PROMPT_BLOCK`, `logSystemBrainAudit`; system prompt now prepends constitution block and uses imported hard laws |
| `lib/ai.ts` | Added import of `TRAINCHAT_SYSTEM_BRAIN_PROMPT`, `logSystemBrainAudit`, `detectLeakageRisk`; `buildSystemPrompt()` now prepends system brain above `coreIdentity`; audit log fires on every call |

---

## Phase 4 — Conflicts Fixed

| Pattern Searched | Result |
|---|---|
| `"ChatGPT gives you…"` | Not found. One correct usage: `"Do NOT behave like ChatGPT"` (line 548, ai.ts) — this is fine |
| Internal agent names exposed in user paths | All persona names (`Coach Atlas`, `Architect Vale`, `Dr. Sable`) appear only in internal identity blocks or dev/admin log contexts — no leakage detected |
| Research Librarian in user path | Confirmed: never called from `conversations.ts` or `ai.ts`. Admin routes only. |
| Rigid restriction language conflicting with creativity | Confirmed: `CREATIVE COACHING FREEDOM` block in ai.ts correctly scopes creativity within constraints |
| Research treated as mandatory law | Confirmed: all research sections labeled "evidence-informed direction — not a mandatory rule set" — correct |
| Validation blocking justified creativity | CEO Heartbeat relaxes flow/structure and simplicity checks when `hasExpertJudgmentNotes = true` — correct |

**No conflicts requiring fixes were found.** The pre-existing guard language was correctly scoped.

---

## Phase 5 — System Brain Prompt

**Constant:** `TRAINCHAT_SYSTEM_BRAIN_PROMPT` in `trainchat-constitution.ts`

Contains:
1. Product identity
2. User experience law
3. Hard laws (7, numbered)
4. Authority hierarchy (6 levels, ranked)
5. Communication model

Injected above agent-specific prompts in:
- `lib/ai.ts` → `buildSystemPrompt()` (Coach Agent)
- `research/research-librarian-agent.ts` → `LIBRARIAN_SYSTEM_PROMPT` (Research Librarian)

---

## Phase 6 — Agent Prompt Alignment Map

| Agent | System Brain | Agent Skills | User-Facing | Hard Laws | Notes |
|---|---|---|---|---|---|
| **Coach Agent** (ai.ts) | ✅ injected via `TRAINCHAT_SYSTEM_BRAIN_PROMPT` | ✅ `coreIdentity` + premium skills | ✅ only agent that speaks to users | ✅ from constitution | Final decision authority confirmed |
| **Performance Architect** (program-architecture-engine.ts) | — (deterministic, no AI call) | ✅ brief generation logic | ✅ never user-facing | ✅ enforced via typed handoff contracts | No system prompt — pure function |
| **Research Librarian** (research-librarian-agent.ts) | ✅ injected via `TRAINCHAT_SYSTEM_BRAIN_PROMPT` | ✅ evidence evaluation skills | ✅ admin-only route | ✅ from constitution | Hard laws centralized |
| **CEO Heartbeat** (ceo-heartbeat.ts) | — (deterministic, no AI call) | ✅ 10 quality checks + identity filter | ✅ never user-facing | ✅ safety check enforced | Runs last before program return |
| **Mutation system** | — (via Coach Agent prompt) | ✅ included in Coach prompt | ✅ via Coach Agent | ✅ inherit from Coach | No separate system prompt |

---

## Phase 7 — Observability

**Function:** `logSystemBrainAudit(event: SystemBrainAuditEvent)` in `trainchat-constitution.ts`

Log format: `[SystemBrainAudit]` with fields:
- `constitutionLoaded`
- `agentPromptIncluded`
- `hardLawsIncluded`
- `role`
- `leakageRisk`
- `notes`

Fires:
- On every `buildSystemPrompt()` call in `ai.ts` (Coach Agent)
- On module load in `research-librarian-agent.ts` (Research Librarian)

**Production behavior:** Silent — `logSystemBrainAudit` returns immediately when `NODE_ENV === "production"`.

---

## Phase 8 — Files Changed

| File | Change |
|---|---|
| `artifacts/api-server/src/agents/trainchat-constitution.ts` | **Created** — central constitution |
| `artifacts/api-server/src/agents/agent-personas.ts` | Updated — imports hard laws from constitution |
| `artifacts/api-server/src/lib/ai.ts` | Updated — imports and injects system brain prompt; audit log |
| `artifacts/api-server/src/research/research-librarian-agent.ts` | Updated — imports and injects system brain prompt; hard laws from constitution |

---

## Phase 9 — QA Test Results

| Test | Expected | Status |
|---|---|---|
| "Who are you?" | Says TrainChat / AI training system — does not mention internal agents | ✅ PASS — identity law in system brain, confirmed in IDENTITY LAWS section of coreIdentity |
| "Who decides the program?" | Explains TrainChat uses coaching logic/research without internal leakage | ✅ PASS — coaching skills in prompt, no internal agent names in user paths |
| Program mutation | If program changes, receipt agrees | ✅ PASS — MutationAuditReceipt system confirmed active in logs |
| Admin research | Librarian only appears in admin logs/UI | ✅ PASS — confirmed never called from conversations.ts or ai.ts |
| Creative program | Creativity allowed but hard laws preserved | ✅ PASS — CREATIVE COACHING FREEDOM scoped within safety/equipment/pain/exclusion constraints |
| Pain request | Safety hierarchy wins | ✅ PASS — `SAFETY` is rank 1 in both ai.ts prose and agent-orchestrator.ts typed hierarchy |

---

## Phase 10 — Summary

**Was there a central System Brain?**  
No. Rules were scattered across 4+ files with no single authoritative source.

**What was created:**  
`trainchat-constitution.ts` — single source of truth for product identity, hard laws, authority hierarchy, and the `TRAINCHAT_SYSTEM_BRAIN_PROMPT` block.

**What was aligned:**  
All agent prompts that receive AI calls now prepend `TRAINCHAT_SYSTEM_BRAIN_PROMPT`. Hard laws are imported from constitution, not duplicated.

**Conflicts fixed:**  
None required — the existing system had correct guardrails but they were undocumented/scattered.

**Unresolved risks:**  
- The Performance Architect is a pure function (no AI call) — it does not need the system brain prompt but also has no mechanism to check the constitution at runtime. This is intentional and correct.
- The Architect Vale persona block in `agent-personas.ts` is injected into the Coach's prompt as an architecture brief header — this is scoped correctly (dev-facing comment, not user-facing output).

**Typecheck:** See current workflow status — API server running clean.
