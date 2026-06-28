---
title: Database & Drizzle Schema
doc_type: implementation
subsystem: db-schema
status: VERIFIED
maturity: L3

source_of_truth:
  - lib/db/package.json
  - lib/db/drizzle.config.ts
  - lib/db/src/index.ts
  - lib/db/src/schema/*.ts
  - lib/db/drizzle/0000_flat_thunderbolt_ross.sql
  - lib/db/drizzle/meta/_journal.json
related_architecture:
  - "CLAUDE.md §3 Data Architecture"
  - "CLAUDE.md §2 Repository Organization (package boundaries)"

last_generated: 2026-06-28
last_verified: 2026-06-28
verified_by: claude (Version 2, Wave 1 doc #1)
verified_commit: 78ee536
verification_method: >
  Read 100% of lib/db source (index.ts, drizzle.config.ts, all 30 schema files,
  package.json) and the single migration + journal. Independently cross-checked claims:
  counted `pgTable(` definitions (51 distinct tables) and diffed table names against the
  migration's CREATE TABLE set (29) to confirm migration drift; grep-verified FK presence,
  `text`-typed userId outliers, raw `sql` tag usage (16 files), transaction usage (0),
  and `pgEnum` usage (0). NOT performed: live-database introspection (`drizzle-kit push`
  against a provisioned DB) — this was a documentation-only task with no DB provisioned.
  All claims about *runtime database state* are therefore marked UNVERIFIED inline.

discrepancies:
  - { id: DR-0002, summary: "drizzle/0000 migration snapshot is stale — covers 29 of 51 tables", kind: doc-vs-code, severity: medium, status: open }
  - { id: DR-0003, summary: "performance_profiles.userId is text; users.id is serial int — cannot be a real FK", kind: code-vs-architecture, severity: medium, status: open }
  - { id: DR-0004, summary: "mutation_audit_receipts.conversationId is text; conversations.id is serial int", kind: code-vs-architecture, severity: low, status: open }
  - { id: DR-0005, summary: "Many cross-entity references are soft (plain integer, no FK); CLAUDE.md §3 implies relational coupling", kind: doc-vs-code, severity: medium, status: open }
  - { id: DR-0006, summary: "No DB transactions wrap multi-table writes; CLAUDE.md §4 implies snapshot/mutation integrity", kind: code-vs-architecture, severity: medium, status: open }
---

# Database & Drizzle Schema

> **Status:** VERIFIED (source-conformance) · **Maturity:** L3 · **Source of truth:** see frontmatter.
> This is an **implementation document**, generated from and reconciled against `lib/db/`.
> Where it disagrees with the source, **the code wins** — open a discrepancy.
> Claims about *live database state* are marked **(UNVERIFIED)** because no DB was introspected
> in this documentation-only task; the schema *source* is the authoritative artifact described here.

## 1. Purpose & scope

`@workspace/db` (`lib/db/`) is TrainChat's **data contract**: the single Drizzle ORM schema plus a
shared PostgreSQL client. Every other package that touches persistent state imports from here
(93 files in `api-server` import `@workspace/db`). This document describes the database
architecture, the Drizzle schema, the entity/relationship model, constraints, how the schema is
consumed (repository patterns, raw SQL), and the migration strategy — all as implemented.
It implements `CLAUDE.md §3`.

## 2. Source map

| File | Responsibility |
|---|---|
| `lib/db/package.json` | Package `@workspace/db`; ESM; `exports` `"."`→`src/index.ts`, `"./schema"`→`src/schema/index.ts`. Deps: `drizzle-orm` (catalog), `drizzle-zod ^0.8.3`, `pg ^8.20.0`, `zod` (catalog). Dev: `drizzle-kit ^0.31.9`, `@types/pg`. |
| `lib/db/src/index.ts` | Creates a single `pg.Pool` from `DATABASE_URL` and exports `pool`, `db = drizzle(pool, { schema })`, and re-exports all schema. Throws if `DATABASE_URL` is unset. |
| `lib/db/drizzle.config.ts` | drizzle-kit config: `dialect: "postgresql"`, schema = `src/schema/index.ts`, credentials from `DATABASE_URL` (throws if unset). |
| `lib/db/src/schema/index.ts` | Barrel: `export *` from all 30 domain schema files. |
| `lib/db/src/schema/*.ts` (30 files) | One file per domain; define 51 tables, their enums (as TS const tuples), Zod insert schemas, and inferred TS types. |
| `lib/db/drizzle/0000_flat_thunderbolt_ross.sql` | The **only** generated migration. Covers 29 tables (stale — see §9). |
| `lib/db/drizzle/meta/{_journal.json,0000_snapshot.json}` | drizzle-kit journal (version 7, single entry) + schema snapshot. |

## 3. Database architecture

- **Engine:** PostgreSQL 16 (`.replit` modules). **Driver:** `pg` (node-postgres) via
  `drizzle-orm/node-postgres`.
- **Client:** one process-wide `pg.Pool` and one `db` instance, both exported from `src/index.ts`.
  The Drizzle client is constructed with the full `schema` object, enabling Drizzle's typed query
  API. Consumers import `{ db, <table>, <Type> }` directly — there is **no connection-management or
  repository layer** between application code and Drizzle (see §7).
- **Configuration:** connection is `DATABASE_URL` only; both the runtime (`index.ts`) and the
  tooling (`drizzle.config.ts`) hard-fail if it is missing. No read-replica, no multi-pool, no
  per-tenant connection logic in this package (a `tenantId` column exists on `users` but is not
  wired to connection routing here).
- **Validation bridge:** `drizzle-zod`'s `createInsertSchema` generates insert validators
  (`insert*Schema`), consistently `.omit({ id, createdAt, updatedAt })`. Notably, `z` is imported
  from **`"zod/v4"`** (the Zod 4 API surface shipped inside the catalog's `zod ^3.25` package), not
  the default `"zod"` entrypoint.

## 4. Data model

### 4.1 Scale & conventions

- **51 tables** across 30 files (verified: 51 distinct `pgTable("…")` names).
- **Keys:** almost all tables use `serial("id").primaryKey()`. Exceptions:
  `stripe_processed_events` (PK = `event_id` text) and `whitepaper_settings` (PK = `id integer
  default 1`, a singleton row).
- **Timestamps:** `timestamp(..., { withTimezone: true })`, `defaultNow()`; mutable tables add
  `updatedAt` with `.$onUpdate(() => new Date())` (app-side, not a DB trigger).
- **Enums:** **zero `pgEnum`**. Every "enum" is a `text` column with a Drizzle `{ enum: [...] }`
  type hint backed by an exported `as const` tuple (e.g. `PLAN_TIERS`, `EVIDENCE_TYPES`).
  Consequence: enum membership is enforced at the **TypeScript/Drizzle layer, not by the database**
  — the underlying column is plain `text` with no `CHECK` constraint. **(Live-DB constraint state
  UNVERIFIED, but the schema emits no DB-level enum/check.)**
- **JSON:** `jsonb` is used heavily for flexible/structured payloads (`metadata`, snapshots,
  `graphState`, `athleteDNA`, `programData`) and for typed arrays via `.$type<string[]>()`.
- **Array representation is mixed:** some lists are `jsonb` arrays (`exercise_library.equipment`,
  `research_documents.topicTags`), others are **native Postgres `text[]`** via `.array()`
  (`assessments.sportRelevance`, `product_directory.sports`, `whitepaper_publications.keywords`).
  This inconsistency is intentional-looking but undocumented; noted as an observation (§11).

### 4.2 Entity catalog by domain

Grouped to match `CLAUDE.md §3`. (T) = has hard FK(s); (soft) = contains plain-integer references
with no FK (see §6).

**Identity & access**
- `users` — identity + anonymous device auth (`device_id` unique, `is_anonymous`, nullable
  `email`/`password_hash`/`name`), Stripe fields, `plan`/`plan_status`/`billing_interval`,
  `message_count`, `tenant_id`.
- `user_profiles` (T) — athlete profile; large behavioral block (schedule/recovery/coaching-style/
  autoregulation/motivation/aggression/confidence), `coaching_precision_score`, `athlete_dna`
  (jsonb), `coaching_precision_history`, `notification_preferences`. Cascades from `users`.
- `guest_sessions` — visitor funnel (`device_id` unique, status enum, funnel timestamps,
  `linked_user_id`→users `set null`, `ab_variant`).
- `password_reset_tokens` (T) — `token_hash` unique, expiry/usage; cascades from `users`.

**Conversation**
- `conversations` (T) / `messages` (T) — threads + turns. `messages.role` is **free `text`**
  (comment says `"user" | "assistant"`, but no enum hint). Cascade chain users→conversations→messages.
- `pending_clarifications` (T, soft) — in-flight edit awaiting clarification; FK to conversations &
  users (cascade); `target_program_id`/`target_session_id` are soft.

**Training programs — current canonical hierarchy** (`training-system.ts`)
- `training_systems` (T) → `training_phases` (T) → `training_weeks` (T) → `training_sessions` (T)
  → `session_exercises` (T): a 5-level cascade. Rich enums (`volume_level`, `session_type`,
  session-exercise `category`).
- `system_change_log` (T) — one row per edit op; `before_snapshot`/`after_snapshot` jsonb,
  `source`/`scope` enums, `is_major_version`, `restored_from_id` (soft).
- `propagation_events` (T, soft) — audit of cross-week propagation (apply/skip + `safety_score` +
  `skipped_reason`); `change_log_id` soft.

**Training programs — legacy hierarchy** (`programs.ts`)
- `saved_programs` (T, soft) → `program_days` (T) → `exercises` (T). `saved_programs.parent_program_id`
  is a soft self-reference for versioning; `block_label`, `week_number`, `version_notes`.
- ⚠️ **Two program representations coexist** (legacy vs `training_systems`); see §10.

**Exercise domain**
- `exercise_library` — the reference movement DB (~50 entries); `name` unique; movement pattern,
  equipment/intent/sport-transfer/joint-stress tags (jsonb arrays), swap `cluster_id`,
  easier/harder variations.
- `exercise_logs` (T, soft) — per-exercise completion (load/reps/sets/RPE, completion enum).
- `assessments` + 4 link tables (`assessment_quality_links`, `_method_links`, `_product_links`,
  `_exercise_links`) — assessment library; **links join by `assessment_id` integer with no FK**
  and by *name* strings to qualities/methods/products/exercises.
- `product_directory` — equipment catalog (category enum, cost tier, native `text[]` for sports/age).

**Athlete state & adaptation**
- `readiness_entries` (T) / `session_feedback` (T, soft) — daily 1–5 readiness scores; post-session
  feedback.
- `session_logs` (T, soft) — completed-session records; **five** soft program/system references +
  `pain_areas` jsonb.
- `active_sessions` (T, soft) — current session pointer; FK to users (cascade) + `training_systems`
  (cascade); week/session/program pointers soft; `focus_mode` enum.
- `performance_profiles` (soft) — derived athlete intelligence (priority qualities, limiting
  factors, etc. as jsonb). ⚠️ **`user_id` is `text`** (outlier; see DR-0003).
- `system_adjustment_events` (soft) — high-signal, user-visible adaptations; all references soft.

**AI memory & learning**
- `user_memories` (T) — durable onboarding/feedback memories (type/sentiment/confidence/status).
- `atlas_memories` (T) — async-extracted chat insights; **the only table with explicit indexes**
  (4: user+status, user+category, normalized_key, last_seen_at); dedup `normalized_key`,
  category `$type`, source conversation FK `set null`.
- `neural_profiles` (T) — gamification (level/xp/scores, `graph_state` jsonb); `user_id` **unique**
  (one-per-user) + cascade.
- `global_learning_events` (soft) — append-only typed product signals; `user_id` soft (nullable).
- `learning_candidates` — aggregated improvement suggestions (risk/recommendation enums,
  `promoted`/`dismissed`). Comments state the live agent never reads these.
- `mutation_audit_receipts` (soft) — append-only per-adjustment receipt; `verification_status`
  enum, before/after delta arrays + full snapshots (jsonb, nullable), `persisted_constraints`.
  ⚠️ `conversation_id` is `text` (DR-0004); `user_id`/`training_system_id`/`change_log_id` soft.

**Research / evidence**
- `research_documents` — curated evidence; `status`/`trust_level`/`evidence_type`/`confidence`
  enums, `is_active`, librarian fields, `is_foundational`.
- `research_chunks` (soft) — retrievable chunks; `document_id` is **plain integer, no FK** to
  `research_documents`; `embedding` jsonb reserved for future pgvector (default null).
- `research_discovery_runs` — discovery pipeline audit counters.
- `research_paper_candidates` (soft) — pre-approval staging; `duplicate_of_document_id` soft.
- `coaching_knowledge` — structured coaching notes for prompt injection (type enum, tags jsonb,
  sport/goal/body-region filter fields).

**Content & marketing**
- `whitepaper_topic_queue` (slug unique) / `whitepaper_publications` (T, slug unique; `topic_id`
  FK `set null`; typed jsonb body/citations/seo) / `whitepaper_settings` (singleton id=1).

**Commerce, ops & analytics**
- `stripe_processed_events` — webhook idempotency (PK `event_id`).
- `external_api_keys` (T) / `external_api_logs` (soft) / `external_programs` (soft) — external API:
  SHA-256 `key_hash` unique, `prefix`, `permissions` jsonb; logs & programs reference key via
  `set null`. `external_programs` deliberately decouples from `training_systems`.
- `support_submissions` (T) — tickets (type enum; `user_id` `set null`).
- `analytics_events` (soft) — funnel events (`event` text, soft device/guest/user refs, `properties`).
- `share_moment_audit` (soft) — share-card generation audit.

## 5. Relationships

**Enforced cascade backbone (hard FKs):** `users` is the deletion root. Cascade-on-delete FKs run
to `user_profiles`, `conversations`(→`messages`), `saved_programs`(→`program_days`→`exercises`),
`training_systems`(→`phases`→`weeks`→`sessions`→`session_exercises`), `readiness_entries`,
`session_feedback`, `user_memories`, `atlas_memories`, `neural_profiles`, `active_sessions`,
`exercise_logs`, `pending_clarifications`, `password_reset_tokens`, `system_change_log`,
`propagation_events`. **Set-null** FKs: `guest_sessions.linked_user_id`,
`support_submissions.user_id`, `external_api_keys.created_by`, `atlas_memories.source_conversation_id`,
`whitepaper_publications.topic_id`, `saved_programs.conversation_id`,
`training_systems.conversation_id`.

**Program ↔ conversation provenance:** both `saved_programs` and `training_systems` carry a
`conversation_id` (`set null`) — a program remembers the chat that produced it (matches `CLAUDE.md §3`).

**Audit/restore graph:** `system_change_log` stores before/after snapshots and links restores via
`restored_from_id`; `mutation_audit_receipts` references `change_log_id` for full-snapshot access;
`propagation_events` references `change_log_id`. These last two links are **soft** (no FK).

The migration encodes **26 foreign keys** for the 29 tables it covers; the 22 newer tables' FKs
(where any) exist only in schema source until the next `push` **(live-DB FK state UNVERIFIED)**.

## 6. Constraints & invariants (as implemented)

- **Primary keys:** every table (serial, or the two special PKs in §4.1).
- **Unique:** `users.device_id`, `users.email`, `guest_sessions.device_id`,
  `password_reset_tokens.token_hash`, `exercise_library.name`, `neural_profiles.user_id`,
  `external_api_keys.key_hash`, whitepaper slugs.
- **Indexes:** **only `atlas_memories` declares explicit secondary indexes** (4). No other table
  declares one in schema; the migration emits **0 `CREATE INDEX`**. Query performance on hot
  soft-referenced columns (e.g. `global_learning_events.user_id`, `analytics_events.event`) relies
  on table scans unless indexes were added out-of-band **(UNVERIFIED)**.
- **Soft references (application-enforced, no DB FK):** a large, deliberate set —
  `session_logs` (5 cols), `active_sessions` (week/session/program), `exercise_logs.program_id`,
  `session_feedback.saved_program_id`, `pending_clarifications.target_*`,
  `mutation_audit_receipts.*`, `system_adjustment_events.*`, `performance_profiles.*`,
  `analytics_events.*`, `research_chunks.document_id`, `research_paper_candidates.duplicate_of_*`,
  `assessment_*_links.assessment_id`, `saved_programs.parent_program_id`,
  `system_change_log.restored_from_id`, `training_systems.current_phase_id`. Referential integrity
  for these is the application's responsibility (DR-0005).
- **Type mismatches on references:** `performance_profiles.user_id` is `text` (DR-0003);
  `mutation_audit_receipts.conversation_id` is `text` (DR-0004) — both differ from the serial-int
  PKs they conceptually point at, so neither could become a real FK without a type change.
- **Append-only invariants** are documented in comments (not DB-enforced):
  `mutation_audit_receipts` ("Rows are NEVER updated or deleted", non-blocking writes) and
  `global_learning_events` ("append-only; the live agent never reads from it").

## 7. Repository patterns

- **No repository/DAO layer and no ORM-model layer.** There are zero `*repository*`/`*repo*` files.
  Application code imports `db` and table objects from `@workspace/db` and uses the **Drizzle query
  builder directly** (`db.select()/insert()/update()/delete()`, with `eq/and/desc/sql` imported from
  `drizzle-orm` in ~83 files).
- **A loose service layer exists but does not abstract the DB.** ~18 `*-service.ts` files in
  `artifacts/api-server/src/lib/` (e.g. `training-system-service.ts`, `mutation-audit-receipt-service.ts`,
  `globalLearningService.ts`) group domain operations, but each calls Drizzle directly rather than
  routing through a shared persistence interface. Persistence concerns are thus spread across many
  call sites, not centralized.
- **Transactions:** **no `db.transaction(...)` usage was found** anywhere in `api-server/src`.
  Multi-table writes (e.g. a program build that inserts a system + phases + weeks + sessions +
  exercises, or a mutation that updates entities *and* writes an audit receipt) are **not wrapped in
  a DB transaction** in source. Integrity relies on ordering, the append-only audit design, and
  snapshot-based restore rather than atomic transactions (DR-0006). **(Runtime behavior UNVERIFIED;
  based on absence of transaction calls in source.)**

## 8. Raw SQL usage

- Hand-written full SQL strings: **none found.** Raw SQL appears only through Drizzle's
  parameterized `sql` tag, in **16 files**, for expressions Drizzle's typed builder doesn't cover:
  aggregates (`COUNT(DISTINCT …)`), boolean predicates (`… IS NOT NULL`), case-insensitive matches
  (`lower(name) = lower(:name)`), and raw `ORDER BY` fragments. Examples:
  `analyticsService.ts` (`COUNT(DISTINCT device_id)`), `exercise-service.ts`
  (`lower(exercise_library.name) = lower(…)`). All interpolate column/values through the `sql` tag,
  so they remain parameterized rather than string-concatenated.
- No raw `pool.query(...)` SQL was observed in the sampled consumers **(full census UNVERIFIED —
  16 `sql`-tag files were confirmed; a `pool.query` grep was not exhaustively run).**

## 9. Migration strategy

- **Mechanism:** `drizzle-kit push` / `push-force` (the only two package scripts). This is
  **push-based**: drizzle-kit diffs the live DB against `schema/index.ts` and applies changes
  directly. There is **no `migrate()` runtime call** in source (matches `CLAUDE.md §3`).
- **The `drizzle/` migration folder is a single, stale snapshot.** It holds exactly one migration
  (`0000_flat_thunderbolt_ross.sql`, journal version 7, generated ≈2026-04-18) covering **29
  tables**. The current schema defines **51 tables**, so **22 tables exist only in schema, not in
  the migration** — including `atlas_memories`, all `external_*`, all `whitepaper_*`, all
  `assessment*`, `product_directory`, `performance_profiles`, `mutation_audit_receipts`,
  `system_adjustment_events`, all `research_*`, `stripe_processed_events`, and
  `share_moment_audit`. The migration is therefore **not** an authoritative description of the live
  schema; `lib/db/src/schema/*` is (DR-0002).
- **Implication for engineers:** never read `drizzle/0000_*.sql` to learn the schema — read the
  TypeScript schema. Treat the migration file as a historical snapshot only.

## 10. Architectural observations discovered directly from source

1. **Dual program model.** Legacy `saved_programs → program_days → exercises` and current
   `training_systems → … → session_exercises` coexist, both linked to conversations and referenced
   (softly) by `session_logs`/`active_sessions`. A code path must know which model it targets.
2. **Exercise-table naming collision.** Four distinct tables carry "exercise" semantics —
   `exercise_library` (reference DB), `exercises` (legacy program leaf), `session_exercises`
   (current program leaf), `exercise_logs` (execution records). Easy to confuse; the bare table
   name `exercises` is the *legacy* one.
3. **Soft-reference–dominant design.** Outside the user-cascade backbone and the two program
   hierarchies, most cross-entity links are soft integers. The DB is used more as typed document
   storage with selective relational enforcement than as a fully normalized relational model.
4. **Audit-first, transaction-light.** Integrity guarantees lean on append-only audit tables and
   jsonb before/after snapshots (`system_change_log`, `mutation_audit_receipts`) rather than DB
   transactions or FKs — consistent with `CLAUDE.md`'s "auditability over cleverness," but it means
   atomicity is not DB-guaranteed.
5. **Enums and indexes live in the type layer, not the DB.** No `pgEnum`, almost no indexes. Type
   safety is strong at compile time; DB-level enforcement is minimal.
6. **Anonymous-first is schema-deep.** `users.device_id`/`is_anonymous` + nullable credentials +
   `guest_sessions` make every visitor a real row, matching `CLAUDE.md` principle #5.

## 11. Known discrepancies

Mirror of frontmatter; registered in `docs/documentation-governance.md §5`.

| id | Summary | Kind | Severity |
|---|---|---|---|
| DR-0002 | `drizzle/0000` migration covers 29 of 51 tables — stale; schema source is authoritative. | doc-vs-code | medium |
| DR-0003 | `performance_profiles.user_id` is `text` vs serial-int `users.id`; cannot be a real FK. | code-vs-architecture | medium |
| DR-0004 | `mutation_audit_receipts.conversation_id` is `text` vs serial-int `conversations.id`. | code-vs-architecture | low |
| DR-0005 | Many cross-entity references are soft (no FK); `CLAUDE.md §3` reads as fully relational. | doc-vs-code | medium |
| DR-0006 | No DB transactions wrap multi-table writes; `CLAUDE.md §4` implies snapshot/mutation integrity. | code-vs-architecture | medium |

## 12. Recommended CLAUDE.md updates

These are **proposals**, not applied edits (governance §2/§7 — architecture changes are deliberate
and owned). Suggested for the next architecture-owner pass:

1. **§3** — Add: "The `lib/db/drizzle/` migration is a single stale snapshot (29/51 tables); the
   authoritative schema is `lib/db/src/schema/*`, applied via `drizzle-kit push`. Do not read the
   migration to learn the schema." (Closes DR-0002.)
2. **§3** — Disambiguate the three+one exercise tables and explicitly label the legacy
   `saved_programs`/`exercises` model as legacy vs the canonical `training_systems` model.
3. **§3** — State that referential integrity is **partial**: a user-cascade backbone + the two
   program hierarchies use FKs; most other links are application-enforced soft references.
   (Addresses DR-0005.)
4. **§3** — Note enums are app/Drizzle-level `text` (no `pgEnum`, no CHECK) and that only
   `atlas_memories` carries explicit indexes.
5. **§4** — Qualify the integrity claim: program mutations are guarded by append-only receipts and
   jsonb snapshots, **not** by DB transactions (none are used). (Addresses DR-0006.)
6. **§3** — Flag the `text`-typed `user_id`/`conversation_id` outliers as known
   inconsistencies (DR-0003/DR-0004).

## 13. Files reviewed

`lib/db/package.json`, `lib/db/drizzle.config.ts`, `lib/db/src/index.ts`,
`lib/db/src/schema/index.ts`, and all 30 schema files: `users, profiles, guest-sessions,
password-reset-tokens, conversations, pending-clarifications, programs, training-system, exercises,
exercise-logs, active-sessions, readiness, session-logs, memory, atlas-memories, neural-profile,
performance-profiles, mutation-audit-receipts, system-adjustment-events, global-learning, research,
knowledge, whitepapers, assessments, product-directory, external-api, billing, support, analytics,
share-moments`. Plus `lib/db/drizzle/0000_flat_thunderbolt_ross.sql` and
`lib/db/drizzle/meta/_journal.json`. Cross-check greps across `artifacts/api-server/src` and
`lib/db/src/schema` (table counts, FKs, types, `sql`/transaction/`pgEnum` usage).

## 14. Confidence assessment

| Area | Confidence | Basis |
|---|---|---|
| Table inventory, columns, enums, types | **High** | Read 100% of schema source; counts cross-verified. |
| FK / cascade / unique / index constraints (as written in schema) | **High** | Read directly; grep-confirmed. |
| Migration staleness (29 vs 51) | **High** | Diffed migration CREATE TABLE set vs schema `pgTable` set. |
| Repository pattern & transaction absence | **High (source)** | Grep: 0 `transaction(`, 0 repo files, 83 direct-builder files. |
| Raw SQL characterization | **Medium-High** | 16 `sql`-tag files sampled; full `pool.query` census not run. |
| **Live database conformance** (does the running DB match schema?) | **UNVERIFIED** | No DB introspection performed (doc-only task; no DB provisioned). |
| Intent behind soft refs / no-transaction design | **Medium** | Inferred from comments + structure, not from a design doc. |

Overall: **high confidence in the schema-as-source description; the one open verification gap is
live-database introspection**, which caps promotion to L4 until a `drizzle-kit push --dry-run` or DB
introspection is run in a future cycle.

## 15. Verification record

- Generated and verified at commit `78ee536` (working tree clean except the untracked `CLAUDE.md`
  and `docs/` from this Knowledge Base effort).
- Independent re-derivation performed: `grep -c 'pgTable('` and name extraction → 51 tables;
  `CREATE TABLE` extraction from migration → 29; set difference → 22 missing (enumerated in §9).
- Negative checks: `pgEnum` → 0; `db.transaction(`/`transaction(` → 0; explicit `index(` → only
  `atlas-memories.ts`.
- Not run (documented gap): `drizzle-kit push` / live DB introspection; exhaustive `pool.query` census.

---
*Generated from code. Reconcile against `CLAUDE.md` per `docs/documentation-governance.md`.*
