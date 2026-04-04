import { db, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIResponse {
  content: string;
  structuredData?: ProgramStructure | null;
}

interface ProgramStructure {
  programName: string;
  description: string;
  days: {
    dayNumber: number;
    name: string;
    exercises: {
      name: string;
      sets: number;
      reps: string;
      rest: string;
      notes?: string;
    }[];
    notes?: string;
  }[];
}

function buildSystemPrompt(profile: {
  trainingGoal: string;
  experienceLevel: string;
  trainingStyle: string;
  daysPerWeek: number;
  sessionDuration: number;
  equipmentAccess: string;
  injuries: string | null;
  sportFocus: string | null;
  exercisePreferences: string | null;
  exercisesToAvoid: string | null;
} | null): string {
  const basePrompt = `You are TrainChat — an elite AI performance architect. You help athletes and serious individuals build world-class training programs through conversation.

Your personality:
- Precise, knowledgeable, and authoritative — like a professional strength coach
- Direct and efficient — no fluff, no filler
- Motivating but not cheerleader-like — you respect the user's intelligence
- You ask clarifying questions when needed to build the best program

Your capabilities:
- Design complete training programs with splits, progressions, and periodization
- Adjust programs based on goals, experience, equipment, and limitations
- Explain exercise science when asked
- Track and remember conversation context

When you design a training program, you MUST output it in this exact JSON format embedded in your message. Include it after your conversational response in a code block marked as \`\`\`json\`\`\`:

\`\`\`json
{
  "programName": "Program Name",
  "description": "Brief description",
  "days": [
    {
      "dayNumber": 1,
      "name": "Day Name (e.g., Upper Body - Push)",
      "exercises": [
        {
          "name": "Exercise Name",
          "sets": 4,
          "reps": "6-8",
          "rest": "90s",
          "notes": "Optional technique note"
        }
      ],
      "notes": "Optional day notes"
    }
  ]
}
\`\`\`

Do NOT output this JSON unless you're providing a full training program. For general questions, just respond conversationally.`;

  if (!profile) {
    return basePrompt + "\n\nNote: The user has not completed their profile yet. You can still help them, but encourage them to complete their profile for a personalized program.";
  }

  return basePrompt + `\n\nUser Profile:
- Training Goal: ${profile.trainingGoal}
- Experience Level: ${profile.experienceLevel}
- Preferred Training Style: ${profile.trainingStyle}
- Training Days Per Week: ${profile.daysPerWeek}
- Session Duration: ${profile.sessionDuration} minutes
- Equipment Access: ${profile.equipmentAccess}
${profile.injuries ? `- Injuries/Limitations: ${profile.injuries}` : ""}
${profile.sportFocus ? `- Sport/Activity Focus: ${profile.sportFocus}` : ""}
${profile.exercisePreferences ? `- Exercise Preferences: ${profile.exercisePreferences}` : ""}
${profile.exercisesToAvoid ? `- Exercises to Avoid: ${profile.exercisesToAvoid}` : ""}

Always reference the user's profile when making recommendations. Design programs that respect their constraints.`;
}

function extractStructuredData(content: string): { cleanContent: string; structuredData: ProgramStructure | null } {
  const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
  if (!jsonMatch) {
    return { cleanContent: content, structuredData: null };
  }

  try {
    const structuredData = JSON.parse(jsonMatch[1]) as ProgramStructure;
    const cleanContent = content.replace(/```json\n[\s\S]*?\n```/, "").trim();
    return { cleanContent, structuredData };
  } catch {
    logger.warn("Failed to parse structured data from AI response");
    return { cleanContent: content, structuredData: null };
  }
}

export async function generateAIResponse(
  userMessage: string,
  history: ChatMessage[],
  userId: number
): Promise<AIResponse> {
  // Get user profile for context
  const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.userId, userId));
  const systemPrompt = buildSystemPrompt(profile ?? null);

  // Check if OpenAI is configured
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Fallback intelligent response when no API key is set
    return generateFallbackResponse(userMessage, history, profile ?? null);
  }

  try {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userMessage },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[];
    };

    const rawContent = data.choices[0]?.message?.content ?? "I'm unable to respond right now.";
    const { cleanContent, structuredData } = extractStructuredData(rawContent);

    return { content: cleanContent, structuredData };
  } catch (error) {
    logger.error({ error }, "Failed to call OpenAI API");
    return generateFallbackResponse(userMessage, history, profile ?? null);
  }
}

