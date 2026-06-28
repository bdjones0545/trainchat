# Documentation Maturity Model

> **Document type:** Governance — Reference
> **Purpose:** define the long-run quality ladder for TrainChat documentation, independent of a
> document's momentary `status`. Status answers *"can I trust this right now?"*; maturity answers
> *"how well-established is this document's coverage and upkeep?"*

## 1. The six levels

| Level | Name | Definition | Entry criteria |
|---|---|---|---|
| **L0** | Absent | No document exists for the subsystem. | — |
| **L1** | Stub | A slot exists in `documentation-map.md`; possibly a title and scope sentence. | Mapped in the index. |
| **L2** | Drafted | Generated **from code** following `documentation-generation-workflow.md`. Frontmatter present; `source_of_truth` populated. | Generated from source; status ≥ DRAFT. |
| **L3** | Verified | Cross-checked against the cited source by a second pass; verification metadata complete; relevant tests/gates observed. | Status reached VERIFIED at least once; `verified_commit` recorded. |
| **L4** | Reconciled | Explicitly reconciled with `CLAUDE.md`; all discrepancies registered, none unresolved at `high` severity; architecture cross-links bidirectional. | L3 + clean Discrepancy Register for this subsystem (no open `high`). |
| **L5** | Continuously maintained | Reconciliation is routine, not heroic: a staleness check ties `verified_commit` to `source_of_truth`, and drift is surfaced automatically. | L4 + automated staleness signal wired (see workflow §6). |

## 2. Maturity is per-document and per-subsystem

- Each implementation document carries a `maturity:` field (L0–L5).
- `documentation-map.md` rolls these up into a **subsystem maturity** (the minimum across the
  subsystem's documents — a chain is only as mature as its weakest link).
- The **knowledge base maturity** is the distribution across all subsystems, reported in the map.

## 3. Promotion & demotion rules

**Promotion** is earned, never assumed:
- L1→L2 requires generation from code (not prose written from memory).
- L2→L3 requires an independent verification pass with recorded metadata.
- L3→L4 requires a reconciliation pass against `CLAUDE.md` with the Discrepancy Register clean of
  open `high`-severity items for that subsystem.
- L4→L5 requires a working staleness signal.

**Demotion** is automatic:
- Any `source_of_truth` file changing after `verified_commit` demotes the doc to **STALE** status
  and caps effective maturity at **L2** until re-verified.
- A new open `high`-severity discrepancy demotes the subsystem from L4 to L3.
- Subsystem removal moves all its docs to **L0 / DEPRECATED**.

## 4. Target maturity for Version 2

Version 2 (implementation documentation) targets **L3 (Verified)** for every subsystem in the
roadmap, with the three highest-risk subsystems — **AI agents/orchestration**, **mutation
pipeline**, and **research-informed programming** — reaching **L4 (Reconciled)** because their
behavior is where architecture and code most easily drift apart. L5 is a Version 3 goal once the
staleness automation exists. See `docs/version-2-roadmap.md`.
