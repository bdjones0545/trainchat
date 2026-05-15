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
  {
    slug: "motor-learning",
    title: "Motor Learning",
    shortDefinition: "The process by which the nervous system acquires, refines, and automates movement skills through structured practice — and why programming must account for skill stage, not just load.",
    metaDescription: "Motor learning is the process by which movement skills are acquired and automated. Learn how motor learning principles shape exercise selection, progression, and programming decisions in AI coaching.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "performance-adaptation", label: "Performance Adaptation" },
      { slug: "coaching-intelligence", label: "Coaching Intelligence" },
      { slug: "intelligent-periodization", label: "Intelligent Periodization" },
    ],
    body: {
      directAnswer: "Motor learning is the process by which the nervous system acquires, refines, and automates movement skills through practice. In athletic programming, it explains why exercise selection and progression must account for skill acquisition stage — not just physiological load capacity.",
      sections: [
        {
          heading: "The Three Stages of Motor Learning",
          content: "Fitts and Posner's classic model describes motor learning as a three-stage progression:",
          bullets: [
            "Cognitive stage: Movement is effortful, conscious, and error-prone. High variability between repetitions. This is where beginners live for most exercises.",
            "Associative stage: Movement becomes more consistent. Errors are detected and corrected. Practice is still deliberate but less exhausting.",
            "Autonomous stage: Movement is automatic and efficient. Cognitive attention is freed for strategic decisions. Performance under fatigue and stress improves dramatically."
          ],
        },
        {
          heading: "Why Motor Learning Matters for Programming",
          content: "Beginner athletes are in the cognitive stage for most movements simultaneously — every new exercise is a skill acquisition challenge layered on top of a physical stress. Loading a movement a beginner hasn't yet automated adds injury risk and limits the training stimulus (because form breakdown limits load). Experienced athletes who have automated their primary movement patterns can absorb much higher loads because the neural efficiency is already established.",
        },
        {
          heading: "Practice Variability and Skill Acquisition",
          content: "Research on contextual interference shows that variable practice — performing multiple skills in an interleaved sequence — produces slower initial acquisition but superior long-term retention and transfer compared to blocked practice (one skill at a time). For athletic populations, this means some programming variability is beneficial for long-term movement development, even if it slows early gains.",
        },
        {
          heading: "Motor Learning in TrainChat's Coaching Intelligence",
          content: "TrainChat's coaching intelligence adjusts exercise complexity recommendations based on training history signals. Movement patterns are introduced progressively — simpler variations first, with complexity added as mastery is demonstrated. For experienced athletes, the system maintains the primary movement patterns that have been automated while adding variation to drive continued adaptation.",
        },
      ],
    },
    faqs: [
      { q: "What is motor learning in fitness?", a: "Motor learning is the process by which the nervous system acquires and automates movement skills through practice. It explains why exercises need to be learned before they can be effectively loaded — and why programming must account for skill acquisition stage, not just physical capacity." },
      { q: "How does motor learning affect exercise programming?", a: "Beginners are in the cognitive stage for most movements — exercises are effortful, inconsistent, and require conscious attention. This affects how much load is appropriate, which exercises to select, and how quickly to progress. Advanced athletes with automated movement patterns can absorb much higher loads and more training stress." },
      { q: "Does TrainChat account for motor learning stages?", a: "Yes. TrainChat's exercise selection and progression logic considers training history — more experienced athletes get more complex movement progressions, while beginners build on simpler patterns before advancing. The coaching intelligence layer avoids overloading movements that haven't been adequately learned." }
    ],
  },
  {
    slug: "cns-load-management",
    title: "CNS Load Management",
    shortDefinition: "The programming practice of monitoring and managing the neural demand of training — recognizing that high-intensity, maximal-effort work taxes the central nervous system beyond what muscle soreness reveals.",
    metaDescription: "CNS load management is the practice of tracking and managing the neural demand of training across the week. Learn why CNS fatigue is invisible compared to muscle soreness and how it shapes intelligent programming.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "intelligent-periodization", label: "Intelligent Periodization" },
      { slug: "training-load-management", label: "Training Load Management" },
    ],
    body: {
      directAnswer: "CNS load management is the programming practice of monitoring and managing the neural demand of training — recognizing that heavy compound work, maximal efforts, and explosive training place central nervous system stress that does not correspond to muscle soreness and requires dedicated recovery time.",
      sections: [
        {
          heading: "Why CNS Fatigue Is Invisible",
          content: "Muscle soreness (DOMS) is a reliable indicator of local tissue stress. CNS fatigue is not visible in the same way — an athlete with significant neural fatigue can feel fine musculoskeletally while their neural drive, motor unit recruitment, and rate coding capacity are significantly compromised. This mismatch between perceived readiness and actual neural capacity is one of the most common causes of accumulated overreaching.",
        },
        {
          heading: "Which Training Creates the Highest CNS Demand",
          content: "Not all training stresses the CNS equally. High CNS demand movements include:",
          bullets: [
            "Maximal and near-maximal strength efforts (>90% 1RM)",
            "Explosive and ballistic work (Olympic lifts, jumps, throws)",
            "High-velocity resistance training",
            "Heavy compound movements (squat, deadlift, press) at high intensities",
            "Competition or testing events"
          ],
        },
        {
          heading: "Lower CNS Demand Training",
          content: "Hypertrophy-range work (moderate loads, higher reps), isolation exercises, slow-tempo movements, and aerobic conditioning place relatively lower neural demand. This is why intelligent programming alternates high and low CNS demand days — preserving neural recovery without sacrificing training volume.",
        },
        {
          heading: "CNS Load Management in TrainChat",
          content: "TrainChat's coaching intelligence spaces high-CNS demand sessions across the week, avoids consecutive days of maximal neural effort, and reads fatigue signals to identify accumulated CNS stress before it becomes overreaching. When you report that performance is dropping on movements you've been executing well, that signal is evaluated in the context of CNS load distribution — not just total volume.",
        },
      ],
    },
    faqs: [
      { q: "What is CNS fatigue in training?", a: "CNS fatigue is the accumulation of stress in the central nervous system from high-intensity, maximal-effort, and explosive training. Unlike muscle soreness, CNS fatigue is not easily felt — athletes can feel physically fresh while neural capacity is significantly compromised." },
      { q: "How does CNS fatigue affect performance?", a: "CNS fatigue reduces neural drive, motor unit recruitment, and rate coding capacity — meaning the muscles can't be activated as effectively even when they've recovered locally. This shows up as unexpected performance drops, reduced explosiveness, and difficulty reaching effort levels that were recently manageable." },
      { q: "How does TrainChat manage CNS load?", a: "TrainChat's coaching intelligence spaces high-demand sessions, avoids consecutive maximal effort days, and watches for feedback signals that indicate accumulated neural fatigue. When CNS stress appears elevated, the system adjusts load and intensity to allow neural recovery before the next high-demand session." }
    ],
  },
  {
    slug: "training-load-management",
    title: "Training Load Management",
    shortDefinition: "The systematic monitoring and management of training stress over time — balancing sufficient stimulus for adaptation against the accumulation of fatigue that increases injury risk and degrades performance.",
    metaDescription: "Training load management is the systematic balancing of training stimulus against fatigue accumulation. Learn the acute:chronic workload ratio, injury risk implications, and how AI coaching applies load management principles.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "dynamic-progression", label: "Dynamic Progression" },
      { slug: "cns-load-management", label: "CNS Load Management" },
    ],
    body: {
      directAnswer: "Training load management is the systematic monitoring and control of training stress over time — ensuring sufficient stimulus for adaptation while preventing the accumulation of fatigue that elevates injury risk and degrades performance. It operates through tracking both acute (recent) and chronic (established) load to manage the relationship between them.",
      sections: [
        {
          heading: "The Acute:Chronic Workload Ratio",
          content: "The acute:chronic workload ratio (ACWR) — developed by Tim Gabbett and colleagues — compares recent training load (typically 1-week average) to established load capacity (typically 4-week average). Research shows that spikes in the acute:chronic ratio — sudden increases in load relative to established baseline — are associated with elevated injury incidence. The 'danger zone' for many populations is an ACWR above 1.5.",
        },
        {
          heading: "The Training-Injury Prevention Paradox",
          content: "Gabbett's research identified an important counterintuitive finding: high chronic training loads are actually protective against injury, while rapid acute load spikes are the primary risk factor. This means the solution to injury prevention is not reducing load — it's building chronic load capacity gradually so that the same absolute load represents a lower relative spike.",
        },
        {
          heading: "Components of Training Load",
          content: "Training load is multidimensional — it includes:",
          bullets: [
            "Volume: total sets, reps, distance, or time",
            "Intensity: load relative to maximum capacity (% 1RM, RPE, % VO2max)",
            "Frequency: sessions per week, recovery time between sessions",
            "Density: work-to-rest ratios within sessions",
            "Complexity: neural demand, technical difficulty, movement novelty"
          ],
        },
        {
          heading: "Training Load Management in TrainChat",
          content: "TrainChat's coaching intelligence monitors load across all dimensions and flags hazardous load spikes before executing them. When a requested change would create an acute:chronic ratio spike — more volume than the training history supports — the system stages the progression to stay within safe load-increase thresholds. Rapid jumps that look reasonable in isolation are evaluated against established training history.",
        },
      ],
    },
    faqs: [
      { q: "What is training load management?", a: "Training load management is the systematic monitoring and control of training stress over time — balancing sufficient stimulus for adaptation against the fatigue accumulation that increases injury risk. It uses metrics like the acute:chronic workload ratio to guide load progression decisions." },
      { q: "What is the acute:chronic workload ratio?", a: "The acute:chronic workload ratio compares recent training load (typically 1-week average) to established load capacity (typically 4-week rolling average). Ratios above 1.5 — meaning recent load is 50% higher than the established baseline — are associated with elevated injury risk across multiple sports." },
      { q: "Does TrainChat use load management principles?", a: "Yes. TrainChat's coaching intelligence evaluates load changes against training history before executing them. Requests that would create hazardous acute load spikes are staged — implementing the change progressively rather than immediately — to stay within safe progression thresholds." }
    ],
  },
  {
    slug: "supercompensation",
    title: "Supercompensation",
    shortDefinition: "The physiological process by which the body rebuilds to a higher level of capacity after a training stimulus — and the programming principle of timing the next stimulus to coincide with this elevated state.",
    metaDescription: "Supercompensation is the process by which the body rebuilds to a higher capacity after training. Learn how this principle underlies all training progress and how adaptive programming optimizes supercompensation timing.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "performance-adaptation", label: "Performance Adaptation" },
      { slug: "dynamic-progression", label: "Dynamic Progression" },
      { slug: "intelligent-periodization", label: "Intelligent Periodization" },
    ],
    body: {
      directAnswer: "Supercompensation is the physiological process by which the body rebuilds to a higher level of capacity following a training stimulus and adequate recovery — and the programming principle of timing the next training stimulus to coincide with this elevated state rather than applying it during fatigue or after the supercompensation window has closed.",
      sections: [
        {
          heading: "The Supercompensation Cycle",
          content: "The supercompensation cycle has four phases that follow every training stimulus:",
          bullets: [
            "Fatigue phase: Immediately after training, performance capacity is reduced. Recovery resources are being allocated.",
            "Recovery phase: The body repairs damaged tissue and replenishes depleted energy stores, returning to baseline.",
            "Supercompensation phase: The body overshoots baseline — rebuilding to a higher capacity than existed before the stimulus.",
            "Involution: If no new stimulus arrives, the elevated capacity returns to baseline over time."
          ],
        },
        {
          heading: "The Timing Problem",
          content: "Supercompensation makes training timing critical. Apply the next stimulus during the fatigue phase (too early), and you accumulate fatigue without capturing the adaptation benefit. Wait too long and the supercompensation window closes — you return to baseline and the stimulus's benefit is lost. The goal of periodization is to time successive stimuli to land during the supercompensation window.",
        },
        {
          heading: "Why Supercompensation Timing Is Individual",
          content: "The duration of each supercompensation phase varies between individuals — influenced by training status, recovery quality, nutrition, sleep, and age. A 22-year-old athlete with high recovery capacity may supercompensate in 48 hours. A 40-year-old masters athlete may need 72–96 hours for the same stimulus. Fixed programming schedules don't account for this variation; adaptive programming does.",
        },
        {
          heading: "Supercompensation in TrainChat",
          content: "TrainChat's dynamic progression and adaptive session scheduling attempt to align stimulus timing with individual supercompensation patterns. When feedback signals indicate that sessions are arriving during the fatigue phase (accumulating soreness, dropping performance), the system adjusts session spacing. When performance is consistently plateaued without fatigue signals, stimulus timing may be too conservative — and the program advances.",
        },
      ],
    },
    faqs: [
      { q: "What is supercompensation?", a: "Supercompensation is the physiological process where the body rebuilds to a higher capacity after a training stimulus and adequate recovery — temporarily exceeding the pre-training baseline. This elevated state is the target for the next training stimulus to drive continued adaptation." },
      { q: "Why does supercompensation timing matter for training?", a: "If the next training stimulus arrives too early (during fatigue) or too late (after the supercompensation window closes), the adaptation benefit is reduced or lost. Effective programming times successive stimuli to land during the supercompensation window — which varies by individual." },
      { q: "How does TrainChat optimize supercompensation?", a: "TrainChat monitors feedback signals — performance trends, reported fatigue, session difficulty — to identify whether stimulus timing is landing in the supercompensation window. Session spacing and load progression adjust based on these signals rather than a fixed calendar assumption about recovery duration." }
    ],
  },
  {
    slug: "said-principle",
    title: "SAID Principle",
    shortDefinition: "Specific Adaptation to Imposed Demands — the foundational training principle that the body adapts specifically to the demands placed upon it, making specificity of training a non-negotiable programming constraint.",
    metaDescription: "The SAID principle (Specific Adaptation to Imposed Demands) is the foundational principle that training adaptations are specific to the stress applied. Learn what SAID means and why it governs every programming decision.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "performance-adaptation", label: "Performance Adaptation" },
      { slug: "adaptive-programming", label: "Adaptive Programming" },
      { slug: "coaching-intelligence", label: "Coaching Intelligence" },
    ],
    body: {
      directAnswer: "The SAID Principle — Specific Adaptation to Imposed Demands — states that the body adapts specifically to the demands placed upon it. Training for strength produces strength adaptations. Training for power produces power adaptations. This specificity principle makes goal-aligned exercise selection a non-negotiable programming constraint, not a preference.",
      sections: [
        {
          heading: "What SAID Means in Practice",
          content: "SAID has direct implications for every programming decision:",
          bullets: [
            "Strength development requires training with heavy loads that stress the neuromuscular system at high force outputs",
            "Power development requires training with high-velocity movements that stress rate of force development",
            "Hypertrophy requires training with sufficient mechanical tension and metabolic stress in the target muscle groups",
            "Endurance requires sustained aerobic stress that forces cardiovascular and metabolic adaptation",
            "Skill transfer requires practicing movements that match the target performance pattern — not just related movements"
          ],
        },
        {
          heading: "The Limits of Transfer",
          content: "SAID also implies that transfer between training modalities is limited and specific. General fitness training develops general fitness. Sport-specific training develops sport-specific capacity. Athletes who train exclusively in the gym and expect direct transfer to their sport performance are misapplying the principle — the adaptations are real, but they transfer only along specific dimensions that match the imposed demands.",
        },
        {
          heading: "SAID and Program Design",
          content: "SAID is the reason exercise selection matters as much as load progression. A program that applies progressive overload to exercises that don't match the training goal will produce real adaptations — just not the targeted ones. Matching the training demand to the adaptation target is the specificity problem that coaching intelligence must solve for each athlete.",
        },
        {
          heading: "SAID in TrainChat's Coaching Intelligence",
          content: "TrainChat's focus mode system implements SAID at the program architecture level. When you declare a training goal — strength, hypertrophy, athleticism, conditioning — the program's exercise selection, load prescriptions, and volume distribution are structured to impose the demands that produce the targeted adaptation. Goal shifts restructure the entire specificity architecture, not just individual exercises.",
        },
      ],
    },
    faqs: [
      { q: "What is the SAID principle?", a: "SAID stands for Specific Adaptation to Imposed Demands. It's the foundational training principle that the body adapts specifically to the demands placed upon it — strength training produces strength, power training produces power, endurance training produces endurance. This specificity principle governs exercise selection and program design." },
      { q: "How does the SAID principle affect exercise selection?", a: "SAID means exercises must be chosen to match the adaptation target — not just to 'work the muscle' in a general sense. A leg press develops quad strength differently than a barbell squat because the imposed demands are different. For sport-specific athletes, the demand-adaptation specificity must extend to the movement patterns and energy systems of the target performance." },
      { q: "Does TrainChat apply the SAID principle?", a: "Yes. TrainChat's focus mode system applies SAID at the program level — matching exercise selection, load prescriptions, and volume distribution to the adaptation target declared by the athlete. When goals change, the specificity architecture of the program changes accordingly." }
    ],
  },
  {
    slug: "progressive-overload",
    title: "Progressive Overload",
    shortDefinition: "The foundational training principle that the body must be subjected to increasing demands over time for adaptation to continue — the mechanism behind all training progress.",
    metaDescription: "Progressive overload is the foundational principle that increasing training demands over time drives continued adaptation. Learn what it is, how it works biologically, and how AI coaching applies it dynamically.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "dynamic-progression", label: "Dynamic Progression" },
      { slug: "performance-adaptation", label: "Performance Adaptation" },
      { slug: "intelligent-periodization", label: "Intelligent Periodization" },
    ],
    body: {
      directAnswer: "Progressive overload is the foundational training principle that for adaptation to continue, the training stimulus must periodically exceed what the body has previously accommodated to. Without progressive overload, the body has no physiological reason to develop greater capacity — it simply maintains what it already has.",
      sections: [
        {
          heading: "The Biology of Progressive Overload",
          content: "The body adapts specifically to the demands placed upon it (SAID principle) and only when those demands are sufficiently challenging. Once the body has adapted to a given stimulus, that same stimulus no longer drives further change — it becomes maintenance work. Progressive overload systematically increases the demand to stay ahead of adaptation, maintaining the physiological signal for continued development.",
        },
        {
          heading: "Methods of Progressive Overload",
          content: "Progressive overload does not mean adding weight every session indefinitely. Multiple training variables can be systematically increased:",
          bullets: [
            "Load: increasing the weight used for a given exercise",
            "Volume: adding sets, reps, or total training time",
            "Frequency: training a quality or movement pattern more often",
            "Density: performing the same work in less time",
            "Complexity: advancing to more demanding movement variations",
            "Specificity: narrowing the training to closer match the target performance demand"
          ],
        },
        {
          heading: "Why Fixed Overload Schemes Fail",
          content: "Linear progression — adding a fixed increment every session or week on schedule — works well for beginners because any systematic increase drives adaptation. As training age increases, recovery requirements grow longer and adaptation rate slows. Fixed weekly increases become increasingly inappropriate, either pushing too fast (overreaching) or too slow (holding back adaptive capacity). Individual variation in recovery rate makes the mismatch larger.",
        },
        {
          heading: "Progressive Overload in TrainChat",
          content: "TrainChat's dynamic progression system applies progressive overload in response to actual performance data rather than a fixed increment schedule. When you demonstrate adaptation — completing sessions above prescribed targets with appropriate effort — the system advances load or volume. When feedback indicates insufficient recovery, progression pauses or moderates. This keeps the overload stimulus meaningful without pushing beyond what adaptation can support.",
        },
      ],
    },
    faqs: [
      { q: "What is progressive overload?", a: "Progressive overload is the training principle that continued adaptation requires progressively increasing demands over time. Once the body has adapted to a given stimulus, that stimulus no longer drives further change. Systematic progression — in load, volume, frequency, or complexity — maintains the signal for continued development." },
      { q: "How does progressive overload work in practice?", a: "In practice, progressive overload means systematically increasing one or more training variables over time — adding weight, more sets, more sessions, or more complex movement variations. The key is that increases must be appropriate to the athlete's recovery capacity and current adaptation state." },
      { q: "Does TrainChat automate progressive overload?", a: "Yes. TrainChat's dynamic progression system advances load and volume when your performance data demonstrates readiness, and moderates when feedback signals insufficient recovery. Progression is driven by actual adaptation evidence rather than a fixed weekly increment." }
    ],
  },
  {
    slug: "fatigue-management",
    title: "Fatigue Management",
    shortDefinition: "The deliberate monitoring and control of accumulated training fatigue to prevent overreaching, protect performance, and optimize the adaptation window over extended training periods.",
    metaDescription: "Fatigue management is the deliberate control of training fatigue to prevent overreaching and protect long-term adaptation. Learn how intelligent programming monitors, manages, and resolves fatigue accumulation.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "cns-load-management", label: "CNS Load Management" },
      { slug: "training-load-management", label: "Training Load Management" },
      { slug: "intelligent-periodization", label: "Intelligent Periodization" },
    ],
    body: {
      directAnswer: "Fatigue management is the deliberate monitoring and control of accumulated training fatigue — the stress that accumulates across sessions, weeks, and blocks — to prevent overreaching, protect long-term performance capacity, and maintain the optimal adaptation window throughout extended training periods.",
      sections: [
        {
          heading: "Acute vs Chronic Fatigue",
          content: "Fatigue accumulates at two timescales that require different management strategies:",
          bullets: [
            "Acute fatigue: Accumulates within and immediately after sessions. Resolves within 24-72 hours with adequate recovery. Normal and expected — the physiological cost of training stress.",
            "Chronic fatigue: Accumulates across days and weeks when acute fatigue doesn't fully resolve between sessions. Manifests as declining performance, persistent soreness, motivation reduction, and increased injury risk. Requires deliberate deload or volume reduction to resolve."
          ],
        },
        {
          heading: "Overreaching vs Overtraining",
          content: "Overreaching is a temporary state of excessive fatigue — performance declines, but resolves within 1-4 weeks of reduced training. Functional overreaching (brief and deliberate) can actually enhance subsequent adaptation through supercompensation. Non-functional overreaching persists longer and degrades the adaptation response. Overtraining syndrome is a severe, prolonged state requiring months of recovery — rare in appropriately managed programs, but serious when it occurs.",
        },
        {
          heading: "Fatigue Management Strategies",
          content: "Effective fatigue management uses multiple levers:",
          bullets: [
            "Deload weeks: Planned periods of reduced volume and/or intensity to allow chronic fatigue to dissipate",
            "Session spacing: Adequate recovery time between high-demand sessions of the same muscle group or movement pattern",
            "Volume undulation: Varying weekly volume across the mesocycle, with lower-volume weeks providing recovery",
            "Priority sequencing: Highest-demand work early in the session when neural capacity is freshest",
            "Load regulation: Managing intensity alongside volume to avoid simultaneous spikes in both dimensions"
          ],
        },
        {
          heading: "Fatigue Management in TrainChat",
          content: "TrainChat's coaching intelligence monitors fatigue indicators — accumulated training load, session difficulty reports, performance trends — and responds proactively. When chronic fatigue signals appear (dropping performance across multiple sessions, elevated difficulty at normal loads), the system adjusts volume, inserts recovery sessions, or recommends a deload before the situation degrades into non-functional overreaching.",
        },
      ],
    },
    faqs: [
      { q: "What is fatigue management in training?", a: "Fatigue management is the deliberate monitoring and control of accumulated training stress across sessions and weeks — to prevent overreaching, maintain adaptation, and protect long-term performance. It involves deload timing, session spacing, volume control, and recognition of fatigue signals." },
      { q: "What is the difference between fatigue and overtraining?", a: "Fatigue is the normal accumulation of training stress that resolves with adequate recovery. Overreaching is excessive fatigue that requires 1-4 weeks to resolve. Overtraining syndrome is a severe, prolonged state requiring months of recovery — serious but rare in properly managed programs." },
      { q: "How does TrainChat manage fatigue?", a: "TrainChat monitors training load accumulation and session feedback signals to identify developing chronic fatigue before it becomes overreaching. The coaching intelligence adjusts volume, recommends deloads, and manages session intensity based on your reported state and performance trend data." }
    ],
  },
  {
    slug: "training-specificity",
    title: "Training Specificity",
    shortDefinition: "The programming principle that exercise selection, load parameters, and session structure must match the adaptation target — and that proximity of training conditions to performance conditions determines transfer.",
    metaDescription: "Training specificity is the principle that adaptations are specific to the training conditions. Learn how specificity governs exercise selection, programming structure, and the degree to which training transfers to performance.",
    category: "Exercise Science",
    relatedConcepts: [
      { slug: "said-principle", label: "SAID Principle" },
      { slug: "performance-adaptation", label: "Performance Adaptation" },
      { slug: "coaching-intelligence", label: "Coaching Intelligence" },
    ],
    body: {
      directAnswer: "Training specificity is the programming principle that adaptations are specific to the conditions under which training is performed — meaning exercise selection, load parameters, movement velocity, and energy system demands must match the adaptation target, and that proximity of training conditions to performance conditions determines the degree of transfer.",
      sections: [
        {
          heading: "Specificity Beyond the SAID Principle",
          content: "The SAID principle establishes that the body adapts to imposed demands. Training specificity extends this: the more closely training conditions match performance conditions, the greater the transfer. A powerlifter squatting with a barbell transfers more directly to their competition squat than a powerlifter using a leg press at the same load — because the movement pattern, muscle activation sequence, and neural demands more closely match.",
        },
        {
          heading: "Dimensions of Training Specificity",
          content: "Specificity operates across multiple dimensions simultaneously:",
          bullets: [
            "Movement pattern: How closely the training movement matches the target performance movement",
            "Load and velocity: High-load/low-velocity training for strength; low-load/high-velocity for power",
            "Energy system: Aerobic training for aerobic performance; anaerobic training for anaerobic demands",
            "Muscle activation: Joint angles and positions that activate muscles in their performance-relevant length-tension relationships",
            "Psychological: Training under conditions that match the pressure and focus demands of competition"
          ],
        },
        {
          heading: "The Specificity-Variation Trade-off",
          content: "Maximum specificity — training exclusively with competition movements at competition loads — is actually counterproductive over extended periods. General training (higher variation, less specific) builds broader physical qualities that support specific performance. Effective periodization cycles between more general preparation phases and increasingly specific phases as competition approaches. The balance between specificity and variation is one of the core decisions in program architecture.",
        },
        {
          heading: "Training Specificity in TrainChat",
          content: "TrainChat's focus mode system encodes specificity at the program architecture level. When you declare a training goal, the program is built around exercises, loads, and volumes that produce the targeted adaptation. As a competition or testing date approaches, the system can shift the program toward greater specificity — narrowing to the movements and intensities that most directly transfer to the stated performance target.",
        },
      ],
    },
    faqs: [
      { q: "What is training specificity?", a: "Training specificity is the principle that adaptations are specific to the conditions under which training is performed. Exercise selection, load, velocity, and movement pattern all determine what the body adapts to — and how much those adaptations transfer to the target performance." },
      { q: "How does training specificity differ from the SAID principle?", a: "The SAID principle says the body adapts to the demands placed upon it. Training specificity extends this by addressing the degree of transfer — the more closely training conditions match performance conditions across all dimensions (movement, load, velocity, energy system), the greater the carryover to target performance." },
      { q: "Does TrainChat account for training specificity?", a: "Yes. TrainChat's focus mode system aligns exercise selection, load parameters, and volume distribution with the stated training goal. As competition or testing dates approach, the coaching intelligence can shift programming toward greater specificity — favoring movements and intensities that transfer most directly to the performance target." }
    ],
  },
];

export const conceptsBySlug = Object.fromEntries(concepts.map((c) => [c.slug, c]));

export const conceptsIndex: { slug: string; title: string; shortDefinition: string; category: string }[] = concepts.map(
  ({ slug, title, shortDefinition, category }) => ({ slug, title, shortDefinition, category })
);
