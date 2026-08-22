# TrainChat Functional Feature Audit — 2026-08-22

## Final status

**TRAINCHAT FEATURE AUDIT PASS WITH PRODUCT DECISIONS**

> **Owner-decision closure (2026-08-22):** The four decisions recorded by this audit have now been
> implemented in the repository: coaching controls are server-authoritative account settings;
> conflicting profile changes mark active programs `needsReview`; profile writes enforce canonical
> values; and legacy guest-session routes are retired in favor of anonymous-user identities. The
> matrices below preserve the original audit evidence. See the repository migration and verification
> results from the closure task before cutover; browser-only checks remain outstanding.

Repository behavior was audited. Browser/Replit, migration-backed PostgreSQL, live OpenAI, email,
HTTPS cookie, autoscale, and external billing boundaries were not available in this workspace and
are explicitly marked `NOT RUN`. No deployment or production database operation was performed.

TrainChat is **not ready for production cutover** until the product decisions and browser/database
verification listed below are closed. The repository compiles and the TrainChat frontend and API
production builds pass, but repository inspection alone cannot prove end-to-end persistence,
rendering, SSE/cookie behavior, or generated-program quality.

## Canonical feature matrix

Verdicts mean: `PASS` = proven at repository-test level; `PARTIAL` = code path exists but an external
boundary or material gap remains; `FAIL` = a concrete defect/gap exists; `NOT RUN` = no defensible
repository-only proof was possible.

| User-facing feature | UI | API / persistence / consumption | Repository evidence | Verdict |
|---|---|---|---|---|
| Anonymous bootstrap/onboarding | `/` and `/chat`; legacy guest UI also exists | `/auth/bootstrap` creates/resumes anonymous `users`; `/guest/*` separately persists `guest_sessions` | Auth tests cover create/resume and retired device IDs; dual systems remain | PARTIAL |
| Registration | `/register` | Upgrades matching anonymous user in place; otherwise creates user | Auth route tests cover conflict, session rotation and public response | PASS |
| Login | `/login` | Password auth; merges a different anonymous identity before authentication | Auth tests cover invalid credentials, merge failure fail-closed, session rotation | PASS |
| Logout | Settings/account | Destroys session and clears cookie | Route test exists; HTTPS browser cookie proof absent | PARTIAL |
| Password reset | Forgot/reset pages | Token lifecycle and session destruction | Route tests cover missing/used/expired tokens | PARTIAL |
| Account/session persistence | App bootstrap/auth context | PostgreSQL-backed session store | Cross-refresh/device/Replit HTTPS not run | NOT RUN |
| Conversation create/list/load/delete | Chat left rail | Owned conversation CRUD | Tests cover auth, ownership-as-404 and basic CRUD | PASS |
| Message history/persistence | Chat transcript | Owned message list and JSON/SSE message writes | Route tests exist; refresh/SSE runtime not run | PARTIAL |
| Messaging and non-program replies | Chat text/voice | Orchestrator routes guidance vs mutation/build | Unit coverage exists; live model and browser streaming not run | PARTIAL |
| Duplicate turn/retry/failure behavior | Chat retry/stream UI | Idempotency and turn-integrity machinery present | No complete live SSE replay proof in this run | PARTIAL |
| Program generation | Chat build flow | Deterministic architecture plus AI output; canonical hierarchy persisted transactionally | Unit coverage; live OpenAI + migration-backed persistence not run | PARTIAL |
| Program regeneration/rebuild | Chat and live-program actions | Rebuild path and active-program replacement exist | Existing-program/profile-change semantics unresolved | PARTIAL |
| Direct program editing | Chat and live panel | Direct edit route, edit engine, receipts/change log | Unit coverage broad; live target/render proof not run | PARTIAL |
| Add/remove exercise | Live program panel | Validated `add_exercise` / `remove_exercise` mutation operations | Ownership and transaction code present; browser not run | PARTIAL |
| Replace/swap exercise | Chat and exercise UI | Swap intent/equipment guards and deterministic mutation paths | Unit coverage exists; live rendered sync not run | PARTIAL |
| Sets/reps/load/rest edits | Chat/edit engine | Prescription mutation/remap logic | Unit coverage exists; live receipt/UI sync not run | PARTIAL |
| Day/week/session/phase refinements | Chat and program views | Hierarchical refine engine supports scope-aware transformations | Broad intent coverage; live unrelated-state preservation not run | PARTIAL |
| Volume/intensity/difficulty/time refinements | Quick commands/chat | Deterministic refine intents (`increase/decrease_volume`, `reduce_time`, etc.) | Unit coverage; browser/live persistence not run | PARTIAL |
| Home/limited-space refinement | Chat | `home_gym` and `limited_space` hierarchical intents | Code path exists; persisted result runtime proof absent | PARTIAL |
| Training-system library | Chat/system pages | Owned library, set-active, by-id, delete | Ownership filters exist; browser selection/deletion not run | PARTIAL |
| Program/session/week/block/today views | `/system`, live panel | Active/full/today/week/weeks/block APIs | Hydration logic exists; visual and stale-state proof absent | NOT RUN |
| Saved/active state | Program library and sidebars | Active-by-focus and set-active persistence | Multiple-program/focus browser behavior not run | PARTIAL |
| Readiness/check-ins/session completion | System/chat surfaces | Readiness, active-session, session-log and adjustment APIs | Repository paths and tests exist; runtime flow not run | PARTIAL |
| Profile/calibration | Settings and calibration modal | `user_profiles`, athlete DNA and memories feed context/generation | One omission-data-loss defect repaired; DB round-trip not run | PARTIAL |
| Coach behavior settings | Settings/billing controls | Sent with each chat turn and consumed by routing/prompt/context | Stored only in `localStorage`; do not survive second browser/device | FAIL |
| Notification preferences | Settings | Local storage plus fire-and-forget server write | UI calls local storage “source of truth”; delivery behavior unproven | PARTIAL |
| Memory view/edit/clear/export | Settings | Owned memory APIs; JSON export combines profile/memory | Download and safety-memory behavior need browser/DB proof | PARTIAL |
| Share/export cards | Live program/share modals | Share moments and client image export paths | Browser image generation/download/share not run | NOT RUN |
| External-program/API-key feature | Developer/API-key UI | Scoped external API, ownership, versions, history/revert | Strong ownership/schema unit coverage; external runtime not run | PARTIAL |
| Plan/subscription/paywall | Settings and billing surfaces | Subscription, checkout, confirm, portal, entitlement/quota helpers | Repository tests cover detection/access; no live Stripe calls made | PARTIAL |
| Account deletion/lifecycle | Settings danger zone | Cancels subscription before deleting; preserves account if cancellation fails | Route tests exist; DB cascade and Stripe boundary not run | PARTIAL |
| Rate limits/quotas | Chat/edit/share/auth surfaces | Shared rate limiters and plan gates | Local rate-limit tests require server sockets/DB env; Replit behavior not run | PARTIAL |
| Device/session behavior | Device bootstrap ID + cookie | Anonymous device resume and registered session rules | Same-device unit cases exist; multi-device/browser not run | NOT RUN |
| Cross-user isolation | No cross-user UI | Owner filters/404 on conversations and external programs | Unit tests cover representative resources; live synthetic-user sweep not run | PARTIAL |
| Admin/research/developer surfaces | Protected routes/pages | Admin guards and gated research flows | Repository authorization coverage; browser roles not run | PARTIAL |

