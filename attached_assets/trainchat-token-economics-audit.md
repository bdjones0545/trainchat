# TrainChat — Token Economics + Action Cost Audit
**Audit Date:** May 15, 2026  
**Codebase Scope:** Full API server pipeline — `artifacts/api-server/src/`  
**Auditor:** Internal architecture review

---

## Pricing Basis

| Model | Input | Output |
|---|---|---|
| `gpt-4.1` | $2.00 / 1M tokens | $8.00 / 1M tokens |
| `gpt-4.1-mini` | $0.40 / 1M tokens | $1.60 / 1M tokens |

All estimates use ~4 chars/token conversion. System prompt sizes derived from source — the `PROMPT_SIZE_WARN_THRESHOLD` in `ai.ts` is set at 22,000 chars (≈ 5,500 tokens), and the coach identity block alone spans lines 218–649 (≈ 3,500–4,000 tokens) before any dynamic extras are injected.

---

## AUDIT CATEGORY 1 — COST PER USER ACTION (Ranked Table)

### Pipeline Map First

Every authenticated chat turn runs this sequence:

```
1. LLM Intent Interpreter  (gpt-4.1-mini)   — always
2. Coach Agent main call   (gpt-4.1 CORE)   — always
3. Edit Intent call        (gpt-4.1)         — if APPLY_MUTATION path
4. Edit Engine             (DB only)         — if APPLY_MUTATION path
5. Mutation Verifier       (DB only, no AI)  — always post-mutation
6. Directions Service      (gpt-4.1)         — sidebar mutations only
7. Truncation retry        (gpt-4.1)         — build path, if triggered
```

Forecast generation and memory retrieval are both zero-AI-cost (DB-only).

---

### Ranked Cost Table: Highest → Lowest

| Rank | Action | Model Calls | Models Used | Est. Input Tokens | Est. Output Tokens | Est. Cost | Latency Driver |
|---|---|---|---|---|---|---|---|
| 1 | **Full block rebuild** | 1–2 | gpt-4.1 (×2 if retry), mini (×1) | 7,000–9,000 | 3,200–4,500 | **$0.040–$0.096** | Large output + truncation retry risk |
| 2 | **First program generation** | 1–2 | gpt-4.1 (×1–2), mini (×1) | 5,000–8,000 | 2,600–3,600 | **$0.031–$0.087** | System prompt size + possible retry |
| 3 | **Multi-turn refinement loop** (3 turns) | 3–6 | gpt-4.1, mini | 18,000–27,000 | 8,400–9,600 | **$0.103–$0.131** | Cumulative cost across 3 edit turns |
| 4 | **Program refinement** (single APPLY_MUTATION) | 3 | gpt-4.1 (×2), mini (×1) | 9,000–13,000 | 4,300 | **$0.052–$0.060** | Dual gpt-4.1 calls (Coach + EditIntent) |
| 5 | **Exercise swap** (sidebar) | 2 | gpt-4.1 (×2) | 5,000–7,000 | 1,200 | **$0.020–$0.024** | Directions + EditIntent dual call |
| 6 | **Direct sidebar mutation** (add/remove) | 2 | gpt-4.1 (×2) | 5,000–7,000 | 1,200 | **$0.020–$0.024** | Directions + EditIntent dual call |
| 7 | **Behavioral intelligence adaptation** | 2–3 | gpt-4.1, mini | 6,000–8,000 | 2,000–2,800 | **$0.029–$0.038** | Coach call + memory injection overhead |
| 8 | **Guest onboarding interaction** | 1–2 | gpt-4.1, mini | 500–1,200 | 700–1,200 | **$0.007–$0.011** | Small guest prompt; extraction is mini |
| 9 | **SSE streaming generation** | 1 | gpt-4.1 | 5,000–8,000 | 2,000–2,800 | **$0.026–$0.038** | Same as coach call; no token overhead |
| 10 | **Cross-conversation continuity opener** | 1–2 | gpt-4.1, mini | 5,500–7,000 | 2,000 | **$0.027–$0.030** | Memory injection adds ~500–800 tokens |
| 11 | **Proactive coaching message** | 0–1 | gpt-4.1 (if AI) | 3,000–5,000 | 500–800 | **$0.010–$0.016** | Unclear if AI-generated or rule-based |
| 12 | **Undo / restore operation** | 0 | DB only | 0 | 0 | **$0.000** | DB snapshot restore |
| 13 | **Memory extraction** | 0 | DB side-effect | 0 | 0 | **$0.000** | Passive from conversation context |
| 14 | **Forecast generation** | 0 | DB queries only | 0 | 0 | **$0.000** | Fully deterministic pattern recognition |
| 15 | **Voice command processing** | +1 intent step | mini (×1 extra) | +200–400 | +200 | **+$0.001** | Transcription overhead only |

