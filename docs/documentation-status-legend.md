# Documentation Status Legend

> **Document type:** Governance — Reference
> **Applies to:** every document in `docs/` and the `status:` field in `docs/_template.md`.
> **Owner:** TrainChat Engineering Knowledge Base.

This legend defines the **single, shared vocabulary** for the state of any TrainChat document.
Every implementation document carries exactly one status in its frontmatter, and the
`docs/documentation-map.md` index renders these same badges. Do not invent ad-hoc states.

## 1. Status values

| Badge | Status | Meaning | Trust it? |
|---|---|---|---|
| 🟢 | `VERIFIED` | Generated from code **and** cross-checked against the cited source files (and tests/gates where relevant) within the current reconciliation cycle. Verification metadata is current. | Yes. |
| 🟡 | `DRAFT` | Generated from code but **not yet verified** against source by a second pass. Content is plausible but unconfirmed. | With caution. |
| 🟠 | `STALE` | Was verified, but a cited source file has changed since `last_verified`. Needs re-verification. | Re-check before relying. |
| 🔴 | `DISCREPANCY` | The document and the code **disagree**, or the code contradicts `CLAUDE.md`. An entry exists in the Discrepancy Register. | No — read the discrepancy note. |
| ⚪ | `PLANNED` | Slot exists in the map/roadmap; no document written yet. | N/A. |
| ⚫ | `DEPRECATED` | The subsystem was removed or merged; the doc is retained for history only. | Historical only. |

## 2. Status transitions

```
PLANNED ─▶ DRAFT ─▶ VERIFIED ─┬─▶ STALE ─▶ (regenerate) ─▶ DRAFT ─▶ VERIFIED
                              └─▶ DISCREPANCY ─▶ (reconcile) ─▶ DRAFT/VERIFIED
                  any state ─▶ DEPRECATED (subsystem removed)
```

- A document **may not** skip from `PLANNED` straight to `VERIFIED`; it must pass through `DRAFT`.
- `STALE` is set automatically-by-policy whenever a `source_of_truth` file's commit hash no longer
  matches `verified_commit` (see `docs/documentation-generation-workflow.md`).
- `DISCREPANCY` is the only status that **requires** a linked entry in the Discrepancy Register
  (see `docs/documentation-governance.md`).

## 3. Where status lives

- **Per document:** the `status:` frontmatter field (see `docs/_template.md`).
- **Aggregated:** the status column of `docs/documentation-map.md`.
- **Maturity vs. status:** *status* is the current trust state of a single doc; *maturity*
  (see `docs/documentation-maturity-model.md`) is the long-run quality level of that doc's
  coverage. A doc can be `VERIFIED` (status) yet still be maturity **L3** if it lacks continuous
  reconciliation hooks. Keep the two concepts distinct.