## Canonical configurable-specification matrix

Scope values are derived from current storage: `profile-global`, `browser-local`, `memory-global`,
or `current-turn`. No fields are invented here.

| Specification | Scope | UI input | Persistence | Backend consumption / generation impact | Reload/login | Verdict |
|---|---|---|---|---|---|---|
| Primary training goal | profile-global; explicit turn overrides | Settings chips; calibration/chat | `user_profiles.training_goal` + possible memory | Agent context, architecture/fallback goal selection, prompt | DB-backed; browser proof not run | PARTIAL |
| Experience level | profile-global | Settings chips; calibration | `user_profiles.experience_level` | Agent context, athlete DNA and programming context | DB-backed; not runtime-proven | PARTIAL |
| Training style | profile-global | Settings chips | `user_profiles.training_style` | Agent context/prompt | DB-backed; not runtime-proven | PARTIAL |
| Days per week | profile-global; explicit turn overrides | Settings 2–6; calibration/chat | `user_profiles.days_per_week` + memory | Deterministic program day count and architecture inputs | DB-backed; not runtime-proven | PARTIAL |
| Session duration | profile-global | Settings 30–90; calibration | `user_profiles.session_duration` | Agent context, time-constrained generation/refinement | DB-backed; not runtime-proven | PARTIAL |
| Equipment access | profile-global/current-turn override | Settings free text; calibration/chat | Profile + equipment memory/constraint | Prompt, deterministic selection and persisted equipment safety gate | DB-backed; not runtime-proven | PARTIAL |
| Injury/limitations | profile-global + safety memory | Calibration/chat; displayed in Settings safety area | Profile + `pain_pattern` memory | Highest-priority context, return-from-injury and output validation paths | DB-backed; not live-proven | PARTIAL |
| Sport focus | profile-global/current-turn override | Settings free text; calibration/chat | Profile + sport memory | Sport extraction/profile engine and architecture context | DB-backed; not live-proven | PARTIAL |
| Exercise preferences | profile-global | API/schema; learned memory; no current Settings editor | `user_profiles.exercise_preferences` | AI prompt and redistribution preferences | Preserved by repaired profile update | PARTIAL |
| Exercises to avoid/exclusions | profile-global + hard memory | Calibration/chat; displayed through memory/safety | Profile + `exercise_exclusion` memory | AI prompt, deterministic filtering and hard-constraint validator | Preserved by repaired profile update; live proof absent | PARTIAL |
| Years training | profile-global | Calibration | `user_profiles.years_training` | Athlete DNA/precision | DB-backed; not shown in Settings editor | PARTIAL |
| Schedule consistency | profile-global + memory | Calibration | Profile behavioral column + memory | Coaching precision/memory context | DB-backed; runtime not run | PARTIAL |
| Recovery consistency | profile-global + memory | Calibration | Profile behavioral column + memory | Coaching precision/memory context | DB-backed; runtime not run | PARTIAL |
| Autoregulation comfort | profile-global + memory | Calibration | Profile behavioral column + memory | Coaching precision/memory context | DB-backed; runtime not run | PARTIAL |
| Motivation style | profile-global + memory | Calibration | Profile behavioral column + memory | Coaching identity/memory context | DB-backed; runtime not run | PARTIAL |
| Calibration training aggression | profile-global + memory | Calibration | Profile behavioral column + memory | Athlete DNA/memory; separate from browser setting | DB-backed; runtime not run | PARTIAL |
| Coaching style | browser-local | Settings direct/supportive/analytical | `localStorage` | Sent per message; injected into system prompt | Same browser only; lost on second device | FAIL |
| Explanation depth | browser-local | Settings minimal/balanced/detailed | `localStorage` | Sent per message; controls prompt depth | Same browser only | FAIL |
| Concise responses | browser-local | Settings switch | `localStorage` | Sent per message; prompt/fallback formatting | Same browser only | FAIL |
| Proactive insights | browser-local | Settings switch | `localStorage` | Controls conversation context/insights | Same browser only | FAIL |
| Memory personalization | browser-local | Settings switch | `localStorage` | Gates non-safety long-term memory for eligible plan | Same browser only | FAIL |
| Auto-adjust recommendations | browser-local | Settings switch | `localStorage` | Changes routing permission to apply vs suggest | Same browser only; high-impact scope ambiguity | FAIL |
| Structural-change approval | browser-local | Settings switch | `localStorage` | Blocks/asks approval for structural rebuilds | Same browser only | FAIL |
| Deload approval | browser-local | Settings switch | `localStorage` | Approval gate for deload mutations | Same browser only | FAIL |
| Readiness adaptation | browser-local | Settings switch | `localStorage` | Included in agent settings; runtime adaptation proof incomplete | Same browser only | PARTIAL |
| Missed-session adaptation | browser-local | Settings switch | `localStorage` | Included in agent settings; runtime adaptation proof incomplete | Same browser only | PARTIAL |
| Notification switches (six) | browser-local + server mirror | Settings switches | Local storage, fire-and-forget status write | Delivery gating explicitly uses local storage | Same browser authoritative | PARTIAL |
| Focus mode (strength/speed/mobility) | program/conversation UI context | Chat/system/live-panel switchers | Active program by focus + UI state | Routes generation, commands and active-program selection | DB/UI hydration requires browser proof | PARTIAL |
| Current-turn constraints | current-turn, sometimes promoted to memory | Natural-language chat | Message; constraint extractor may persist memory | Highest-precedence generation/mutation input | Conversation replay/memory semantics vary by intent | PARTIAL |

