---
title: Exercise Programming — Architecture Engine, Periodization, Prescription & Variety
doc_type: implementation
subsystem: exercise-programming
status: VERIFIED
maturity: L3

source_of_truth:
  - artifacts/api-server/src/lib/program-architecture-engine.ts
  - artifacts/api-server/src/lib/periodization-engine.ts
  - artifacts/api-server/src/lib/prescription-schema.ts
  - artifacts/api-server/src/lib/prescription-remap.ts
  - artifacts/api-server/src/lib/program-quality-validator.ts
  - artifacts/api-server/src/lib/program-specialist.ts
  - artifacts/api-server/src/lib/programs/*.ts
  - artifacts/api-server/src/lib/focus-engines/*.ts
  - artifacts/api-server/src/services/program-build-service.ts
  - artifacts/api-server/src/lib/ai.ts
related_architecture:
  - "CLAUDE.md §7 Exercise-Programming Architecture & Exercise-Science Philosophy"
  - "CLAUDE.md §1 principle #1 (deterministic skeleton, generative skin)"
related_implementation:
  - "docs/ai-agents.md (Performance Architect = Vale, deterministic, BUILD-only; inline persona DR-0011)"
  - "docs/mutation-pipeline.md (prescription-remap in edits; legacy applyMutation; dual engines DR-0018)"
  - "docs/context-pipeline.md (architecture brief + periodization are prompt-assembly layers)"
  - "docs/db-schema.md (writes to training_systems; exercise_library; wp-* philosophy sites)"
  - "docs/research.md (research guidance shapes exercise selection on build + edit)"

last_generated: 2026-06-29
last_verified: 2026-06-29
verified_by: claude (Version 2, Wave 3 doc #8)
verified_commit: 78ee536
verification_method: >
  Read headers + exported signatures of program-architecture-engine.ts (computeWeeklyArchitecture,
  buildArchitectureBrief, validateProgramArchitecture, enforceVariationMandateOnProgram),
  periodization-engine.ts (training levels, block definitions, progression models,
  buildBlockArchitecture, buildPeriodizationContext), prescription-schema.ts (family→field, resolveField),
  prescription-remap.ts, program-quality-validator.ts, program-build-service.ts; one-line headers of the
  ~25 lib/programs/* "Block Variation Engine" files; listed lib/focus-engines/*. Verified wiring with
  grep: buildArchitectureBrief callers (ai.ts + speed/mobility focus-engines); buildPeriodizationContext
  + enforceVariationMandateOnProgram + program-quality-validator callers (ai.ts); prescription-schema/
  remap callers (edit-intent-service/edit-engine/mutation-engine); program-build-service caller
  (conversations.ts). NOT done: full read of the 4367-line engine and the ~8200-line lib/programs/*;
  no runtime execution. Such claims are marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0029, summary: "Validator proliferation: ≥4 overlapping program/architecture validators (validateProgramArchitecture, validateProgrammingQuality, validateArchitectureGate, validatePostMutationArchitectureLight) plus theme/description coherence validators, with no documented single precedence", kind: code-vs-architecture, severity: low, status: open }
  - { id: DR-0030, summary: "program-specialist.ts is a separate specialist programming path using the legacy in-memory applyMutation engine; its relationship to the main architecture engine is undocumented (ties to mutation-pipeline DR-0018)", kind: code-vs-architecture, severity: low, status: open }
  - { id: DR-0031, summary: "Build dispatches through a focus-mode engine layer (focus-engines/: strength/speed/mobility + router) not reflected in CLAUDE.md §7's Architect→Periodization→Coach description", kind: doc-vs-code, severity: low, status: open }
---

# Exercise Programming — Architecture Engine, Periodization, Prescription & Variety

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> Reconciled against the programming engine + its wiring. **Code wins** on disagreement. This is the
> **largest subsystem** (~18k lines); the 4367-line engine and ~8200-line `lib/programs/*` were read
> at header/signature/wiring level, **not** in full — which (with no runtime) caps this at **L3**.
> `CLAUDE.md §7` is **largely faithful**; only three `low` completeness DRs are opened. Runtime
> claims are **(UNVERIFIED)**.

## 1. Purpose & scope

How TrainChat builds the *structure* of a program deterministically (the "skeleton") before the
Coach LLM renders it (the "skin") — `CLAUDE.md` principle #1. Covers the Performance Architect engine,
the periodization engine, the prescription layer, the Block Variation Engine (variety + coherence),
the focus-mode engines, post-generation validators, and persistence. Implements `CLAUDE.md §7`.

Out of scope: the Coach LLM call (`ai-agents.md`); mutation execution (`mutation-pipeline.md`); the
`wp-*` whitepaper sites (philosophy statements, not engine code — `db-schema.md`/CLAUDE.md §7).

## 2. Source map

| File / dir | Wired? | Responsibility |
|---|---|---|
| `lib/program-architecture-engine.ts` (4367) | ✅ (ai.ts, focus-engines) | **Performance Architect** (deterministic, BUILD-only): `computeWeeklyArchitecture`, `buildArchitectureBrief`, `validateProgramArchitecture`, `enforceVariationMandateOnProgram`; selects exercises via `exercise-variation-engine`. |
| `lib/periodization-engine.ts` (1003) | ✅ (ai.ts) | Training levels, **block definitions** (re_entry/accumulation/intensification/realization/deload), goal-block structures, **progression models** (linear/wave/undulating/block/autoregulated), `buildBlockArchitecture`, `buildPeriodizationContext`. |
| `lib/prescription-schema.ts` (686) | ✅ (edits) | **Field-safe** family→field mapping (`classifyExerciseFamily`, `getExerciseFamilySchema`, `resolveField`). |
| `lib/prescription-remap.ts` (1147) | ✅ (edits/build remap) | Same-family-preserve vs different-family-remap + deterministic context modifier (block/focus/goal/position); explosive-prescription protection. |
| `lib/programs/*` (~25 files, ~8200) | ✅ (engine) | **Block Variation Engine:** archetypes, split architectures, block scoring (10-step), slot-intent derivation, fingerprint/similarity (6-dim), variance audit/reasons/reroll/thresholds, theme + description-integrity validators, agent-control directives/resolver. |
| `lib/focus-engines/*` | ✅ | Focus-mode dispatch: `focus-mode-router`, `strength-engine`, `speed-engine`, `mobility-engine` (+intelligence/library). (DR-0031) |
| `lib/program-quality-validator.ts` (898) | ✅ (ai.ts) | `validateProgrammingQuality` → dimensioned quality score. |
| `lib/program-specialist.ts` (1438) | ✅ | Specialist path using the **legacy** in-memory `applyMutation` (DR-0030). |
| `services/program-build-service.ts` (247) | ✅ (conversations) | `saveOrUpdateProgram` → persists to `training_systems` + `createChangeLogEntry`. |

## 3. The build pipeline (deterministic skeleton → generative skin)

1. **Focus-mode dispatch.** `focus-engines/focus-mode-router` routes by mode to the strength / speed /
   mobility engine. Each calls `buildArchitectureBrief` (confirmed callers: `ai.ts`, `speed-engine`,
   `mobility-engine`). This dispatch layer is real but absent from CLAUDE.md §7 (DR-0031).
2. **Architecture (deterministic, no LLM).** `computeWeeklyArchitecture` → `WeeklyArchitecture`
   (CNS blocks, session architecture, movement allocation), then `buildArchitectureBrief` emits the
   brief with **pre-selected** exercises (via `exercise-variation-engine` `selectSlotExercises` +
   `buildVariationMandate`) — prescriptions, not options. Injected into the Coach prompt
   (`ai-agents.md §6`; `context-pipeline.md`). This is the Architect (Vale) — deterministic,
   BUILD-only, per its own header and `ai-agents.md`.
3. **Periodization.** `buildPeriodizationContext` (ai.ts) supplies long-horizon structure:
   `TRAINING_LEVEL_PROFILES` (beginner→advanced, `blockStructureRequired`), `BLOCK_DEFINITIONS`,
   `GOAL_BLOCK_STRUCTURES`, `PROGRESSION_MODELS`, `detectTrainingLevel`/`detectGoalKey`/
   `selectProgressionModel` → `buildBlockArchitecture`. Output is a prompt context block.
4. **Coach (LLM)** renders the final program (`ai-agents.md`).
5. **Post-generation enforcement/validation** (in `ai.ts`): `enforceVariationMandateOnProgram`
   (locks in the variation engine's selections), `validateProgramArchitecture` (engine),
   `validateProgrammingQuality` (quality validator), plus the orchestrator's `validateArchitectureGate`
   (`ai-agents.md §5.4`) and DEV variance audit/reroll.
6. **Persistence.** `saveOrUpdateProgram` writes the canonical `training_systems` hierarchy +
   `createChangeLogEntry` (`db-schema.md`, `mutation-pipeline.md`).

## 4. The Block Variation Engine (variety, engineered & measured)

`lib/programs/*` is a large deterministic subsystem realizing CLAUDE.md §7's "variety is engineered
and measured, not random; coherence validated":
- **Selection:** `blockArchetypes` (Layer 1) → `splitArchitectures` (Layer 2) → `blockScoring`
  (10-step selection) → `deriveSlotIntent` (block/phase-aware slot intent).
- **Measurement:** `programFingerprint` → `programSimilarity` (6-dimension scorer) →
  `programVarianceAudit`/`programVarianceReasons`/`programVarianceThresholds` →
  `programVarianceReroll` (re-roll when too similar to prior programs).
- **Coherence:** `themeCoherenceValidator`, `sessionDescriptionIntegrityValidator`.
- **Agent control:** `agentControlDirectives`/`agentControlResolver`/`agentControlTypes` normalize
  control inputs for generation.

## 5. The prescription layer (field-safe — edit-time)

`prescription-schema.ts` maps each `ExerciseFamily` (`load_reps`, `height_reps`, `distance_reps`,
`time_only`, `mobility_flow`, …) to allowed/preferred/forbidden fields and units, and `resolveField`
routes a logical field to the correct structured DB column — so "use 25 lbs" mutates a **load** field,
not free-text notes (the design brief in `attached_assets/`). **Wired at edit/mutation time**
(consumed by `edit-intent-service`, `edit-engine`, `mutation-engine`, `session-stimulus-redistribution`),
which matches CLAUDE.md §7's command-driven framing. `prescription-remap` adds same-family-preserve
vs remap logic + a deterministic context modifier (block/focus/goal/position) and explosive-prescription
protection. This corroborates `mutation-pipeline.md` (edits apply through the DB-backed pipeline).

## 6. Embedded exercise-science philosophy (CLAUDE.md §7 — confirmed)

The engine genuinely encodes the §7 commitments:
- **CNS-driven sequencing** (speed/power fresh; strength before accessories; conditioning last) —
  engine header + `SessionArchitecture`/`CNSBlock`.
- **Training-age-aware periodization** — `TRAINING_LEVEL_PROFILES.blockStructureRequired`, block +
  progression models.
- **Fatigue economics** (remove junk volume) — Architect skill set.
- **Variety engineered + measured** — the Block Variation Engine (§4).
- **Evidence informs selection** — research guidance (`research.md`) feeds build + edit.
The `wp-*` whitepaper sites (constraint-aware coaching, conversational periodization,
deterministic-generative hybrid) are the narrative statement of exactly this engine.

## 7. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`. **No high/medium** — §7 is faithful; these are
`low` completeness items.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0029 | ≥4 overlapping program/architecture validators with no documented single precedence. | code-vs-architecture | low |
| DR-0030 | `program-specialist.ts` is a separate specialist path on the legacy in-memory `applyMutation` engine; relationship undocumented (ties to mutation DR-0018). | code-vs-architecture | low |
| DR-0031 | Focus-mode engine layer (focus-engines/) dispatches build by mode; not in CLAUDE.md §7's Architect→Periodization→Coach description. | doc-vs-code | low |

## 8. Cross-references to prior implementation docs

- **`ai-agents.md`:** the Architect is the deterministic, BUILD-only agent; its persona is **inlined**
  in the brief, not from the unwired `agent-personas.ts` (DR-0011); the build path runs the
  `validateArchitectureGate` documented there.
- **`mutation-pipeline.md`:** prescription-remap/schema operate at edit time; `program-specialist.ts`
  uses the legacy `applyMutation` (the dual-engine story, DR-0018).
- **`context-pipeline.md`:** the architecture brief and periodization context are conditional layers
  of `buildSystemPrompt`.
- **`research.md`:** research guidance shapes exercise selection on both build and edit.
- **`db-schema.md`:** builds persist to the canonical `training_systems` hierarchy; the variation
  engine draws on `exercise_library`.

## 9. Recommended CLAUDE.md updates

Proposals only (governance §2/§7); §7 is accurate, so these are completeness clarifications:

1. **§7/§8** — Document the **validator landscape** and a single precedence among
   architecture/quality/gate/post-mutation validators. (DR-0029.)
2. **§7** — Note `program-specialist.ts` as a distinct specialist path on the legacy engine.
   (DR-0030.)
3. **§7** — Add the **focus-mode engine layer** (strength/speed/mobility + router) to the build
   pipeline description. (DR-0031.)

No corrective change is needed — the deterministic-skeleton/generative-skin model, periodization,
prescription field-safety, and engineered-variety claims are all genuinely implemented.

## 10. Files reviewed

Headers/signatures: `program-architecture-engine.ts`, `periodization-engine.ts`, `prescription-schema.ts`,
`prescription-remap.ts`, `program-quality-validator.ts`, `program-build-service.ts`. One-line headers:
~25 `lib/programs/*` files. Listing: `lib/focus-engines/*`. Wiring: `lib/ai.ts` (brief/periodization/
mandate/quality), `routes/conversations.ts` (build service), edit/mutation consumers of prescription.
Consumer greps across `artifacts/api-server/src`.

## 11. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Architect role + BUILD-only + brief injection | **High** | Engine header + caller grep + ai-agents cross-ref. |
| Periodization model (levels/blocks/progressions) | **High** | Exported tables/types read. |
| Prescription field-safety (edit-time) | **High** | Schema exports + consumer grep. |
| Block Variation Engine (variety/coherence) | **Medium-High** | File-header roles + wiring; not every body. |
| Validator landscape (DR-0029) | **High** | Consumer grep of each validator. |
| Focus-mode engines (DR-0031) | **High** | Dir listing + brief caller grep. |
| Engine internals (4367 + 8200 lines) | **Medium** | Headers/signatures, not full bodies. |
| **Runtime behavior** | **UNVERIFIED** | No execution. |

Overall: **high confidence in structure, wiring, and faithfulness to §7**; the open gap is the deep
internals of the two largest code areas + runtime — which keeps this at **L3** (it could reach L4 in a
later pass given its clean, low-only register, after a code-level read of the engine + variation system).

## 12. Verification record

- Verified at commit `78ee536` (current date 2026-06-29).
- Independent checks: `buildArchitectureBrief` callers = ai.ts + speed/mobility engines;
  `buildPeriodizationContext`/`enforceVariationMandateOnProgram`/`validateProgrammingQuality` callers
  = ai.ts; prescription-schema/remap callers = edit/mutation modules; `saveOrUpdateProgram` caller =
  conversations.ts; focus-engines dir enumerated; ≥4 distinct validators located.
- Not run (documented gaps): full engine + lib/programs read; runtime execution.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
