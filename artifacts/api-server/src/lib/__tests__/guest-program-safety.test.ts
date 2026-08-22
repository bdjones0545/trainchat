import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guestMocks = vi.hoisted(() => ({
  getGuestSession: vi.fn(),
  updateGuestSession: vi.fn(),
}));

vi.mock("../guestService", () => guestMocks);
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../coach-select", () => ({
  buildCoachContext: vi.fn(() => ""),
  selectSessionExercises: vi.fn(async () => [{
    name: "Push-Up",
    classification: "primary",
    sets: 3,
    reps: "8-12",
    rest: "90 sec",
    notes: "Use controlled technique",
  }]),
}));
vi.mock("../constraint-memory", () => ({
  validatePainConstraints: vi.fn((program: any, constraints: any) => {
    if (constraints.painRegions.length === 0) return [];
    return program.days.flatMap((day: any) => day.exercises)
      .filter((exercise: any) => /box jump/i.test(exercise.name))
      .map((exercise: any) => ({ exerciseName: exercise.name, painRegion: "knee", severity: "critical" }));
  }),
}));

import {
  generateGuestProgram,
  GuestGenerationError,
  GUEST_PROGRAM_PROMPT_VERSION,
  validateGuestProgramConstraints,
  type GuestOnboardingAnswers,
} from "../guestGenerate";
import { PROGRAM_OUTPUT_SCHEMA_VERSION } from "../program-structure-schema";

const answers: GuestOnboardingAnswers = {
  goal: "strength",
  experience: "intermediate",
  frequency: 1,
  equipment: ["bodyweight"],
  injuries: "none",
  style: "balanced",
  timeline: "12 weeks",
  sport: "general",
};

function validProgram(exerciseName = "Push-Up") {
  return {
    programName: "Guest Strength Foundation",
    description: "A complete bodyweight strength plan.",
    progressionStrategy: "Add repetitions with controlled technique.",
    splitType: "full_body",
    days: [{
      dayNumber: 1,
      name: "Full Body",
      focus: "Strength",
      exercises: [{
        name: exerciseName,
        classification: "primary",
        sets: 3,
        reps: "8-12",
        rest: "90 sec",
        intent: "Build strength",
        notes: "Use controlled technique",
      }],
      notes: "Stop if pain occurs.",
    }],
  };
}

function providerResponse(candidate: unknown, id = "resp_guest") {
  return {
    ok: true,
    json: vi.fn(async () => ({
      id,
      choices: [{ message: { content: JSON.stringify(candidate) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    })),
  };
}

describe("guest program AI safety boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    guestMocks.getGuestSession.mockResolvedValue({ metadata: { onboardingAnswers: answers } });
    guestMocks.updateGuestSession.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it.each([
    ["missing structure", { programName: "Incomplete" }],
    ["empty program", { ...validProgram(), days: [] }],
    ["no executable exercises", { ...validProgram(), days: [{ ...validProgram().days[0], exercises: [] }] }],
    ["incompatible field types", { ...validProgram(), days: [{ ...validProgram().days[0], exercises: [{ ...validProgram().days[0].exercises[0], sets: "three" }] }] }],
    ["unknown fields", { ...validProgram(), unsafeExtra: true }],
  ])("fails closed for %s after one bounded retry", async (_label, candidate) => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(providerResponse(candidate))
      .mockResolvedValueOnce(providerResponse(candidate)));

    await expect(generateGuestProgram("device-guest-1", answers))
      .rejects.toMatchObject({ category: "exhausted_retry" } satisfies Partial<GuestGenerationError>);
    expect(guestMocks.updateGuestSession).not.toHaveBeenCalled();
  });

  it("does not let malformed provider output bypass the bounded retry", async () => {
    const malformed = { ok: true, json: vi.fn(async () => ({ choices: [{ message: { content: "{not-json" } }] })) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(malformed).mockResolvedValueOnce(malformed));

    await expect(generateGuestProgram("device-guest-malformed", answers))
      .rejects.toMatchObject({ category: "exhausted_retry" });
    expect(guestMocks.updateGuestSession).not.toHaveBeenCalled();
  });

  it("retries an invalid candidate once, persists only the valid result, and records provenance", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(providerResponse({ ...validProgram(), days: [] }, "resp_bad"))
      .mockResolvedValueOnce(providerResponse(validProgram(), "resp_good")));

    const result = await generateGuestProgram("device-guest-2", answers);

    expect(result.days).toHaveLength(1);
    expect(result.generationProvenance).toMatchObject({
      provider: "openai",
      modelId: expect.any(String),
      promptVersion: GUEST_PROGRAM_PROMPT_VERSION,
      schemaVersion: PROGRAM_OUTPUT_SCHEMA_VERSION,
      providerRequestId: "resp_good",
      validationVerdict: "passed",
      constraintValidationVerdict: "passed",
      attemptCount: 2,
      fallbackUsed: false,
      tokenUsage: { promptTokens: 20, completionTokens: 40, totalTokens: 60 },
    });
    expect(guestMocks.updateGuestSession).toHaveBeenCalledTimes(1);
    expect(guestMocks.updateGuestSession.mock.calls[0][1].metadata.firstProgramProvenance)
      .toEqual(result.generationProvenance);
  });

  it("rejects unavailable equipment and explicit injury conflicts", () => {
    expect(validateGuestProgramConstraints(validProgram("Barbell Back Squat"), answers).hardConstraintIssues)
      .toHaveLength(1);
    expect(validateGuestProgramConstraints(validProgram("Box Jump"), { ...answers, injuries: "knee pain" }).criticalPainIssues)
      .toHaveLength(1);
  });

  it("sends strict canonical schema configuration with deterministic generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(providerResponse(validProgram()));
    vi.stubGlobal("fetch", fetchMock);

    await generateGuestProgram("device-guest-3", answers);

    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.temperature).toBe(0);
    expect(request.response_format.type).toBe("json_schema");
    expect(request.response_format.json_schema).toMatchObject({
      name: "trainchat_program",
      strict: true,
    });
  });

  it("uses a validated, explicitly labeled local fallback when the provider is unavailable", async () => {
    const fallbackAnswers = { ...answers, frequency: 2 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    const result = await generateGuestProgram("device-guest-fallback", fallbackAnswers);

    expect(result.days).toHaveLength(2);
    expect(result.generationProvenance).toMatchObject({
      provider: "local_fallback",
      modelId: "coach-select-deterministic",
      fallbackUsed: true,
      tokenUsage: null,
      validationVerdict: "passed",
      constraintValidationVerdict: "passed",
    });
    expect(guestMocks.updateGuestSession).toHaveBeenCalledTimes(1);
  });
});