> **Key finding:** The two most expensive single actions (full rebuild, first program generation) can cost up to **$0.096 per action** when truncation retries fire. A 3-turn refinement loop costs over **$0.13**. These are the dominant scaling risks.

---

## AUDIT CATEGORY 2 — MODEL USAGE OPTIMIZATION

### Current Model Assignments

| Slot | Role | Current Model | Justification in Code |
|---|---|---|---|
| CORE | Coach Agent main call | `gpt-4.1` | "Highest-value generation surface" |
| GUEST_RESPONSE | Guest chat generation | `gpt-4.1` | "Highest-value generation surface" |
| PROGRAM_GENERATION | Guest program JSON | `gpt-4.1` | "Highest-value generation surface" |
| EDIT_ENGINE | Structured edit application | `gpt-4.1` | "Structured edit layer" |
| EDIT_INTENT | Natural language → edit plan | `gpt-4.1` | "Structured edit layer" |
| DIRECTIONS | Direction chooser options | `gpt-4.1` | "Structured edit layer" |
| EXERCISE_FALLBACK | Harder/easier progression | `gpt-4.1` | "Utility/fallback" |
| SWAP_BACKSTOP | Last-resort exercise swap | `gpt-4.1` | "Utility/fallback" |
| SHARE_MOMENTS | Share captions | `gpt-4.1` | "Utility/fallback" |
| INTENT_INTERPRETER | Pre-planner routing | `gpt-4.1-mini` | Speed, low cost |
| ROUTING | Guest program extraction | `gpt-4.1-mini` | Speed, low cost |

**9 of 11 slots use gpt-4.1 (premium tier).**

---

### Model Downgrade Opportunities

#### Immediate candidates for `gpt-4.1-mini` downgrade:

| Slot | Why Downgrade Is Safe | Estimated Savings |
|---|---|---|
| **DIRECTIONS** | Produces 2–4 pre-structured direction options from a rigid template. The output is always a constrained JSON array of labeled choices. Mini handles structured JSON classification reliably at temp 0. | ~$0.005–$0.010 per sidebar action |
| **SWAP_BACKSTOP** | Last-resort fallback — already not the happy path. Picks one exercise name from a constrained domain (same movement pattern, available equipment). Mini's output quality is indistinguishable here. | ~$0.003–$0.006 per swap |
| **SHARE_MOMENTS** | Generates social share captions — low-stakes, decorative output. Short text, no reasoning chains required. | ~$0.002–$0.005 per share |
| **EXERCISE_FALLBACK** | Resolves harder/easier progressions from a well-defined exercise catalogue. Essentially a lookup + single substitution decision. | ~$0.003–$0.008 per fallback |

#### Candidates that genuinely require gpt-4.1:

| Slot | Why It Should Stay on gpt-4.1 |
|---|---|
| **CORE** | Primary coaching intelligence — nuanced reasoning, contextual memory application, sport-specific programming, structured JSON + narrative generation. This is the value surface. |
| **EDIT_INTENT** | Interprets ambiguous natural language into exact DB operation plans. Errors here cascade into real program mutations. Precision matters. |
| **EDIT_ENGINE** | Applies structured plans — errors in structured JSON generation are real DB mutations. Precision matters. |
| **GUEST_RESPONSE** | First impression, conversion surface. This IS the product for guests. |

