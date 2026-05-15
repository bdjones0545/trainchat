import type { FaqItem } from "@/components/aeo/FaqBlock";

export interface RelatedConcept {
  slug: string;
  label: string;
}

export interface ConceptData {
  slug: string;
  title: string;
  shortDefinition: string;
  metaDescription: string;
  category: string;
  parentConcept?: string;
  childConcepts?: string[];
  relatedConcepts: RelatedConcept[];
  body: {
    directAnswer: string;
    sections: {
      heading: string;
      content: string;
      bullets?: string[];
    }[];
  };
  faqs: FaqItem[];
  schemaType?: string;
}

export const concepts: ConceptData[] = [
  {
    slug: "adaptive-programming",
    title: "Adaptive Programming",
    shortDefinition: "A training methodology where the program continuously evolves based on feedback, performance data, and shifting goals — rather than remaining fixed from its initial build.",
    metaDescription: "Adaptive programming is a training methodology where your workout plan continuously updates based on feedback, performance, and goals. Learn what it is, how it works, and why it produces better outcomes than static plans.",
    category: "Training Methodology",
    childConcepts: ["workout-mutation", "dynamic-progression", "performance-adaptation"],
    relatedConcepts: [
      { slug: "coaching-intelligence", label: "Coaching Intelligence" },
      { slug: "training-memory", label: "Training Memory" },
      { slug: "living-training-system", label: "Living Training System" },
    ],
    body: {
      directAnswer: "Adaptive programming is a training methodology where the program continuously evolves based on your feedback, performance data, and shifting goals — rather than remaining fixed from its initial build. It is the operational core of any living training system.",
      sections: [
        {
          heading: "Why Static Programs Fail Over Time",
          content: "A static training program reflects one snapshot of your goals, capacity, and schedule. The moment your situation changes — an injury, a performance breakthrough, a goal shift, a schedule disruption — the plan becomes progressively misaligned. Most athletes compensate by abandoning structure entirely. Adaptive programming solves this by treating the program as a living document that responds to change rather than resisting it.",
        },
        {
          heading: "How Adaptive Programming Works",
          content: "Adaptive programming operates through a continuous feedback loop:",
          bullets: [
            "Input: You provide feedback — session difficulty, soreness, goal changes, schedule constraints",
            "Processing: The coaching intelligence layer interprets the feedback against your current program state",
            "Decision: Training science constraints (load management, movement balance, recovery) are applied",
            "Mutation: Specific changes are executed in the live program",
            "Documentation: Every change is logged with rationale and timestamp",
          ],
        },
        {
          heading: "Adaptive Programming vs Periodization",
          content: "Periodization organizes training into structured phases with planned progressions — it's a scheduling system. Adaptive programming is a responsiveness system. The two are complementary: well-designed adaptive programming incorporates periodization principles while maintaining the flexibility to deviate when athlete feedback demands it. TrainChat implements both: a periodized program architecture that adapts in real time when conditions warrant.",
        },
        {
          heading: "Adaptive Programming in TrainChat",
          content: "TrainChat's adaptive programming is conversational. You tell it what changed, and it executes the appropriate modification in your live program — immediately, with full documentation. The system applies exercise science constraints to every adaptation decision, ensuring changes are principled rather than arbitrary.",
        },
      ],
    },
    faqs: [
      { q: "What is adaptive programming?", a: "Adaptive programming is a training methodology where the workout plan continuously evolves based on your feedback, performance data, and shifting goals — rather than remaining fixed from its initial build." },
      { q: "How is adaptive programming different from a static plan?", a: "A static plan is built once and delivered. Adaptive programming treats the plan as a living document that responds to new information: session difficulty, injury signals, goal changes, and performance data." },
      { q: "Does adaptive programming require a coach?", a: "Not with TrainChat. The coaching intelligence layer handles adaptive decisions automatically through conversational input. You describe what changed; the system applies the appropriate programming response." },
      { q: "What triggers an adaptation in TrainChat?", a: "Any natural language input that describes a change in your training situation — soreness, difficulty level, goal shifts, schedule changes, or explicit requests to modify the program." },
    ],
  },
  {
    slug: "coaching-intelligence",
    title: "Coaching Intelligence",
    shortDefinition: "The AI layer that applies exercise science principles to training decisions — not just exercise matching, but load management, periodization logic, movement balance, and recovery reasoning.",
    metaDescription: "Coaching intelligence is the AI layer in TrainChat that applies exercise science principles to every programming decision. Learn what separates coaching intelligence from basic AI workout generation.",
    category: "AI Architecture",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "intelligent-periodization", label: "Intelligent Periodization" },
      { slug: "conversational-training", label: "Conversational Training" },
    ],
    body: {
      directAnswer: "Coaching intelligence is the AI layer that applies exercise science principles to training decisions — not just matching exercises to categories, but reasoning about load management, periodization structure, movement balance, recovery capacity, and the full context of an athlete's training history.",
      sections: [
        {
          heading: "What Separates Coaching Intelligence from AI Workout Generation",
          content: "AI workout generators match inputs to templates. They understand exercise names, muscle groups, and rep ranges. Coaching intelligence understands training. The difference is the depth of reasoning applied to each decision.",
          bullets: [
            "A workout generator selects exercises that match your equipment and preferences",
            "Coaching intelligence selects exercises that fit your current phase, address your weaknesses, balance your weekly movement patterns, and account for your recovery state",
            "A workout generator swaps exercises when you report an injury",
            "Coaching intelligence manages load across the entire program to accommodate the injury without losing adaptation in other areas",
          ],
        },
        {
          heading: "The Exercise Science Foundation",
          content: "TrainChat's coaching intelligence is built on the principles that govern professional strength and conditioning practice: progressive overload, specificity, periodization, fatigue management, and individual variation. These aren't approximated from fitness content — they're encoded from a decade of real coaching practice by TrainChat's founder.",
        },
        {
          heading: "How Coaching Intelligence Processes Input",
          content: "When you tell TrainChat 'I want more upper body work,' coaching intelligence doesn't simply add push exercises. It evaluates your current push-to-pull ratio, your weekly volume by movement pattern, where you are in your training phase, your shoulder's recovery history, and what adding volume in that pattern means for Thursday's session. Then it executes the change that best serves the training goal within those constraints.",
        },
        {
          heading: "Why This Matters for Long-Term Progress",
          content: "Consistent progress over months and years requires decisions that account for more than the current session. Coaching intelligence maintains the full context of your training and applies principled reasoning to every decision — which is why athletes who use TrainChat see continuous development rather than the plateaus and stagnation common with static-plan tools.",
        },
      ],
    },
    faqs: [
      { q: "What is coaching intelligence in AI?", a: "Coaching intelligence is an AI layer that applies exercise science principles to training decisions — reasoning about load management, periodization, movement balance, and recovery, rather than simply generating exercises that match keywords or muscle groups." },
      { q: "How does TrainChat's coaching intelligence work?", a: "TrainChat's coaching intelligence processes your input against your full training history and current program state, applies exercise science constraints, and executes programming decisions that are principled, documented, and immediately visible in the live program panel." },
      { q: "Is coaching intelligence different from a regular AI model?", a: "Yes. A general AI model approximates fitness knowledge from training data. TrainChat's coaching intelligence encodes specific exercise science principles from real coaching practice — making it reliable for the nuanced decisions that training requires." },
    ],
  },
  {
    slug: "training-memory",
    title: "Training Memory",
    shortDefinition: "The persistent retention and application of an athlete's full training history — goals, sessions, feedback, and program mutations — across all coaching interactions.",
    metaDescription: "Training memory is the persistent retention of your full athletic history across coaching sessions. Learn why it's essential for adaptive programming and what it enables that stateless AI tools cannot.",
    category: "System Architecture",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "coaching-intelligence", label: "Coaching Intelligence" },
      { slug: "living-training-system", label: "Living Training System" },
    ],
    body: {
      directAnswer: "Training memory is the persistent retention and active application of an athlete's full training history — including goals, completed sessions, feedback signals, program mutations, and coaching context — across all interactions with the AI coaching system.",
      sections: [
        {
          heading: "Why Training Memory Changes Everything",
          content: "Every good coach knows their athletes. They remember that you had a shoulder issue in March, that you respond well to high-frequency lower body work, that your last peaking block overreached and you needed two weeks to recover. This accumulated knowledge shapes every programming decision they make. Without it, every coaching interaction starts from zero. With it, each interaction builds on the last.",
        },
        {
          heading: "What Training Memory Enables",
          content: "With persistent training memory, TrainChat can:",
          bullets: [
            "Reference previous program blocks: 'Do something similar to week 3 of my last strength cycle'",
            "Recognize patterns: 'You've had three sessions where lower back fatigue cut the deadlift short'",
            "Apply historical constraints: 'Avoiding overhead pressing due to shoulder history in March'",
            "Track long-term progression: 'Your squat has increased 15% over the last 8 weeks'",
            "Resolve deictic references: 'Undo that last change' or 'Do the same for Day 2'",
          ],
        },
        {
          heading: "Training Memory vs Session Logging",
          content: "Traditional workout apps log data — sets, reps, weights. Training memory applies that data. The distinction is active vs passive. A log is a record. Training memory is a working model that influences every programming decision going forward.",
        },
        {
          heading: "How TrainChat Implements Training Memory",
          content: "TrainChat retains your full conversation history, program versions, mutation logs, and goal states. The context resolution layer translates references to past sessions and exercises into precise, actionable information that the coaching intelligence layer uses to make informed decisions.",
        },
      ],
    },
    faqs: [
      { q: "What is training memory in AI coaching?", a: "Training memory is the persistent retention and application of your full athletic history — goals, sessions, feedback, and program changes — across all AI coaching interactions. It enables coaching decisions to be informed by your complete training context." },
      { q: "Does TrainChat remember previous workouts?", a: "Yes. TrainChat maintains persistent training memory across all conversations. Your history, goals, feedback, and program mutations are retained indefinitely and used to inform every coaching decision." },
      { q: "Why does training memory matter for performance?", a: "Training memory enables the AI coaching system to make decisions informed by your complete history — recognizing patterns, avoiding repeated mistakes, building on what worked, and maintaining continuity across training phases. This is what human coaches do; training memory gives AI the same capability." },
    ],
  },
  {
    slug: "workout-mutation",
    title: "Workout Mutation",
    shortDefinition: "The real-time modification of specific elements within an active training program — exercises, sets, reps, load, or session structure — without rebuilding the entire plan.",
    metaDescription: "Workout mutation is the real-time modification of specific training program elements through conversational input — without manual editing or rebuilding the plan. Learn how TrainChat implements it.",
    category: "Training Methodology",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "conversational-training", label: "Conversational Training" },
      { slug: "training-memory", label: "Training Memory" },
    ],
    body: {
      directAnswer: "Workout mutation is the real-time modification of specific elements within an active training program — individual exercises, sets, reps, load prescriptions, or session structure — executed through conversational input without requiring a full program rebuild.",
      sections: [
        {
          heading: "The Precision of Targeted Mutation",
          content: "The term 'mutation' is intentional. It describes surgical modification of a specific program element — not wholesale replacement. When you tell TrainChat 'swap barbell squats for goblet squats this week,' it modifies that one exercise while preserving the rest of the program's structure, volume, and intent.",
        },
        {
          heading: "Types of Workout Mutations",
          content: "TrainChat's mutation system handles all standard training modifications:",
          bullets: [
            "Exercise substitution: Replace a specific movement with an alternative that maintains training intent",
            "Volume adjustment: Add or remove sets on a specific movement pattern",
            "Intensity modification: Adjust load targets, RPE prescriptions, or percentage-based work",
            "Session restructuring: Reorder, combine, or split sessions within the training week",
            "Block-level changes: Extend, compress, or restructure multi-week training phases",
            "Focus shifts: Change the primary training lane (strength → conditioning) with program-level restructuring",
          ],
        },
        {
          heading: "Mutation vs Rebuild",
          content: "Mutation is not the same as rebuilding. A rebuild generates a new program from scratch. A mutation modifies the existing program precisely. TrainChat's coaching intelligence distinguishes between requests that warrant a mutation (most modifications) and those that genuinely require a rebuild (complete goal change, major injury requiring full restructuring) — and handles each appropriately.",
        },
        {
          heading: "The Mutation History",
          content: "Every mutation is logged in the Changes tab of the Live Program Panel — with a timestamp, description of what changed, and the reasoning. This creates a complete audit trail of how your program has evolved, which informs future coaching decisions and allows you to review or revert any change.",
        },
      ],
    },
    faqs: [
      { q: "What is workout mutation?", a: "Workout mutation is the real-time modification of specific elements within an active training program — such as swapping an exercise, adjusting sets, or changing load prescriptions — through conversational input, without rebuilding the entire plan." },
      { q: "Can TrainChat mutate one exercise without changing the whole program?", a: "Yes. TrainChat's mutation system operates at the individual element level. You can change a single exercise, one session's volume, or a specific load target while keeping everything else in the program intact." },
      { q: "Is there a record of workout mutations?", a: "Yes. Every mutation is logged in the Changes tab of the Live Program Panel with a timestamp and description. You can review the full evolution of your program and reference or revert any change through conversation." },
    ],
  },
  {
    slug: "conversational-training",
    title: "Conversational Training",
    shortDefinition: "The interaction model where athletic programs are built, directed, and evolved through natural language conversation — replacing rigid forms, logging interfaces, and manual plan editing.",
    metaDescription: "Conversational training is the interaction model where athletic programming happens through natural language. Learn how it works, why it's more effective than traditional interfaces, and what it enables.",
    category: "Interaction Model",
    relatedConcepts: [
      { slug: "coaching-intelligence", label: "Coaching Intelligence" },
      { slug: "workout-mutation", label: "Workout Mutation" },
      { slug: "training-memory", label: "Training Memory" },
    ],
    body: {
      directAnswer: "Conversational training is the interaction model where athletic programs are built, directed, and evolved through natural language conversation — replacing rigid logging forms, manual plan editors, and static configuration interfaces with open-ended dialogue.",
      sections: [
        {
          heading: "The Interface Is Not the Product",
          content: "A critical distinction in conversational training: the conversation is the interface to a programming system — not the product itself. You're not chatting with an AI about fitness. You're operating a live training system through conversational commands. The coaching intelligence, live program panel, mutation history, and memory layer are all behind the conversation.",
        },
        {
          heading: "Why Natural Language Works Better",
          content: "Training feedback is inherently linguistic. 'My hip flexors are tight, skip hip hinge work' contains more useful coaching information than any rating scale could capture. 'I want something more athletic' is a real intent that traditional selection interfaces can't process. Conversational training handles the full spectrum of human performance feedback — ambiguous, emotional, colloquial, and precise — and translates it into programming actions.",
        },
        {
          heading: "Conversational Training vs AI Chatbots",
          content: "Fitness chatbots answer questions. Conversational training systems take action. The distinction is architectural: a chatbot generates text in response to questions; a conversational training system interprets language and executes mutations in a live program. The conversation has consequences that persist after the conversation ends.",
        },
        {
          heading: "Context Resolution in Conversational Training",
          content: "Human conversation relies heavily on context. 'Do the same for Tuesday' or 'undo that' only make sense if the system knows what happened before. TrainChat's context resolution layer tracks exercise, session, and mutation references across conversation turns — resolving these deictic references against your program state before execution.",
        },
      ],
    },
    faqs: [
      { q: "What is conversational training?", a: "Conversational training is the interaction model where athletic programs are built, directed, and evolved through natural language conversation — replacing forms, logging interfaces, and manual plan editors." },
      { q: "Can I just type normally to TrainChat, or do I need to use specific commands?", a: "You type naturally. 'My back is sore, skip deadlifts today,' 'Add conditioning on Saturdays,' 'I want to focus more on explosiveness' — all valid inputs. The system handles natural language without requiring specific formatting or commands." },
      { q: "How does conversational training handle ambiguous requests?", a: "When a request is genuinely ambiguous — multiple plausible interpretations with meaningfully different outcomes — TrainChat asks a clarifying question. For most requests, context and training history are sufficient for the system to proceed without interruption." },
    ],
  },
  {
    slug: "dynamic-progression",
    title: "Dynamic Progression",
    shortDefinition: "The continuous, AI-driven advancement of training load, complexity, and specificity in response to demonstrated adaptation — rather than following a fixed, pre-scheduled progression scheme.",
    metaDescription: "Dynamic progression is the continuous, AI-driven advancement of training load and complexity based on actual performance data — rather than a fixed schedule. Learn how it works and why it outperforms linear periodization.",
    category: "Training Methodology",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "intelligent-periodization", label: "Intelligent Periodization" },
      { slug: "performance-adaptation", label: "Performance Adaptation" },
    ],
    body: {
      directAnswer: "Dynamic progression is the continuous, AI-driven advancement of training load, complexity, and specificity in direct response to demonstrated performance adaptation — rather than following a fixed pre-scheduled progression that assumes progress at a predetermined rate.",
      sections: [
        {
          heading: "The Problem with Fixed Progression Models",
          content: "Traditional periodization assumes progression at a planned rate: add 5 lbs per week, move to the next phase after 4 weeks, deload every 6th week. These schedules work as population averages but fail at the individual level. Some athletes adapt faster. Others need more time. A fixed schedule either holds fast adapters back or pushes slow adapters into overreaching.",
        },
        {
          heading: "How Dynamic Progression Works",
          content: "Dynamic progression uses your actual performance signals to determine when and how to advance:",
          bullets: [
            "Consistently completing sessions above prescribed targets → advance the load prescription",
            "Repeated difficulty completing prescribed work → maintain or reduce before progressing",
            "Plateaus in performance across multiple sessions → alter the training variable (frequency, exercise selection, intensity distribution)",
            "Recovery markers indicating accumulated fatigue → insert deload before planned schedule",
            "Goal shift mid-program → restructure progression toward new target metrics",
          ],
        },
        {
          heading: "Dynamic vs Linear Progression",
          content: "Linear progression adds the same increment every session or week on a fixed schedule. Dynamic progression responds to what's actually happening: advancing when adaptation is confirmed, moderating when recovery is insufficient, and restructuring when the current trajectory won't reach the stated goal. Linear progression is simpler to administer. Dynamic progression produces better outcomes over the long term.",
        },
        {
          heading: "Dynamic Progression in TrainChat",
          content: "TrainChat implements dynamic progression through its adaptive programming system. Your performance feedback — communicated through conversation — feeds the coaching intelligence layer, which evaluates your current progression curve and makes load and volume adjustments accordingly. You don't manage the progression manually; the system tracks it and adapts.",
        },
      ],
    },
    faqs: [
      { q: "What is dynamic progression in training?", a: "Dynamic progression is the continuous advancement of training load and complexity based on actual performance data — rather than a fixed schedule. It advances when adaptation is confirmed and moderates when recovery is insufficient." },
      { q: "How does dynamic progression differ from linear periodization?", a: "Linear periodization follows a fixed schedule regardless of actual performance. Dynamic progression responds to real feedback — advancing when you demonstrate readiness, moderating when you don't, and restructuring when your trajectory doesn't align with your goals." },
      { q: "Does TrainChat automatically adjust my progression?", a: "Yes. As you report session feedback through conversation, TrainChat's coaching intelligence evaluates your progression curve and makes appropriate adjustments — you don't need to manage load calculations manually." },
    ],
  },
  {
    slug: "performance-adaptation",
    title: "Performance Adaptation",
    shortDefinition: "The process by which the body responds to systematic training stimuli — and the AI coaching principle of designing programs that optimize this response over time.",
    metaDescription: "Performance adaptation is the biological process of responding to training stimuli, and the coaching principle of designing programs that optimize this response. Learn how AI coaching accelerates adaptation.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "dynamic-progression", label: "Dynamic Progression" },
      { slug: "intelligent-periodization", label: "Intelligent Periodization" },
    ],
    body: {
      directAnswer: "Performance adaptation refers to the systematic physiological and neurological changes that occur in response to structured training stimuli — and, from an AI coaching perspective, the design of programs that consistently optimize these responses over time.",
      sections: [
        {
          heading: "The Biology of Adaptation",
          content: "Adaptation is the body's response to stress. Apply a training stimulus that challenges current capacity, allow sufficient recovery, and the body rebuilds with enhanced capability. This is the fundamental mechanism behind all training progress — whether the goal is strength, power, endurance, or hypertrophy.",
        },
        {
          heading: "The Adaptation Window",
          content: "Adaptation requires the right stimulus at the right time: enough stress to trigger a response, but not so much that recovery is compromised. Programming that consistently hits this window produces continuous improvement. Programming that misses it — by under-stimulating or over-stimulating — produces stagnation or injury. The coaching intelligence layer in TrainChat manages this window dynamically.",
        },
        {
          heading: "How AI Coaching Optimizes Adaptation",
          content: "Adaptive programming, training memory, and dynamic progression all serve one goal: maximizing the consistency of appropriate adaptation stimulus. By adjusting load, volume, and exercise selection in response to real feedback, TrainChat keeps your training in the optimal range for adaptation — adjusting when signals indicate the stimulus is too easy, too hard, or poorly targeted.",
        },
        {
          heading: "Adaptation vs Performance",
          content: "Adaptation is the process; performance is the outcome. You adapt in training sessions. You express performance in competition or testing. Intelligent programming manages the relationship between the two — ensuring training is stressful enough to drive adaptation without compromising the recovery needed to express performance when it counts.",
        },
      ],
    },
    faqs: [
      { q: "What is performance adaptation in training?", a: "Performance adaptation is the physiological response to systematic training stimuli — the process by which your body develops increased capacity in response to structured stress. It's the biological mechanism behind all training progress." },
      { q: "How does AI coaching optimize performance adaptation?", a: "AI coaching optimizes adaptation by dynamically adjusting training load, volume, and exercise selection based on your performance feedback — keeping the stimulus in the range that drives adaptation without compromising recovery." },
      { q: "Can AI coaching accelerate adaptation?", a: "AI coaching doesn't accelerate the biological process of adaptation — that's fixed by physiology. It accelerates progress by ensuring training consistently applies the right stimulus and doesn't waste sessions with inappropriate load, poor exercise selection, or insufficient recovery management." },
    ],
  },
  {
    slug: "intelligent-periodization",
    title: "Intelligent Periodization",
    shortDefinition: "AI-driven organization of training phases that applies periodization principles while dynamically adjusting timelines, intensities, and phase transitions based on actual athlete performance.",
    metaDescription: "Intelligent periodization applies classical periodization theory through AI — automatically structuring training phases, managing phase transitions, and adjusting timelines based on actual performance data.",
    category: "Training Methodology",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "dynamic-progression", label: "Dynamic Progression" },
      { slug: "coaching-intelligence", label: "Coaching Intelligence" },
    ],
    body: {
      directAnswer: "Intelligent periodization is the AI-driven application of periodization theory — automatically structuring training into organized phases, managing volume and intensity waves, and dynamically adjusting phase timelines and transitions based on actual athlete performance and feedback.",
      sections: [
        {
          heading: "Classical Periodization, Briefly",
          content: "Periodization is the systematic organization of training into distinct phases — accumulation, intensification, realization, recovery — each with a specific purpose in the development cycle. It manages fatigue over time, builds capacity progressively, and times peak performance for competition or testing. It's the structural framework behind most professional athletic programming.",
        },
        {
          heading: "Where Classical Periodization Breaks Down",
          content: "Traditional periodization models are rigid. Phase durations are predetermined. Transitions are scheduled. Deloads happen on a calendar, not in response to fatigue. When athletes deviate from plan — through illness, travel, unexpected PRs, or injury — the fixed structure provides no guidance. Coaches adapt manually. Athletes following self-directed programs simply fall off.",
        },
        {
          heading: "What Makes Periodization 'Intelligent'",
          content: "Intelligent periodization applies the structural principles of periodization while using real performance data to manage phase transitions:",
          bullets: [
            "Phase durations adjust based on adaptation rate — athletes who respond quickly don't wait out unnecessary accumulation periods",
            "Deload insertion responds to fatigue signals, not calendar dates",
            "Peak timing adjusts if competition or testing dates shift",
            "Volume and intensity prescriptions within phases update based on session-by-session feedback",
            "Phase goals are re-evaluated if circumstances or priorities change mid-block",
          ],
        },
        {
          heading: "Intelligent Periodization in TrainChat",
          content: "When you build a training system in TrainChat, the program is structured with periodization architecture appropriate to your goal and timeline. As you train and report feedback, the coaching intelligence layer manages phase transitions and within-phase adjustments dynamically. You get the structural discipline of periodization with the responsiveness of adaptive programming.",
        },
      ],
    },
    faqs: [
      { q: "What is intelligent periodization?", a: "Intelligent periodization is AI-driven application of periodization principles — organizing training into structured phases while dynamically adjusting phase timelines, volume, intensity, and transitions based on actual performance data rather than a fixed calendar." },
      { q: "Does TrainChat use periodization in its programming?", a: "Yes. TrainChat structures programs with periodization architecture appropriate to your goal and timeline, then manages phase transitions and adjustments dynamically through the coaching intelligence layer." },
      { q: "Is periodization necessary for recreational athletes?", a: "The principles of periodization — managing fatigue, building capacity progressively, recovering before testing performance — benefit athletes at all levels. The implementation scales: recreational athletes don't need the complexity of advanced periodization models, but they benefit from a structured progression with built-in recovery management." },
    ],
  },
  {
    slug: "living-training-system",
    title: "Living Training System",
    shortDefinition: "An adaptive, continuously evolving athletic program that responds to feedback, maintains full history, and persists indefinitely — as opposed to a static plan with a fixed endpoint.",
    metaDescription: "A living training system is an adaptive, continuously evolving athletic program that persists and responds over time. Learn what defines a living training system and how TrainChat implements it.",
    category: "System Architecture",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "training-memory", label: "Training Memory" },
      { slug: "coaching-intelligence", label: "Coaching Intelligence" },
    ],
    body: {
      directAnswer: "A living training system is an adaptive, continuously evolving athletic program that maintains persistent memory, responds to feedback through real-time mutation, and persists indefinitely — as opposed to a static plan with a fixed duration and no capacity for self-correction.",
      sections: [
        {
          heading: "The Defining Properties of a Living System",
          content: "A training system qualifies as 'living' when it possesses three properties simultaneously:",
          bullets: [
            "Persistence: It exists beyond individual sessions and retains full history",
            "Adaptability: It changes in response to new information without requiring a rebuild",
            "Continuity: It maintains coherent context across all interactions — what happened previously informs what happens next",
          ],
        },
        {
          heading: "Living System vs Training Plan",
          content: "A training plan is a document. It's authored, delivered, and then followed or abandoned. It doesn't know what happened last Tuesday. It doesn't respond when you tell it you're fatigued. It doesn't restructure itself when your goals change. A living training system does all three.",
        },
        {
          heading: "The Architecture of TrainChat's Living System",
          content: "TrainChat's living training system is maintained through four integrated components: the coaching intelligence layer (decision-making), the training memory (historical context), the mutation system (real-time modification), and the live program panel (current state visibility). These components work together to keep the program accurate, current, and responsive at all times.",
        },
        {
          heading: "Why Athletes Need a Living System",
          content: "Training is a long-term endeavor that plays out across years, not weeks. The athletes who make consistent progress are those whose programming stays aligned with their actual capacity, goals, and life circumstances over that full duration. A living training system is the structural solution to that challenge — a persistent coaching relationship that maintains alignment indefinitely.",
        },
      ],
    },
    faqs: [
      { q: "What is a living training system?", a: "A living training system is an adaptive, continuously evolving athletic program that maintains persistent memory, responds to feedback in real time, and persists indefinitely — as opposed to a static plan with a fixed duration and no adaptive capacity." },
      { q: "What makes a training system 'living'?", a: "Three properties: persistence (it retains full history), adaptability (it changes in response to new information), and continuity (context from previous interactions informs future decisions)." },
      { q: "Is TrainChat a living training system?", a: "Yes. TrainChat is designed from the ground up as a living training system — with persistent training memory, real-time workout mutation, coaching intelligence, and a live program panel that reflects the current state of your program at all times." },
    ],
  },
];

export const conceptsBySlug = Object.fromEntries(concepts.map((c) => [c.slug, c]));

export const conceptsIndex: { slug: string; title: string; shortDefinition: string; category: string }[] = concepts.map(
  ({ slug, title, shortDefinition, category }) => ({ slug, title, shortDefinition, category })
);
