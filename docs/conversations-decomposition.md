# conversations.ts Decomposition Audit

> **Document type:** Implementation audit — engineering record
> **Source of truth:** `artifacts/api-server/src/routes/conversations.ts`
> **Purpose:** Track what has been extracted from conversations.ts into `conversation-routing.ts`, what was audited but not extracted, and the rationale for stopping points. Updated after each phase.

---

## Overview

`artifacts/api-server/src/routes/conversations.ts` contains two large request handlers (non-SSE and SSE) that share routing logic, formatting strings, and pure decision functions inline. The decomposition project extracts only pure, side-effect-free helpers into `artifacts/api-server/src/lib/conversation-routing.ts` with focused unit tests for each.

**Extraction constraints (non-negotiable throughout all phases):**

- Do not move DB writes
- Do not move AI calls
- Do not change response shapes
- Do not change SSE behavior
- Do not move switch branch bodies beyond pure formatting
- Do not capture passwords, API keys, authorization headers, Stripe secrets, OpenAI keys, or session secrets

---

## Phases completed

### Phase 5B — `resolveResponseMode` + `classifyOrchMutationType`

**Helpers extracted:**

- `resolveResponseMode(action, intentFamily): ResponseMode` — maps execution plan action + intent family to the ResponseMode string that drives system-prompt template selection. Identical inline in both handlers.
- `classifyOrchMutationType(mutationType): "structural" | "minor" | undefined` — classifies mutation type into the two-tier taxonomy used by the orchestrator.

**Tests added:** initial routing test suite established.

---

### Phase 5D — `shouldBypassEditEngine` + `DELOAD_INTENT_FAMILIES` + `EditEngineBypassReason`

**Helpers extracted:**

- `DELOAD_INTENT_FAMILIES: ReadonlySet<IntentFamily>` — the set of intent families that trigger the deload approval gate.
- `EditEngineBypassReason` (type union) — `"suggest_only" | "requireApprovalDeload" | "requireApprovalStructural" | null`
- `shouldBypassEditEngine(agentSettings, intentFamily, orchMutationType): EditEngineBypassReason` — encodes the three approval gates that appear identically in both APPLY_MUTATION switch cases. Caller retains logging and the `break` that routes to the AI path.

**Tests added:** gate permutation matrix (suggest_only, requireApprovalDeload × in/out of family, requireApprovalStructural × structural/minor).

---

### Phase 5E — `resolveClarificationPendingFamily`

**Helper extracted:**

- `resolveClarificationPendingFamily(planIntentFamily, userMessage, focusMode): string` — resolves the intent family to store in a pending-clarification DB record. Execution planner occasionally emits `"clarification_required"` as a fallback; this function re-runs `normalizeToIntentFamily` to recover the real family from the raw user message when that sentinel is detected.

**Key fix captured:** the `vi.hoisted()` pattern is required for all mock fns referenced in `vi.mock()` factories — a plain `const` at module level throws `ReferenceError: Cannot access '...' before initialization` because vitest hoists the factory before `const` initialization.

**Tests added:** passthrough of valid families, sentinel detection + recovery, null/undefined inputs.

---

### Phase 5F — `formatChoiceCard` + `ChoiceCardInput`

**Helpers extracted:**

- `ChoiceCardInput` (interface) — `{ prompt: string; choices: Array<{ label: string; action: string }> }`
- `formatChoiceCard(choiceCard: ChoiceCardInput): { content: string; structuredData: string }` — formats a choice card into the two strings written to the DB and returned in the response. Identical logic in both ACTION_CHOICE_CARD branches.

**Tests added:** choice rendering, structuredData shape, multi-choice numbering.

---

### Phase 5G — `formatSafetyRefusal` + `SAFETY_REFUSAL_DEFAULT`

**Helpers extracted:**

- `SAFETY_REFUSAL_DEFAULT` (internal constant) — `"I can't design sessions intended to cause pain or injury. Let me know if you want to increase intensity safely."`
- `formatSafetyRefusal(safetyRefusal?: { message: string }): { content: string; structuredData: string }` — formats the SAFETY_REFUSAL response. Both branches use custom message if present, else default; structuredData is always `{ _type: "safety_refusal" }`.

**Tests added:** custom message passthrough, undefined → default, structuredData type field.

---

### Phase 5H — `formatSaveProgram`

**Helper extracted:**

- `formatSaveProgram(saveSuccess, programToSave): { baseContent: string; structuredData: string | null }` — three-outcome formatter: success with program name, failure with program present, no program to save. SSE handler appends an optional confidence line to `baseContent` after calling this; non-SSE uses it directly.

**TypeScript constraint recorded:** `ProgramStructure` has no index signature, so the parameter type is narrowed to `{ programName: string } | null | undefined` — the only field the helper reads. `JSON.stringify` accepts the full object at the call site via implicit widening.

