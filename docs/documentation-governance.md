# Documentation Governance

> **Document type:** Governance — Constitution for the Knowledge Base
> **Purpose:** the rules that keep TrainChat's documentation honest: separation of architecture
> from implementation, code as source of truth, discrepancy tracking, and continuous
> reconciliation between `CLAUDE.md` and the implementation documents.

## 1. The document hierarchy

TrainChat documentation has three tiers with **strict, non-overlapping authority**:

| Tier | Document(s) | Authority | Changes when… |
|---|---|---|---|
| **Architecture** | `CLAUDE.md` | Defines *intended* structure, boundaries, and philosophy. | An architectural boundary moves — deliberately. |
| **Implementation** | `docs/implementation/*.md` | Describes *as-built* behavior, generated from code. | The code it documents changes. |
| **Governance** | `docs/*.md` (this set) | Defines the *process* by which the other two stay true. | The process itself is revised. |

**Ground-truth ordering (memorize this):**

```
CODE  ▶  IMPLEMENTATION DOCS  ▶  CLAUDE.md (architecture)  ▶  *_QA.md / *_AUDIT.md (design intent)
 (truth)   (derived from code)    (intended design)          (historical/aspirational)
```

When two tiers disagree, the **higher-truth source wins**, and the disagreement is logged as a
discrepancy. Documentation never overrides code; architecture never silently follows code.

## 2. Separation of Architecture and Implementation (the prime rule)

- `CLAUDE.md` says **what the system is meant to be**. It is authored by intent and changed
  deliberately. It contains **no generated, file-level implementation detail**.
- `docs/implementation/*.md` say **what the code actually does**. They are **generated from code**
  per `documentation-generation-workflow.md` and carry verification metadata.
- Neither may absorb the other's job. An implementation doc that starts redefining architecture,
  or an architecture doc that starts enumerating function-by-function behavior, is out of bounds.

## 3. Code is the source of truth

Every implementation document declares a `source_of_truth` (the files it is derived from). A claim
in a doc that the source files do not support is a **defect in the document**, not in the code —
regardless of how reasonable the claim sounds. Verification (workflow Phase 2) exists to catch
exactly this.

## 4. Implementation documents must be generated from code

No implementation document may be authored from `replit.md`, from a `*_QA.md` design record, or
from memory. The generation workflow requires reading the cited source. Design records inform
*questions to ask the code*; they are never themselves the source.

## 5. Discrepancy Register

The single ledger of every known gap between code, implementation docs, and architecture.

**Each entry:**

| Field | Meaning |
|---|---|
| `id` | `DR-####`, monotonic. |
| `subsystem` | Subsystem key. |
| `summary` | One line: what disagrees with what. |
| `kind` | `doc-vs-code` · `code-vs-architecture` · `architecture-vs-architecture`. |
| `severity` | `low` · `medium` · `high` (high = safety, data, or contract correctness). |
| `status` | `open` · `reconciling` · `resolved` · `wontfix`. |
| `resolution_path` | Which tier changes, and the linked action (issue / CLAUDE.md edit / doc fix). |
| `opened` / `closed` | Dates + author. |

**Register table** (seed — populated during Version 2 reconciliation):

