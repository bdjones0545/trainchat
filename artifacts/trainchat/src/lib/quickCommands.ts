import type { FocusMode } from "@/lib/focusMode";

type QuickCommandFocus = FocusMode;

interface QuickCommand {
  label: string;
  focus: QuickCommandFocus;
  scopes: string[];
  intents?: string[];
}

interface QuickCommandContext {
  focusMode?: string | null;
  blockType?: string | null;
  sessionIntent?: string | null;
}

const VALID_FOCUSES: FocusMode[] = ["strength", "speed", "mobility"];

const COMMANDS: QuickCommand[] = [
  { label: "Increase acceleration emphasis", focus: "speed", scopes: ["session", "week", "phase", "system"], intents: ["acceleration", "start", "projection", "force"] },
  { label: "Increase max velocity exposure", focus: "speed", scopes: ["session", "week", "phase", "system"], intents: ["max", "velocity", "upright", "elasticity"] },
  { label: "Add reactive work", focus: "speed", scopes: ["session", "week", "phase", "system"], intents: ["reactive", "cod", "change", "direction"] },
  { label: "Improve deceleration control", focus: "speed", scopes: ["exercise", "session", "week", "phase", "system"], intents: ["deceleration", "landing", "braking"] },
  { label: "Reduce ground contact time", focus: "speed", scopes: ["exercise", "session", "week", "phase", "system"], intents: ["max", "velocity", "elasticity", "stiffness"] },
  { label: "Lower CNS load", focus: "speed", scopes: ["session", "week", "phase", "system"], intents: ["recovery", "fatigue", "deload"] },
  { label: "Shorten sprint distance", focus: "speed", scopes: ["exercise", "session", "week"], intents: ["acceleration", "distance", "fatigue"] },
  { label: "Reduce volume keep intensity", focus: "speed", scopes: ["session", "week", "phase", "system"], intents: ["recovery", "fatigue", "intensity"] },
  { label: "Increase load", focus: "strength", scopes: ["exercise", "session", "week", "phase", "system"], intents: ["strength", "intensity", "load"] },
  { label: "Increase volume", focus: "strength", scopes: ["exercise", "session", "week", "phase", "system"], intents: ["volume", "hypertrophy"] },
  { label: "Shift toward hypertrophy", focus: "strength", scopes: ["session", "week", "phase", "system"], intents: ["hypertrophy", "muscle", "volume"] },
  { label: "Increase intensity", focus: "strength", scopes: ["session", "week", "phase", "system"], intents: ["intensity", "load", "strength"] },
  { label: "Add accessory work", focus: "strength", scopes: ["session", "week", "phase", "system"], intents: ["accessory", "hypertrophy", "volume"] },
  { label: "Increase end-range control", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "system"], intents: ["end", "range", "control"] },
  { label: "Increase passive range", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "system"], intents: ["passive", "range"] },
  { label: "Add isometric holds", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "system"], intents: ["isometric", "holds", "pails", "rails"] },
  { label: "Improve joint control", focus: "mobility", scopes: ["exercise", "session", "week", "phase", "system"], intents: ["joint", "control", "cars"] },
  { label: "Increase flow/recovery work", focus: "mobility", scopes: ["session", "week", "phase", "system"], intents: ["flow", "recovery", "restore"] },
];

function normalizeFocus(focusMode?: string | null): FocusMode {
  return VALID_FOCUSES.includes(focusMode as FocusMode) ? (focusMode as FocusMode) : "strength";
}

function normalize(value?: string | null): string {
  return String(value ?? "").toLowerCase().replace(/[_-]/g, " ");
}

function scoreCommand(command: QuickCommand, context: Required<Pick<QuickCommandContext, "blockType" | "sessionIntent">>): number {
  const blockType = normalize(context.blockType);
  const sessionIntent = normalize(context.sessionIntent);
  const haystack = `${blockType} ${sessionIntent}`;
  const intentScore = command.intents?.some((intent) => haystack.includes(intent)) ? 2 : 0;
  const scopeScore = command.scopes.includes(blockType) ? 1 : 0;
  return intentScore + scopeScore;
}

export function getQuickCommands({ focusMode, blockType, sessionIntent }: QuickCommandContext): string[] {
  const currentFocus = normalizeFocus(focusMode);
  const normalizedBlockType = normalize(blockType) || "system";
  const normalizedSessionIntent = normalize(sessionIntent);
  const commandsReturned = COMMANDS
    .filter((command) => command.focus === currentFocus)
    .filter((command) => command.scopes.includes(normalizedBlockType) || normalizedBlockType === "block")
    .sort((a, b) => {
      const context = { blockType: normalizedBlockType, sessionIntent: normalizedSessionIntent };
      return scoreCommand(b, context) - scoreCommand(a, context);
    })
    .map((command) => command.label);

  console.info("[QuickCommandAudit]", {
    focusMode: currentFocus,
    blockType: normalizedBlockType,
    sessionIntent: normalizedSessionIntent || null,
    commandsReturned,
  });

  return commandsReturned;
}