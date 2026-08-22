import { describe, expect, it, vi } from "vitest";
import { initializeChatIdentity } from "@/lib/initializeChatIdentity";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("initializeChatIdentity", () => {
  it("returns an existing registered session without anonymous bootstrap", async () => {
    const registered = { id: 7, isAnonymous: false };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, registered));

    const result = await initializeChatIdentity("anonymous-device", request);

    expect(result).toEqual({ source: "registered_session", user: registered });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("/api/auth/me", { credentials: "include" });
  });

  it("bootstraps anonymously only after current-user lookup returns 401", async () => {
    const anonymous = { id: 8, isAnonymous: true };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { error: "expired" }))
      .mockResolvedValueOnce(jsonResponse(200, { user: anonymous }));

    const result = await initializeChatIdentity("anonymous-device", request);

    expect(result).toEqual({ source: "anonymous_bootstrap", user: anonymous });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[0]).toBe("/api/auth/bootstrap");
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
  });

  it("fails closed instead of bootstrapping after a non-auth lookup error", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(503, { error: "unavailable" }));

    await expect(initializeChatIdentity("anonymous-device", request))
      .rejects.toThrow("status 503");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