### Decorative or incompletely consumed settings

- The behavior settings are genuinely sent and consumed; they are not decorative. Their defect is
  scope/persistence: they are browser-local despite being presented as account settings.
- `adaptFromReadiness` and `adaptFromMissedSessions` are resolved and injected, but this audit did
  not find repository-level proof of every automatic runtime adjustment promised by the UI.
- Notification switches show a server mirror, but comments declare local storage authoritative;
  cross-device notification state is therefore not coherent.
- `exercisePreferences` and `exercisesToAvoid` are backend-consumed, but the normal Settings editor
  does not expose them. Exclusions are available through calibration/conversation memory.

## Required constraint behavior

| Scenario | Repository result | Verdict |
|---|---|---|
| Dumbbells only | Canonical compatibility validator and deterministic reselection paths exist | PARTIAL — live persisted artifact not run |
| Bodyweight | Representative restricted-mode tests exist and fail closed on unknown exercises | PARTIAL — live persisted artifact not run |
| Home/limited | Equipment validator plus `home_gym`/`limited_space` refinements exist | PARTIAL — live persisted artifact not run |
| Full gym/unrestricted | Default architecture supports unrestricted selection | PARTIAL — live generation not run |
| 2/3/4+ days | UI supports 2–6 and generator reads profile/turn day count | PARTIAL — persisted session-count matrix not run |
| Pain/injury | Safety context, memories and critical validation paths exist | PARTIAL — real output and fail-closed terminal case not run |
| Excluded/disliked exercises | Memory/profile prompt plus deterministic validation/filter paths exist | PARTIAL — live mutation/regeneration not run |
| Goal differences | Goal feeds architecture/fallback/prompt | PARTIAL — persisted structural difference not run |

