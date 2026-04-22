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
  /** Extended fields for rich card rendering */
  splitType?: string;
  daysPerWeek?: number;
  weekNumber?: number;
  blockLabel?: string;
  currentDayName?: string;
  blockLength?: number;
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
  /** Extended params */
  splitType?: string;
  daysPerWeek?: number;
  weekNumber?: number;
  blockLabel?: string;
  currentDayName?: string;
  blockLength?: number;
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
    splitType,
    daysPerWeek,
    weekNumber,
    blockLabel,
    currentDayName,
    blockLength,
  } = params;

  const effectiveDays = daysPerWeek ?? weeklyFrequency;
  const freqLabel = effectiveDays ? `${effectiveDays}-day` : "";
  const progLabel = programName ?? trainingStyle ?? "training program";

  switch (type) {
    case "PROGRAM_GENERATED": {
      const style = splitType ?? trainingStyle;
      const subtitle = programName
        ?? ([freqLabel, style].filter(Boolean).join(" ") || "Custom training program");

      const captionParts: string[] = [];
      if (freqLabel && style) {
        captionParts.push(`Built my ${freqLabel} ${style} block with the TrainChat Agent.`);
      } else if (freqLabel) {
        captionParts.push(`Built my ${freqLabel} training block with the TrainChat Agent.`);
      } else {
        captionParts.push("Built my training program with the TrainChat Agent.");
      }

      return {
        type,
        title: "Look what I created with the TrainChat Agent",
        subtitle: subtitle.charAt(0).toUpperCase() + subtitle.slice(1),
        metrics: [],
        captionText: captionParts[0],
        programName,
        trainingStyle,
        triggerSource,
        splitType,
        daysPerWeek: effectiveDays,
        weekNumber: weekNumber ?? blockWeek,
        blockLabel,
        currentDayName,
        blockLength: blockLength ?? 4,
      };
    }

    case "AGENT_ADJUSTMENT": {
      const metrics: ShareMetric[] = [];
      if (sessionsUpdated) metrics.push({ label: "Sessions updated", value: String(sessionsUpdated) });
      if (exercisesUpdated) metrics.push({ label: "Exercises changed", value: String(exercisesUpdated) });
      if (blockWeek ?? weekNumber) metrics.push({ label: "Current week", value: `Week ${blockWeek ?? weekNumber}` });

      const caption = changeSummary
        ? `The TrainChat Agent adjusted my ${progLabel} — ${changeSummary.toLowerCase().replace(/\.$/, "")}.`
        : `The TrainChat Agent updated my ${progLabel} based on what I needed.`;

      return {
        type,
        title: "TrainChat Agent adjusted my program",
        subtitle: changeSummary ?? "Real-time program adjustment",
        agentQuote,
        metrics,
        captionText: caption,
        programName,
        trainingStyle,
        triggerSource,
        splitType,
        daysPerWeek: effectiveDays,
        weekNumber: blockWeek ?? weekNumber,
        blockLabel,
        currentDayName,
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
        agentQuote,
        metrics,
        captionText: `Finished my${blockName ? ` ${blockName}` : ""} 4-week block. TrainChat Agent already has the next phase ready.`,
        programName,
        trainingStyle,
        triggerSource,
        splitType,
        daysPerWeek: effectiveDays,
        weekNumber: blockWeek ?? weekNumber,
        blockLabel: blockName ?? blockLabel,
      };
    }

    case "NEXT_BLOCK_READY": {
      const metrics: ShareMetric[] = [];
      if (blockName) metrics.push({ label: "Next block", value: blockName });
      if (effectiveDays) metrics.push({ label: "Days / week", value: String(effectiveDays) });
      metrics.push({ label: "Duration", value: "4 weeks" });

      return {
        type,
        title: "Next phase ready",
        subtitle: blockName ? `Starting ${blockName}` : "Next training block generated",
        agentQuote,
        metrics,
        captionText: `TrainChat Agent automatically built my next training phase${blockName ? ` — ${blockName}` : ""}.`,
        programName,
        trainingStyle,
        triggerSource,
        splitType,
        daysPerWeek: effectiveDays,
        blockLabel: blockName ?? blockLabel,
      };
    }

    case "SESSION_LOG_ADAPTATION": {
      const metrics: ShareMetric[] = [];
      if (sessionsCompleted) metrics.push({ label: "Sessions logged", value: String(sessionsCompleted) });
      if (blockWeek ?? weekNumber) metrics.push({ label: "Week", value: `Week ${blockWeek ?? weekNumber}` });
      if (sessionsUpdated) metrics.push({ label: "Sessions updated", value: String(sessionsUpdated) });

      return {
        type,
        title: "TrainChat Agent adapted my plan",
        subtitle: "Based on how today felt",
        agentQuote,
        metrics,
        captionText: "Logged my session — TrainChat Agent adjusted my upcoming workouts automatically.",
        programName,
        trainingStyle,
        triggerSource,
        splitType,
        daysPerWeek: effectiveDays,
        weekNumber: blockWeek ?? weekNumber,
        blockLabel,
        currentDayName,
      };
    }

    case "PROGRESS_MILESTONE": {
      const metrics: ShareMetric[] = [];
      if (sessionsCompleted) metrics.push({ label: "Sessions", value: String(sessionsCompleted) });
      if (blockWeek ?? weekNumber) metrics.push({ label: "Current week", value: `Week ${blockWeek ?? weekNumber}` });

      const milestoneText = sessionsCompleted
        ? `${sessionsCompleted} sessions completed`
        : "Training milestone reached";

      return {
        type,
        title: "Milestone reached",
        subtitle: milestoneText,
        metrics,
        captionText: `${milestoneText} with the TrainChat Agent.`,
        programName,
        trainingStyle,
        triggerSource,
        splitType,
        daysPerWeek: effectiveDays,
        weekNumber: blockWeek ?? weekNumber,
        blockLabel,
      };
    }
  }
}

export const MOMENT_MILESTONES = [3, 6, 12, 25, 50, 100];

export function isMilestoneSessions(count: number): boolean {
  return MOMENT_MILESTONES.includes(count);
}