#### Candidates for further review:

| Slot | Recommendation |
|---|---|
| **DIRECTIONS** | **Downgrade to mini.** The output is always a small JSON array from a constrained template. A/B test to confirm quality parity. |
| **PROGRAM_GENERATION** | Keep on gpt-4.1 for now — this is the guest "wow moment" (first program build). |

---

## AUDIT CATEGORY 3 — CONTEXT WINDOW EFFICIENCY

### System Prompt Architecture (ai.ts `buildSystemPrompt`)

The `extras` array assembled at line 3222 contains **24 distinct context sections**:

```
focusModeContext              — focus-engine-specific programming rules
focusModeAdaptationContext    — progression gates, joint adaptation heuristics
behaviorInstructions          — agent settings (tone, style, behavior rules)
profileFillContext            — profile data formatted as prompt context
adaptationContext             — short-term readiness / feedback signals
memoryContext                 — long-term memory entries (all types)
sessionSportOverride          — sport isolation guard for build paths
insightHint                   — next-session training insight hints
conversionHint                — free-tier upsell language
intentHint                    — intent routing decisions
editContext                   — current edit plan context
specialistContextHint         — specialist mutation context
preservationContext           — program preservation rules
constraintContract            — hard constraints (equipment, pain, schedule)
failSafePrompt                — fail-safe resolution section
agentIntentProfileSection     — language profile (user communication preferences)
responsePolicySection         — response policy rules
architectureBriefText         — deterministic architecture brief (build paths)
buildThresholdSection         — build threshold evaluation
transformHint                 — split transform hint
responseModePrompt            — BUILD / MODIFY / QUESTION mode classifier
neuralContext                 — neural bias / CNS load context
uiContextSection              — UI state (selected exercise, panel state)
buildCompactInstruction       — skeleton compaction rules (build paths)
```

**Estimated total system prompt size: 4,000–7,500 tokens per call.**

This does not include conversation history (up to 15 turns × ~200–500 tokens each = additional 3,000–7,500 tokens).

---

### Context Injection Analysis

#### Always injected (even when irrelevant):

| Section | Injected When | Relevance Problem |
|---|---|---|
| `conversionHint` | Every non-build turn | Upsell language irrelevant to paying users |
| `behaviorInstructions` | Every turn | Mostly static style rules — rarely changes per turn |
| `responsePolicySection` | Every turn | Often static; repeated across all turns |
| `agentIntentProfileSection` | Every turn | Language profile changes rarely; regenerated per call |
| `focusModeAdaptationContext` | Every non-mobility-build turn | Progression gates rarely relevant mid-conversation |

#### Already suppressed on correct paths (good):

- `insightHint` suppressed on build paths ✓
- `conversionHint` suppressed on build paths ✓
- `focusModeContext` + `focusModeAdaptationContext` suppressed for mobility builds ✓

---

### Memory Injection Audit

Memory retrieval is DB-only (no AI cost), but every retrieved memory entry is injected directly into the system prompt as raw text. No filtering by action relevance.

**Problem example:** An exercise swap request for a single exercise receives:
- Full behavioral history entries
- Onboarding memories
- Long-term adherence patterns
- Recovery preferences
- Communication preferences

None of these are relevant to a single-exercise swap decision.

**Estimated wasted tokens per irrelevant memory injection:** 50–200 tokens per entry × 5–12 entries = **250–2,400 tokens** on low-value calls.

---

### Largest Context Offenders (Ranked)

| Source | Estimated Token Size | Relevance Scope |
|---|---|---|
| Base coach identity + laws + principles | 3,500–4,000 | Always needed |
| `focusModeContext` (full context) | 800–3,000 | Focus-mode-specific only |
| Research guidance injection | 500–1,500 | Research-relevant actions only |
| Conversation history (15 turns) | 3,000–7,500 | Conversational only |
| `editContext` (serialized training system) | 2,000–5,000 | APPLY_MUTATION only |
| Architecture brief | 800–1,500 | Build path only |
| Memory context | 250–2,400 | Always, unfiltered |
| `buildCompactInstruction` | 400–500 | Build path only |
| `constraintContract` | 300–800 | Varies |
| `uiContextSection` | 100–300 | Always |

