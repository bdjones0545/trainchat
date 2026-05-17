/**
 * External API Router
 *
 * Mounted at /api/external by the main router.
 * Isolated namespace — all routes require API key authentication,
 * separate from the standard session-based auth used by the TrainChat frontend.
 *
 * Docs endpoint:
 *   GET /api/external/docs — human-readable API reference
 */

import { Router } from "express";
import apiKeysRouter from "./api-keys";
import programsRouter from "./programs";
import exercisesRouter from "./exercises";

const router = Router();

router.use(apiKeysRouter);
router.use(programsRouter);
router.use(exercisesRouter);

// ── GET /api/external/docs ────────────────────────────────────────────────────
// Internal API documentation page. No auth required — this is public reference.

router.get("/external/docs", (_req, res) => {
  res.json({
    name: "TrainChat External API",
    version: "1.0.0",
    description:
      "TrainChat's programming intelligence, exposed as a secure REST API. " +
      "Power external training platforms with TrainChat's deterministic-generative AI engine.",
    authentication: {
      type: "Bearer Token",
      header: "Authorization: Bearer tc_<your_key>",
      notes: "Keys are created via POST /api/external/keys (requires TrainChat login). " +
        "Keys are never shown again after creation — store securely.",
    },
    permissions: [
      { key: "generate_program", description: "Generate new training programs" },
      { key: "edit_program", description: "Modify existing programs" },
      { key: "generate_session", description: "Generate a single training session" },
      { key: "exercise_swap", description: "Swap exercises for alternatives" },
      { key: "explain_program", description: "Get AI rationale for a program" },
      { key: "retrieve_program", description: "Retrieve stored programs" },
      { key: "list_exercises", description: "Browse the exercise library" },
      { key: "manage_keys", description: "Create/revoke API keys" },
    ],
    rateLimits: {
      default: "60 requests / 60 seconds per key",
      headers: [
        "X-RateLimit-Limit — total allowed requests in the window",
        "X-RateLimit-Remaining — requests remaining",
        "X-RateLimit-Reset — Unix timestamp when the window resets",
      ],
    },
    responseFormat: {
      success: {
        schema: { success: true, data: "{payload}", meta: "{pagination_or_null}", error: null },
      },
      error: {
        schema: {
          success: false,
          data: null,
          meta: null,
          error: { code: "ERROR_CODE", message: "Human-readable message" },
        },
        commonCodes: [
          "MISSING_API_KEY — no Authorization header",
          "INVALID_API_KEY — key not found or invalid",
          "KEY_REVOKED — key has been revoked",
          "KEY_EXPIRED — key expiry date has passed",
          "INSUFFICIENT_PERMISSIONS — key lacks required permission",
          "RATE_LIMIT_EXCEEDED — too many requests",
          "VALIDATION_ERROR — invalid request body or params",
          "NOT_FOUND — requested resource does not exist",
          "GENERATION_FAILED — AI did not produce structured output",
          "INTERNAL_ERROR — unexpected server error",
        ],
      },
    },
    endpoints: {
      keyManagement: {
        "POST /api/external/keys": {
          auth: "Session login required (TrainChat user)",
          description: "Create a new API key",
          body: {
            name: "string (required) — friendly name for the key",
            orgId: "string (optional) — your organization identifier",
            permissions: "string[] (default: all non-admin permissions)",
            expiresAt: "ISO 8601 datetime (optional) — key expiry",
          },
          response:
            "Returns the key object including the raw key (shown ONCE — store it securely).",
        },
        "GET /api/external/keys": {
          auth: "Session login required",
          description: "List all API keys for the authenticated user",
          response: "Array of key objects (never includes the raw key).",
        },
        "DELETE /api/external/keys/:id": {
          auth: "Session login required",
          description: "Revoke an API key immediately",
        },
        "GET /api/external/keys/:id/logs": {
          auth: "Session login required",
          description: "View request logs for a specific key",
          query: { limit: "number (default: 50, max: 200)" },
        },
      },
      programs: {
        "POST /api/external/program/generate": {
          permission: "generate_program",
          description: "Generate a new full training program using TrainChat intelligence.",
          body: {
            goal: "string (required) — e.g. 'strength and speed for football'",
            sport: "string — sport context",
            schedule: "string — e.g. '4 days/week'",
            experienceLevel: "beginner | intermediate | advanced | elite",
            equipment: "string[] — available equipment",
            durationWeeks: "number — program length in weeks",
            constraints: "string[] — hard constraints (injuries, schedule limits, etc.)",
            notes: "string[] — additional context",
            focusMode: "strength | speed | mobility | general (default: strength)",
          },
          response: {
            programId: "number — use this to retrieve/edit the program",
            summary: "string",
            programName: "string",
            sessions: "ProgramDay[] — the full program days",
            coachRationale: "string — AI explanation",
            generatedAt: "ISO datetime",
          },
        },
        "POST /api/external/program/generate/stream": {
          permission: "generate_program",
          description: "SSE streaming version of program generation.",
          body: "Same as /generate",
          response:
            "Server-Sent Events stream. Events: stage (progress), complete (final result), error",
        },
        "POST /api/external/program/edit": {
          permission: "edit_program",
          description: "Refine or modify an existing program.",
          body: {
            programId: "number (required)",
            instruction: "string (required) — e.g. 'reduce lower body volume'",
            scope: "string (optional) — e.g. 'week_2', 'all'",
          },
          response: {
            programId: "number",
            updatedProgram: "ProgramStructure",
            changes: "string[]",
            coachSummary: "string",
          },
        },
        "POST /api/external/program/session": {
          permission: "generate_session",
          description: "Generate a single training session.",
          body: {
            goal: "string (required)",
            sessionType: "lifting | conditioning | mobility | recovery | sport",
            equipment: "string[]",
            duration: "number (minutes)",
            experienceLevel: "beginner | intermediate | advanced | elite",
            constraints: "string[]",
            notes: "string",
            focusMode: "strength | speed | mobility | general",
          },
          response: { session: "ProgramDay", coachRationale: "string", generatedAt: "ISO datetime" },
        },
        "POST /api/external/program/exercise-swap": {
          permission: "exercise_swap",
          description: "Get a safe replacement for an exercise. Uses deterministic library matching first, AI backstop if needed.",
          body: {
            exerciseName: "string — exercise to replace (use this OR exerciseId)",
            exerciseId: "number — exercise library ID",
            reason: "string — why you're swapping (e.g. 'knee pain', 'no barbell')",
            equipment: "string — equipment level (full_gym | dumbbells_only | home_limited | bodyweight)",
            injuries: "string[] — active injury flags",
            programId: "number (optional) — program context for better AI suggestions",
          },
          response: {
            replacement: "{ name, movementPattern, equipment, difficultyLevel, coachingNotes }",
            alternatives: "array of alternative replacements",
            rationale: "string",
            stimulusPreserved: "boolean",
            source: "library | ai_backstop",
          },
        },
        "POST /api/external/program/explain": {
          permission: "explain_program",
          description: "Get TrainChat's reasoning and rationale for a program.",
          body: {
            programId: "number (required)",
            question: "string (optional) — specific question about the program",
          },
          response: {
            explanation: "string — full AI explanation",
            whyItWorks: "string — structural rationale",
            progressionStrategy: "string",
            intelligenceStatus: "object",
          },
        },
        "GET /api/external/program/:id": {
          permission: "retrieve_program",
          description: "Retrieve a stored program by ID.",
          response: { programId: "number", program: "ProgramStructure", summary: "string", generatedAt: "ISO datetime" },
        },
      },
      exercises: {
        "GET /api/external/exercises": {
          permission: "list_exercises",
          description: "Browse the TrainChat exercise library with search and filters.",
          query: {
            page: "number (default: 1)",
            limit: "number (default: 20, max: 100)",
            search: "string — name search",
            movementPattern: "string — e.g. 'knee_dominant', 'push_horizontal'",
            bodyRegion: "string — e.g. 'lower', 'upper', 'core'",
            equipment: "string — filter by equipment tag",
            tags: "string — filter by intent/sport tag",
            difficultyLevel: "beginner | intermediate | advanced | elite",
          },
        },
      },
    },
    samplePayloads: {
      generateProgram: {
        goal: "strength and speed for football",
        sport: "football",
        schedule: "4 days/week",
        experienceLevel: "intermediate",
        equipment: ["barbell", "rack", "dumbbells", "cable"],
        durationWeeks: 8,
        focusMode: "strength",
      },
      exerciseSwap: {
        exerciseName: "Back Squat",
        reason: "knee pain",
        equipment: "full_gym",
        injuries: ["knee"],
      },
      editProgram: {
        programId: 42,
        instruction: "reduce lower body volume and add more upper body accessory work",
        scope: "all",
      },
    },
  });
});

export default router;
