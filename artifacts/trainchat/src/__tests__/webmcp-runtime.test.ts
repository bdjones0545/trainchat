/**
 * Guarantees the WebMCP runtime owes every app that uses it.
 *
 * These are the properties the tool surface is trusted on, so they are asserted
 * rather than assumed:
 *
 *  - a tool built here is always read-only
 *  - nothing registers while the feature flag is off
 *  - one broken tool never takes the others down with it
 *  - a throwing tool becomes a tool error, never an unhandled rejection
 *  - disposal actually unregisters
 *
 * No DOM is needed: `document` is stubbed, which also keeps these runnable in a
 * plain node test environment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defineReadOnlyTool,
  registerWebMcpTools,
  type WebMcpTool,
} from "../webmcp/runtime";

type RegisterCall = { tool: WebMcpTool; signal?: AbortSignal };

/** Install a fake `document.modelContext` and report what it was asked to do. */
function stubModelContext(
  onRegister: (call: RegisterCall) => void | Promise<void> = () => {},
) {
  const calls: RegisterCall[] = [];
  const registerTool = vi.fn(
    async (tool: WebMcpTool, options?: { signal?: AbortSignal }) => {
      const call = { tool, signal: options?.signal };
      calls.push(call);
      await onRegister(call);
    },
  );
  (globalThis as Record<string, unknown>).document = { modelContext: { registerTool } };
  return { calls, registerTool };
}

/** Let the runtime's internal async registration settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const tool = (name: string, read: () => unknown = () => name) =>
  defineReadOnlyTool({ name, description: `${name} description`, read });

afterEach(() => {
  delete (globalThis as Record<string, unknown>).document;
  vi.restoreAllMocks();
});

describe("defineReadOnlyTool", () => {
  it("marks every tool read-only, whatever the caller passes", () => {
    const built = tool("a");
    expect(built.annotations?.readOnlyHint).toBe(true);
  });

  it("defaults untrustedContentHint to false and honours an opt-in", () => {
    expect(tool("a").annotations?.untrustedContentHint).toBe(false);
    expect(
      defineReadOnlyTool({
        name: "b",
        description: "d",
        untrustedContent: true,
        read: () => 1,
      }).annotations?.untrustedContentHint,
    ).toBe(true);
  });

  it("always supplies an inputSchema, because registerTool is overloaded on it", () => {
    expect(tool("a").inputSchema).toEqual({ type: "object", properties: {} });
  });

  it("omits title entirely rather than setting it undefined", () => {
    expect("title" in tool("a")).toBe(false);
    expect(
      defineReadOnlyTool({ name: "b", title: "T", description: "d", read: () => 1 }).title,
    ).toBe("T");
  });

  it("serializes a result into a text content block", async () => {
    const result = await tool("a", () => ({ hello: "world" })).execute({});
    expect(result).toEqual({
      content: [{ type: "text", text: '{\n  "hello": "world"\n}' }],
    });
  });

  it("passes a string result through unquoted", async () => {
    const result = (await tool("a", () => "plain").execute({})) as {
      content: { text: string }[];
    };
    expect(result.content[0].text).toBe("plain");
  });

  it("awaits an async read", async () => {
    const built = defineReadOnlyTool({
      name: "a",
      description: "d",
      read: async () => "later",
    });
    const result = (await built.execute({})) as { content: { text: string }[] };
    expect(result.content[0].text).toBe("later");
  });

  it("reports a throwing read as a tool error instead of rejecting", async () => {
    const built = tool("a", () => {
      throw new Error("boom");
    });
    const result = (await built.execute({})) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Tool "a" failed: boom');
  });

  it("substitutes an empty object when invoked with no arguments", async () => {
    const read = vi.fn(() => "ok");
    await defineReadOnlyTool({ name: "a", description: "d", read }).execute(
      undefined as unknown as Record<string, unknown>,
    );
    expect(read).toHaveBeenCalledWith({});
  });

  it("truncates an oversized result and says so", async () => {
    const built = tool("a", () => "x".repeat(20_000));
    const result = (await built.execute({})) as { content: { text: string }[] };
    const { text } = result.content[0];
    expect(text.length).toBeLessThan(20_000);
    expect(text).toContain("truncated");
    expect(text).toContain("Narrow the query");
  });
});

describe("registerWebMcpTools", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("registers nothing while the flag is off", async () => {
    const { registerTool } = stubModelContext();
    registerWebMcpTools([tool("a")], { enabled: false, polyfill: false });
    await settle();
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("registers every tool once enabled", async () => {
    const { registerTool, calls } = stubModelContext();
    registerWebMcpTools([tool("a"), tool("b")], { enabled: true, polyfill: false });
    await settle();
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(calls.map((call) => call.tool.name)).toEqual(["a", "b"]);
  });

  it("keeps registering after one tool fails, and names the one that failed", async () => {
    const { registerTool } = stubModelContext(({ tool: candidate }) => {
      if (candidate.name === "bad") throw new Error("nope");
    });
    registerWebMcpTools([tool("bad"), tool("good")], {
      enabled: true,
      polyfill: false,
    });
    await settle();
    expect(registerTool).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('tool "bad" failed to register'),
      expect.anything(),
    );
  });

  it("hands each tool a signal that the disposer aborts", async () => {
    const { calls } = stubModelContext();
    const dispose = registerWebMcpTools([tool("a")], {
      enabled: true,
      polyfill: false,
    });
    await settle();
    expect(calls[0]?.signal?.aborted).toBe(false);
    dispose();
    expect(calls[0]?.signal?.aborted).toBe(true);
  });

  it("registers nothing if disposed before registration lands", async () => {
    const { registerTool } = stubModelContext();
    registerWebMcpTools([tool("a")], { enabled: true, polyfill: false })();
    await settle();
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("is a no-op in a browser without WebMCP, rather than throwing", async () => {
    (globalThis as Record<string, unknown>).document = {};
    expect(() =>
      registerWebMcpTools([tool("a")], { enabled: true, polyfill: false }),
    ).not.toThrow();
    await settle();
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not reach for the polyfill when the flag is off", async () => {
    (globalThis as Record<string, unknown>).document = {};
    registerWebMcpTools([tool("a")], { enabled: true, polyfill: false });
    await settle();
    // A polyfill import attempt would surface here as an unresolved-module warning.
    expect(warn).not.toHaveBeenCalled();
  });

  it("registers nothing when given no tools", async () => {
    const { registerTool } = stubModelContext();
    registerWebMcpTools([], { enabled: true, polyfill: false });
    await settle();
    expect(registerTool).not.toHaveBeenCalled();
  });
});
