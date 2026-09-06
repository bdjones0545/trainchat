import { useMemo } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useWebMcpTools } from "@bdjones/webmcp-kit";

import { webMcpConfig } from "./config";
import { buildTrainChatTools } from "./tools";

/**
 * Publishes TrainChat's read-only tools to any AI agent driving the page.
 * Renders nothing, and is a no-op unless VITE_WEBMCP_ENABLED is set.
 * See src/webmcp/README.md.
 */
export default function WebMcpBridge() {
  const { data: me } = useGetMe();

  useWebMcpTools(
    buildTrainChatTools,
    useMemo(() => ({ isAuthenticated: Boolean(me) }), [me]),
    webMcpConfig(),
  );

  return null;
}
