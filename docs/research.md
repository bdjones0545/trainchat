---
title: Research-Informed Programming — Retrieval, Guidance, Curation & Global Learning
doc_type: implementation
subsystem: research
status: VERIFIED
maturity: L4

source_of_truth:
  - artifacts/api-server/src/research/research-retriever.ts
  - artifacts/api-server/src/research/research-programming-guidance.ts
  - artifacts/api-server/src/research/research-ingestion.ts
  - artifacts/api-server/src/research/research-discovery-service.ts
  - artifacts/api-server/src/research/research-librarian-agent.ts
  - artifacts/api-server/src/research/research-seeder.ts
  - artifacts/api-server/src/research/research-real-evidence-seeder.ts
  - artifacts/api-server/src/research/research-speed-mobility-seeder.ts
  - artifacts/api-server/src/research/research-strength-seeder.ts
  - artifacts/api-server/src/research/research-weekly-update-seeder.ts
  - artifacts/api-server/src/research/trusted-sources.ts
  - artifacts/api-server/src/lib/globalLearningService.ts
  - artifacts/api-server/src/lib/ai.ts
  - artifacts/api-server/src/lib/edit-intent-service.ts
related_architecture:
  - "CLAUDE.md §6 Research Architecture (Research-Informed Programming)"
related_implementation:
  - "docs/ai-agents.md (research guidance is a buildSystemPrompt layer; librarian is admin-only)"
  - "docs/db-schema.md (research_documents/chunks/discovery_runs/candidates; global_learning_*)"
  - "docs/mutation-pipeline.md (research guidance is injected into edit prompts)"
  - "docs/context-pipeline.md (research is one of the prompt-assembly layers)"

