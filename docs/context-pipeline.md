---
title: Context Pipeline — Deixis Resolver, UIContext & System-Prompt Assembly
doc_type: implementation
subsystem: context-pipeline
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/api-server/src/lib/conversation-context-resolver.ts
  - artifacts/api-server/src/lib/ai.ts
  - artifacts/api-server/src/routes/conversations.ts
related_architecture:
  - "CLAUDE.md §4 (Unified Context Pipeline / UIContext; Conversation Context Resolver)"
related_implementation:
  - "docs/ai-agents.md (buildSystemPrompt assembles the Coach prompt; inlined coreIdentity)"
  - "docs/mutation-pipeline.md (resolver rewrites mutation deictics → restore-from-changeLogId)"
  - "docs/db-schema.md (pending_clarifications; system_change_log changeLogId)"

last_generated: 2026-06-28
last_verified: 2026-06-28
verified_by: claude (Version 2, Wave 2 doc #5)
verified_commit: 78ee536
verification_method: >
  Read conversation-context-resolver.ts (constants, reference types, store, TTL sweep, the
  resolveContextualMessage head + branches) and the UIContextData interface + buildUIContextSection
  in ai.ts; read the system-prompt layer assembly region of buildSystemPrompt (1737–1910). Verified
  wiring with grep: resolver call sites in conversations.ts (resolveContextualMessage,
  tickConversationTurn, storeMutationReference, inferExerciseReferenceFromMutation); confirmed
  storeExerciseReference/storeSessionReference have NO production callers (tests only); confirmed the
  module-level in-memory Map and deploymentTarget=autoscale. NOT done: full read of
  resolveContextualMessage (337–598) every branch, and the full ~1670-line buildSystemPrompt; no
  runtime execution. Such claims are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0020, summary: "Conversation context resolver uses a module-level in-memory Map; deploymentTarget is autoscale → server-side conversational context is not shared across instances", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0021, summary: "storeExerciseReference/storeSessionReference are unused in production (tests only); exercise/session deictic refs are populated only via mutation inference, not from AI responses or user mentions", kind: code-vs-architecture, severity: low, status: open }
  - { id: DR-0022, summary: "Two overlapping deixis-resolution strategies coexist: the deterministic resolver (rewrites the message) and the LLM-delegated UIContext prompt section ('resolve the reference using the above context')", kind: doc-vs-code, severity: low, status: open }
  - { id: DR-0023, summary: "CLAUDE.md §4 claims '~30 conditional context blocks'; ~10+ distinct engine blocks observed, exact count unverified", kind: doc-vs-code, severity: low, status: open }
---

# Context Pipeline — Deixis Resolver, UIContext & System-Prompt Assembly

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Implementation doc reconciled against the context resolver + the prompt-assembly path. **Code wins**
> on disagreement. The full per-branch resolver logic and the complete ~1670-line `buildSystemPrompt`
> were not read line-by-line; runtime claims are **(UNVERIFIED)**.

## 1. Purpose & scope

How TrainChat assembles the *context* a turn runs against. Two cooperating mechanisms map to the two
bullets in `CLAUDE.md §4`:
- **Conversation Context Resolver** — server-side, deterministic resolution of cross-turn deictic
  references ("undo that", "do the same for Day 2") that **rewrites the message** before planning.
- **Unified Context Pipeline / UIContext** — the layered **system-prompt assembly** in
  `buildSystemPrompt`, including a `UIContext` section built from the frontend's current view, which
  the LLM uses to resolve "this/here/that session".

Out of scope: the research/memory/periodization *engines* whose output these layers inject (their own
docs); the mutation execution they precede (`mutation-pipeline.md`).

## 2. Source map

| File | Wired? | Responsibility |
|---|---|---|
| `lib/conversation-context-resolver.ts` (640) | ✅ | In-memory deixis resolver: reference types, TTL store + sweep, `resolveContextualMessage`, store/infer/tick helpers. |
| `lib/ai.ts` → `buildSystemPrompt` (229–~1910) | ✅ | Assembles the layered system prompt from a `RoutingDecision`; two branches (authenticated / unauthenticated). |
| `lib/ai.ts` → `UIContextData` + `buildUIContextSection` (2556+) | ✅ | Renders the frontend's current view into a `## CURRENT USER CONTEXT` prompt section. |
| `routes/conversations.ts` | ✅ | Calls the resolver before planning and stores references after mutations. |

## 3. Conversation Context Resolver (deterministic, message-rewriting)

- **DB-free, in-memory.** Module-level `const store = new Map<conversationId, ConversationContextState>()`.
  Each state holds `lastExerciseReference`, `lastSessionReference`, `lastMutationReference`.
