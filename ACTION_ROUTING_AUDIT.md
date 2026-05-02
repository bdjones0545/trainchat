# TrainChat — Action Routing Audit

**Last updated:** 2026-05-02
**Status:** Complete ✅

---

## ActionScope Taxonomy

`ButtonActionPayload.scope` is the single canonical field that tells the server *where* to route a user action.

| Scope | Origin | Server Route | Agent(s) |
|---|---|---|---|
| `exercise` | Exercise-level pill (Swap, Easier, Harder, Equipment, Explain) | `mutation_pipeline/exercise` | Coach Agent (DIRECT_EDIT) |
| `session` | Session-level pill (Make Lighter, Add Exercise, Shorter, etc.) | `mutation_pipeline/session` | Coach Agent (DIRECT_EDIT) |
| `program` | Global constraint chip (Remove All, No Barbell, Joint-Friendly) | `mutation_pipeline/program` | Coach Agent (DIRECT_EDIT) |
| `architecture` | Global directional chip (Make Athletic, Progress 4 Weeks, etc.) | `hierarchical_engine` → `block_scope` | Performance Architect + Coach |
| `readiness` | Daily Check-In modal | `readiness_service` (direct API, bypasses edit pipeline) | — |
| `profile` | Calibration / Profile update modal | `profile_update` (direct API, bypasses edit pipeline) | — |
| `settings` | Settings controls | `settings_update` (direct API, bypasses edit pipeline) | — |
| `admin` | Research admin panel (Dr. Sable) | `research_librarian` → `LIBRARIAN_ADMIN` | Research Librarian |
| _(none)_ | Free-text input, starter chips, CTA buttons | Auto-resolved by server via `resolveRefinementScope` | Coach Agent or Performance Architect |

---

## Server Routing Decision Chain

### `conversations.ts` — APPLY_MUTATION path (non-stream + stream)

```
buttonPayload.scope?
  "architecture" | "block"  →  block_scope ScopeResolution  →  applyHierarchicalRefinement()
                                                               → Performance Architect + Coach
  anything else / undefined →  resolveRefinementScope(message)
                                ├─ block_scope   → applyHierarchicalRefinement()
                                ├─ week_scope    → applyHierarchicalRefinement()
                                └─ session_scope → session edit pipeline (DIRECT_EDIT)
```

The `[ActionRoutingAudit]` server log fires at each routing decision point (both non-stream ~line 1501 and stream ~line 3343), logging `{ scope, actualRoute, btnScopeOverride }`.

### `agent-orchestrator.ts` — resolveOrchestratorRoute()

```
APPLY_MUTATION / ASK_CLARIFICATION  →  DIRECT_EDIT  →  ["coach"]         (fast path, no Architect)
REBUILD_PROGRAM / BUILD intent       →  BUILD_WITH_ARCHITECT  →  ["performance_architect", "coach"]
GUIDANCE                             →  GUIDANCE  →  ["coach"]
NO_OP                                →  NO_OP  →  []
(admin flag)                         →  LIBRARIAN_ADMIN  →  ["research_librarian"]
RETRIEVE_CURRENT_PROGRAM             →  RETRIEVE  →  []  (no AI call)
```

---

## Per-Action Audit

### Exercise-level Actions (LiveProgramPanel.tsx → EXERCISE_ACTIONS)

| Action | source | actionType | scope | Expected Route |
|---|---|---|---|---|
| Swap | `program_panel` | `swap_exercise` | `exercise` ✅ | mutation_pipeline/exercise |
| Easier | `program_panel` | `make_easier` | `exercise` ✅ | mutation_pipeline/exercise |
| Harder | `program_panel` | `make_harder` | `exercise` ✅ | mutation_pipeline/exercise |
| Equipment | `program_panel` | `replace_equipment` | `exercise` ✅ | mutation_pipeline/exercise |
| Explain | `program_panel` | `explain_exercise` | `exercise` ✅ | mutation_pipeline/exercise |

### Session-level Actions (LiveProgramPanel.tsx → FOCUS_SESSION_ACTIONS)

| Action | source | actionType | scope | Expected Route |
|---|---|---|---|---|
| Make Lighter | `program_panel` | `make_easier` | `session` ✅ | mutation_pipeline/session |
| Go Heavier | `program_panel` | `make_harder` | `session` ✅ | mutation_pipeline/session |
| Add Exercise | `program_panel` | `add_exercise` | `session` ✅ | mutation_pipeline/session |
| Shorter | `program_panel` | `shorten_session` | `session` ✅ | mutation_pipeline/session |
| Progress | `program_panel` | `make_harder` | `session` ✅ | mutation_pipeline/session |