**Total possible prompt: 12,000–27,000 tokens on a heavy call.**

---

## AUDIT CATEGORY 4 — ORCHESTRATION OVERHEAD

### Call Count Per Path

| Path | AI Calls | Models | Notes |
|---|---|---|---|
| **BUILD_WITH_ARCHITECT** | 1–2 | mini, gpt-4.1 (×1–2) | Architecture engine is deterministic (free). Retry if truncated. |
| **APPLY_MUTATION (chat)** | 3 | mini, gpt-4.1 (×2) | Interpreter + Coach + EditIntent. All three always fire. |
| **APPLY_MUTATION (sidebar)** | 2 | gpt-4.1 (×2) | Directions + EditIntent. No interpreter (no chat turn). |
| **GUIDANCE / QUESTION** | 1–2 | mini, gpt-4.1 | Interpreter + Coach. Edit engine skipped. |
| **FORECAST** | 0 | DB only | Fully deterministic. |
| **UNDO / RESTORE** | 0 | DB only | DB snapshot rollback. |
| **MEMORY EXTRACT** | 0 | DB side-effect | No dedicated AI call. |

---

### Orchestration Inefficiencies

#### 1. The Double-Blind Problem on APPLY_MUTATION
On every chat turn that ends in a mutation, the Coach Agent call fires **first** (generating a response), then `interpretEditRequest` fires **second** (generating the actual DB plan). These are two separate, independent gpt-4.1 calls that both reason about the same user request from different angles.

The Coach call output is used for the chat narrative. The EditIntent call output is used for the actual mutation. Neither directly informs the other. This is a structural redundancy: the model is reasoning about the same mutation intent twice.

**Optimization opportunity:** Unified structured response — instruct the Coach to output a structured edit intent JSON alongside its coaching narrative in a single call, eliminating the separate `interpretEditRequest` call on edit paths. This would reduce APPLY_MUTATION from 3 calls to 2, saving ~$0.018–$0.022 per edit turn.

#### 2. LLM Intent Interpreter Runs on Every Turn
The `INTENT_INTERPRETER` (gpt-4.1-mini) runs before every authenticated chat message regardless of whether the message is complex. Simple, high-confidence messages ("make Day 2 harder", "swap the squat") are clearly classifiable by the existing deterministic planner.

**Current design:** Mini call → deterministic planner uses result if confidence ≥ 0.75, rewrites message if 0.45–0.74, ignores if < 0.45.

When confidence < 0.45 (deterministic planner runs unchanged anyway), the mini call was pure overhead.

**Optimization opportunity:** A lightweight pre-screen heuristic before the mini call. If the deterministic planner's regex/keyword match is already high-confidence (e.g., "Day 2", named exercise, explicit prescription change), skip the mini call entirely. Could eliminate 30–50% of interpreter calls.

#### 3. Directions Service Fires for Every Sidebar Mutation
The Directions Service makes a full gpt-4.1 call to generate 2–4 direction options for every panel action. However, `isDirectUserCommand()` and `detectNamedExerciseCommand()` (already implemented) short-circuit this for direct commands. The issue is that these deterministic checks still incur a service initialization cost and the AI call fires for any ambiguous action.

For many sidebar mutations (exercise swaps by button click, add/remove by category), the "direction" is already structurally implicit from the button context. The AI direction chooser adds ~$0.007–$0.010 per sidebar action for options the user's UI context already implies.

#### 4. Truncation Retry — Avoidable Cost
When a build response is truncated, the system retries with 40% more budget. This was reduced from 2 retries to 1, which is correct. However:
- Truncation retries use the **same large system prompt** + the full base messages
- The retry adds an extra user turn ("COMPACT JSON ONLY...")  
- This adds a second full input token cost on top of the failed first call

