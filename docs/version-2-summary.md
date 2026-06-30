# Version 2 — Completion Summary & Synthesis

> **Document type:** Governance — Synthesis (end-of-Version-2 wrap-up)
> **Status:** Version 2 complete — 12/12 implementation documents generated and verified.
> **Source of truth:** the 12 `docs/<subsystem>.md` files + the Discrepancy Register
> (`documentation-governance.md §5`). This document synthesizes; it does not introduce new claims.
> **Verified commit:** `78ee536` · **Date:** 2026-06-29 · **Application source: not modified.**

## 1. Repository-wide engineering summary

TrainChat is a **pnpm monorepo** whose intelligence is overwhelmingly concentrated in one
application, `@workspace/api-server` (Express 5), with a conventional `@workspace/trainchat`
(React 19 + wouter + React Query) front end, four shared libs (`db`, `api-spec`, `api-zod`,
`api-client-react`), and operational scripts. PostgreSQL 16 via Drizzle; OpenAI `gpt-4.1`/`-mini`.

**What it is, as built:** a conversational "AI Performance Architect" where a deterministic
**Performance Architect** computes program structure, a **Coach** LLM renders it, a **Research
Librarian** (admin-only) curates evidence, and a layered prompt assembly injects memory, research,
periodization, and UI context. Mutations flow through a verified ATTEMPT→APPLY→VERIFY→RESPOND
pipeline with receipt-first feedback; adaptation closes the loop from readiness/feedback/performance.

**Coverage achieved (12 subsystems):** db-schema, contract-spine, ai-agents, mutation-pipeline,
context-pipeline, memory, research, exercise-programming, adaptation-loop, identity-billing,
external-api, frontend — all **🟢 VERIFIED**; `research` reached **L4 (Reconciled)**, the other 11
**L3 (Verified)**. **41 discrepancies** were opened (3 high, 13 medium, 25 low).

**Strongest subsystems (closest to CLAUDE.md):** `research` (keyword retrieval, 7-dimension guidance,
3-gate approval, admin-only Librarian, collect→aggregate→suggest — all faithful) and
`exercise-programming` (deterministic skeleton, periodization, field-safe prescription, engineered
variety). The deterministic-skeleton/generative-skin principle is genuinely realized.

**Highest-risk findings (the 3 high-severity DRs):**
- **DR-0025 (memory):** the anonymous→registered **merge silently cascade-deletes** an anon user's
  memory/profile/readiness/neural/logs (only conversations + training_systems migrate) — likely a
  bug, and it contradicts a stated guarantee.
- **DR-0011 (ai-agents):** the **persona registry is unwired** (0 consumers); the Coach identity is
  hardcoded in `ai.ts` — editing the "obvious" file changes nothing at runtime.
- **DR-0007 (contract-spine):** the OpenAPI "single source of truth" actually covers **~9 of 40
  routers**; most of the HTTP surface is hand-written and uncontracted.

**Universal caveat:** every document is VERIFIED against *source*; **none** was verified at
*runtime* (no app/test execution in this documentation-only program). This is the single largest
outstanding verification gap and the main thing standing between L3/L4 and L5.

## 2. Recurring architectural patterns

The cross-subsystem patterns are more valuable than any single finding:

1. **Dual coexisting systems (the dominant pattern).** New systems are added beside legacy ones
   without retiring them: dual **program models** (saved_programs vs training_systems, DR-0009),
   dual **mutation engines** (mutation-engine vs edit pipeline, DR-0018), dual **anonymous/guest**
   systems (/auth/bootstrap vs /guest/*, DR-0035), dual **memory** systems (user_memories vs
   atlas_memories, DR-0024), dual **billing** surfaces (DR-0036), and two **conflict hierarchies**
   (DR-0013). Reconciling or documenting these is the repo's biggest architectural debt.
2. **Defined-but-unwired scaffolding.** Code written for an intended architecture but not connected:
   the persona registry (DR-0011), behavioral + progression intelligence (DR-0012), and the
   mutation ontology's rich metadata (DR-0016). The `*_QA.md` audits report these as "implemented."
3. **In-memory state vs autoscale.** Process-local stores break under the `autoscale` deployment:
   the conversation context resolver (DR-0020) and the external rate limiter (DR-0038). The
   DB-backed session store (connect-pg-simple) is the deliberate counter-example.
4. **Spec-first contract is a minority surface.** OpenAPI covers a core subset; the **core product
   flow** (SSE chat, outcomes, build stages, scope, UIContext) rides **hand-synchronized** types
   (DR-0040), validation is partial (DR-0008), and the external API has its own envelope (DR-0039).
5. **Audit-first, transaction-light.** Integrity rests on append-only audit (`system_change_log`,
   universal) + jsonb before/after snapshots, **not** DB transactions (DR-0006); the dedicated
   `mutation_audit_receipts` table is only partially wired (DR-0017).
6. **Capability tiering in the architecture.** Memory + adaptation injection is plan-gated premium
   (DR-0026) — the intelligence the docs describe as universal is partly paywalled.
7. **Faithful deterministic core.** Where TrainChat is most rigorous — research retrieval/guidance
   and the programming engine — the implementation matches the architecture closely.

> **Update (2026-06-29): the reconciliation pass below has been executed.** `CLAUDE.md` is now
> **v1.1**, reconciled against all 12 implementation docs; §11 "Known Divergences" was added. Register
> outcome: **30 entries `resolved`** (doc-vs-code drift corrected in CLAUDE.md), **11 `reconciling`**
> (documented but awaiting code fixes, incl. the 3 high items). See the Reconciliation ledger in
> `documentation-governance.md §5`. The section below is retained as the pass's plan of record.

## 3. Recommended final CLAUDE.md reconciliation

A single, deliberate **architecture-owner pass** (governance §2/§7) applying the per-document §
"Recommended CLAUDE.md updates," prioritized:

**Tier 1 — resolve the 3 high-severity DRs first**
- **§5:** correct the merge claim and decide whether DR-0025 (data loss) is a bug to fix or intended.
- **§4:** state the persona registry is unwired and the Coach identity lives inline in `ai.ts`
  (DR-0011); mark behavioral/progression intelligence as not-wired (DR-0012).
- **§2/§7:** replace "single source of truth for the HTTP surface" with the qualified reality
  (~9/40 routers contracted; the rest hand-written) (DR-0007).

**Tier 2 — correct the medium drifts**
- §4: two conflict hierarchies (DR-0013); mandatory conversion/sales identity (DR-0015); gate lives
  in `ai.ts`. §6 model facts: replace residual "GPT-4o" with `gpt-4.1`/`-mini` and close **DR-0001**.
- §3/§4: audit-table coverage (DR-0017); dual program/mutation models; no DB transactions (DR-0006).
- §5: dual memory systems (DR-0024); plan-gating (DR-0026).
- §2/§3: dual guest systems (DR-0035); two billing surfaces (DR-0036); non-Drizzle tables (DR-0037).
- §7: split adaptation apply-model (DR-0032); focus-mode engine layer (DR-0031).
- §2: hand-synchronized streaming contract (DR-0040); AEO surface (DR-0041).

**Tier 3 — clarifications (low)** — the remaining low DRs (ontology-as-classifier, graceful research
no-op, validator proliferation, etc.) folded in as notes.

After the pass, re-tag each CLAUDE.md claim as **accurate / aspirational / drifted**, and move
resolved register entries to `resolved`. Subsystems whose register then has no open high/medium
become eligible for **L4** promotion.

## 4. Recommended Version 3 priorities

1. **Fix/triage the 3 high-severity DRs.** DR-0025 (merge data loss) is the most urgent — it is a
   probable correctness bug, not just a doc gap. DR-0011/DR-0012 (dead scaffolding): wire it or
   delete it. DR-0007: expand the spec or formally accept + document the uncontracted surface.
2. **Runtime verification.** Stand up the app + Vitest suites and re-verify each subsystem's behavior
   — this is the universal `UNVERIFIED` gap and the gate from L3/L4 toward L5.
3. **Staleness automation (L5 enabler).** Implement the docs-lint staleness check
   (`documentation-generation-workflow.md §6`) tying each doc's `verified_commit` to its
   `source_of_truth`; surface drift automatically.
4. **L3→L4 promotions via code-level deep reads.** mutation-pipeline (edit-intent-service +
   edit-engine), exercise-programming (the 4367-line engine + lib/programs), external-api (programs
   route), and ai-agents (after DR-0011) are all clean-register L4 candidates pending full reads.
5. **Decide the dual-systems future.** For each duplicated system (program model, mutation engine,
   guest, memory, billing), choose: retire the legacy path, or document the coexistence as
   intentional. This is the single highest-leverage architectural decision.
6. **Address the autoscale-fragile in-memory stores** (DR-0020, DR-0038) — move to a shared store if
   horizontal scaling is real.

---

## Appendix — Document & maturity ledger

| # | Subsystem | Doc | Maturity | DRs (sev) |
|---|---|---|---|---|
| 1 | db-schema | `docs/db-schema.md` | L3 | DR-0002…0006 (1 med-set, lows) |
| 2 | contract-spine | `docs/contract-spine.md` | L3 | DR-0007 (high) …0010 |
| 3 | ai-agents | `docs/ai-agents.md` | L3 | DR-0011 (high), 0012-0015 |
| 4 | mutation-pipeline | `docs/mutation-pipeline.md` | L3 | DR-0016…0019 |
| 5 | context-pipeline | `docs/context-pipeline.md` | L3 | DR-0020…0023 |
| 6 | memory | `docs/memory.md` | L3 | DR-0025 (high), 0024, 0026 |
| 7 | research | `docs/research.md` | **L4** | DR-0027…0028 (low) |
| 8 | exercise-programming | `docs/exercise-programming.md` | L3 | DR-0029…0031 (low) |
| 9 | adaptation-loop | `docs/adaptation-loop.md` | L3 | DR-0032…0034 |
| 10 | identity-billing | `docs/identity-billing.md` | L3 | DR-0035…0037 |
| 11 | external-api | `docs/external-api.md` | L3 | DR-0038…0039 |
| 12 | frontend | `docs/frontend.md` | L3 | DR-0040…0041 |

**Totals:** 12 docs · 1 L4 + 11 L3 · 41 open DRs (3 high / 13 medium / 25 low) · 0 application-source
changes.

---
*Synthesis of Version 2. Reconcile per `docs/documentation-governance.md`. Implementation
documentation is generated from code; CLAUDE.md remains the architecture specification.*