## Changing settings while a program exists

Current repository behavior updates profile/memory for future turns. It does **not** atomically
reconcile or invalidate the already-persisted active training system when equipment, frequency,
injury, exclusion, sport, or goal changes. The UI can therefore continue presenting an existing
program that is incompatible with the newly saved profile until a later refinement/regeneration.

**PRODUCT DECISION REQUIRED:** choose and specify per field whether a change should:

1. immediately mutate the current program;
2. mark it stale and require regeneration;
3. warn and offer a refinement;
4. affect only the next generated program.

Safety changes (new pain/injury and hard exclusions) need an explicit fail-closed rule. Frequency
and equipment changes need a clear stale-program presentation rule. Goal/style changes may be
next-generation-only, but that must be intentional and visible.

## Identity and merge journey

Repository unit tests cover anonymous bootstrap, in-place anonymous registration, login-time merge,
merge failure preventing authentication, session rotation, logout, and account deletion guards.
The schema/service design intends child ownership to move during merge. The complete journey
`anonymous → conversation → program → register/merge → refresh → logout/login → fresh browser`
was **NOT RUN** because it requires a migration-backed DB and browser cookies. The legacy
`guest_sessions` conversion route also remains active alongside anonymous `users`, so both journeys
must be tested independently.

## Ownership/isolation

Representative repository tests enforce owner-scoped conversations and external programs and use
404 for cross-tenant resources. Training-system routes contain owner filters. A complete synthetic
two-user DB sweep covering profile, conversation, training system, memory, logs, share moments and
API keys was **NOT RUN**. Isolation is therefore `PARTIAL`, not browser/DB-proven.

## Billing, plan, entitlement and quota

Repository logic includes plan detection, product/price maps, checkout confirmation, portal access,
access-control gates, self-healing, rate limits, and cancellation-before-delete. Unknown or missing
external state has defensive error paths. No live Stripe request or financial transaction was made.
Cancellation, failed billing, unknown live price, webhook signature and ownership remain deferred.

## Product-state and interaction defects

1. **FAIL:** account-looking coach behavior controls are device-local and reset on a second browser.
2. **FAIL:** active program can remain visibly current after a conflicting profile constraint change.
3. **FAIL:** profile API validation accepts arbitrary strings/numbers beyond the UI options; stale or
   crafted payloads can persist unsupported goal/style/frequency/duration values.
4. **PARTIAL:** notification UI saves locally first and performs a non-fatal server mirror; success
   can be displayed without durable cross-device persistence.
5. **PARTIAL:** two guest/anonymous systems create ambiguous conversion and quota semantics.
6. **NOT RUN:** spinner completion, scroll traps, mobile controls, share/download, stale-query display,
   focus switching and program-panel hydration require browser observation.

## Exact defect repaired

- `POST /api/profile` previously converted omitted optional `exercisePreferences` and
  `exercisesToAvoid` fields to `null` on every update. The normal Settings form omits those fields,
  so saving goal/equipment/frequency could silently erase calibrated preferences and exclusions.
  Existing values are now preserved when the field is omitted; an explicit value or `null` still
  updates/clears it. No schema or production data was changed.

## Genuine product decisions

1. **PRODUCT DECISION REQUIRED — behavior-setting scope:** Are coach voice, explanation depth,
   memory, auto-adjust and approval controls account-global or intentionally per-device? The current
   UI placement implies account-global; persistence is per-browser.
2. **PRODUCT DECISION REQUIRED — existing-program reconciliation:** Define semantics for constraint,
   frequency, equipment, injury/exclusion and goal changes as described above.