**Root cause of truncations:** System prompt is too large, leaving insufficient output budget for the program JSON. The token budget is sized for the JSON, but the total context window consumed by the system prompt + history reduces effective output headroom.

**Optimization opportunity:** Shrink the system prompt on build paths more aggressively. The architecture brief already covers exercise vocabulary and session structure on build paths. Most of the 24-section prompt can be suppressed to 8–10 sections on first builds.

---

## AUDIT CATEGORY 5 — MEMORY COST EFFICIENCY

### Memory Injection Behavior

Memory retrieval is DB-only (zero AI cost). However, all retrieved memories are injected into the system prompt as raw text — no filtering by action type or task relevance.

### Memory Relevance Matrix

| Memory Type | Relevant For | Irrelevant For |
|---|---|---|
| `exercise_exclusion` | All actions | Nothing — always needed |
| `pain_pattern` | All actions | Nothing — always needed |
| `exercise_preference` | Program builds, exercise swaps | Single prescription changes (reps/sets) |
| `session_preference` | Program builds | Single exercise changes |
| `volume_response` | Program builds, block rebuilds | Prescription tweaks, direct swaps |
| `split_preference` | Program builds, structural edits | Single session edits |
| `recovery_pattern` | Program builds, intensity edits | Swap, add/remove |
| `adherence_pattern` | Proactive coaching, rebuilds | Single exercise edits |
| `sport_context` | Program builds | Single exercise, prescription tweaks |
| `time_constraint` | Program builds | Single exercise changes |
| `communication_preference` | All coaching responses | Pure edit operations |
| `training_preference` | Program builds | Targeted tweaks |

### Finding

For surgical operations (single exercise swap, reps/sets change, add/remove exercise), only `exercise_exclusion` and `pain_pattern` are truly safety-critical and always needed. Injecting all 12 memory categories adds 500–2,000 wasted tokens on low-scope actions.

### Recommendation

Implement **task-scoped memory injection**:
- **Scope: exercise** → inject only `exercise_exclusion`, `pain_pattern`
- **Scope: session** → add `session_preference`, `exercise_preference`
- **Scope: program / architecture** → inject all categories
- **All coaching responses** → add `communication_preference`

Estimated savings: 300–1,500 tokens per surgical edit call.

---

## AUDIT CATEGORY 6 — STREAMING + SSE COSTS

### Streaming Behavior

SSE streaming in `routes/conversations.ts` streams the Coach Agent response in real time. Key findings:

**Token cost is identical to non-streaming.** Streaming does not add tokens. The same `max_tokens` budget applies. No additional narration tokens are produced for streaming stages themselves.

**Observed stage events** (ARCHITECT_BRIEFING, GENERATING_PROGRAM, etc.) are emitted from pre-call code — they are not AI-generated and carry zero token cost.

**However, streaming may inflate completion length indirectly:**
- The model "knows" it is building progressively, which can encourage longer, more discursive responses
- Temperature 0.6 on the CORE model allows stylistic variation — streaming completion style vs. non-streaming style has not been audited for length difference

### Interrupted Generation Waste

If a user sends a second message before the first stream completes, the in-flight generation is discarded. Estimated incomplete build waste: 200–1,500 tokens of completed-but-discarded output. No mitigation is currently in place.

**Recommendation:** Track interruption frequency. If >10% of builds are interrupted, consider a speculative generation cancel-and-restart mechanism to stop billing for output that will be discarded.

---

## AUDIT CATEGORY 7 — CACHING OPPORTUNITIES

### High-Value Cache Targets