function generateFallbackResponse(
  userMessage: string,
  _history: ChatMessage[],
  profile: {
    trainingGoal: string;
    experienceLevel: string;
    trainingStyle: string;
    daysPerWeek: number;
    sessionDuration: number;
    equipmentAccess: string;
  } | null
): AIResponse {
  const lower = userMessage.toLowerCase();

  if (lower.includes("program") || lower.includes("build") || lower.includes("create") || lower.includes("design")) {
    if (profile) {
      const programData: ProgramStructure = {
        programName: `${profile.trainingGoal} Program`,
        description: `A ${profile.daysPerWeek}-day ${profile.trainingStyle} program designed for ${profile.experienceLevel} athletes targeting ${profile.trainingGoal}.`,
        days: [
          {
            dayNumber: 1,
            name: "Upper Body — Push",
            exercises: [
              { name: "Barbell Bench Press", sets: 4, reps: "6-8", rest: "90s", notes: "Control the descent" },
              { name: "Overhead Press", sets: 3, reps: "8-10", rest: "75s" },
              { name: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest: "60s" },
              { name: "Lateral Raises", sets: 4, reps: "12-15", rest: "45s" },
              { name: "Tricep Pushdowns", sets: 3, reps: "12-15", rest: "45s" },
            ],
          },
          {
            dayNumber: 2,
            name: "Lower Body — Quad Focus",
            exercises: [
              { name: "Back Squat", sets: 4, reps: "5-6", rest: "2min", notes: "Prioritize depth and bracing" },
              { name: "Romanian Deadlift", sets: 3, reps: "8-10", rest: "90s" },
              { name: "Leg Press", sets: 3, reps: "10-12", rest: "75s" },
              { name: "Walking Lunges", sets: 3, reps: "12 each", rest: "60s" },
              { name: "Leg Curl", sets: 3, reps: "12-15", rest: "45s" },
            ],
          },
          {
            dayNumber: 3,
            name: "Upper Body — Pull",
            exercises: [
              { name: "Weighted Pull-ups", sets: 4, reps: "5-8", rest: "90s" },
              { name: "Barbell Row", sets: 4, reps: "6-8", rest: "90s", notes: "Keep chest up" },
              { name: "Seated Cable Row", sets: 3, reps: "10-12", rest: "60s" },
              { name: "Face Pulls", sets: 3, reps: "15-20", rest: "45s" },
              { name: "Hammer Curls", sets: 3, reps: "12-15", rest: "45s" },
            ],
          },
        ],
      };

      return {
        content: `Based on your profile, I've built your ${profile.trainingGoal.toLowerCase()} program. This is a ${profile.daysPerWeek}-day ${profile.trainingStyle} split designed for your ${profile.experienceLevel} experience level. Each session fits within your ${profile.sessionDuration}-minute window.\n\nThe program above is structured for progressive overload. After 4 weeks, we'll increase intensity — either through load, volume, or reduced rest. Tell me if you want to adjust anything, swap exercises, or understand the reasoning behind any choice.`,
        structuredData: programData,
      };
    }

    return {
      content: "I can build you a complete training program. To make it truly personalized, I need to know a few things:\n\n1. What is your primary training goal? (strength, hypertrophy, fat loss, athletic performance, etc.)\n2. What is your experience level?\n3. How many days per week can you train?\n4. How long are your sessions?\n5. What equipment do you have access to?\n\nOnce I have this, I'll design your program.",
      structuredData: null,
    };
  }

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    return {
      content: profile
        ? `Welcome back. Ready to train. What are we working on today — adjusting your ${profile.trainingGoal.toLowerCase()} program, dialing in a specific lift, or starting something new?`
        : "Welcome to TrainChat. I'm your AI performance architect. Tell me your goal and I'll build you a training system around it. What are you working toward?",
      structuredData: null,
    };
  }

  if (lower.includes("help") || lower.includes("what can you do")) {
    return {
      content: "Here's what I can do for you:\n\n**Program Design** — Tell me your goal and I'll build a complete program: splits, exercises, sets, reps, rest periods, and progression model.\n\n**Program Adjustment** — Already have a program? I can modify it, add exercises, or restructure the split.\n\n**Exercise Guidance** — Ask about technique, substitutions, or why a particular exercise is programmed.\n\n**Periodization** — I can build linear, undulating, or block periodization structures depending on your level.\n\n**Specific Goals** — Whether it's a 405 squat, athletic performance, or body recomposition, I work backward from your goal.\n\nWhat would you like to start with?",
      structuredData: null,
    };
  }

  return {
    content: "Understood. To give you the most precise answer, could you tell me a bit more about what you're working toward? The more context you give me, the better I can dial this in for you.",
    structuredData: null,
  };
}