**Tests added:** all three outcome branches, structuredData null vs present.

---

### Phase 5I — APPLY_MUTATION audit (read-only)

Audit only. No code extracted.

**Key findings:**
- Three sub-paths: approval gates (extracted in 5D), clarification-followup, direct-vibe-edit
- `applyEditPlan`, `interpretMutationRequest`, `interpretEditRequest`, `createChangeLogEntry`, and the `changeLogId !== null` catch guard are all unsafe to touch
- `formatSystemEditData` and `formatMutationFailureContent` are safe for extraction (Phase 5J)

---

### Phase 5J — `formatSystemEditData` + `formatMutationFailureContent`

**Helpers extracted:**

- `formatSystemEditData(params): { _type: "system_edit"; ... }` — assembles the `system_edit` structuredData object written to the DB on a successful APPLY_MUTATION turn. Identical shape in four places (non-SSE and SSE × direct-edit and clarification-followup).
- `formatMutationFailureContent(mutationType): string` — returns the user-facing failure message for the catch block's true-failure path, selecting a mutation-type-specific verb (add / remove / swap / apply).

**Tests added:** all four systemEditData field combinations, all four mutationType verb branches, null/undefined inputs.

---

### Phase 5K — REBUILD_PROGRAM audit (read-only)

Audit only. No code extracted. See full findings below.

---

## Current safe stopping point

After Phase 5J, the extractable pure-formatting surface of `conversations.ts` is exhausted. The remaining REBUILD_PROGRAM-specific logic does not meet the extraction bar (pure formatting, no handler-local mutation, clear duplication of a testable contract). The decomposition is complete at this point.

---

## REBUILD_PROGRAM audit findings

### What the switch case actually contains

```typescript
case "REBUILD_PROGRAM":
case "GUIDANCE":
case "NO_OP":
default:
  break;
```

No body. REBUILD_PROGRAM falls through to `break` and the standard AI path. All REBUILD_PROGRAM-specific logic lives **outside** the switch in three discrete locations.

### Full responsibility map

| Location | Lines (approx) | What it does | Side effects | Extractable? |
|---|---|---|---|---|
| Structural approval gate | non-SSE ~882, SSE ~3543 | Appends approval directive string to `memoryCtx` | Mutates `memoryCtx` (handler-local) | No — local mutation |
| Pre-transform block | non-SSE ~2568, SSE ~4869 | `resolveTransformType` → `transformProgram` → `buildTransformPromptHint` | Writes `preTransformedProgram`, `transformHint` (handler-local) | Partially pure, but output is immediate local mutation |
| `generateAIResponse` call | shared with GUIDANCE/NO_OP | AI call using `preTransformedProgram` and `transformHint` | External API | Must stay |
| `_buildMeta` enrichment | non-SSE ~2882, SSE ~5126 | Attaches build metadata to `structuredData` post-AI-call | Mutates `structuredData` in-place | Must stay — shared with CREATE/START_NEW |
| `saveOrUpdateProgram` | non-SSE ~2963, SSE ~5200 | Writes program to DB, creates change log | DB write | Must stay |
| Response | standard `res.json` / `done(buildCompleteEvent(...))` | Shared with GUIDANCE/NO_OP | — | Nothing REBUILD-specific |

### Why REBUILD_PROGRAM should not be extracted yet

**1. No pure formatting output.** Every Phases 5B–5J extraction targeted a function that returns a value (a string, a typed object, a `{ content, structuredData }` pair) without writing to any handler-local variable. REBUILD_PROGRAM has no equivalent. Its pre-transform block immediately assigns `preTransformedProgram` and `transformHint` — handler-local mutable variables that feed directly into `generateAIResponse`. Extracting this requires returning both values and reassigning them at the call site, which is a refactor of the mutation surface, not a pure formatting extraction.

**2. Divergence between handlers.** The non-SSE pre-transform block logs `logger.info({ transformType, resultingSplit, preserved, removed })` on success. The SSE version does not. This divergence is intentional. Any extraction must either preserve the divergence (by passing a logging callback or making the caller responsible for the log) or silently drop the non-SSE log — both are more complex than leaving the blocks in place.

**3. `_buildMeta` enrichment fires post-AI-call.** It mutates `structuredData` in-place and must execute after `generateAIResponse` returns but before the `messagesTable` DB insert. It is also shared with `CREATE_PROGRAM` and `START_NEW_PROGRAM` — it is not a REBUILD_PROGRAM-specific helper.

**4. `saveOrUpdateProgram` is a DB write.** It is explicitly excluded from extraction scope throughout all phases.