| Target | Cache Duration | Estimated Token Savings |
|---|---|---|
| **Base system prompt (identity + laws + style)** | Session / per-user | 3,000–4,000 tokens per call via OpenAI prompt caching (≥1,024 tokens of repeated prefix) |
| **Research guidance summaries** | 24–48 hours | 500–1,500 tokens per call when research context is stable |
| **Focus mode context blocks** | Session | 800–3,000 tokens per call — content is static per mode |
| **Agent intent profile** | Session or daily | 200–400 tokens — language profile rarely changes |
| **Response policy section** | Session | 100–300 tokens — static unless user changes preferences |
| **Architecture briefs** (same goal + day count) | Session | 800–1,500 tokens per repeated build of same profile |

### OpenAI Prompt Caching

OpenAI's prompt caching (50% discount on repeated input prefixes ≥1,024 tokens) is not explicitly enabled in the current codebase. The base system prompt prefix is stable across all turns for a given user session, making this an **immediately actionable** optimization.

**Estimated savings from prompt caching:** If the first 3,000–4,000 tokens of the system prompt (identity + laws + style sections) are stable across turns, prompt caching delivers **50% discount on that prefix** — saving ~$0.003–$0.004 per call.

At 10 calls/session, that is **$0.03–$0.04 per session in input token savings** for free, just by structuring the prompt to put stable content first.

### Deterministic Replacement Opportunities

| Current AI Operation | Can Become Deterministic | How |
|---|---|---|
| Simple harder/easier progressions (load increase) | Yes | Lookup table: category → next progression step |
| Rep scheme adjustments ("add 2 reps") | Yes | Direct field arithmetic |
| Rest period changes ("longer rest") | Yes | Predefined rest tiers per category |
| Deload detection | Yes | Rule: week status + volume level flag |
| Session label updates | Yes | Template-driven from session type |
| "Lower volume" (remove 1 accessory set) | Yes | Already partially deterministic in edit-intent-service.ts |

Several operations in `edit-intent-service.ts` are **already deterministic** (block-level refocus, volume reduction, deload detection) and correctly skip the OpenAI call. This is a good pattern to extend further.

---

## AUDIT CATEGORY 8 — TOKEN ROI ANALYSIS

### HIGH ROI — High perceived intelligence per token

| Operation | Why It's High ROI |
|---|---|
| **First program generation** | User's "wow moment." Full personalized training system appears in seconds. Maximum visible intelligence. Worth the full gpt-4.1 + architecture cost. |
| **Coach narrative on APPLY_MUTATION** | Short, precise coaching language confirming what changed and why. High perceived intelligence, low output tokens needed (200–400). |
| **Intent Interpreter (mini)** | Cheap ($0.0002–0.0004) pre-classification that dramatically improves routing accuracy on conversational edge cases. |
| **Research-informed programming** | When research context improves exercise selection or progression decisions, the user perceives sophisticated expertise. High intelligence value. |
| **Guest program extraction (mini)** | Converts free-text response into structured panel JSON. Directly enables the program panel on guest turn 1. High product value. |

### LOW ROI — Expensive, low user-visible value

| Operation | Why It's Low ROI | Action |
|---|---|---|
| **Full system prompt on surgical edits** | 22,000-char prompt injected for a 1-exercise reps change. User sees: "Changed to 4×6." Invisible prompt overhead. | Aggressive suppression on exercise-scope actions |
| **Directions chooser for named commands** | AI generates 2–4 direction options for a user who already named the exact exercise. User sees a modal they don't need. | Already short-circuited for some patterns; extend detection |
| **Memory injection on surgical edits** | 10+ memory categories injected for a single exercise prescription change. Sport history, adherence patterns, communication preferences — none affect the output. | Task-scoped memory (see Category 5) |
| **`conversionHint` for paying users** | Upsell language injected into paying users' prompts. Produces no visible output but consumes ~100–300 tokens per call. | Gate behind `!isPaidUser` |
| **`agentIntentProfileSection` per turn** | Language profile re-extracted and re-injected every call. Rarely changes. Costs ~200–400 tokens/call. | Cache per session |
| **Truncation retries** | Full second call at 40% higher budget for programs that truncated due to an oversized system prompt. The root cause (oversized prompt) is the real fix. | Shrink prompt on build paths |
| **Hidden verifier passes** (DB-only) | Mutation verifier is already correctly implemented as a DB-only comparison — zero AI cost. ✓ | No action needed |
| **Forecast generation** | Fully deterministic, DB-only. Zero AI cost for high perceived intelligence value. | No action needed — excellent design |

