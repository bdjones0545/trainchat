/**
 * Whitepaper Publications Seeder
 *
 * Seeds 3 published whitepapers directly into whitepaper_publications
 * as fully published records (no AI generation required).
 *
 * Idempotent — uses ON CONFLICT DO NOTHING on slug.
 * Called on server startup.
 */

import { db, whitepaperPublicationsTable } from "@workspace/db";
import type { WhitepaperSection, WhitepaperCitationBlock, WhitepaperSeoMetadata } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

interface SeedPublication {
  title: string;
  slug: string;
  code: string;
  subtitle: string;
  abstract: string;
  bodyJson: WhitepaperSection[];
  citationsJson: WhitepaperCitationBlock;
  seoMetadataJson: WhitepaperSeoMetadata;
  keywords: string[];
  estimatedPages: string;
}

const SEED_PUBLICATIONS: SeedPublication[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Persistent Coaching Intelligence
  // ──────────────────────────────────────────────────────────────────────────
  {
    title: "Persistent Coaching Intelligence",
    slug: "persistent-coaching-intelligence",
    code: "PCI",
    subtitle: "Why Memory-Based AI Changes the Future of Athlete Development",
    abstract: `Coaching intelligence is not a function of generative capability alone. It requires memory — structured, queryable, longitudinal recall of athlete behavior, constraint evolution, session responses, and coaching decisions across time. A stateless AI system, regardless of the sophistication of its language model, cannot function as a coach. It can generate programs. It cannot coach.\n\nThis paper defines persistent coaching intelligence as the architectural minimum required for AI systems that claim coaching capability: a layered memory model comprising persistent athlete profiles, constraint memory systems, behavioral adaptation tracking, and conversation-aware reasoning. Without these layers, AI coaching is indistinguishable from AI programming — powerful, but fundamentally limited.\n\nWe argue that the absence of coaching memory is not a product gap to be filled by better prompts. It is a structural deficiency. Memory is not a feature of a coaching system. It is the substrate upon which every principled coaching decision is made.`,
    bodyJson: [
      {
        number: "1.",
        heading: "The Stateless AI Problem",
        content: [
          "The dominant paradigm in AI fitness applications is stateless generation. A user describes their goal. The system produces a program. The session ends. The next session begins from zero. No recall of the last conversation. No record of what worked. No memory of the injury that was disclosed six weeks ago. The system exists, permanently, in the moment of first contact.",
          "This is not a technical limitation of large language models. Modern LLMs can maintain extended context within a session. The problem is architectural: most AI fitness products are not designed to persist, structure, or retrieve coaching-relevant information across interactions. Each session is a clean slate, and clean slates are incompatible with coaching.",
          "Coaching is a longitudinal relationship. It operates across weeks, months, and training cycles. The decisions that define a great coach — the substitution made because of a client's historic shoulder response, the load reduction triggered by three consecutive low-energy sessions, the program pivot based on a competition date shift — are only available to a system that remembers. Stateless AI cannot make these decisions. It can only approximate them by asking users to re-explain their history every session, which transfers the cognitive burden of coaching to the athlete.",
          "The stateless AI problem is not about intelligence. It is about memory. And memory, in a coaching system, is architecture — not a feature that can be layered onto a generative model after the fact."
        ],
        pullQuote: "A stateless AI system, regardless of its generative sophistication, cannot function as a coach. It can produce programs. Coaching requires memory."
      },
      {
        number: "2.",
        heading: "Why Human Coaches Remember Athletes",
        content: [
          "Human coaches do not remember athletes as a courtesy. They remember athletes because memory is the mechanism through which coaching quality compounds. Every session a coach works with an athlete produces data: how the athlete responded to load, what movement patterns emerged under fatigue, which cues landed and which did not, how emotional state correlated with performance output. A coach who does not retain and apply this data is not a worse coach — they are not a coach at all.",
          "This longitudinal recall manifests in coaching decisions that are invisible to the athlete. When a skilled coach adjusts load at the start of a session — before the athlete has said a word about how they feel — they are drawing on a pattern database accumulated over months of observation. The adjustment is not a reaction to a complaint. It is a prediction grounded in history.",
          "Human coaching memory also operates on constraint evolution. An athlete's constraints change. An injury resolves. A competition schedule shifts. A life event restructures availability. A good coach tracks these changes not as isolated updates but as entries in a dynamic constraint profile that continuously reshapes what is appropriate programming at any moment. The coach does not need to be reminded. They already know.",
          "The human coach's memory is the model. AI coaching systems that lack an equivalent are not offering coaching — they are offering generation with coaching branding."
        ]
      },
      {
        number: "3.",
        heading: "Persistent Athlete Profiles",
        content: [
          "A persistent athlete profile is a structured, continuously updated record of everything a coaching system needs to know about an athlete to make principled programming decisions. It is not a user account. It is not a settings page. It is a dynamic document that grows with every interaction and shapes every subsequent response.",
          "The minimum viable persistent athlete profile contains four categories of information: identity (name, demographic context, training history), constraints (clinical, structural, lifestyle, equipment), performance state (recent training responses, readiness indicators, fatigue signals), and preference history (what the athlete has responded to positively, negatively, and ambiguously across time).",
          "Critically, a persistent profile must be machine-readable and coaching-system-queryable. A profile that exists as unstructured conversation history requires the AI to re-derive athlete context on every call — an expensive, error-prone operation that degrades with scale. A structured profile enables the coaching layer to resolve athlete context deterministically before any generative reasoning begins.",
          "In the TrainChat architecture, the persistent athlete profile is the input to every programming decision. Before a session begins, before a mutation is considered, before a response is generated, the coaching system resolves who the athlete is, what they need, and what constraints bound the available decision space. The profile is not consulted. It is foundational."
        ],
        pullQuote: "A persistent athlete profile is not a settings page. It is the substrate upon which every coaching decision is made."
      },
      {
        number: "4.",
        heading: "Constraint Memory Systems",
        content: [
          "Constraints are the boundaries within which all valid coaching decisions must fall. They include clinical restrictions (injuries, medical conditions, post-surgical protocols), structural limitations (equipment access, training environment, time availability), and performance constraints (fatigue budgets, competition windows, recovery requirements). A coaching system that does not persistently track constraints will eventually violate them.",
          "Constraint memory is distinct from general athlete memory in one important way: constraints are hierarchical and some are non-negotiable. A clinical constraint — do not load the lumbar spine under axial compression during the six weeks following a disc herniation — must override all other programming considerations. A preference constraint — the athlete prefers not to do Romanian deadlifts — can be overridden by coaching judgment when necessary. Constraint memory systems must encode both the constraint and its hierarchy level to function correctly.",
          "The most dangerous failure mode in constraint-unaware AI coaching is not the obvious violation — the system that prescribes a back squat to an athlete with an acute knee injury. It is the subtle, cumulative violation: the system that, across twelve sessions, progressively loads a joint that was flagged as problematic at intake, because no session carries memory of what was said in any previous session.",
          "Persistent constraint memory eliminates this failure mode structurally. When constraints are stored, versioned, and queried at the start of every programming decision, violations become architecturally impossible at the resolved layer. The generative layer may suggest; the constraint layer decides."
        ]
      },
      {
        number: "5.",
        heading: "Behavioral Adaptation Tracking",
        content: [
          "Behavioral adaptation tracking is the systematic recording of how an athlete responds to training stimuli over time. It encompasses objective metrics (load completed vs. prescribed, RPE feedback, session duration adherence) and qualitative signals (athlete-reported energy, motivation, and pain) aggregated into a longitudinal adaptation profile that the coaching system can query to inform future programming.",
          "This tracking layer enables a class of coaching decisions that generative AI alone cannot support: load progression calibrated to demonstrated adaptation rather than normative expectations, intensity modulation triggered by a three-session downward trend in reported energy, exercise substitution driven by a pattern of incomplete reps at a specific load rather than a single session's complaint.",
          "Behavioral adaptation tracking also serves as the ground truth for AI coaching self-evaluation. A coaching system that cannot compare its prescriptions against athlete responses cannot know whether it is coaching well. It is operating open-loop. Closing the loop — connecting prescription to response to next prescription — requires persistent behavioral tracking as a first-class architectural component.",
          "In practice, behavioral adaptation data is noisy. Athletes are inconsistent. Reports are subjective. Single data points mislead. The value of adaptation tracking is not in any individual data point but in the patterns it enables detection of across multiple sessions. A coaching system with three sessions of history is guessing. A system with thirty sessions of structured behavioral data is inferring."
        ],
        pullQuote: "A coaching system that cannot compare its prescriptions against athlete responses is operating open-loop. Open-loop systems cannot improve."
      },
      {
        number: "6.",
        heading: "Longitudinal Performance Intelligence",
        content: [
          "Longitudinal performance intelligence is the synthesis of all persistent athlete data — profile, constraints, behavioral adaptation — into a coaching signal that improves over time. It is the property that distinguishes a coaching system from a program generator. Program generators produce outputs. Coaching systems learn from the athlete they serve.",
          "The practical output of longitudinal performance intelligence is predictive capability. A coaching system with sufficient longitudinal data on an athlete can begin to anticipate, not just react. It can predict when a deload is coming based on accumulated fatigue patterns before the athlete reports soreness. It can detect a competition anxiety pattern in pre-event sessions. It can identify the training frequency that this specific athlete, not a population average, responds best to.",
          "This predictive layer represents the frontier of AI coaching capability. Current systems, including TrainChat, are in the early stages of building the longitudinal data infrastructure required to make these predictions reliably. The architecture is defined. The data accumulation is ongoing. The coaching intelligence that compounds from this data is the long-term value proposition of AI coaching systems that take memory seriously.",
          "Longitudinal performance intelligence also has an institutional dimension. As athlete data accumulates across a platform's user base, aggregate patterns emerge that inform default programming logic, constraint hierarchies, and readiness interpretation. Individual athlete intelligence and population-level intelligence compound each other. The coaching system that takes memory seriously from the beginning is building toward this compound future."
        ]
      },
      {
        number: "7.",
        heading: "Conversation-Aware Coaching",
        content: [
          "Conversation-aware coaching is the property of a coaching system that uses the full history of its dialogue with an athlete — not just the current message — to interpret intent, resolve ambiguity, and make contextually appropriate decisions. It is the conversational analog of persistent athlete profiling: memory applied to the coaching dialogue itself.",
          "The primary practical application of conversation-aware coaching is deictic reference resolution. When an athlete says 'make that exercise easier,' the word 'that' refers to something said earlier in the conversation. A stateless system either asks for clarification or guesses. A conversation-aware system resolves the reference deterministically by tracking what exercises have been discussed, mutated, or flagged in recent turns.",
          "Beyond reference resolution, conversation-aware coaching enables intent continuity across sessions. When an athlete has been asking for more upper body volume over the past three sessions, a conversation-aware system can register this as an emerging preference signal rather than treating each request as isolated. The cumulative pattern informs programming even when the athlete does not explicitly state it again.",
          "Conversation memory also enables coaching relationship depth. An athlete who said three sessions ago that they felt burned out, then reported improvement last session, then today is asking for harder training — a conversation-aware system can synthesize this arc into a nuanced coaching response. A stateless system responds to the words of the current message. A conversation-aware system responds to the athlete."
        ]
      },
      {
        number: "8.",
        heading: "Digital Coaching Memory",
        content: [
          "Digital coaching memory is the operationalized form of all memory components discussed in this paper: persistent athlete profiles, constraint memory systems, behavioral adaptation tracking, longitudinal performance intelligence, and conversation-aware reasoning, implemented as a unified, queryable architecture that informs every coaching decision the system makes.",
          "The distinguishing property of digital coaching memory — as opposed to a simple database of athlete records — is that it is active. The memory system does not wait to be queried. It resolves athlete context at the start of every interaction, surfaces constraint violations proactively, detects adaptation trends in real time, and continuously updates its representation of the athlete based on new information. The coaching system is always informed.",
          "This active memory architecture fundamentally changes the nature of what AI coaching can accomplish. It moves the system from reactive generation — responding to what the athlete says today — to proactive coaching — making decisions informed by who the athlete is, what they have done, and what the longitudinal pattern predicts they need next. The difference between these two modes of operation is the difference between a program generator and a coach.",
          "TrainChat's persistent coaching intelligence architecture is designed around this distinction. Memory is not a database behind the coaching engine. It is the coaching engine. Every token generated by the AI layer is conditioned on structured athlete memory. Every decision passes through constraint resolution. Every session adds to the longitudinal record that makes every subsequent session more precise. This is what it means to build a digital coaching memory — and it is why memory-based AI changes the future of athlete development."
        ],
        pullQuote: "Memory is not a database behind the coaching engine. It is the coaching engine. Every coaching decision is conditioned on it."
      }
    ],
    citationsJson: {
      formatted: `TrainChat Research. (2026). Persistent Coaching Intelligence: Why Memory-Based AI Changes the Future of Athlete Development. TrainChat Research Series. https://trainchat.ai/whitepapers/persistent-coaching-intelligence`,
      related: [
        "Constraint-Aware Coaching Systems (CACS) — TrainChat Research, 2026",
        "The Adaptive Coaching Architecture (ACA) — TrainChat Research, 2025",
        "Coaching Memory as a Programming Layer (CMPL) — TrainChat Research Series",
        "Conversational Periodization (CP) — TrainChat Research, 2026"
      ],
      framework: [
        "ACA: The Adaptive Coaching Architecture — foundational framework",
        "CACS: Constraint-Aware Coaching Systems — constraint hierarchy reference",
        "MFP: Mutation-First Programming — surgical intervention principles"
      ],
      canonicalUrl: "https://trainchat.ai/whitepapers/persistent-coaching-intelligence"
    },
    seoMetadataJson: {
      metaTitle: "Persistent Coaching Intelligence — AI Memory & Athlete Development | TrainChat",
      metaDescription: "Why memory-based AI changes the future of athlete development. TrainChat's whitepaper on persistent athlete profiles, constraint memory systems, and longitudinal performance intelligence.",
      ogTitle: "Persistent Coaching Intelligence: Why Memory-Based AI Changes the Future of Athlete Development",
      ogDescription: "A formal examination of why AI coaching systems require persistent memory — structured recall of athlete behavior, constraints, and adaptation patterns — to deliver genuine coaching capability."
    },
    keywords: [
      "persistent AI memory",
      "AI strength coach",
      "adaptive coaching",
      "athlete profile",
      "constraint-aware coaching",
      "longitudinal performance",
      "digital coaching memory",
      "AI sports performance"
    ],
    estimatedPages: "~13 pages"
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Adaptive Readiness Periodization
  // ──────────────────────────────────────────────────────────────────────────
  {
    title: "Adaptive Readiness Periodization",
    slug: "adaptive-readiness-periodization",
    code: "ARP",
    subtitle: "How AI-Driven Readiness Systems Continuously Recalibrate Training Stress in Real Time",
    abstract: `Classical periodization models assume a tractable relationship between planned training load and athlete adaptation. Block periodization, linear progression, undulating models — all share a foundational premise: that a program designed weeks in advance can predict, with sufficient accuracy, the appropriate stimulus for the athlete on any given training day. This premise is false.\n\nAthletes do not adapt on schedule. Their readiness — the biological state that determines their capacity to absorb and benefit from training stress — fluctuates continuously in response to sleep quality, accumulated fatigue, nutrition, illness, life stress, and dozens of other variables that no fixed program can anticipate. A plan that ignores readiness is not a periodized training plan. It is a wish list.\n\nThis paper defines Adaptive Readiness Periodization (ARP) as the architectural framework through which AI coaching systems can resolve athlete readiness in real time and recalibrate training stress accordingly. We examine the biological basis of readiness as a dynamic variable, the distinction between CNS and muscular fatigue and its implications for exercise selection, the constraint-aware training adjustment protocols that govern real-time session modification, and the session mutation architecture that makes daily recalibration structurally safe without breaking program coherence.`,
    bodyJson: [
      {
        number: "1.",
        heading: "The Failure of Static Periodization",
        content: [
          "Static periodization is the practice of prescribing training load, intensity, and volume weeks or months in advance and executing that prescription regardless of the athlete's actual biological state on any given day. It is the dominant model in recreational and professional strength training, and it is structurally incompatible with athlete physiology.",
          "The failure mode of static periodization is well-documented but poorly addressed. Training days rated as high intensity fall on days when the athlete is functionally under-recovered. Deload weeks are scheduled when the athlete is in peak form and would benefit from continued loading. Volume progression proceeds according to a weekly increment formula that bears no relationship to how the athlete actually adapted to the previous week's stimulus. The plan continues; the athlete struggles to keep up.",
          "The deeper structural problem is not that static periodization is inflexible. It is that static periodization treats the training plan as the primary variable and the athlete as a secondary one. In reality, the athlete's readiness state is always the primary variable. The plan is a hypothesis. Readiness is the experimental result that either validates or refutes it.",
          "Adaptive coaching systems must invert this relationship. The training plan is a structured starting point — a coherent sequence of stimuli designed to drive a specific adaptation outcome. But the execution of that plan must be governed by real-time readiness data, not calendar adherence. An AI coaching system that cannot recalibrate based on readiness is automating the failure mode of static periodization, not solving it."
        ],
        pullQuote: "Static periodization treats the training plan as the primary variable and the athlete as secondary. In reality, the athlete's readiness is always primary."
      },
      {
        number: "2.",
        heading: "Readiness as a Dynamic Biological Variable",
        content: [
          "Readiness is the athlete's current capacity to absorb and benefit from a training stimulus. It is not a fixed quantity. It varies continuously — hour to hour, day to day, week to week — in response to the cumulative interaction of training load, recovery quality, and systemic stressors that extend far beyond the gym.",
          "The biological substrate of readiness is complex. At the neuromuscular level, readiness reflects the current state of motor unit recruitment capacity, contractile force production, and neuromuscular coordination efficiency. At the systemic level, readiness reflects autonomic nervous system state, inflammatory load, hormonal balance, and glycogen availability. At the psychological level, it reflects motivational state, stress-related cortisol elevation, and perceived effort tolerance.",
          "These variables interact in non-linear ways. An athlete with excellent sleep quality and good nutrition can tolerate significant accumulated training load before readiness degrades meaningfully. The same athlete with two consecutive nights of poor sleep and high psychological stress may present with markedly reduced readiness even without any preceding hard training. No static program can model this interaction. Only real-time readiness assessment can.",
          "Practical readiness assessment in AI coaching systems draws on multiple signal types: self-reported readiness scores (simple, scalable, validated by HRV research), session performance data (actual vs. prescribed RPE, completed vs. attempted volume), behavioral patterns (session timing, duration variability, frequency of modification requests), and constraint flags (injury re-emergences, illness reports, sleep disruption disclosures). The synthesis of these signals into a readiness estimate is the core function of the adaptive readiness layer."
        ]
      },
      {
        number: "3.",
        heading: "CNS Fatigue vs. Muscular Fatigue",
        content: [
          "The distinction between central nervous system fatigue and peripheral muscular fatigue is one of the most practically important and most frequently ignored concepts in training program design. The two fatigue types have different causes, different time courses for recovery, and different implications for appropriate training modifications — and an AI coaching system that does not resolve which type is present will make systematically wrong recalibration decisions.",
          "CNS fatigue — fatigue of the motor cortex, descending neural pathways, and motor neuron pools — typically manifests as reduced motivation, elevated perceived effort at submaximal loads, slowed reaction time, and impaired coordination on complex multi-joint movements. It is driven by high-intensity neural demands: maximal effort lifts, complex skill training, high-volume sprint work, and significant psychological stress. Recovery from CNS fatigue requires 48–72 hours of reduced neural demand, not simply muscular rest.",
          "Muscular fatigue — depletion of local energy substrates, accumulation of metabolic byproducts, micro-damage to contractile structures — manifests as reduced local force production, muscle soreness, and pump-dependent impairment in the affected muscle groups. It is localized, and it does not necessarily impair training in unaffected muscle groups. An athlete with significant quadriceps fatigue can train upper body at full intensity with no meaningful performance degradation.",
          "An AI coaching system that responds to all fatigue signals with uniform load reduction is using a blunt instrument. The appropriate response to CNS fatigue is a shift in training character: reduce neural intensity (move from maximal to moderate loads), reduce movement complexity, increase recovery between sets, and avoid new skill acquisition. The appropriate response to muscular fatigue in a specific region is targeted volume reduction or muscle group substitution, not global session reduction. Adaptive readiness periodization requires the ability to make this distinction and act on it."
        ],
        pullQuote: "An AI coaching system that responds to all fatigue signals with uniform load reduction is using a blunt instrument. CNS and muscular fatigue require different interventions."
      },
      {
        number: "4.",
        heading: "Constraint-Aware Training Adjustments",
        content: [
          "Real-time readiness recalibration does not occur in a vacuum. Every adjustment the coaching system makes to accommodate current readiness state must simultaneously respect the athlete's persistent constraint profile. A session modification that addresses CNS fatigue by shifting to moderate loads must not violate a clinical load ceiling. A muscle group substitution triggered by localized fatigue must select from exercises compatible with the athlete's equipment access and injury history.",
          "Constraint-aware training adjustments are the mechanism through which these two requirements — readiness responsiveness and constraint compliance — are resolved simultaneously. The adjustment algorithm first identifies the readiness-driven modification need. It then filters available responses through the athlete's constraint registry. The intersection of 'what would help the readiness state' and 'what the constraint profile permits' defines the valid adjustment space.",
          "This intersection can be empty. An athlete in significant CNS fatigue whose constraint profile also excludes all low-intensity alternatives — due to equipment limitations, time constraints, or medical restrictions — cannot be offered a valid modified session that serves both needs. In this case, the correct coaching decision is to recommend rest rather than construct a session that serves neither readiness recovery nor constraint compliance. Adaptive readiness periodization must include the capacity to prescribe non-training as a valid response.",
          "Constraint-aware adjustments also operate across the weekly training structure, not only the individual session. A readiness-driven session modification that reduces stimulus on a planned primary training day has downstream consequences for weekly volume distribution and progression sequencing. The coaching system must resolve these consequences at the program level, not only the session level — ensuring that individual day modifications do not accumulate into unintentional detraining or periodization phase drift."
        ]
      },
      {
        number: "5.",
        heading: "TrainChat Readiness Interpretation",
        content: [
          "TrainChat implements readiness interpretation as a structured pre-session reasoning step that runs before any exercise prescription is generated or any existing session is presented for execution. The readiness interpreter receives athlete context (constraint profile, recent session history, behavioral adaptation data) and any current session signals (disclosed readiness rating, recent sleep reports, energy disclosures in conversation) and produces a readiness classification that governs the session modification pathway.",
          "Readiness classifications in the TrainChat system map to four primary coaching responses: Full execution (readiness is sufficient to support planned stimulus), Load-adjusted execution (session proceeds with systematic intensity or volume reduction), Character-shifted execution (session is restructured to a different fatigue profile — from neural-intensive to aerobic-dominant, from compound-heavy to isolation-based), and Rest recommendation (readiness signal indicates training stress would be counterproductive).",
          "The classification is not deterministic. It is a recommendation that the athlete can override. The coaching system may classify a session as requiring character shift due to disclosed poor sleep, but the athlete may confirm that they feel ready to train at full intensity. In this case, the system flags the override, notes it in the behavioral adaptation record, and monitors the session response to calibrate future readiness interpretation accuracy.",
          "This override mechanism is important for coaching relationship trust. Athletes who feel overridden by their coaching system — who believe the AI is more concerned with its own readiness model than with their self-knowledge — disengage. The goal of readiness interpretation is to surface data the athlete may not have consciously synthesized, not to make decisions for them. The system informs. The athlete decides. The interaction is recorded."
        ]
      },
      {
        number: "6.",
        heading: "Session Mutation Architecture",
        content: [
          "Session mutation is the process of modifying an existing planned training session in response to readiness signals, constraint updates, or athlete preference inputs, in a way that preserves program coherence and does not require a full program rebuild. It is the mechanism through which adaptive readiness periodization is operationalized at the session level.",
          "The session mutation architecture defines a hierarchy of interventions ordered by scope: load adjustment (change sets, reps, or weight on a specific exercise), exercise substitution (replace one exercise with a constraint-compatible, readiness-appropriate alternative), session character modification (restructure the session's intensity and neural demand profile while preserving overall training intent), and session replacement (replace the planned session with a new session designed to serve the current readiness state).",
          "The hierarchy is significant. The mutation system always attempts the least invasive valid intervention first. If a load adjustment can address the readiness concern without compromising program structure, a full session replacement is not triggered. This preserves longitudinal program coherence — the property that each session contributes to a meaningful progression arc — even when daily readiness fluctuations require significant individual session modifications.",
          "Session mutations are recorded and versioned. The coaching system maintains a history of what was planned, what was executed, and why the modification was made. This history feeds back into the longitudinal performance intelligence layer, allowing the system to detect patterns: if the same session type is being consistently modified in the same direction, the planned session may need to be redesigned rather than repeatedly mutated. The mutation history converts individual adjustments into system learning."
        ],
        pullQuote: "The mutation system always attempts the least invasive valid intervention first. Preserving program coherence across daily readiness fluctuations is a structural requirement."
      },
      {
        number: "7.",
        heading: "Adaptive Exercise Substitution Logic",
        content: [
          "Exercise substitution is the most granular and most frequently triggered form of session mutation. When a specific exercise is flagged — by readiness state, constraint violation, equipment unavailability, or athlete preference — the coaching system must identify a valid substitute that serves the same training function within the program's adaptation intent.",
          "Valid exercise substitution is not synonym replacement. Replacing a barbell back squat with a goblet squat because the athlete reports knee discomfort is not a valid substitution if the coaching intent was posterior chain development rather than quad-dominant loading. Valid substitution requires the system to encode both the physiological role of the exercise being replaced (primary mover, joint angle, neural demand, stability requirement) and the constraints that exclude certain categories of replacements.",
          "The substitution algorithm in the TrainChat architecture queries the exercise library against three parameters: functional equivalence (does the substitute target the same primary movers and movement pattern?), constraint compatibility (does the substitute pass through the athlete's constraint filter?), and readiness appropriateness (does the substitute match the required neural demand level given current readiness state?). The intersection of valid candidates is then ranked by training intent proximity and presented to the athlete.",
          "Adaptive substitution logic also handles the case where no valid substitute exists. An athlete who reports acute lumbar pain during a session that requires both hip hinge loading and knee flexion dominant loading may have no substitute that satisfies all three parameters simultaneously. In this case, the coaching system must communicate the constraint clearly, offer the available partial alternatives (upper body work, mobility protocols), and recommend that the primary lower body session be rescheduled pending symptom resolution."
        ]
      },
      {
        number: "8.",
        heading: "AI-Guided Autoregulation",
        content: [
          "Autoregulation — the practice of adjusting training load and volume in real time based on performance readiness rather than pre-set prescription — has a strong evidence base in human performance research. Athletes who train to effort-based targets (RPE 8/10, stop two reps short of failure) show superior long-term adaptation outcomes compared to athletes who train to fixed rep prescriptions regardless of daily readiness. AI coaching systems are uniquely positioned to operationalize autoregulation at scale.",
          "AI-guided autoregulation extends the classical autoregulation model in two important ways. First, it applies autoregulation not only within sessions (adjusting load based on bar speed or RPE during a working set) but across the training week and training block — detecting readiness trends that suggest the entire phase needs recalibration, not just a single session. Second, it makes the autoregulation decisions visible and explainable, generating coaching communication that the athlete can understand and engage with rather than silently adjusting numbers in the background.",
          "The practical implementation of AI-guided autoregulation in TrainChat operates on a session-to-session feedback loop. After each session, the system evaluates the gap between prescribed and executed training volume and intensity, combines this with any athlete readiness disclosures, and uses the delta to inform the readiness estimate for the next session. Over multiple sessions, the system builds a calibrated model of this specific athlete's readiness-performance relationship that improves the precision of subsequent autoregulatory adjustments.",
          "The long-term outcome of AI-guided autoregulation is a training experience that feels responsive rather than rigid — where the athlete experiences their program as a coaching relationship that understands them, not a static prescription they are either succeeding or failing to follow. This shift in athlete experience is not cosmetic. It drives adherence, engagement, and ultimately, adaptation outcomes. Adaptive readiness periodization, at its best, is the architecture that makes this experience possible."
        ],
        pullQuote: "AI-guided autoregulation makes the readiness-based decisions visible and explainable. The athlete understands the adjustment. The coaching relationship deepens."
      }
    ],
    citationsJson: {
      formatted: `TrainChat Research. (2026). Adaptive Readiness Periodization: How AI-Driven Readiness Systems Continuously Recalibrate Training Stress in Real Time. TrainChat Research Series. https://trainchat.ai/whitepapers/adaptive-readiness-periodization`,
      related: [
        "Constraint-Aware Coaching Systems (CACS) — TrainChat Research, 2026",
        "Mutation-First Programming (MFP) — TrainChat Research, 2025",
        "The Adaptive Coaching Architecture (ACA) — TrainChat Research, 2025",
        "Persistent Coaching Intelligence (PCI) — TrainChat Research, 2026"
      ],
      framework: [
        "ARP: Adaptive Readiness Periodization — this framework",
        "MFP: Mutation-First Programming — session mutation hierarchy",
        "CACS: Constraint-Aware Coaching Systems — constraint filter reference"
      ],
      canonicalUrl: "https://trainchat.ai/whitepapers/adaptive-readiness-periodization"
    },
    seoMetadataJson: {
      metaTitle: "Adaptive Readiness Periodization — AI-Driven Training Stress Recalibration | TrainChat",
      metaDescription: "How AI-driven readiness systems continuously recalibrate training stress in real time. TrainChat's whitepaper on CNS fatigue, constraint-aware adjustments, and session mutation architecture.",
      ogTitle: "Adaptive Readiness Periodization: How AI-Driven Readiness Systems Continuously Recalibrate Training Stress",
      ogDescription: "A formal examination of why static periodization fails athletes and how AI coaching systems can resolve readiness dynamically — adjusting session character, load, and exercise selection in real time."
    },
    keywords: [
      "adaptive periodization",
      "athlete readiness AI",
      "AI sports performance",
      "AI strength coach",
      "CNS fatigue",
      "constraint-aware coaching",
      "autoregulation",
      "session mutation architecture"
    ],
    estimatedPages: "~14 pages"
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Movement Intelligence Systems
  // ──────────────────────────────────────────────────────────────────────────
  {
    title: "Movement Intelligence Systems",
    slug: "movement-intelligence-systems",
    code: "MIS",
    subtitle: "The Shift From Muscle-Based Programming to Neuromuscular Coordination Models",
    abstract: `The dominant language of strength training program design is anatomical. Programs are organized by muscle groups. Progress is measured in hypertrophy and isolated strength metrics. Exercise selection is governed by the question: which muscle does this exercise target? This framing is clinically useful, educationally accessible, and architecturally incomplete.\n\nMovement is not the output of a muscle. It is the output of a nervous system — a coordinated sequence of motor unit recruitment, co-contraction patterns, force vector management, and real-time sensorimotor feedback that produces purposeful displacement in space. Programming that ignores this reality produces athletes who can produce force in prescribed positions but struggle to express that force in the varied, unpredictable contexts that performance and health actually require.\n\nThis paper defines Movement Intelligence Systems (MIS) as the architectural framework through which AI coaching can move beyond muscle-centric programming toward neuromuscular coordination models — exercise selection and progression logic grounded in motor learning principles, efferent signal characteristics, movement quality metrics, and constraint-aware movement pattern management. We argue that this shift is not optional for AI coaching systems with serious performance ambitions. It is the difference between programming a body and coaching a movement system.`,
    bodyJson: [
      {
        number: "1.",
        heading: "The Limitation of Muscle-Centric Training",
        content: [
          "Muscle-centric training treats the human body as a collection of force-producing tissues to be individually loaded and progressively overloaded. It is a model imported from bodybuilding and rehabilitation science — contexts where isolated muscle analysis is genuinely useful — and applied wholesale to general performance training, where its limitations become significant.",
          "The core limitation of muscle-centric programming is that it optimizes for a property — isolated muscle force production — that is necessary but not sufficient for athletic performance, functional health, or injury resilience. A quadricep with high isolated strength that cannot coordinate with the hip flexors, hamstrings, and core stabilizers during a change-of-direction movement is not a high-performing quadricep in the context that matters. Isolation creates a capability. Coordination creates performance.",
          "Muscle-centric programming also generates systematic blind spots in exercise selection. Exercises that produce high electromyographic activation in a target muscle are favored. Exercises that develop coordination quality, timing precision, or multi-joint sequencing — but produce lower isolated muscle activation — are undervalued or excluded entirely. The result is athletes who are measurably strong in the gym and disproportionately limited in their ability to express that strength in movement.",
          "An AI coaching system built on a muscle-centric exercise taxonomy will inherit these limitations. It will optimize what the taxonomy measures and ignore what it does not. Developing a movement intelligence layer requires rebuilding the exercise taxonomy from neurological first principles: what movement pattern does this exercise encode? What motor coordination demand does it create? How does it serve the athlete's neuromuscular development trajectory?"
        ],
        pullQuote: "Isolation creates a capability. Coordination creates performance. Muscle-centric programming optimizes the former at the cost of the latter."
      },
      {
        number: "2.",
        heading: "Movement as Neurological Output",
        content: [
          "Movement is the output of the motor system. Before a muscle contracts, a motor command has been issued by the motor cortex, processed through the cerebellum and basal ganglia, transmitted down the corticospinal tract, integrated at the spinal cord level with proprioceptive feedback, and delivered to the alpha motor neurons that innervate the target motor units. The force a muscle produces is the end product of this complex neural sequence, not its origin.",
          "This neurological framing has direct implications for training program design. Movement quality improvements — precision, timing, coordination efficiency, force sequencing — are primarily neural adaptations, not muscular ones. They occur in the motor cortex (refinement of movement representations), the cerebellum (improvement of timing and error correction), and the spinal cord (optimization of inter-muscular coordination patterns). These adaptations require different training inputs than hypertrophy adaptations and respond poorly to the high-fatigue, high-volume protocols typically used to drive muscle growth.",
          "The distinction between neurological and muscular training adaptations is not academic. An athlete who needs to improve hip hinge coordination — the ability to dissociate lumbar and hip movement, load the posterior chain efficiently, and express force through the glutes rather than compensating with lumbar extension — needs practice in the movement pattern at manageable loads, with high-quality sensorimotor feedback, not progressive overload of the deadlift at maximal loads that reinforce compensation patterns.",
          "A movement intelligence system recognizes this distinction and routes exercise selection based on adaptation type. When the training goal is neurological (coordination improvement, motor pattern acquisition, movement quality restoration), the exercise selection logic favors controlled intensity, high movement quality cuing, and progressive complexity. When the training goal is muscular (hypertrophy, maximal strength), the logic favors higher load and volume. The two pathways are not mutually exclusive, but they are distinct."
        ]
      },
      {
        number: "3.",
        heading: "Motor Learning and Coordination Efficiency",
        content: [
          "Motor learning is the process by which the nervous system acquires, refines, and stabilizes movement patterns through practice. It proceeds through well-documented stages: cognitive (conscious, effortful, error-prone execution), associative (reducing errors, improving consistency), and autonomous (automatic, efficient, low-conscious-demand execution). A movement at the autonomous stage is a fundamentally different neural event than the same movement at the cognitive stage — and it responds differently to training variables.",
          "Coordination efficiency — the property of a movement pattern at the autonomous stage — is characterized by reduced co-contraction, more precise force timing, lower metabolic cost per unit of work, and greater adaptability to perturbation. An athlete who has achieved coordination efficiency in a squat pattern can maintain effective movement under load, fatigue, and environmental disruption in a way that a cognitively-stage athlete cannot. Coordination efficiency is the neurological foundation of athletic resilience.",
          "AI coaching systems that do not model motor learning stage create a significant programming error: applying high-load, high-fatigue protocols to athletes who are still in the cognitive stage of a movement pattern. High fatigue degrades movement quality in cognitively-stage athletes, reinforces compensation patterns, and actively impedes the neural adaptation process. The correct programming intervention for a cognitively-stage athlete is practice-quality exposure at manageable loads — not progressive overload.",
          "Movement intelligence systems must encode motor learning stage as a programming variable alongside the traditional variables of load, volume, and intensity. The system's exercise progression logic should reflect not only 'is the athlete strong enough to increase load?' but 'is this athlete's movement pattern quality sufficient to support increased complexity or load without reinforcing a compensation that will need to be unlearned later?'"
        ],
        pullQuote: "High fatigue degrades movement quality in cognitively-stage athletes. Applying overload protocols before coordination is established reinforces the compensations that limit performance."
      },
      {
        number: "4.",
        heading: "Efferent Signaling and Force Production",
        content: [
          "The efferent nervous system — the descending pathway from motor cortex to muscle fiber — is the hardware of force production. The rate at which motor units are recruited, the sequence in which they fire, the co-contraction patterns of synergists and antagonists, and the neural drive available at any moment of maximum effort are all functions of efferent signaling quality and capacity.",
          "Training the efferent system is distinct from training the contractile system. Contractile adaptation — changes in fiber size, pennation angle, and cross-sectional area — responds to sustained mechanical tension and metabolic stress over multiple sets and repetitions at moderate to high volumes. Efferent adaptation — changes in motor unit recruitment threshold, rate coding efficiency, and inter-muscular coordination — responds most powerfully to high-velocity, high-intent movements at low fatigue, where the nervous system is required to generate maximal recruitment patterns without the interference of accumulated metabolic waste.",
          "This distinction explains the well-documented phenomenon of strength without size: athletes who demonstrate significant maximal strength improvements without proportional hypertrophy. The adaptation is neural, not structural — improved efferent drive and recruitment efficiency allowing greater expression of existing contractile tissue capacity. It also explains the opposite failure mode: athletes who develop significant hypertrophy but cannot access it under performance conditions where neural efficiency is required.",
          "An AI coaching system that programs only for contractile adaptation — treating strength training as fundamentally about muscle tissue — will consistently underserve athletes whose performance limitations are primarily efferent. Movement intelligence systems explicitly model both adaptation types and select training stimuli that address the athlete's current limiting factor, whether that is contractile capacity, efferent efficiency, or coordination quality at the movement pattern level."
        ]
      },
      {
        number: "5.",
        heading: "Movement Quality and Recruitment",
        content: [
          "Movement quality is the degree to which a movement pattern reflects optimal neuromuscular coordination: the correct muscles activating at the correct times, in the correct sequence, with appropriate co-contraction, and with sensorimotor precision that allows real-time error correction. High movement quality is not the same as high movement performance. An athlete can produce high force output through a movement pattern with poor quality — through compensation, brute force recruitment, or structural loading that trades long-term joint health for short-term performance.",
          "Motor unit recruitment quality — whether the intended muscles are the primary force producers in a given movement — is central to movement quality assessment. A hip thrust is designed to load the gluteus maximus as the primary mover. An athlete who executes a hip thrust primarily through lumbar hyperextension and hamstring compensation is performing the movement with poor recruitment quality, regardless of how much load is on the bar. Progressing this athlete on the hip thrust without addressing recruitment quality is building strength into a faulty pattern.",
          "AI coaching systems must develop the ability to reason about movement quality without access to the visual assessment that human coaches use. This requires building movement quality signals from behavioral data: athlete-reported pain patterns that suggest compensation, RPE responses that suggest unusually high effort for sub-maximal loads (a classic indicator of poor coordination efficiency), modification request patterns that cluster around specific movement types, and longitudinal performance data that fails to show expected adaptation despite consistent loading.",
          "These indirect signals are imperfect proxies for what an in-person coach would identify from watching a squat set. But they are not noise. Systematically collected and interpreted over multiple sessions, they form a movement quality profile that can inform exercise selection, flag compensation patterns, and trigger coaching interventions that redirect the athlete toward movements that develop rather than reinforce limitations."
        ]
      },
      {
        number: "6.",
        heading: "Constraint-Aware Movement Selection",
        content: [
          "Movement selection in a constraint-aware coaching system is governed by the intersection of three domains: the training intent (what adaptation does this session need to drive?), the athlete's movement quality profile (which movement patterns are available for loading and which are in the process of quality development?), and the constraint registry (which movement categories are excluded by clinical, structural, or equipment constraints?)",
          "The constraint registry in a movement intelligence framework encodes not only exercise-level restrictions but movement-pattern-level restrictions. An athlete with an anterior cruciate ligament history does not simply have a 'no deep squat' restriction. They have a movement pattern constraint: all movements that produce significant valgus force at the knee under load are restricted until coordination of the hip abductors and external rotators is sufficient to protect the joint dynamically. This is a more sophisticated constraint than a simple exercise exclusion, and it requires a more sophisticated system to apply.",
          "Constraint-aware movement selection also operates across the training week. A movement pattern that is currently in the quality development phase — being refined toward autonomy — should not also be the primary loading modality for the session. Simultaneous quality development and maximal loading of the same movement pattern creates conflicting neural demands: the quality development phase requires sub-maximal, high-quality practice; the loading phase requires maximum effort that will naturally invoke compensation when fatigue is present.",
          "The correct approach is session-level movement pattern segregation: sessions focused on movement quality development use moderate loads and high coaching cue density; sessions focused on performance expression use the movement patterns that are already at autonomous stage. An AI coaching system with a movement intelligence layer can track movement pattern stage across the athlete's exercise library and assign exercises to sessions accordingly."
        ],
        pullQuote: "Movement pattern constraints are more sophisticated than simple exercise exclusions. They require the system to reason about coordination requirements, not just load."
      },
      {
        number: "7.",
        heading: "AI Movement Coaching",
        content: [
          "AI movement coaching is the application of movement intelligence principles to real-time coaching dialogue — providing technique cues, pattern feedback, and progression guidance grounded in neuromuscular coordination models rather than purely mechanical or muscle-centric frameworks. It extends the movement intelligence system from a programming layer (what to program) to a coaching layer (how to communicate movement quality guidance during execution).",
          "The primary challenge of AI movement coaching is the absence of visual feedback. A human coach watching a set can identify a Trendelenburg gait pattern, a forward weight shift, a shortened eccentric phase, or a breath holding compensation in real time. An AI system operating through text conversation cannot observe these things directly. It must develop indirect observation capabilities — inferring movement quality from athlete disclosures, RPE patterns, pain location reports, and the coherence of athlete self-description.",
          "Despite this limitation, AI movement coaching has substantial capability in three domains. First, it can provide pre-movement cognitive cues — technique reminders and intention-setting guidance before a set — that prime the motor system for quality execution. Second, it can ask structured post-set questions that elicit movement quality data (where did you feel it? how was your balance? did anything feel compensatory?) and use responses to update the movement quality profile. Third, it can contextualize technique corrections within the broader movement intelligence framework, explaining why a specific compensation pattern is worth addressing rather than simply commanding technique changes.",
          "The long-term value of AI movement coaching is the accumulated movement quality profile it builds over months of interaction. As the system develops a structured record of how this athlete moves, which patterns are stable, which are developing, and which are problematic, its coaching responses become progressively more precise. Movement coaching quality, like all coaching quality, compounds with memory."
        ]
      },
      {
        number: "8.",
        heading: "Intelligent Neuromuscular Systems",
        content: [
          "An intelligent neuromuscular coaching system is one that integrates all components of the movement intelligence framework — movement-as-neurological-output framing, motor learning stage tracking, efferent and contractile adaptation distinction, movement quality profiling, and constraint-aware movement selection — into a unified programming and coaching architecture that treats the athlete as a movement system to be developed, not a collection of muscles to be loaded.",
          "The practical output of an intelligent neuromuscular system is a training program that looks different from a muscle-centric program in important ways. It explicitly separates sessions by adaptation type. It tracks movement pattern quality as a first-class programming variable. It modulates load based on coordination stage rather than applying progressive overload universally. It selects exercises that serve the athlete's actual neuromuscular development needs, not exercises that rank highest on isolated muscle activation metrics.",
          "The AI coaching layer of an intelligent neuromuscular system speaks differently, too. It cues movement intent rather than muscle activation. It explains progression decisions in terms of pattern readiness rather than simply noting that load was increased. It communicates movement quality concerns in the context of athletic development goals — why this compensation pattern matters for performance, not just why it is technically incorrect.",
          "The shift from muscle-centric programming to neuromuscular coordination models is not a trend. It is a return to first principles. Movement is the fundamental output of the human organism. It is the currency of athletic performance, functional health, and injury resilience. An AI coaching system that takes movement seriously — that builds its exercise taxonomy, its progression logic, and its coaching language around the neuromuscular system rather than the muscular system — is building toward a model of athletic development that is structurally more complete. This is the promise of movement intelligence systems, and it is why the shift matters."
        ],
        pullQuote: "The shift from muscle-centric programming to neuromuscular coordination models is not a trend. It is a return to first principles — movement is the fundamental output of the organism."
      }
    ],
    citationsJson: {
      formatted: `TrainChat Research. (2026). Movement Intelligence Systems: The Shift From Muscle-Based Programming to Neuromuscular Coordination Models. TrainChat Research Series. https://trainchat.ai/whitepapers/movement-intelligence-systems`,
      related: [
        "The Problem With Static Programming (LSM) — TrainChat Research, 2025",
        "Constraint-Aware Coaching Systems (CACS) — TrainChat Research, 2026",
        "Adaptive Readiness Periodization (ARP) — TrainChat Research, 2026",
        "The Adaptive Coaching Architecture (ACA) — TrainChat Research, 2025"
      ],
      framework: [
        "MIS: Movement Intelligence Systems — this framework",
        "CACS: Constraint-Aware Coaching Systems — constraint registry reference",
        "ACA: The Adaptive Coaching Architecture — foundational framework"
      ],
      canonicalUrl: "https://trainchat.ai/whitepapers/movement-intelligence-systems"
    },
    seoMetadataJson: {
      metaTitle: "Movement Intelligence Systems — Neuromuscular Training AI | TrainChat",
      metaDescription: "The shift from muscle-based programming to neuromuscular coordination models. TrainChat's whitepaper on motor learning, efferent signaling, movement quality, and AI movement coaching.",
      ogTitle: "Movement Intelligence Systems: The Shift From Muscle-Based Programming to Neuromuscular Coordination Models",
      ogDescription: "A formal examination of why muscle-centric training is architecturally incomplete and how AI coaching systems can integrate neuromuscular coordination models for superior athlete development."
    },
    keywords: [
      "neuromuscular training",
      "AI strength coach",
      "AI sports performance",
      "motor learning",
      "movement quality",
      "constraint-aware coaching",
      "adaptive periodization",
      "coordination efficiency"
    ],
    estimatedPages: "~13 pages"
  }
];

export async function seedWhitepaperPublicationsIfMissing(): Promise<void> {
  const targetSlugs = SEED_PUBLICATIONS.map((p) => p.slug);

  const existing = await db
    .select({ slug: whitepaperPublicationsTable.slug })
    .from(whitepaperPublicationsTable)
    .where(inArray(whitepaperPublicationsTable.slug, targetSlugs));

  const existingSlugs = new Set(existing.map((r) => r.slug));
  const toInsert = SEED_PUBLICATIONS.filter((p) => !existingSlugs.has(p.slug));

  if (toInsert.length === 0) {
    logger.info("[WhitepaperSeeder] All seed publications already present — skipping");
    return;
  }

  const now = new Date();

  for (const pub of toInsert) {
    await db
      .insert(whitepaperPublicationsTable)
      .values({
        topicId: null,
        title: pub.title,
        slug: pub.slug,
        code: pub.code,
        subtitle: pub.subtitle,
        abstract: pub.abstract,
        bodyJson: pub.bodyJson,
        citationsJson: pub.citationsJson,
        seoMetadataJson: pub.seoMetadataJson,
        keywords: pub.keywords,
        estimatedPages: pub.estimatedPages,
        status: "published",
        publishedAt: now,
      })
      .onConflictDoNothing();

    logger.info({ slug: pub.slug }, "[WhitepaperSeeder] Seeded publication");
  }

  logger.info({ count: toInsert.length }, "[WhitepaperSeeder] Seed complete");
}