**5. SSE has an additional guard not present in non-SSE.** The `_hasCriticalStructuralIssue` guard (~line 5182 SSE) blocks saves of programs with empty-exercise days. Non-SSE does not have this guard. Touching the save block risks losing this asymmetry.

---

## Risks around key subpaths

### `preTransformedProgram` and `transformHint`

- Both are set by the pre-transform block and consumed immediately by `generateAIResponse`
- `preTransformedProgram` defaults to `currentProgram` (unchanged) if the block is skipped (`currentProgram` is null) or if `transformProgram` throws
- `transformHint` is additive — each injecting block appends to it; changing assignment order would corrupt the prompt
- If any extraction misses the `&& currentProgram` guard, `transformProgram` receives null and throws

### `_buildMeta`

- Fires conditionally on `intentResult.type === "STRUCTURAL_REBUILD"` for REBUILD_PROGRAM turns (and on `CREATE_PROGRAM` / `START_NEW_PROGRAM`)
- Mutates `structuredData` in-place **before** the `messagesTable` insert — the timing is load-bearing
- `goalToFocusMode`, `generateCoachReasoning`, and `buildMicroReasons` are all called with handler-local constraint data; they cannot be called from a standalone helper without receiving that data as parameters

### `saveOrUpdateProgram`

- Async DB write; returns `{ system, changeLogId, isUpdate }` which drives `turnOutcome` mutations
- Non-SSE lacks `_hasCriticalStructuralIssue` guard; SSE has it — the asymmetry is intentional
- `changeLogId` returned here is used downstream in the response alignment verifier (SSE) and in the final response JSON (non-SSE)

---

## Recommended prerequisite tests before touching REBUILD_PROGRAM

If a future phase attempts the pre-transform block extraction:

1. **`resolveTransformBlock(meta, currentProgram, userMessage)` contract tests:**
   - `currentProgram = null` → both outputs unchanged (no-op path)
   - valid `meta.targetSplit + targetDays` → correct `transformType`, non-null `splitHint` appended to `transformHint`
   - `transformProgram` throws → `preTransformedProgram` falls back to `currentProgram`, `transformHint` unchanged
   - `meta` entirely undefined → `targetSplit = "unknown"`, `targetDays = currentProgram.days.length`

2. **Approval gate directive constant test:**
   - If the directive string is extracted as a named constant, verify the injected string matches what the `requireApprovalStructural` smoke tests assert on

3. **`_buildMeta` timing integration test:**
   - Confirm `_buildMeta` is present in `structuredData` at the point of `messagesTable` insert for a `STRUCTURAL_REBUILD` intent turn

4. **Non-SSE vs SSE log divergence test:**
   - If the pre-transform block is unified, confirm the non-SSE `logger.info` on success is preserved and the SSE path does not log it

---

## Helpers in `conversation-routing.ts` (current state)

| Helper | Phase | Type | Notes |
|---|---|---|---|
| `resolveResponseMode` | 5B | Function | Maps action + intentFamily → ResponseMode |
| `classifyOrchMutationType` | 5B | Function | "structural" \| "minor" \| undefined |
| `DELOAD_INTENT_FAMILIES` | 5D | Constant | `ReadonlySet<IntentFamily>` |
| `EditEngineBypassReason` | 5D | Type | Bypass reason union |
| `shouldBypassEditEngine` | 5D | Function | Three-gate approval logic |
| `resolveClarificationPendingFamily` | 5E | Function | Sentinel recovery for pending-clarification DB record |
| `ChoiceCardInput` | 5F | Interface | Narrowed input type for formatChoiceCard |
| `formatChoiceCard` | 5F | Function | ACTION_CHOICE_CARD → content + structuredData |
| `SAFETY_REFUSAL_DEFAULT` | 5G | Constant (internal) | Default refusal message |
| `formatSafetyRefusal` | 5G | Function | SAFETY_REFUSAL → content + structuredData |
| `formatSaveProgram` | 5H | Function | SAVE_PROGRAM → baseContent + structuredData |
| `formatSystemEditData` | 5J | Function | APPLY_MUTATION success → system_edit object |
| `formatMutationFailureContent` | 5J | Function | APPLY_MUTATION catch → failure message string |

---

## Test counts at completion

| Phase | Routing tests | api-server total | Notes |
|---|---|---|---|
| 5D (baseline) | 48 | 1551 | — |
| 5E | 57 | 1560 | +9 routing |
| 5F | 65 | 1568 | +8 routing |
| 5G | 76 | 1579 | +11 routing |
| 5H | 97 | 1600 | +21 routing |
| 5J | (incremental) | (incremental) | formatSystemEditData + formatMutationFailureContent |

11 pre-existing DATABASE_URL failures in `adjustment-intent.test.ts` and related files are environment failures unrelated to this decomposition project. They persist unchanged throughout all phases.