3. **PRODUCT DECISION REQUIRED — guest model:** Retain both legacy `guest_sessions` and anonymous
   `users`, or select one canonical guest journey and quota/merge policy.
4. **PRODUCT DECISION REQUIRED — supported API values:** Confirm whether APIs must enforce the
   exact UI goal/style/day/duration enums or intentionally support additional hidden values.

## Verification results

| Gate | Exact result |
|---|---|
| Frontend suite | **PASS** — 3 files, 57 tests |
| Backend default suite | **PARTIAL** — 59 files / 1,859 tests passed; 8 tests failed and 17 suites could not import because `DATABASE_URL` is absent; 2 skipped |
| Focused settings/constraint DB suites | **NOT RUN** — require `DATABASE_URL` / migration-backed PostgreSQL |
| Auth/session suite | **PARTIAL** — route tests included among repository pass set; browser cookie/DB journey not run |
| Turn integrity/SSE | **PARTIAL** — unit logic present; live HTTP/SSE not run |
| Program safety/generation | **PARTIAL** — unit coverage present; live OpenAI/persisted artifact matrix not run |
| Mutation/edit suite | **PARTIAL** — unit coverage present; live DB/UI target verification not run |
| Migration-backed API suite | **NOT RUN** — no database configured; no production DB used |
| TypeScript gates | **PASS** — libs, API, TrainChat, scripts and configured artifacts |
| API production build | **PASS** |
| TrainChat production build | **PASS** with required `PORT` and `BASE_PATH` supplied |
| Root all-artifact build | **PARTIAL** — stopped at a whitepaper artifact missing required `PORT`; TrainChat/API builds separately pass |
| `git diff --check` | **PASS** |
| Live Stripe/OpenAI/email | **NOT RUN** |
| Replit browser verification | **NOT RUN** |

## Exact Replit browser/database checklist

Use two synthetic registered users, one clean guest device, two browsers, and two tabs. Do not use
production billing or deploy during this audit.

1. Bootstrap a guest; create conversation A; send/refresh/retry; verify one persisted user turn and
   one assistant turn with no duplicate mutation.
2. Generate and inspect structured programs for dumbbells-only, bodyweight, home/limited and full
   gym at 2, 3, 4 and 5 days. Count persisted sessions; inspect every persisted exercise.
3. Generate strength, hypertrophy/fat-loss/endurance/general-fitness/sport-performance examples and
   verify materially different persisted structure/prescription, not just response prose.
4. Add pain/injury and exercise exclusions before build, after build, before regeneration and during
   an active chat. Verify fail-closed output and stale-program UX.
5. Exercise every edit: swap/add/remove exercise; sets/reps/load/rest; move/change day; volume,
   intensity, duration, week/session/phase/block refinement; regeneration; undo/restore/history.
   Reload after each and verify unrelated state and receipts remain intact.
6. Change full gym→dumbbells, 4→3 days, goal, sport and exclusion with an existing program. Record
   the current UX for owner decision; ensure no unsafe program is silently recommended.
7. Run guest→program→register, and guest→program→login/merge. Refresh, logout/login and use a fresh
   browser. Verify profile, constraints, messages, program, active focus and logs survive once.
8. Test two conversations with conflicting constraints and multiple focus programs; verify no state,
   hydration, quick-command or sidebar leakage.
9. Test blank/optional fields, rapid double-save, malformed/unsupported profile payloads, stale-tab
   saves and settings changes while SSE is active. Verify errors and final displayed values.
10. In browser B, verify whether coach behavior and notification settings match browser A (currently
    expected not to); repeat after logout/login.
11. With synthetic users A/B, attempt direct IDs for profile, conversation, messages, training
    systems, library, memories, logs, share moments, external programs and API keys. Expect 401/404
    and no mutation.
12. Verify program/session/week/block/today tabs, focus switching, library selection/deletion,
    empty states, scroll, mobile keyboard, loading/error spinners and refresh hydration.
13. Verify share image/download and any native share path on desktop/mobile; verify no cross-user or
    private-data leakage in the exported artifact.
14. With Stripe test-mode fixtures only, verify free/paid entitlement, unknown price, cancellation,
    failed/past-due state, checkout cancellation, portal ownership and quota boundaries. Do not call
    live Stripe.
15. Run the migration-backed auth/merge integration and API suite against an isolated non-production
    database, including account deletion cascades and concurrent/multiple-tab writes.

## Safety confirmations

**NO PRODUCTION DATABASE CHANGE PERFORMED**

**NO PRODUCTION DEPLOYMENT PERFORMED**
