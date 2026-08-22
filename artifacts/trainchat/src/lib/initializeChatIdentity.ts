export type ChatIdentitySource = "registered_session" | "anonymous_bootstrap";

export interface ChatIdentityResult<TUser = unknown> {
  source: ChatIdentitySource;
  user: TUser;
}

type RequestFn = typeof fetch;

/**
 * Resolve an existing server session before presenting an anonymous device ID.
 * The server remains authoritative, while the ordering prevents a client-side
 * bootstrap race from masking a valid registered session.
 */
export async function initializeChatIdentity<TUser = unknown>(
  deviceId: string,
  request: RequestFn = fetch,
): Promise<ChatIdentityResult<TUser>> {
  const current = await request("/api/auth/me", { credentials: "include" });

  if (current.ok) {
    return {
      source: "registered_session",
      user: await current.json() as TUser,
    };
  }

  if (current.status !== 401) {
    throw new Error(`Current-user lookup failed with status ${current.status}`);
  }

  const bootstrap = await request("/api/auth/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ deviceId }),
  });

  if (!bootstrap.ok) {
    throw new Error(`Anonymous bootstrap failed with status ${bootstrap.status}`);
  }

  const data = await bootstrap.json() as { user?: TUser };
  if (!data.user) {
    throw new Error("Anonymous bootstrap returned no user");
  }

  return { source: "anonymous_bootstrap", user: data.user };
}
