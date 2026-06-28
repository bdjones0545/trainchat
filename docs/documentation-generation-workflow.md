# Documentation Generation Workflow

> **Document type:** Governance — Process
> **Purpose:** define how a TrainChat **implementation document** is *generated from code*,
> verified, and kept reconciled. Architecture documents (`CLAUDE.md`) are authored by intent;
> implementation documents are **derived from source** by this workflow. They are not the same
> activity and must not be conflated.

## Core rule

> **Source code is the source of truth. Implementation docs are generated from it, never the
> reverse.** A document that describes behavior the code does not exhibit is a defect, tracked as
> a discrepancy — even if the described behavior is "better."

## Phase 0 — Scope a subsystem

1. Pick a subsystem key from `docs/documentation-map.md` (e.g. `ai-agents`, `mutation-pipeline`,
   `research`, `memory`, `db-schema`, `external-api`, `exercise-programming`, `contract-spine`).
2. Identify its **source of truth** — the exact files/globs the doc will be generated from. This
   becomes the `source_of_truth` frontmatter and the boundary of the document.
3. Identify the **architecture anchor** — which `CLAUDE.md` section(s) this subsystem implements.

## Phase 1 — Generate from code (→ status DRAFT, maturity L2)

4. Copy `docs/_template.md` to `docs/implementation/<subsystem>.md`.
5. Read the `source_of_truth` files and write the document **strictly from what the code does**:
   control flow, contracts, types, DB tables, endpoints, side effects, error paths, gates.
   - Cite `file:line` for non-obvious claims.
   - Record *actual* behavior, including warts. Do not document the intended design from a
     `*_QA.md` file unless the code matches it — if it doesn't, that's a discrepancy (Phase 3).
6. Fill `last_generated`, `source_of_truth`, `related_architecture`. Set `status: DRAFT`.

## Phase 2 — Verify against source (→ status VERIFIED, maturity L3)

7. A **separate pass** (different agent/human, or a deliberately fresh read) re-derives the key
   claims from code and confirms them. Verification is not "re-reading what you wrote."
8. Exercise the relevant verification layer where applicable (per `CLAUDE.md §8`):
   - run the subsystem's Vitest suite and record pass/fail;
   - observe runtime gates (Architecture Gate, CEO Heartbeat, mutation verifier) for AI/program docs;
   - exercise the route or `drizzle-kit push` for API/schema docs.
9. Record verification metadata: `last_verified`, `verified_by`, `verified_commit` (short SHA at
   verification time), `verification_method`. Set `status: VERIFIED`.

## Phase 3 — Reconcile with architecture (→ maturity L4)

10. Compare the verified behavior against the architecture anchor in `CLAUDE.md`.
11. For every mismatch, open a **Discrepancy Register** entry (`docs/documentation-governance.md`)
    with a `DR-####` id, severity, and the resolution path:
    - **Code is right, CLAUDE.md is stale** → file a CLAUDE.md correction (architecture change is a
      deliberate, separate action — do not silently edit architecture from an impl doc).
    - **CLAUDE.md is right, code diverged** → file an engineering issue; the doc records the
      *as-built* reality and flags the gap. The doc still describes the code, not the wish.
    - **Both partially right** → split into the smallest true statements and register each.
12. Add bidirectional cross-links (doc ↔ CLAUDE.md section). When the subsystem's register is
    clean of open `high`-severity items, the doc reaches **L4**.

## Phase 4 — Continuous reconciliation (→ maturity L5, Version 3)

13. A staleness check compares each `source_of_truth` file's current commit against the doc's
    `verified_commit`. On drift, the doc is marked **STALE** and capped at L2 until re-verified.
14. Re-entry: a STALE doc re-runs Phases 1–3 for the changed surface only (not a full rewrite).

## Section 6 — Staleness signal (mechanism)

The staleness signal may be implemented (in Version 3) as a docs-lint script that:
- parses each `docs/implementation/*.md` frontmatter,
- runs `git log -1 --format=%h` over each `source_of_truth` path,
- flags any doc where a source path advanced beyond `verified_commit`.

Until that exists, staleness is checked **manually at the start of each reconciliation cycle**, and
the result recorded in `documentation-map.md`. This document defines the contract; the automation
is deferred, not assumed.

## What this workflow forbids

- ❌ Writing implementation docs from memory, `replit.md`, or `*_QA.md` intent without code reading.
- ❌ Marking `VERIFIED` without recorded `verified_commit` + `verification_method`.
- ❌ Editing generated code directories to make a doc "true" (this is a doc-only process).
- ❌ Silently changing `CLAUDE.md` architecture as a side effect of an impl doc — that is a
  separate, deliberate architecture change.