---

## AUDIT CATEGORY 9 — BUSINESS SCALING MODEL

### User Behavior Segments

| Segment | Actions/Day | Composition |
|---|---|---|
| **Passive viewer** | 1–2 chat turns, 0 edits | Program built; occasional check-in |
| **Active refiner** | 5–8 chat turns, 2–4 sidebar mutations | Regular program adjustments |
| **Heavy user** | 12–20 chat turns, 6–10 mutations | Daily refinement + rebuilds |
| **Guest (free)** | 1–8 turns (capped at 8) | Pre-conversion; guest system only |

### Daily Cost Per User Segment

| Segment | Est. Daily Cost |
|---|---|
| Passive viewer | $0.06–$0.12 |
| Active refiner | $0.35–$0.65 |
| Heavy user | $0.90–$2.20 |
| Guest (capped) | $0.01–$0.10 (one-time, pre-conversion) |

### Monthly Cost Per User

| Segment | Monthly Cost (30 days) |
|---|---|
| Passive viewer | $1.80–$3.60 |
| Active refiner | $10.50–$19.50 |
| Heavy user | $27.00–$66.00 |

### Unit Economics at Scale (assuming $20/mo Pro tier)

| Scale | Avg User Cost/Mo | Margin | Risk |
|---|---|---|---|
| 100 users (70% active) | ~$12/user | **~40%** | Low — manageable |
| 1,000 users (60% active) | ~$11/user | **~45%** | Low |
| 10,000 users (50% active) | ~$10/user | **~50%** | Low-medium |
| 100,000 users (40% active) | ~$9/user | **~55%** | Medium — heavy-user tail is the risk |

**Critical risk:** The heavy-user tail. A user averaging 15 chat turns/day + daily rebuilds costs **$50–$66/month** against a $20 plan — a **3× loss** on that user. At 10% of 100,000 users being heavy users, that's $30M/year in losses from the tail alone.

### Free Tier Sustainability

The 8-message guest cap at ~$0.01–$0.10 total cost per guest is economically sustainable. Guest conversion funnel cost is negligible. The paywall triggers before meaningful cost accumulates.

### Break-Even Usage Pattern

At $20/mo Pro:
- Break-even: ~10 "active refiner" days per month
- At 20 active days: ~30–40% margin
- At 30 active days (daily user): margin turns negative for active-to-heavy crossover users

### Highest Scaling Bottlenecks

1. **Heavy user tail** — a small percentage of power users could erode all margin at scale
2. **Build truncation retry rate** — if even 10% of builds trigger retries, that adds $0.03–$0.09 per build event to aggregate cost
3. **Dual gpt-4.1 calls on every APPLY_MUTATION** — this is the most frequent cost-doubling pattern
4. **Unfiltered memory + context injection** — adds 500–2,000 tokens invisibly to every call regardless of need

---

## FINAL DELIVERABLES

### What Currently Costs the Most

1. **Program generation + block rebuilds** — up to $0.096 per action with retry
2. **Multi-turn refinement loops** — 3 turns costs $0.10–$0.13 cumulative
3. **APPLY_MUTATION path** — dual gpt-4.1 call structure costs ~$0.052–$0.060 per edit turn
4. **Unoptimized system prompt** — 4,000–7,500 token input overhead on every single call

### What Delivers the Most Intelligence Per Token

1. **Forecast generation** — zero AI cost, delivers "Fatigue Risk" and "Plateau Risk" signals. Best ROI in the system.
2. **Mutation Verifier** — zero AI cost, provides integrity guarantees on every edit. Excellent design.
3. **First program generation** — the full gpt-4.1 cost is justified. It is the product's defining moment.
4. **LLM Intent Interpreter (mini)** — $0.0002–$0.0004 per call for routing accuracy improvement. Outstanding ROI.
5. **Guest extraction (mini)** — turns a free-text chat response into a structured program panel. High product value, low cost.

