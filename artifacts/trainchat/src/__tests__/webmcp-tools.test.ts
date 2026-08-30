/**
 * TrainChat's WebMCP tool surface.
 *
 * The API client is mocked, so what is under test is the tool layer itself:
 * that every tool is read-only, that reads reach the right client call, that a
 * signed-out caller is refused rather than handed empty results, and that a
 * missing argument comes back as a tool error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildTrainChatTools } from "../webmcp/tools";

vi.mock("@workspace/api-client-react", () => ({
  getMe: vi.fn(async () => ({ id: 7, email: "athlete@example.com" })),
  getProfile: vi.fn(async () => ({ goal: "strength" })),
  listPrograms: vi.fn(async () => [{ id: 1, name: "Block A" }]),
  getProgram: vi.fn(async (id: number) => ({ id, weeks: [] })),
  listConversations: vi.fn(async () => [{ id: 3 }]),
  listMessages: vi.fn(async (id: number) => [{ id: 1, conversationId: id }]),
  listReadiness: vi.fn(async () => [{ id: 1, score: 8 }]),
  listMemories: vi.fn(async () => [{ id: 1 }]),
  listInsights: vi.fn(async () => [{ id: 1 }]),
}));

type ToolResult = { isError?: boolean; content: { text: string }[] };

let authenticated = true;
const tools = buildTrainChatTools(() => ({ isAuthenticated: authenticated }));
const byName = (name: string) => {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no such tool: ${name}`);
  return found;
};
const call = (name: string, input: Record<string, unknown> = {}) =>
  byName(name).execute(input) as Promise<ToolResult>;
const read = async (name: string, input: Record<string, unknown> = {}) =>
  JSON.parse((await call(name, input)).content[0].text);

beforeEach(() => {
  authenticated = true;
});

describe("the tool surface", () => {
  it("exposes exactly the six intended tools", () => {
    expect(tools.map((candidate) => candidate.name).sort()).toEqual([
      "trainchat_get_athlete_profile",
      "trainchat_get_program",
      "trainchat_get_training_history",
      "trainchat_list_conversations",
      "trainchat_list_messages",
      "trainchat_list_programs",
    ]);
  });

  it("declares every tool read-only", () => {
    for (const candidate of tools) {
      expect(candidate.annotations?.readOnlyHint).toBe(true);
      expect(candidate.inputSchema).toBeDefined();
    }
  });

  it("names every tool with a reading verb", () => {
    // Writing to TrainChat is program generation. The naming convention carries
    // that guarantee: a tool that sent a message or edited a program could not
    // be named under this rule. A substring check would be the wrong invariant
    // — a legitimate read can contain a write-sounding word.
    for (const candidate of tools) {
      expect(candidate.name).toMatch(/^trainchat_(get|list)_/);
    }
  });
});

describe("reads", () => {
  it("returns the athlete's account and training profile together", async () => {
    expect(await read("trainchat_get_athlete_profile")).toEqual({
      user: { id: 7, email: "athlete@example.com" },
      profile: { goal: "strength" },
    });
  });

  it("says so explicitly when no training profile exists", async () => {
    const client = await import("@workspace/api-client-react");
    vi.mocked(client.getProfile).mockRejectedValueOnce(new Error("404"));
    const result = await read("trainchat_get_athlete_profile");
    expect(result.profile).toBeNull();
    expect(result.note).toContain("Do not assume defaults");
  });

  it("lists programs with a count", async () => {
    expect(await read("trainchat_list_programs")).toEqual({
      count: 1,
      programs: [{ id: 1, name: "Block A" }],
    });
  });

  it("fetches one program by id", async () => {
    expect(await read("trainchat_get_program", { programId: 42 })).toEqual({
      id: 42,
      weeks: [],
    });
  });

  it("reads one conversation's messages", async () => {
    expect(await read("trainchat_list_messages", { conversationId: 3 })).toEqual({
      conversationId: 3,
      count: 1,
      messages: [{ id: 1, conversationId: 3 }],
    });
  });

  it("gathers readiness, memories and insights in one call", async () => {
    const history = await read("trainchat_get_training_history");
    expect(history.readiness.count).toBe(1);
    expect(history.memories.count).toBe(1);
    expect(history.insights.count).toBe(1);
  });

  it("clamps the readiness limit into range", async () => {
    const client = await import("@workspace/api-client-react");
    await read("trainchat_get_training_history", { limit: 5_000 });
    expect(vi.mocked(client.listReadiness)).toHaveBeenLastCalledWith({ limit: 100 });
    await read("trainchat_get_training_history", { limit: -1 });
    expect(vi.mocked(client.listReadiness)).toHaveBeenLastCalledWith({ limit: 1 });
  });

  it("survives a partial failure of the optional history sources", async () => {
    const client = await import("@workspace/api-client-react");
    vi.mocked(client.listMemories).mockRejectedValueOnce(new Error("down"));
    const history = await read("trainchat_get_training_history");
    expect(history.memories.count).toBe(0);
    expect(history.readiness.count).toBe(1);
  });
});

describe("refusals", () => {
  it("refuses a signed-out read instead of returning nothing found", async () => {
    authenticated = false;
    const result = await call("trainchat_list_programs");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Not signed in");
  });

  it("refuses every data tool while signed out", async () => {
    authenticated = false;
    for (const candidate of tools) {
      const result = (await candidate.execute({
        programId: 1,
        conversationId: 1,
      })) as ToolResult;
      expect(result.isError).toBe(true);
    }
  });

  it("reports a missing id as a tool error, not a rejection", async () => {
    const result = await call("trainchat_get_program");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("programId is required");
  });
});
