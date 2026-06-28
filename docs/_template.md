---
# ─── TrainChat Implementation Document — Frontmatter (REQUIRED) ───────────────
# Copy this file to docs/implementation/<subsystem>.md and fill every field.
# Verification metadata is mandatory: an implementation doc with empty metadata
# is treated as PLANNED, not DRAFT.

title:                # Human title, e.g. "Mutation Pipeline & Receipts"
doc_type: implementation        # implementation | architecture | governance
subsystem:            # canonical subsystem key, e.g. "ai-agents", "research", "db-schema"
status: DRAFT         # see docs/documentation-status-legend.md
maturity: L2          # see docs/documentation-maturity-model.md (L0–L5)

# Source of truth — the code this document is GENERATED FROM. Globs/paths, repo-relative.
# Reconciliation compares these files' commit state against verified_commit.
source_of_truth:
  - artifacts/api-server/src/...     # primary implementation
  - lib/db/src/schema/...            # related data shapes
# Architecture this document must stay consistent with (CLAUDE.md sections).
related_architecture:
  - "CLAUDE.md §4 AI Architecture"

# Verification metadata — DO NOT leave blank for a VERIFIED doc.
last_generated:       # ISO date the doc was generated from code
last_verified:        # ISO date the doc was cross-checked against source
verified_by:          # agent/human who verified
verified_commit:      # git short SHA the verification was performed against
verification_method:  # e.g. "read source + ran vitest + exercised route"

# Open discrepancies between this doc, the code, and CLAUDE.md.
# Each must also be registered in docs/documentation-governance.md §Discrepancy Register.
discrepancies: []     # e.g. [{ id: DR-012, summary: "...", severity: medium, status: open }]
---

# {title}

> **Status:** {status} · **Maturity:** {maturity} · **Source of truth:** see frontmatter.
> This is an **implementation document**: it is *generated from and reconciled against code*.
> If it disagrees with the source files listed above, **the code wins** — open a discrepancy.
> Architectural intent lives in `CLAUDE.md`; this document does not redefine architecture.

## 1. Purpose & scope
<!-- What this subsystem does, in one paragraph. Link the CLAUDE.md section it implements. -->

## 2. Source map
<!-- Table: file → responsibility. Every row must be a real file in source_of_truth. -->

| File | Responsibility |
|---|---|
| `…` | … |

## 3. Behavior (as implemented)
<!-- Describe ACTUAL behavior derived from code: control flow, contracts, data shapes,
     side effects, error paths. Cite file:line where it matters. No aspirational behavior. -->

## 4. Contracts & data shapes
<!-- Types, receipts, DB tables, API endpoints this subsystem owns or depends on. -->

## 5. Invariants & gates
<!-- Safety rules, validation gates, ordering guarantees the code enforces.
     Map each to the verification that proves it (test name, gate, manual check). -->

## 6. Known discrepancies
<!-- Mirror the frontmatter `discrepancies`. If empty, state "None known as of last_verified." -->

## 7. Verification record
<!-- How this document was verified for the current cycle. Reproducible steps:
     files read, tests run (and result), routes exercised, gates observed. -->

---
<!-- Reconciliation footer — updated every cycle. -->
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