### What Hidden Systems Are Burning Tokens Invisibly

1. **`conversionHint` injection for paying users** — upsell language added to prompts of users who already converted
2. **`agentIntentProfileSection` regenerated every call** — language profile rarely changes; re-extracted unnecessarily
3. **Full memory injection on surgical edits** — 10+ memory categories sent when 2 are needed
4. **`focusModeAdaptationContext` on short-reply turns** — progression gates and adaptation heuristics injected when the user asked a simple question
5. **`responsePolicySection` injected statically** — mostly static content regenerated per call
6. **Research guidance on non-research turns** — injected when the user's question has nothing to do with research

### What Can Be Optimized Immediately With Minimal UX Impact

| Optimization | Estimated Savings | Risk |
|---|---|---|
| **Enable OpenAI prompt caching** (stable prefix first) | $0.003–$0.004/call | None |
| **Gate `conversionHint` to non-paying users** | 100–300 tokens/call for paying users | None |
| **Downgrade DIRECTIONS to gpt-4.1-mini** | $0.005–$0.010 per sidebar action | Low — validate output format |
| **Downgrade SWAP_BACKSTOP to gpt-4.1-mini** | $0.003–$0.006 per swap backstop | Low |
| **Downgrade EXERCISE_FALLBACK to gpt-4.1-mini** | $0.003–$0.008 per fallback | Low |
| **Downgrade SHARE_MOMENTS to gpt-4.1-mini** | $0.002–$0.005 per share | None |
| **Task-scoped memory injection** | 300–1,500 tokens on surgical edits | Low |
| **Skip Intent Interpreter on high-confidence deterministic matches** | $0.0002–$0.0004 per turn saved | Low |
| **Cache `agentIntentProfileSection` per session** | 200–400 tokens/call | None |
| **Suppress more sections on exercise-scope build paths** | 500–2,000 tokens/call | None |

**Estimated combined savings from all immediate optimizations:** $0.008–$0.025 per call, depending on action type. Across an active refiner's daily usage (~8 calls/day): **$0.064–$0.200/day saved**, or **$1.92–$6.00/month** in gross margin improvement per user.

### Can TrainChat Economically Scale in Its Current Architecture?

**Short answer: Yes at 10,000 users. Uncertain at 100,000+.**

The current architecture is sound for the intelligence quality it delivers. The forecast system, mutation verifier, and architecture engine are all correctly implemented as zero-AI-cost components — that is excellent design and should be preserved.

The primary scaling risks are:

1. **Heavy-user margin compression** — the current pricing model does not account for the 5–10% of users who will be daily heavy refiners. These users cost $30–$66/month against a $20 plan. A usage-tiered pricing model (message limits, or a "power user" tier at $35–$40/mo) is needed before 10,000+ users.

2. **Dual gpt-4.1 call on APPLY_MUTATION** — this is structurally the highest-frequency cost doubling in the system. A unified Coach+EditIntent structured response output would eliminate one full gpt-4.1 call per edit turn. This is the single highest-ROI architectural optimization available.

3. **System prompt size on build paths** — the current prompt is approaching the 22,000-char warning threshold on heavy builds. Aggressive suppression of non-build-relevant sections (conversionHint, adherence memories, focusModeAdaptationContext, agentIntentProfileSection) on CREATE_PROGRAM paths could reduce input costs by 1,500–3,500 tokens per build.

4. **No prompt caching** — the stable identity/laws/style prefix (first 3,000–4,000 tokens) is eligible for OpenAI's 50% input discount on repeated prefixes. Restructuring the prompt to front-load stable content is a zero-risk, zero-quality-impact optimization.

The architecture is intelligent and well-considered. The optimizations above are refinements, not redesigns. TrainChat can scale economically with targeted prompt engineering, model right-sizing on utility services, and a usage-aware pricing tier for heavy users.

---

*End of Audit — May 15, 2026*
