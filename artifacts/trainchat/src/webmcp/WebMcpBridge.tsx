import { useMemo } from "react";
import { useGetMe } from "@workspace/api-client-react";

import { buildTrainChatTools } from "./tools";
import { useWebMcpTools } from "./useWebMcp";

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
  );

  return null;
}