last_generated: 2026-06-29
last_verified: 2026-06-29
verified_by: claude (Version 2, Wave 3 doc #7 — target L4)
verified_commit: 78ee536
verification_method: >
  Read at code level: research-retriever.ts (header + scoring constants + scoreChunk + the two
  retrieval functions' approval filter + score<2 rejection + token cap), research-programming-guidance.ts
  (full interface + buildResearchProgrammingGuidance body + the 7 per-dimension builders' dispatch),
  globalLearningService.ts (exports + trackLearningEvent + generateCandidates + promotion logic).
  Read headers/exports: ingestion, discovery (external API bases + RESEARCH_DISCOVERY_ENABLED),
  librarian-agent, seeders, trusted-sources. Verified wiring with grep: research-retriever +
  research-programming-guidance consumed by ai.ts AND edit-intent-service; librarian-agent consumed
  only by admin route + discovery + scripts (never chat); the live agent (ai.ts/conversations.ts)
  does NOT read learning_candidates/global_learning_events; trackLearningEvent call sites. NOT done:
  full read of every seeder + the discovery parser; no runtime execution. Such claims are marked
  UNVERIFIED inline.

discrepancies:
  - { id: DR-0027, summary: "Research-informed programming silently no-ops (returns empty guidance/context) when no approved+active documents exist; the live evidence base depends on manually-run seeders / admin ingestion", kind: doc-vs-code, severity: low, status: open }
  - { id: DR-0028, summary: "Global-learning event capture (trackLearningEvent) is wired on edit/feedback/history routes, not the main conversations chat handler — interaction coverage is partial", kind: code-vs-architecture, severity: low, status: open }
---

# Research-Informed Programming — Retrieval, Guidance, Curation & Global Learning

> **Status:** VERIFIED (source-conformance) · **Maturity:** L4 (Reconciled) · **Source of truth:** see frontmatter.
> This is the **most faithful subsystem** documented so far: implementation closely matches
> `CLAUDE.md §6`. It earns **L4** because (a) the core algorithms were read at code level, (b) the
> subsystem's Discrepancy Register has **no open high/medium items** (only two `low`), and (c)
> bidirectional cross-links are established (`documentation-maturity-model.md §3`). Runtime execution
> was not performed; that gap is L5 territory, not L4. Runtime claims are **(UNVERIFIED)**.

## 1. Purpose & scope

How curated exercise-science evidence becomes **structured programming constraints** in the Coach's
prompt, how that evidence is discovered/curated/gated, and how the system collects behavioral signals
for human-reviewed improvement. Implements `CLAUDE.md §6`. Covers retrieval, the 7-dimension guidance
translation, ingestion + discovery + the Librarian, seeders, and global learning.

## 2. Source map

| File | Wired? | Responsibility |
|---|---|---|
| `research/research-retriever.ts` (925) | ✅ (ai.ts + edits) | Keyword/tag retrieval with deterministic scoring; approval-gated; token-capped. |
| `research/research-programming-guidance.ts` (630) | ✅ (ai.ts + edits) | Translates chunks → **7-dimension** `ResearchProgrammingGuidance`; formats for the prompt. |
| `research/research-ingestion.ts` (273) | admin | Admin-provided abstract → AI-generated structured fields + chunks. |
| `research/research-discovery-service.ts` (845) | pipeline | Queries PubMed / Semantic Scholar / Crossref → candidates; `RESEARCH_DISCOVERY_ENABLED`. |
| `research/research-librarian-agent.ts` (725) | ⚠️ admin-only | LLM evidence evaluator (Dr. Sable). Consumed only by admin route + discovery + scripts. |
| `research/research-*-seeder.ts` (5 files) | admin/script | Populate the evidence base (speed-mobility, strength, real-evidence, weekly-update, base). |
| `research/trusted-sources.ts` (291) | pipeline | Trusted publisher/journal whitelist for discovery scoring. |
| `lib/globalLearningService.ts` (782) | ✅ collect side | `trackLearningEvent`, `generateCandidates`, `promoteCandidate` — collect→aggregate→suggest. |

## 3. Retrieval (keyword/tag, deterministic — matches CLAUDE.md §6)

`research-retriever.ts` exposes `getRelevantResearchContext` (text) and
`getRelevantResearchContextWithChunks` (chunks — used by `ai.ts`). Verified behavior:
- **No vector search.** Pure keyword/tag scoring; the `embedding` column stays reserved
  (`db-schema.md`). The header states this explicitly.
- **Approval gate (3-gate).** `fetchApprovedDocs` filters `status = "approved"` **AND**
  `isActive = true` **AND** (`librarianRecommendation = "approve"` OR admin-approved `needs_review`).
  Unreviewed/NULL-recommendation docs are never surfaced.
- **Deterministic scoring (`scoreChunk`).** Tag overlap ×3; trust boost (gold +2/high +1);
  `EVIDENCE_TYPE_BOOSTS` (meta-analysis +4 … review/cohort +1); freshness (≤3yr +2 … >12yr −1 unless
  foundational); chunk-type boost (librarian +2); injury/population boosts; `WARNING_FLAG_PENALTIES`.
  `finalScore` is summed; **chunks scoring < 2 are rejected and logged** (fully explainable, with a
  `ScoreBreakdown`). Token budget capped at `MAX_RESEARCH_TOKENS = 1200`.

## 4. Guidance translation (7 dimensions — matches CLAUDE.md §6)

`buildResearchProgrammingGuidance` converts retrieved chunks into a structured object with **seven
dimensions** — `volumeGuidance`, `intensityGuidance`, `exerciseSelectionGuidance`,
`progressionGuidance`, `recoveryGuidance`, `safetyGuidance`, `contraindications[]` — plus
`confidenceLevel` (high/moderate/low/insufficient), `influencedDimensions[]`, `researchSources[]`,
and an emerging-evidence `framingNote`. Each dimension has its own builder
(`buildVolumeGuidance`, … `buildSafetyGuidance`) that reads chunk tags/trust via `hasTags`/
`hasHighTrust`/`hasCategory`. With **no chunks → all dimensions empty, `confidenceLevel:
"insufficient"`** (graceful no-op — see DR-0027). A `[ResearchProgrammingGuidance]` debug log records
chunks/tags/dimensions/confidence.

`formatResearchGuidanceForPrompt` renders it into a prompt section. **Wiring:** `ai.ts` (build path,
1756→1768→1776) and **`edit-intent-service.ts`** (mutation prompts) — so research shapes both program
*generation* and *edits* (harder/easier/swap), exactly as the file header and CLAUDE.md §6 claim.
`ai.ts` also carries hardcoded `## RESEARCH BOUNDARY — MANDATORY` / `## RESEARCH APPLICATION` framing
(455–486) alongside the dynamic guidance — research framing is partly static, partly data-driven.

## 5. Curation: ingestion, discovery & the Librarian (admin-only)

- **Ingestion** (`research-ingestion.ts`): admin supplies an abstract; AI generates the structured
  fields + chunks. Docs start `pending`/`isActive:false` until approved.
- **Discovery** (`research-discovery-service.ts`): queries **PubMed**, **Semantic Scholar**, **Crossref**
  (base URLs confirmed) into `research_paper_candidates` (status `discovered`); gated by
  `RESEARCH_DISCOVERY_ENABLED`. Never enters retrieval until approved.
- **Librarian (Dr. Sable)** (`research-librarian-agent.ts`): LLM evaluator producing
  recommendation/confidence/trust/chunks/warning-flags. **Verified admin-only:** consumed by
  `routes/admin.ts`, `research-discovery-service.ts`, and two scripts — **never** by the chat handler
  (`conversations.ts`). This upholds the constitution hard law and `ai-agents.md`'s
  `assertLibrarianIsAdminOnly`. (The `agent-personas.ts` reference is the unwired registry —
  `ai-agents.md` DR-0011 — so it is non-functional.)
- **Seeders** (5 files): the evidence base is populated by manually-run seeders/ingestion (admin or
  script). If none have run, retrieval returns empty and guidance is `insufficient` (DR-0027).

## 6. Global learning (collect → aggregate → suggest — matches CLAUDE.md §6)

`globalLearningService.ts` verified against the "never auto-applied / live agent never reads" claims:
- **Collect:** `trackLearningEvent` (fire-and-forget, failures swallowed) — wired on
  `routes/session-feedback.ts`, `training-system-history.ts`, `training-system-edit.ts`. **Not** in
  `conversations.ts` directly (DR-0028 — partial coverage).
- **Aggregate/suggest:** `generateCandidates` ("NEVER modifies the core system") writes
  `learning_candidates` with a `recommendation`. A candidate is tagged `safe_to_promote` only when
  `confidenceScore ≥ 0.8 && riskLevel === "low"`, and certain domains are **never** auto-promotable.
- **Promote:** `promoteCandidate`/`dismissCandidate` are explicit admin actions; `getLearningReport`/
  `getOpenCandidates` feed the admin dashboard.
- **Verified invariant:** the live agent (`ai.ts`, `conversations.ts`) **does not read**
  `learning_candidates` or `global_learning_events` (grep-confirmed). Promotion is admin-gated; the
  `safe_to_promote` tag is a *recommendation*, not an auto-apply. This matches CLAUDE.md §6 principle #8.

## 7. Architecture discrepancies

Registered in `docs/documentation-governance.md §5`. **No high/medium items** — the reason this
subsystem reaches L4.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0027 | Research-informed programming silently no-ops when no approved+active docs exist; live evidence base depends on manually-run seeders/ingestion. | doc-vs-code | low |
| DR-0028 | `trackLearningEvent` capture is wired on edit/feedback/history routes, not the main chat handler — partial interaction coverage. | code-vs-architecture | low |

## 8. Cross-references to prior implementation docs

- **`ai-agents.md`:** research guidance is a live `buildSystemPrompt` layer; the Librarian's
  admin-only status confirms the orchestrator's `assertLibrarianIsAdminOnly` invariant; the unwired
  `agent-personas.ts` reference (DR-0011) is the only non-functional consumer.
- **`mutation-pipeline.md`:** research guidance is injected into **edit** prompts via
  `edit-intent-service.ts`, so evidence shapes mutations (harder/easier/swap), not just builds.
- **`db-schema.md`:** confirms the storage model (research_documents/chunks/discovery_runs/candidates;
  global_learning_events/learning_candidates) and the reserved `embedding` column.
- **`context-pipeline.md`:** research context + guidance are conditional (plan-aware) layers of the
  prompt assembly.

## 9. Recommended CLAUDE.md updates

Proposals only (governance §2/§7). Because this subsystem is faithful, the suggestions are
clarifications, not corrections:

1. **§6** — Note that research-informed programming **gracefully no-ops** when the evidence base is
   empty, and that the base is populated by **manually-run seeders/ingestion** (operational
   dependency). (DR-0027.)
2. **§6** — Note global-learning capture coverage (edit/feedback/history routes), and that
   `safe_to_promote` is a *recommendation* with admin-gated promotion (reinforces principle #8).
   (DR-0028.)
3. **§6** — Optionally mention that research framing is partly hardcoded prompt text (`RESEARCH
   BOUNDARY`/`RESEARCH APPLICATION` in ai.ts) in addition to the dynamic 7-dimension guidance.

No corrective change is needed — §6's description (keyword retrieval, 3-gate approval, 7-dimension
guidance, admin-only Librarian, collect→aggregate→suggest learning) is **accurate**.

## 10. Files reviewed

Code-level: `research-retriever.ts` (scoring + retrieval + approval filter), `research-programming-guidance.ts`
(interface + builder body + dimension dispatch), `globalLearningService.ts` (collect/aggregate/promote).
Headers/exports: `research-ingestion.ts`, `research-discovery-service.ts` (API bases), `research-librarian-agent.ts`,
the 5 seeders, `trusted-sources.ts`. Wiring: `lib/ai.ts` (1756–1776, 455–486), `lib/edit-intent-service.ts`,
`routes/{admin,session-feedback,training-system-edit,training-system-history}.ts`. Consumer greps across
`artifacts/api-server/src`.

## 11. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Keyword retrieval + deterministic scoring + approval gate | **High** | Read scoreChunk + filter + rejection. |
| 7-dimension guidance translation | **High** | Read builder body + dimension dispatch. |
| Wiring into build + edit prompts | **High** | Import/call-site grep in ai.ts + edit-intent-service. |
| Librarian admin-only invariant | **High** | Consumer census (no chat consumer). |
| Discovery sources + gating | **High** | API bases + RESEARCH_DISCOVERY_ENABLED read. |
| Global-learning collect→suggest, admin-gated, agent-never-reads | **High** | Exports + promotion logic + negative read grep. |
| Per-dimension builder internals + every seeder | **Medium** | Dispatch read; individual builder bodies + seeders not fully read. |
| **Runtime behavior** | **UNVERIFIED** | No execution. |

Overall: **high confidence; faithful subsystem; clean register (no high/medium).** L4 (Reconciled)
is awarded on that basis. Promotion to **L5** awaits runtime verification + the staleness automation
(Version 3).

## 12. Verification record

- Verified at commit `78ee536` (current date 2026-06-29).
- Independent checks: retriever approval filter (status=approved ∧ isActive ∧ recommendation);
  score<2 rejection; `MAX_RESEARCH_TOKENS=1200`; 7 dimensions in `ResearchProgrammingGuidance`;
  librarian consumers = admin/discovery/scripts only; ai.ts/conversations.ts read of learning tables
  = none; `trackLearningEvent` sites = feedback/history/edit routes; discovery bases = PubMed/
  Semantic Scholar/Crossref.
- Not run (documented gaps): full per-dimension builder + seeder read; discovery parser; runtime.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
