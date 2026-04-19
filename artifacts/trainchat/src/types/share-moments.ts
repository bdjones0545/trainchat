export type ShareMomentType =
  | "PROGRAM_GENERATED"
  | "AGENT_ADJUSTMENT"
  | "BLOCK_COMPLETE"
  | "NEXT_BLOCK_READY"
  | "SESSION_LOG_ADAPTATION"
  | "PROGRESS_MILESTONE";

export interface ShareMetric {
  label: string;
  value: string;
}

export interface ShareMoment {
  type: ShareMomentType;
  title: string;
  subtitle: string;
  agentQuote?: string;
  metrics: ShareMetric[];
  captionText: string;
  programName?: string;
  trainingStyle?: string;
  triggerSource: string;
}

export function buildShareMoment(params: {
  type: ShareMomentType;
  programName?: string;
  trainingStyle?: string;
  weeklyFrequency?: number;
  changeSummary?: string;
  agentQuote?: string;
  sessionsCompleted?: number;
  blockWeek?: number;
  blockName?: string;
  exercisesUpdated?: number;
  sessionsUpdated?: number;
  triggerSource?: string;
}): ShareMoment {
  const {
    type,
    programName,
    trainingStyle,
    weeklyFrequency,
    changeSummary,
    agentQuote,
    sessionsCompleted,
    blockWeek,
    blockName,
    exercisesUpdated,
    sessionsUpdated,
    triggerSource = "chat",
  } = params;

  const freqLabel = weeklyFrequency ? `${weeklyFrequency}-day` : "";
  const progLabel = programName ?? trainingStyle ?? "training program";

  switch (type) {
    case "PROGRAM_GENERATED": {
      const subtitle = [freqLabel, trainingStyle, "program"]
        .filter(Boolean)
        .join(" ");
      const metrics: ShareMetric[] = [];
      if (weeklyFrequency) metrics.push({ label: "Days / week", value: String(weeklyFrequency) });
      if (trainingStyle) metrics.push({ label: "Style", value: trainingStyle });
      metrics.push({ label: "Block length", value: "4 weeks" });

      return {
        type,
        title: "New program built",
        subtitle: subtitle.charAt(0).toUpperCase() + subtitle.slice(1),
        agentQuote: agentQuote ?? "Here's your program. Everything is set and ready to go.",
        metrics,
        captionText: `TrainChat just built my ${[freqLabel, trainingStyle, "program"].filter(Boolean).join(" ")}.`,
        programName,
        trainingStyle,
        triggerSource,
      };
    }

    case "AGENT_ADJUSTMENT": {
      const metrics: ShareMetric[] = [];
      if (sessionsUpdated) metrics.push({ label: "Sessions updated", value: String(sessionsUpdated) });
      if (exercisesUpdated) metrics.push({ label: "Exercises changed", value: String(exercisesUpdated) });
      if (blockWeek) metrics.push({ label: "Current week", value: `Week ${blockWeek}` });

      const caption = changeSummary
        ? `I told TrainChat what I needed and it updated my ${progLabel} — ${changeSummary.toLowerCase().replace(/\.$/, "")}.`
        : `I told TrainChat what I needed and it adjusted my ${progLabel} instantly.`;

      return {
        type,
        title: "Program adjusted",
        subtitle: changeSummary ?? "Your AI coach made real changes",
        agentQuote: agentQuote ?? changeSummary,
        metrics,
        captionText: caption,
        programName,
        trainingStyle,
        triggerSource,
      };
    }

    case "BLOCK_COMPLETE": {
      const metrics: ShareMetric[] = [];
      if (sessionsCompleted) metrics.push({ label: "Sessions completed", value: String(sessionsCompleted) });
      if (blockName) metrics.push({ label: "Block", value: blockName });
      metrics.push({ label: "Duration", value: "4 weeks" });

      return {
        type,
        title: "Block complete",
        subtitle: blockName ? `Finished ${blockName}` : "4-week block complete",
        agentQuote: agentQuote ?? "Great work finishing this block. Everything carries forward.",
        metrics,
        captionText: `Finished my${blockName ? ` ${blockName}` : ""} 4-week training block. TrainChat already has the next phase ready.`,
        programName,
        trainingStyle,
        triggerSource,
      };
    }

    case "NEXT_BLOCK_READY": {
      const metrics: ShareMetric[] = [];
      if (blockName) metrics.push({ label: "Next block", value: blockName });
      if (weeklyFrequency) metrics.push({ label: "Days / week", value: String(weeklyFrequency) });
      metrics.push({ label: "Duration", value: "4 weeks" });

      return {
        type,
        title: "Next phase ready",
        subtitle: blockName ? `Starting ${blockName}` : "Next training block generated",
        agentQuote: agentQuote ?? "Your next phase is built and ready. Your history and signals all carry through.",
        metrics,
        captionText: `TrainChat automatically generated my next training phase${blockName ? ` — ${blockName}` : ""}.`,
        programName,
        trainingStyle,
        triggerSource,
      };
    }

    case "SESSION_LOG_ADAPTATION": {
      const metrics: ShareMetric[] = [];
      if (sessionsCompleted) metrics.push({ label: "Sessions logged", value: String(sessionsCompleted) });
      if (blockWeek) metrics.push({ label: "Week", value: `Week ${blockWeek}` });
      if (sessionsUpdated) metrics.push({ label: "Sessions updated", value: String(sessionsUpdated) });

      return {
        type,
        title: "AI adapted my program",
        subtitle: "Based on how today felt",
        agentQuote: agentQuote ?? "I logged how my session felt and my upcoming workouts were adjusted automatically.",
        metrics,
        captionText: "I logged how my session felt and TrainChat adjusted my upcoming workouts automatically.",
        programName,
        trainingStyle,
        triggerSource,
      };
    }

    case "PROGRESS_MILESTONE": {
      const metrics: ShareMetric[] = [];
      if (sessionsCompleted) metrics.push({ label: "Sessions", value: String(sessionsCompleted) });
      if (blockWeek) metrics.push({ label: "Current week", value: `Week ${blockWeek}` });

      const milestoneText = sessionsCompleted
        ? `${sessionsCompleted} sessions completed`
        : "Training milestone reached";

      return {
        type,
        title: "Milestone reached",
        subtitle: milestoneText,
        metrics,
        captionText: `${milestoneText} with TrainChat.`,
        programName,
        trainingStyle,
        triggerSource,
      };
    }
  }
}

export const MOMENT_MILESTONES = [3, 6, 12, 25, 50, 100];

export function isMilestoneSessions(count: number): boolean {
  return MOMENT_MILESTONES.includes(count);
}