- **Reference types:** `ExerciseReference`, `SessionReference`, `MutationReference` — each with
  `turnsRemaining`, `createdAt`, and a `source` ("ai_response" | "user_mention" | "mutation_target").
- **TTL:** exercise/session refs expire after `MAX_TURNS = 2` **or** `MAX_AGE_MS = 5 min`; mutation
  refs persist `MUTATION_MAX_AGE_MS = 30 min` ("undo/redo should feel like a document editor"). A
  `setInterval(..., 5 min).unref()` sweep prunes expired refs and empty entries.
- **`resolveContextualMessage(conversationId, message, activeSystemId?)`** → a tagged union:
  `{resolved:true, resolvedMessage}` | `{resolved:false, ambiguous:true, clarificationQuestion}` |
  `{resolved:false, ambiguous:false}` (no deictic phrase → pass through). Priority: **mutation
  deictic > exercise > session**. Examples implemented: *undo* → `"Undo the last change … Restore
  from changeLogId N"`; *apply program-wide* → replays `mutRef.userRequest` across all sessions;
  *do-same-for-target* → repeats the change for an extracted target. Missing reference → a
  clarification question (never a silent guess — matches CLAUDE.md). A **cross-system leakage guard**
  warns when resolving a deictic without `activeSystemId`.

### Wiring (live)
In `conversations.ts`: `tickConversationTurn` (3328), `resolveContextualMessage` (3674, before the
execution planner), `storeMutationReference` + `inferExerciseReferenceFromMutation` (4092/4102 and
4876/4887, after a mutation). The resolver is genuinely connected — unlike the unwired modules in
`ai-agents.md §7`.

### Partial wiring (finding)
`storeExerciseReference` / `storeSessionReference` (the public setters for "ai_response"/"user_mention"
sources) have **no production callers** (tests only). Exercise/session references are therefore
populated **only by mutation inference** (`inferExerciseReferenceFromMutation`/`…Session…`), never
from a non-mutation AI suggestion or a plain user mention. So "change that exercise" immediately
after the AI *proposes* one (with no mutation yet) has no stored reference to resolve against. (DR-0021)

## 4. UIContext (LLM-delegated resolution)

`UIContextData` (frontend-supplied) carries `page`, `activeProgramId/Name`, `selectedWeek`,
`selectedSessionId/Name`, `selectedExerciseId/Name`, `panelState`. `buildUIContextSection` renders
present fields into a `## CURRENT USER CONTEXT` block ending with: *"When the user says 'this',
'here', 'that session' … resolve the reference using the above context before responding."* — i.e.
the **LLM** performs this resolution from what the user is *viewing*, sent fresh on each request.

This is a **second, overlapping** deixis strategy alongside the deterministic resolver (§3). They
differ in mechanism (server rewrite vs LLM instruction) and signal (cross-turn history vs current
view). CLAUDE.md §4 lists both but does not note the overlap. (DR-0022.) Because UIContext is sent
per-request, it survives across instances even though the resolver's in-memory state does not (§6).

## 5. System-prompt assembly (`buildSystemPrompt`)

Driven by a `RoutingDecision`: `const routing = precomputedRouting ?? resolveRoutingDecision(userMessage, profile)`
(1737). It concatenates `TRAINCHAT_SYSTEM_BRAIN_PROMPT` + an **inlined** `coreIdentity` (the Coach
Atlas block — see `ai-agents.md` DR-0011) + many **conditional engine blocks**, each gated by the
routing decision. Observed blocks include: re-entry, periodization, mobility, special-considerations
(+clarification), return-from-injury (+clarification), routing hint, home-gym constraint, research
context + research-programming guidance, the UIContext section, and the user profile block. There are
**two branches**: authenticated (full profile) and unauthenticated (conversion path, ~1653). A
`PROMPT_SIZE_WARN_THRESHOLD = 22000` guards size (`ai-agents.md §6`).

- **Count:** ~10+ distinct engine blocks were directly observed; CLAUDE.md §4's "~30 conditional
  context blocks" is plausible if sub-layers are counted but was **not precisely verified** (DR-0023).
- **Routing-signal fragility (archaeology):** code comments document that re-entry and periodization
  engines *previously* passed `profile.trainingGoal` instead of `userMessage` as the trigger signal,
  so chat-driven activations silently never fired — since fixed to pass `userMessage`. The engines
  are keyword/routing-triggered, and this signal plumbing has been historically fragile. (Observation;
  the bug is fixed — not a current DR.)

## 6. Architecture observation: in-memory state vs autoscale (headline)

