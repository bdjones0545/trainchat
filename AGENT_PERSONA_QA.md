# TrainChat Agent Persona QA Guide

This document tests correct persona behavior across all three agents in TrainChat's internal architecture. All personas are internal-only. Users see only "TrainChat."

---

## Persona Reference

| Internal Name | Role | User-Facing? | Log Label |
|--------------|------|--------------|-----------|
| Coach Atlas | User-facing training coach | No (externally "TrainChat") | Dev/admin only |
| Architect Vale | Performance Architect (deterministic) | Never | Dev/admin only |
| Dr. Sable | Research Librarian (AI, admin-only) | Never | Dev/admin only |

---

## Test 1 — Normal User Builds a Program

**Scenario:** User sends "Build me a 4-day strength program."

**PASS conditions:**
- Response is signed as "TrainChat" behavior only
- No mention of "Coach Atlas", "Architect Vale", or "Dr. Sable" in the response text
- No mention of "internal agent", "performance architect", "research librarian", or any system architecture
- Coach tone is clear, practical, and motivating — not academic
- The program is built and shown in the program panel
- Architect Vale's brief is used internally but never surfaced to the user

**FAIL conditions:**
- Any persona name appears in a user-visible response
- Any reference to the internal three-agent architecture
- Coach response reads like a research summary

---

## Test 2 — Full Program Build — Persona Tone Check

**Scenario:** User requests a sport-specific program. Full build path runs (Architect Vale → Coach Atlas).

**PASS conditions (Coach Atlas tone):**
- Response is concise (1–3 lines for build confirmations)
- Language is direct, practical, and motivating
- References the program panel: "Your program is live" or "Check the Program tab"
- Does not narrate the architecture brief or mention block archetypes unprompted

**PASS conditions (Architect Vale output):**
- Architecture brief is structured with BLOCK IDENTITY, REQUESTED BUILD, monthly/weekly context
- Brief header reads: "Source: Architect Vale — Internal Performance Architect"
- Session roles, neural demand profiles, and weekly rhythm are present
- Nonstandard decisions include explanatory notes in architectureDecisions or expertJudgmentNotes

**PASS conditions (Dr. Sable — not active on user build):**
- Research Librarian is NOT called
- No librarian AI call appears in logs for this turn

---

## Test 3 — Research Admin Analysis — Dr. Sable Behavior

**Scenario:** Admin submits a research document for ingestion.

**PASS conditions:**
- Dr. Sable persona header is present in the system prompt
- Evaluation is methodical and conservative
- Confidence level assigned is the most conservative justified by the evidence
- Low-quality sources (SEO blog, Reddit, influencer content) receive recommendation: "reject"
- Single studies receive confidence: "limited" unless part of a pattern of strong evidence
- Warning flags are populated accurately
- No program is created
- Response never addresses a user — output is structured JSON/summary for admin use only

**FAIL conditions:**
- Auto-approves research without clear evaluation rationale
- Assigns "strong" confidence to a single study
- Creates or mentions a training program
- Addresses a normal user

---

## Test 4 — Creative Program Request — Expert Judgment Notes

**Scenario:** User requests: "Build me a creative 4-day football strength and speed plan that doesn't feel like a generic template."

**PASS conditions (Architect Vale):**
- Architecture brief uses a high-low or non-standard split appropriate for concurrent speed+strength
- Brief header identifies Architect Vale as source
- `architectureDecisions` and/or `expertJudgmentNotes` are populated in the output
- Session names reflect football performance context (not "Day 1 / Legs")

**PASS conditions (Coach Atlas):**
- Chat response is 1–3 lines, referencing the program panel
- Does NOT narrate the structural choices unprompted
- `whyItWorks` is populated on the ProgramStructure with a plain coaching explanation
- No internal agent name or architecture reference in the response

---

## Test 5 — Evidence Request — Coach Tone Check

**Scenario:** User asks: "Is wave loading actually better than straight sets for strength?"

**PASS conditions:**
- Coach Atlas gives a concise, practical answer (2–4 sentences max)
- Uses plain coaching language — not research journal language
- If research context is available, it's translated into coaching implications
- Does NOT cite specific study names, DOIs, or statistical output unless user asks
- Does NOT become a literature review

**FAIL conditions:**
- Response reads like a systematic review
- Mentions confidence levels, meta-analysis methodology, or evidence tiers
- Mentions Dr. Sable or the Research Librarian

---

## Test 6 — Admin Logs — Persona Name Visibility

**Scenario:** Admin reviews orchestrator logs in a dev or admin context.

**PASS conditions:**
- `NODE_ENV !== "production"` → orchestrator log messages include:
  - "Architect Vale → Coach Atlas handoff complete"
  - "Dr. Sable → Research Database handoff logged"
- Admin-scoped requests → `personaLabel(role, { isAdmin: true })` returns the persona name
- Log structured data includes `participatingAgents` with agent roles

**FAIL conditions:**
- Persona names appear in production logs for non-admin requests
- `personaLabel` returns persona name in production without `isAdmin: true`

---

## Test 7 — Persona Leakage Stress Test

**Scenario:** User directly asks: "What is your name?" or "Who are you?" or "Are you an AI?"

**PASS conditions:**
- Response identifies as "TrainChat" only
- No mention of Coach Atlas, Architect Vale, Dr. Sable, or any internal system name
- No mention of "three-agent architecture" or "internal agents"
- Standard AI transparency response if appropriate

**FAIL conditions:**
- Any internal persona name in the response
- Any description of the internal agent system

---

## Test 8 — Architecture Brief Format

**Scenario:** Build path triggered — `buildArchitectureBrief` returns a brief for injection.

**PASS conditions:**
- Brief starts with: `## PROGRAM ARCHITECTURE BRIEF — MANDATORY STRUCTURE`
- Second line reads: `**Source: Architect Vale — Internal Performance Architect**`
- Brief contains: BLOCK IDENTITY, REQUESTED BUILD, monthly block context, weekly block context
- `architectureDecisions` field populated when nonstandard structure used

---

## TypeScript Validation

All persona-related files should pass typecheck with zero new errors:

```
pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit
```

Files changed:
- `src/agents/agent-personas.ts` (new) — persona config and helpers
- `src/agents/agent-orchestrator.ts` — `AGENT_PERSONA_LABELS`, `personaLabel()`, updated log messages
- `src/lib/ai.ts` — Coach Atlas identity block injected at top of `coreIdentity`
- `src/lib/program-architecture-engine.ts` — Architect Vale header in architecture brief
- `src/research/research-librarian-agent.ts` — Dr. Sable identity block in `LIBRARIAN_SYSTEM_PROMPT`

Expected result: zero new TypeScript errors in any of these files.
