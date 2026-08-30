/**
 * TrainChat's WebMCP tool surface.
 *
 * Every tool calls the same generated API client the UI calls, so the backend
 * decides what the caller may read and this layer holds no reach of its own.
 *
 * All reads. Nothing here sends a chat message, creates a conversation, or
 * generates or edits a training program — see README.md for why those are
 * excluded rather than merely omitted.
 */
import {
  getMe,
  getProfile,
  getProgram,
  listConversations,
  listInsights,
  listMemories,
  listMessages,
  listPrograms,
  listReadiness,
} from "@workspace/api-client-react";

import { defineReadOnlyTool, type WebMcpTool } from "./runtime";

export interface TrainChatSnapshot {
  /** True once the app has an authenticated user. */
  isAuthenticated: boolean;
}

const SIGN_IN_REQUIRED =
  "Not signed in to TrainChat. Ask the person to sign in before requesting their programs, conversations or training history.";

function requireAuth(getSnapshot: () => TrainChatSnapshot): void {
  if (!getSnapshot().isAuthenticated) throw new Error(SIGN_IN_REQUIRED);
}

export function buildTrainChatTools(
  getSnapshot: () => TrainChatSnapshot,
): readonly WebMcpTool[] {
  return [
    defineReadOnlyTool({
      name: "trainchat_get_athlete_profile",
      title: "Get athlete profile",
      description:
        "Get the signed-in athlete's account and training profile — goals, experience, equipment, constraints and injury history. Call this before interpreting any program: the same program means different things for different athletes.",
      async read() {
        requireAuth(getSnapshot);
        const [user, profile] = await Promise.all([
          getMe(),
          getProfile().catch(() => null),
        ]);
        return {
          user,
          profile,
          ...(profile === null && {
            note: "No training profile has been completed yet, so goals, equipment and injury constraints are unknown. Do not assume defaults.",
          }),
        };
      },
    }),

    defineReadOnlyTool({
      name: "trainchat_list_programs",
      title: "List training programs",
      description:
        "List the athlete's training programs. Returns each program's summary; use trainchat_get_program for the full week-by-week detail of one.",
      untrustedContent: true,
      async read() {
        requireAuth(getSnapshot);
        const programs = await listPrograms();
        return { count: programs.length, programs };
      },
    }),

    defineReadOnlyTool<{ programId: number }>({
      name: "trainchat_get_program",
      title: "Get one training program",
      description:
        "Get the full detail of one training program by ID — its blocks, weeks, sessions and prescribed exercises. Use trainchat_list_programs first to find the ID.",
      untrustedContent: true,
      inputSchema: {
        type: "object",
        properties: {
          programId: { type: "number", description: "The program's numeric ID." },
        },
        required: ["programId"],
      },
      async read({ programId }) {
        requireAuth(getSnapshot);
        if (typeof programId !== "number")
          throw new Error("programId is required and must be a number.");
        return await getProgram(programId);
      },
    }),

    defineReadOnlyTool({
      name: "trainchat_list_conversations",
      title: "List conversations",
      description:
        "List the athlete's TrainChat conversations. Read-only: it never starts a conversation or sends a message.",
      untrustedContent: true,
      async read() {
        requireAuth(getSnapshot);
        const conversations = await listConversations();
        return { count: conversations.length, conversations };
      },
    }),

    defineReadOnlyTool<{ conversationId: number }>({
      name: "trainchat_list_messages",
      title: "Read a conversation",
      description:
        "Read the messages in one conversation by ID. Use trainchat_list_conversations first to find the ID. Read-only: it never sends a message.",
      untrustedContent: true,
      inputSchema: {
        type: "object",
        properties: {
          conversationId: {
            type: "number",
            description: "The conversation's numeric ID.",
          },
        },
        required: ["conversationId"],
      },
      async read({ conversationId }) {
        requireAuth(getSnapshot);
        if (typeof conversationId !== "number")
          throw new Error("conversationId is required and must be a number.");
        const messages = await listMessages(conversationId);
        return { conversationId, count: messages.length, messages };
      },
    }),

    defineReadOnlyTool<{ limit?: number }>({
      name: "trainchat_get_training_history",
      title: "Get readiness and training history",
      description:
        "Get the athlete's recent readiness entries, along with the coaching memories and training insights TrainChat holds about them. This is the context behind why their program looks the way it does.",
      untrustedContent: true,
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Maximum readiness entries, 1-100. Defaults to 30.",
          },
        },
      },
      async read({ limit = 30 }) {
        requireAuth(getSnapshot);
        const [readiness, memories, insights] = await Promise.all([
          listReadiness({ limit: Math.min(Math.max(limit, 1), 100) }),
          listMemories().catch(() => []),
          listInsights().catch(() => []),
        ]);
        return {
          readiness: { count: readiness.length, entries: readiness },
          memories: { count: memories.length, items: memories },
          insights: { count: insights.length, items: insights },
        };
      },
    }),
  ];
}