| id | subsystem | summary | kind | severity | status |
|---|---|---|---|---|---|
| DR-0001 | ai-agents | `replit.md` cites model "GPT-4o"; live registry `lib/openai-models.ts` resolves the GPT-4.1 family. CLAUDE.md §9 already notes this. | doc-vs-code | low | open |
| DR-0002 | db-schema | `drizzle/0000` migration snapshot covers 29 of 51 tables — stale; `lib/db/src/schema/*` is authoritative (applied via `drizzle-kit push`). | doc-vs-code | medium | open |
| DR-0003 | db-schema | `performance_profiles.user_id` is `text` while `users.id` is serial int — cannot be a real FK; type-inconsistent soft reference. | code-vs-architecture | medium | open |
| DR-0004 | db-schema | `mutation_audit_receipts.conversation_id` is `text` while `conversations.id` is serial int — type-inconsistent soft reference. | code-vs-architecture | low | open |
| DR-0005 | db-schema | Many cross-entity references are soft (plain integer, no FK); CLAUDE.md §3 reads as fully relational. Referential integrity is partly application-enforced. | doc-vs-code | medium | open |
| DR-0006 | db-schema | No `db.transaction(...)` wraps multi-table writes; CLAUDE.md §4 implies snapshot/mutation integrity. Integrity rests on append-only receipts + jsonb snapshots, not DB atomicity. | code-vs-architecture | medium | open |
| DR-0007 | contract-spine | OpenAPI spec covers ~9 of 40 mounted routers (24 operations); most of the HTTP surface (training-system, billing, memory, external, etc.) is hand-written and uncontracted. CLAUDE.md §2 reads as if the spec is the whole surface. | doc-vs-code | high | open |
| DR-0008 | contract-spine | Within covered routes, request validation/error envelopes are only partially enforced by generated schemas; inline zod + ad-hoc `{ error }` responses are used. | doc-vs-code | medium | open |
| DR-0009 | contract-spine | Contracted `Program`/`ProgramDay`/`Exercise` DTOs model the **legacy** `saved_programs` hierarchy; the canonical `training_systems` model is uncontracted. Cross-ref `docs/db-schema.md §10`. | code-vs-architecture | medium | open |
| DR-0010 | contract-spine | No CI/parity guard that committed generated output matches the spec, or that the spec matches the mounted routes; spec ↔ generated ↔ routes drift is unguarded. | code-vs-architecture | medium | open |

> Note: DR-0001 is pre-seeded from the architecture-discovery phase as a worked example of the
> register format. The `replit.md` correction is a governance/ops-doc fix, not a code change.
> DR-0002–DR-0006 were opened during the `db-schema` reconciliation (Version 2, Wave 1). Their
> recommended resolutions are proposed in `docs/db-schema.md §12` (CLAUDE.md updates) and remain
> `open` pending a deliberate architecture-owner pass — no code or `CLAUDE.md` edit has been made.

**Rules:**
- A document at `status: DISCREPANCY` **must** have at least one `open` register entry.
- A subsystem cannot reach maturity **L4** with an `open` `high`-severity entry.
- Resolving an entry that requires an architecture change means a deliberate edit to `CLAUDE.md`
  (with its own review), never a silent drift.

## 6. Continuous reconciliation

Reconciliation is a recurring cycle, not a one-time event:

1. **Staleness sweep** — flag docs whose `source_of_truth` advanced past `verified_commit`
   (see workflow §6). Mark them `STALE`.
2. **Re-verify** stale docs over the changed surface only.
3. **Re-reconcile** against `CLAUDE.md`; open/close register entries.
4. **Roll up** maturity and status into `documentation-map.md`.

Cadence: at minimum, once per Version milestone, and whenever a subsystem's source changes
materially. The goal is that `CLAUDE.md` and `docs/implementation/*` never silently diverge.

## 7. Roles

- **Author (generator):** produces the DRAFT from code (workflow Phase 1).
- **Verifier:** independent pass that confirms claims and records metadata (Phase 2). Must not be
  the same pass as authoring.
- **Reconciler:** compares against `CLAUDE.md`, maintains the Discrepancy Register (Phase 3).
- **Architecture owner:** the only role that edits `CLAUDE.md`; acts on `code-vs-architecture`
  discrepancies deliberately.

A single agent may play multiple roles across documents, but **not author and verify the same
document in the same pass** — independence is the point.

## 8. Hard prohibitions

- ❌ Editing application source code as part of a documentation task.
- ❌ Editing generated directories (`api-zod/generated`, `api-client-react/generated`).
- ❌ Marking a doc `VERIFIED` without `verified_commit` + `verification_method`.
- ❌ Letting an implementation doc mutate architecture, or letting architecture quietly track code.
- ❌ Closing a discrepancy without recording which tier changed and why.
