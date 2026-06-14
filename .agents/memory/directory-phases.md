---
name: Performance Intelligence Directory — Phases 1–4
description: Tracks the build state of the guest-start page Performance Intelligence Directory feature across four phases.
---

## Phase 1 — Static Catalog (complete)
- `product_directory` table, 286 rows, 29 featured
- Static component: stats bar, 6 category cards, featured product cards, CTA
- Guest-start page scrollable below hero

## Phase 2 — Knowledge Relationships (complete)
- Extended `product_directory` with 12 knowledge columns
- New tables: `training_methods` (50), `product_method_links`, `goal_knowledge_graph` (20 chains)
- Data files: `training-methods.ts`, `product-extended.ts`, `knowledge-graph.ts`
- UI: `ProductDetailDrawer.tsx` (slide-in), category cards with method counts/qualities, Knowledge Graph accordion

## Phase 3 — Exercise ↔ Product Intelligence (complete)

### DB
- `exercise_product_links` table — 65 rows seeded
- `goal_knowledge_graph` extended with `exercise_name` + `exercise_description` columns

### Data layer
- `artifacts/trainchat/src/data/directory/exercise-product-links.ts`
  - `PRODUCT_EXERCISE_DATA`: Record<productName, {relatedExercises, substitutionRule}>
  - `EQUIPMENT_SCENARIOS`: 6 interactive scenarios (Goal + with/without equipment)
  - RelationshipType: PRIMARY | SUPPORTED_BY | OPTIONAL | ALTERNATIVE | SUBSTITUTION

### Utility
- `artifacts/trainchat/src/lib/directory/resolveAvailableEquipment.ts`
  - `resolveAvailableEquipment(products[])` → compatible exercises + substitutions
  - `getExercisesForMethod(method, products[])` → filtered exercises
  - `getSubstitutionsForProduct(productName)` → substitution rules

### UI
- `ProductDetailDrawer.tsx` — "Related Exercises" section (PRIMARY/SUPPORTED/SUBSTITUTION badges)
- `EquipmentAwareProgramming.tsx` — new landing section; interactive scenario selector + equipment toggle
- `guest-start.tsx` — EquipmentAwareProgramming inserted between Directory and Footer
- `PerformanceIntelligenceDirectory.tsx` — chain now shows: Quality → Method → Product → **Exercise** (green)
- `knowledge-graph.ts` — `KnowledgeChain` interface extended with optional `exercise?` + `exerciseDescription?`; 8 of 8 primary chains have exercise node

### AI chat integration
- Equipment is already Hard Law #2 in the constitution — no change needed
- The `constraint-memory.ts` system already handles equipment banning from user messages
- Phase 3 adds the structured exercise-product layer for future API/UI queries

**Why:** `EXTENDED_PRODUCT_DATA` uses type `ExtendedProductOverride` (not Omit-based) — `description` is included because `DirectoryProduct` already has `description?:string` making Omit remove it. Don't change this pattern.

## Phase 4 — Assessment Intelligence & Testing Layer (complete)

### New chain
Assessment → Quality → Method → Exercise → Adaptation (replaces/extends Goal chain)

### DB tables (created via direct SQL + Drizzle schema)
- `assessments` — 50 assessments across 8 categories
- `assessment_quality_links` — assessment-to-physical-quality mappings
- `assessment_method_links` — weakness-triggered method recommendations
- `assessment_product_links` — required/recommended/alternative products per assessment
- `assessment_exercise_links` — prescribed exercises with weakness targeting and prescription

**Note:** `pnpm --filter @workspace/db run push` uses interactive prompts even with `push-force`. Use direct SQL via `node` from `lib/db` directory for non-interactive table creation.

### Data layer (frontend-only, no DB required for UI)
- `artifacts/trainchat/src/data/directory/assessments.ts`
  - 50 `Assessment` objects with full normative data, quality/method/product/exercise links
  - 8 categories: Speed, Power, Strength, Mobility, Conditioning, Recovery, Readiness, Movement Quality
  - `ASSESSMENT_CATEGORIES`, `getAssessmentsByCategory()`, `getAssessmentById()`, `ASSESSMENT_STATS`

### AI utility
- `artifacts/trainchat/src/lib/directory/analyzeAssessmentResults.ts`
  - `analyzeAssessmentResults({assessmentName, score})` → full `AssessmentAnalysis` object
  - `analyzeMultipleAssessments()` — batch analysis
  - `findPriorityWeaknesses()` — ranks qualities flagged across multiple assessments
  - `getExamplePathways()` — 6 pre-built pathways for the landing section

### UI
- `AssessmentDetailDrawer.tsx` — slide-in drawer: description, normative data tier rows, intelligence chain viz, methods, products, exercises, equipment, sports
- `AssessmentIntelligence.tsx` — landing section with "Example Pathways" + "Browse Assessments" tabs, stats bar, category tabs, clickable pathway cards, CTA
- `guest-start.tsx` — `AssessmentIntelligence` inserted after `EquipmentAwareProgramming`, before footer

### Seed script
- `artifacts/api-server/scripts/seed-assessments.ts` — idempotent seeder for all 5 assessment tables
