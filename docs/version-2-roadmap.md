# Version 2 Roadmap — Implementation Documentation

> **Document type:** Governance — Roadmap
> **Purpose:** define the order in which TrainChat's implementation documents are generated in
> Version 2, and why. Version 1 delivered the Architecture Specification (`CLAUDE.md`) and this
> governance framework. **Version 2 produces the code-derived implementation docs** under
> `docs/implementation/`, following `documentation-generation-workflow.md`.
>
> Status: **COMPLETE.** 12 of 12 implementation documents generated. (`research` is the first L4.)
> Cross-cutting reconciliation pass (§5) and Version 3 priorities are pending.
>
> **Note on path:** the first document was generated at `docs/db-schema.md` (flat `docs/`), per the
> task instruction, rather than `docs/implementation/db-schema.md`. The remaining documents may
> follow either convention; the map records the actual location. Keep `subsystem:` keys canonical
> regardless of path.

## 0. Progress log

| # | Subsystem | Document | Status | Maturity | Notes |
|---|---|---|---|---|---|
| 1 | `db-schema` | `docs/db-schema.md` | 🟢 VERIFIED (source) | L3 | Done. Opened DR-0002…DR-0006. Live-DB introspection is the one open verification gap (caps L4). |
| 2 | `contract-spine` | `docs/contract-spine.md` | 🟢 VERIFIED (source) | L3 | Done. Opened DR-0007 (**high**)…DR-0010. Headline: spec covers ~9 of 40 routers. Open gaps: codegen-parity run; per-route validation audit. |
| 3 | `ai-agents` | `docs/ai-agents.md` | 🟢 VERIFIED (source) | **L3** (target was L4) | Done. Opened DR-0011 (**high**)…DR-0015. Headline: persona registry + both intelligence modules are **unwired**. L4 blocked by open high-severity DR-0011. |
| 4 | `mutation-pipeline` | `docs/mutation-pipeline.md` | 🟢 VERIFIED (source) | **L3** (target was L4) | Done. Opened DR-0016…DR-0019 (all medium/low). Headline: `mutation_audit_receipts` not written on chat path; ontology metadata unconsumed. L3 (edit-intent-service + edit-engine ~6.8k lines not fully read). |
| 5 | `context-pipeline` | `docs/context-pipeline.md` | 🟢 VERIFIED (source) | L3 | Done. Opened DR-0020…DR-0023 (medium/low). Headline: in-memory resolver + autoscale = context not shared across instances. Resolver is genuinely wired. |
| 6 | `memory` | `docs/memory.md` | 🟢 VERIFIED (source) | L3 | Done. Opened DR-0024…DR-0026 (incl. **high** DR-0025: anon→registered merge silently cascade-deletes memory/profile/logs). Atlas memory is frontend-only; memory injection is plan-gated. |
| 7 | `research` | `docs/research.md` | 🟢 VERIFIED (source) | **L4** ✅ | Done. **Most faithful subsystem; L4 target met.** Only DR-0027/DR-0028 (low). Keyword retrieval, 7-dim guidance, 3-gate approval, admin-only Librarian, collect→aggregate→suggest all confirmed. |
| 8 | `exercise-programming` | `docs/exercise-programming.md` | 🟢 VERIFIED (source) | L3 | Done. **Largest subsystem (~18k lines); §7 faithful.** Only DR-0029…DR-0031 (low). L3: engine + lib/programs read at header/wiring level, not full. |
| 9 | `adaptation-loop` | `docs/adaptation-loop.md` | 🟢 VERIFIED (source) | L3 | Done. Opened DR-0032 (medium)…DR-0034. Headline: split apply model — check-ins user-confirmed, session logs auto-apply. **Wave 3 complete.** |
| 10 | `identity-billing` | `docs/identity-billing.md` | 🟢 VERIFIED (source) | L3 | Done. Opened DR-0035 (medium)…DR-0037. Headline: legacy guest system still live alongside anonymous-first; two billing surfaces; non-Drizzle tables. |
| 11 | `external-api` | `docs/external-api.md` | 🟢 VERIFIED (source) | L3 | Done. Opened DR-0038 (medium)…DR-0039. Clean isolated namespace; reuses the Coach engine; in-memory rate limiter under autoscale. |
| 12 | `frontend` | `docs/frontend.md` | 🟢 VERIFIED (source) | L3 | Done. **Final V2 doc.** Opened DR-0040 (medium)…DR-0041. Headline: core product flow rides hand-synchronized client↔server types; large AEO surface. |