The resolver's `store` is a **process-local `Map`**, and `.replit` sets `deploymentTarget = "autoscale"`.
On a multi-instance deployment, a follow-up turn routed to a *different* instance finds an empty
store — server-side conversational references (especially the 30-minute mutation/undo window) would
be **silently lost**. The LLM-side UIContext (sent per request) is unaffected, but deterministic
"undo that" / "do the same" resolution is not horizontally durable. CLAUDE.md §4 accurately calls it
"in-memory, short-TTL" but does not flag the autoscale implication. (DR-0020.)

## 7. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0020 | In-memory module-level resolver store + autoscale deployment → conversational context not shared across instances. | code-vs-architecture | medium |
| DR-0021 | `storeExerciseReference`/`storeSessionReference` unused in production; exercise/session refs only set via mutation inference. | code-vs-architecture | low |
| DR-0022 | Two overlapping deixis-resolution strategies (deterministic resolver vs LLM-delegated UIContext). | doc-vs-code | low |
| DR-0023 | "~30 conditional context blocks" (CLAUDE.md §4) unverified; ~10+ distinct blocks observed. | doc-vs-code | low |

No `high`-severity items opened.

## 8. Cross-references to prior implementation docs

- **`ai-agents.md`:** `buildSystemPrompt` is the Coach's assembler; this doc confirms the
  **inlined `coreIdentity`** (corroborates DR-0011) and partially corroborates the "~30 layers" claim
  (DR-0023). `TRAINCHAT_SYSTEM_BRAIN_PROMPT` is the wired constitution head.
- **`mutation-pipeline.md`:** the resolver and the mutation pipeline interlock — a mutation calls
  `storeMutationReference({changeLogId, …})`; the next turn's "undo that" resolves to *"Restore from
  changeLogId N"*, where `changeLogId` is the `system_change_log` id this doc's sibling describes.
  Resolution runs **before** the mutation pipeline (planner sees the rewritten message).
- **`db-schema.md`:** the resolver is **DB-free**; this is distinct from the `pending_clarifications`
  table — the resolver *emits* a clarification question, but its persistence (if any) is a separate
  clarification flow, not this in-memory layer.

## 9. Recommended CLAUDE.md updates

Proposals only (governance §2/§7), each source-supported:

1. **§4** — Note the resolver is **process-local in-memory** and therefore not durable under the
   `autoscale` deployment target; mutation/undo carryover can be lost across instances. (DR-0020.)
2. **§4** — Clarify there are **two** deixis mechanisms (deterministic message-rewrite resolver +
   LLM-delegated UIContext section) and how they differ. (DR-0022.)
3. **§4** — Note exercise/session reference capture is currently **mutation-inferred only** (the
   AI-response/user-mention setters are unwired). (DR-0021.)
4. **§4** — Replace the soft "~30 conditional context blocks" with a verified count, or qualify it.
   (DR-0023.)

The deixis-resolution design (rewrite-before-plan, clarify-don't-guess, document-editor undo window)
is sound; the gaps are durability under autoscale and partial reference capture.

## 10. Files reviewed

`lib/conversation-context-resolver.ts` (constants, types, store, TTL sweep, resolution head +
branches); `lib/ai.ts` (`buildSystemPrompt` 229–300 + 1737–1910 assembly region; `UIContextData` +
`buildUIContextSection` 2556–2600); `routes/conversations.ts` (resolver wiring). Consumer-census
greps; `.replit` deploymentTarget.

## 11. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Resolver types, TTL, store, sweep | **High** | Read directly. |
| Resolver wiring (live) + unused setters (DR-0021) | **High** | Call-site grep, prod-vs-test census. |
| UIContext shape + LLM-delegated resolution | **High** | Read interface + builder. |
| In-memory + autoscale implication (DR-0020) | **High** | Module-level Map + `.replit` confirmed. |
| System-prompt layer set | **Medium** | Assembly region read; full ~1670 lines + every branch not read (DR-0023). |
| Full resolveContextualMessage branch logic | **Medium** | Head + several branches read, not all (337–598). |
| **Runtime behavior** | **UNVERIFIED** | No execution. |

Overall: **high confidence in the resolver, UIContext, and the autoscale finding**; the open gaps
(full prompt enumeration, every resolver branch, runtime) keep this at its **L3** target.

## 12. Verification record

- Verified at commit `78ee536`.
- Independent checks: resolver live call sites in conversations.ts confirmed; `storeExerciseReference`/
  `storeSessionReference` production callers = 0 (tests only); `store` is a module-level `Map`;
  `.replit` `deploymentTarget = "autoscale"`; `buildSystemPrompt` routing source = `resolveRoutingDecision`.
- Not run (documented gaps): full resolver/branch read; full `buildSystemPrompt` read; runtime execution.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