### Global Chip Actions (button-action-payloads.ts → inferTrySayingScope)

| Chip Prompt Pattern | scope | Expected Route |
|---|---|---|
| "Make this more athletic" | `architecture` ✅ | hierarchical_engine |
| "Progress this for N weeks" | `architecture` ✅ | hierarchical_engine |
| "Add more explosive work" | `architecture` ✅ | hierarchical_engine |
| "Make this a re-entry program" | `architecture` ✅ | hierarchical_engine |
| "Remove all barbell exercises" | `program` ✅ | mutation_pipeline/program |
| "Replace equipment" / "No barbell" | `program` ✅ | mutation_pipeline/program |
| "Knee-friendly / joint-friendly" | `program` ✅ | mutation_pipeline/program |
| "Make Day 1 heavier" | `session` ✅ | mutation_pipeline/session |
| _(other chips)_ | `undefined` | auto_resolved_by_server |

### CTA / ReturnSessionHook Actions (button-action-payloads.ts → makeCtaRefinePayload)

| Action | source | actionType | scope | Expected Route |
|---|---|---|---|---|
| "Make it more intense" | `system_cta` | `refine_program` | `undefined` | auto_resolved_by_server |
| Other CTA refinements | `system_cta` | `refine_program` | `undefined` | auto_resolved_by_server |

### Starter Chip Actions (button-action-payloads.ts → makeStarterChipPayload)

| source | actionType | scope | Expected Route |
|---|---|---|---|
| `chat_chip` | `build_program` or `refine_program` | `undefined` | auto_resolved_by_server (BUILD_WITH_ARCHITECT if no active program) |

### Readiness / Profile / Settings Actions (bypass edit pipeline entirely)

| Action | Route | Chat involvement |
|---|---|---|
| Daily Check-In (ReadinessModal) | `POST /api/readiness` → readiness_service | None — does not call `handleSend` |
| Calibration / Profile update (CalibrationModal) | `PUT /api/users/calibrate` → profile_update | None — does not call `handleSend` |
| Settings controls | Direct mutations via React Query | None — does not call `handleSend` |

### Admin / Research Actions

| Action | Route | Agent |
|---|---|---|
| Research document upload | `POST /api/admin/research` → `isAdminRequest=true` → `LIBRARIAN_ADMIN` | `research_librarian` only |
| Research Librarian (Dr. Sable) | `LIBRARIAN_ADMIN` route | `research_librarian` — **never user-facing** |

---

## Logging Reference

All audit-relevant events emit structured logs with a consistent `[ActionRoutingAudit]` tag.

### Client logs (DEV only)

| Location | Tag | Fires when |
|---|---|---|
| `LiveProgramPanel.tsx → sendRefinement()` | `[ActionRoutingAudit]` | Every panel button press |
| `chat.tsx → handleSend()` | `[ActionRoutingAudit]` | Every chat send with a `buttonPayload` |

### Server logs (all environments via pino)

| Location | Tag | Fires when |
|---|---|---|
| `conversations.ts:~1501` (non-stream) | `[ActionRoutingAudit]` | Every APPLY_MUTATION non-stream routing decision |
| `conversations.ts:~3343` (stream) | `[ActionRoutingAudit]` | Every APPLY_MUTATION stream routing decision |
| `conversations.ts` (when block override used) | `[GlobalChipRouting]` | When `scope=architecture|block` overrides to `block_scope` |
| `conversations.ts` (when hierarchical engine fires) | `[HierarchicalRefine]` | When hierarchical engine is invoked |

---

## Known Scope Mismatches (Resolved)

| Issue | Status | Fix |
|---|---|---|
| `inferTrySayingScope` returning `"block"` for architecture chips | ✅ Fixed | Changed to `"architecture"` |
| `inferTrySayingScope` returning `"block"` for program-wide chips | ✅ Fixed | Changed to `"program"` |
| Exercise action pills missing `scope` | ✅ Fixed | Added `scope: "exercise"` to `exPayload` |
| Session action pills missing `scope` | ✅ Fixed | Added `scope: "session"` to session pill payload |
| `conversations.ts` only checking `=== "block"` for override | ✅ Fixed | Extended to `=== "architecture" || === "block"` |
| `ButtonActionPayload.scope` type too narrow (`"block"|"week"|"session"`) | ✅ Fixed | Updated to full ActionScope |
| Client log `[StructuredButtonAction]` missing `scope` + `expectedRoute` | ✅ Fixed | Renamed to `[ActionRoutingAudit]`, added both fields |
