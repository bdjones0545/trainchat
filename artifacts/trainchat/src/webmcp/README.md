# WebMCP

[WebMCP](https://github.com/webmachinelearning/webmcp) lets this app publish its
own functionality to an AI agent as callable tools, through
`document.modelContext`. Instead of an agent reading the chat DOM, it calls a
named tool with a JSON schema and gets structured data back.

## Status of the underlying API

WebMCP is a Web Machine Learning Community Group draft. It is native in Chrome's
origin trial (Chrome 149–156) and absent in Firefox and Safari.
`navigator.modelContext` was the earlier shape and is deprecated; this code uses
`document.modelContext` only.

## Switches

Both default to off. An unset environment behaves exactly as it did before
WebMCP was added.

| Variable | Effect |
| --- | --- |
| `VITE_WEBMCP_ENABLED=true` | Register this app's tools. |
| `VITE_WEBMCP_POLYFILL=true` | Also serve them to browsers with no native WebMCP, by lazily loading `@mcp-b/global`. |

The polyfill is only ever reached through a dynamic `import()`, so it builds
into its own chunk that unflagged builds never fetch.

## What is exposed

Six tools, all read-only:

| Tool | Returns |
| --- | --- |
| `trainchat_get_athlete_profile` | Account plus training profile — goals, experience, equipment, constraints, injuries |
| `trainchat_list_programs` | The athlete's training programs, summarized |
| `trainchat_get_program` | One program's full block/week/session/exercise detail |
| `trainchat_list_conversations` | The athlete's conversations |
| `trainchat_list_messages` | The messages in one conversation |
| `trainchat_get_training_history` | Readiness entries, coaching memories and training insights |

## What is deliberately not exposed

No tool sends a chat message, creates a conversation, or generates or edits a
training program. In TrainChat those are the same act: a message to the coach is
what produces and mutates a program.

Two reasons that stays human-driven:

1. It is billable AI generation, on every call.
2. The output is a training prescription for a real person, written against
   their injury history and equipment. An agent should be able to *read* an
   athlete's program and explain it. It should not be able to change what they
   are told to lift.

`defineReadOnlyTool` is the only tool constructor, and it hard-codes
`readOnlyHint: true`. A mutating tool cannot be expressed through it. Adding
write tools is a deliberate change to `runtime.ts`, not something reachable by
accident from `tools.ts`.

## Context before interpretation

`trainchat_get_athlete_profile` says explicitly when no training profile exists
yet, rather than returning an empty object. The same program means different
things for different athletes, and an agent that assumes default goals and no
injuries will misread it.

## Files

| File | Role |
| --- | --- |
| `runtime.ts` | Feature detection, lazy polyfill, registration, `defineReadOnlyTool`. App-agnostic. |
| `config.ts` | Reads the two environment flags. |
| `useWebMcp.ts` | React hook; registers once, reads live data through a ref. |
| `tools.ts` | This app's tool definitions. |
| `WebMcpBridge.tsx` | Renders nothing; wires auth state into the hook. |

## Verifying

This frontend cannot be built or dev-served on macOS: the workspace deliberately
excludes darwin native binaries for `@tailwindcss/oxide`, `esbuild`,
`lightningcss` and `rollup`, because Replit runs linux-x64 only. `pnpm typecheck`
and `vitest` do run there, and the tool layer is covered by
`src/__tests__/webmcp-*`.

CI on Linux builds the SPA and runs the full suite, so the app is known to build
with the bridge mounted. CI does **not** exercise the tools:
`VITE_WEBMCP_ENABLED` is unset there, so nothing registers.

To check the tools for real, set both flags on a Linux host and run this in the
console:

```js
await document.modelContext.getTools();
```