## 1. Goals for Version 2

- Generate an implementation document for each of the 12 subsystems in `documentation-map.md §3`.
- Every document reaches at least maturity **L3 (Verified)**.
- The three highest-risk subsystems — **AI agents**, **mutation pipeline**, **research** — reach
  **L4 (Reconciled)**.
- The Discrepancy Register is populated and triaged; no `open` `high`-severity item is left
  unresolved at the close of Version 2.

## 2. Sequencing principles

1. **Foundations before consumers.** Document the contract and data tiers first; everything else
   references them.
2. **Highest architectural-drift risk early.** The subsystems where code most easily diverges from
   `CLAUDE.md` (AI orchestration, mutations) are documented while attention is high.
3. **Safety-critical paths before peripheral ones.** Anything that can alter a user's program or
   make a safety decision precedes commerce/UI surfaces.
4. **Leaf consumers last.** Frontend and external API are documented after the engine they depend
   on is verified, so their docs can link to verified contracts.

## 3. Recommended document order

### Wave 1 — Foundations (establish the ground truth references)
1. **`db-schema`** — the data contract; every other doc cites these tables. Anchor: CLAUDE.md §3.
2. **`contract-spine`** — `openapi.yaml` → Orval → zod/react-query. Defines the HTTP surface every
   route doc references. Anchor: CLAUDE.md §2.

### Wave 2 — The brain (highest drift risk → target L4)
3. **`ai-agents`** — three-agent system, orchestrator, constitution, conflict hierarchy, model
   registry. The keystone document. Anchor: CLAUDE.md §4. **Target L4.**
4. **`mutation-pipeline`** — ontology, execution service, receipts, verifier/post-validator, audit
   receipts. Safety- and contract-critical. Anchor: CLAUDE.md §4. **Target L4.**
5. **`context-pipeline`** — system-prompt assembly + deictic context resolver. Anchor: CLAUDE.md §4.

### Wave 3 — Knowledge & state
6. **`memory`** — layered stores + memory dominance + anonymous→registered merge. Anchor: §5.
7. **`research`** — curation, discovery, keyword retrieval, 7-D guidance, global learning.
   Anchor: §6. **Target L4.**
8. **`exercise-programming`** — architecture engine, periodization, prescription schema,
   variance/coherence logic. Anchor: §7.
9. **`adaptation-loop`** — readiness/feedback → adaptation services → system-adjustment events.
   Anchor: §7.

### Wave 4 — Edge surfaces & consumers (leaf last)
10. **`identity-billing`** — auth, guest sessions, Stripe billing/webhooks. Anchor: §2/§3.
11. **`external-api`** — key auth, rate limiting, isolated namespace, audit logs. Anchor: §2/§3.
12. **`frontend`** — pages, contexts, hooks; consumes the verified contract spine. Anchor: §2.

## 4. Per-document exit criteria (Definition of Done)

A Version 2 implementation document is "done" when:
- [ ] Generated from code (workflow Phase 1); `source_of_truth` populated.
- [ ] Independently verified (Phase 2); `verified_commit` + `verification_method` recorded.
- [ ] Reconciled against its `CLAUDE.md` anchor (Phase 3); discrepancies registered.
- [ ] Status 🟢 VERIFIED (or 🔴 with a tracked register entry if reality demands it).
- [ ] `documentation-map.md` roll-up updated.
- [ ] L4 targets additionally have a clean Discrepancy Register (no open `high`) for the subsystem.

## 5. Cross-cutting passes (after Wave 4)

- **Reconciliation sweep** — run governance §6 across all 12 docs; refresh the map roll-up.
- **CLAUDE.md correction pass** — apply any `code-vs-architecture` discrepancies that resolve in
  favor of the code as deliberate, reviewed edits to `CLAUDE.md` (e.g. close DR-0001 by correcting
  the `replit.md` model reference).
- **Version 3 preview** — wire the staleness automation (workflow §6) to move subsystems toward L5.

## 6. Explicitly out of scope for Version 2

- Application source changes (documentation-only program of work).
- Editing generated directories.
- L5 (continuous-maintenance automation) — deferred to Version 3.
