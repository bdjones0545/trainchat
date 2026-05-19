import WhitepaperPrintLayout from "./WhitepaperPrintLayout";

const CP_FIGURE = (
  <>
    <div className="pub-figure-label">Figure 1</div>
    <div className="pub-figure-title">The Mutation Scope Hierarchy</div>
    <p className="pub-figure-caption">
      Three mutation scopes in conversational periodization. Mutations are applied at the lowest structural level that adequately addresses the coaching need, with recalculation cascading through dependent elements.
    </p>
    <div className="pub-hierarchy">
      <div className="pub-level">
        <div className="pub-level-badge">BLOCK</div>
        <div className="pub-level-body">
          <div className="pub-level-name">Block Mutations</div>
          <div className="pub-level-desc">Change the block's training emphasis, periodization structure, or peak target. Cascade through all contained weeks with full downstream recalculation.</div>
          <div className="pub-level-freq">Trigger: goal shifts, competition date changes, significant adaptation divergence</div>
        </div>
      </div>
      <div className="pub-level default-level">
        <div className="pub-level-badge">WEEK</div>
        <div className="pub-level-body">
          <div className="pub-level-name">Week Mutations</div>
          <div className="pub-level-desc">Redistribute load, reorder sessions, or adjust volume within a single training week. Block-level coherence and arc are preserved.</div>
          <div className="pub-level-freq">Trigger: fatigue signals, schedule disruption, athlete feedback on weekly load</div>
        </div>
      </div>
      <div className="pub-level">
        <div className="pub-level-badge">SESSION</div>
        <div className="pub-level-body">
          <div className="pub-level-name">Session Mutations</div>
          <div className="pub-level-desc">Substitute exercises, modify sets and reps, or adjust tempo within a single session. No upstream structural impact.</div>
          <div className="pub-level-freq">Trigger: equipment constraints, acute readiness, exercise-level feedback</div>
        </div>
      </div>
    </div>
    <div className="pub-figure-note">
      The CP Mutation Scope Hierarchy — trainchat.ai/whitepapers/conversational-periodization · Available under Creative Commons for educational use with attribution to TrainChat®
    </div>
  </>
);

export default function CpPrintPage() {
  return (
    <WhitepaperPrintLayout
      meta={{
        docTitle: "TrainChat® — Conversational Periodization (2026)",
        brand: "TrainChat® · Publications · 2026",
        eyebrow: "Whitepaper · Conversational Periodization",
        title: "Conversational Periodization",
        subtitle: "Toward Adaptive Training Systems Built Through Continuous Coaching Dialogue",
        tagline: '"Each exchange is not a deviation from the plan. It is the plan continuing to develop in response to new information."',
        author: "Bryan Jones",
        affiliation: "Founder, TrainChat®",
        year: "2026",
        canonical: "trainchat.ai/whitepapers/conversational-periodization",
        printBarLabel: "TrainChat® Publications · Conversational Periodization · 2026",
      }}
      abstract={{
        paragraphs: [
          "Traditional periodization treats the training plan as a blueprint — designed in full before the first session and executed linearly from there. Real coaching is not a blueprint. It is a continuous series of observations, interpretations, and adjustments informed by what actually happened during training.",
          "This paper describes conversational periodization: a model where the training plan is not fixed but mutable, evolving through coaching dialogue while preserving longitudinal coherence. Each exchange is not a deviation from the plan. It is the plan continuing to develop in response to new information. We define the mechanisms through which this model operates — dynamic block mutation, training-state continuity, adaptive sequencing, and conversational refinement loops — and argue that these mechanisms are the structural requirements for coaching systems that remain accurate across the full duration of an athlete's training cycle.",
        ],
        keywords: ["Conversational Periodization", "CP", "Dynamic Block Mutation", "Training-State Continuity", "Adaptive Sequencing", "Refinement Loops", "Living Training Systems", "Periodization Software"],
      }}
      sections={[
        {
          number: "1.",
          heading: "The Limits of Linear Periodization Software",
          content: [
            "Periodization software treats the plan as a stable object — a document to be followed. The assumption is that if the plan is well-designed, execution is all that remains. This assumption breaks immediately when the athlete's training state diverges from what the plan anticipated.",
            "The problem is architectural. Linear periodization software is optimized for plan creation, not plan evolution. When circumstances change — injury, schedule disruption, unexpected performance, fatigue accumulation — the system has no native mechanism for structural response. Only note-taking. The coach is left to improvise in the margins of a document that was designed for a different athlete in a different moment.",
            "Three structural limitations characterize linear periodization software. Plan-as-document: the plan lives as static text, not queryable state. Single-author bias: athlete input has no formal place in the plan structure. And the mutation gap: changes require manual reconstruction rather than structured mutation applied to a live program object. Each limitation reduces the quality of the coaching relationship — not because the coach is less capable, but because the tool cannot represent the information the coach needs to act on.",
          ],
          pullQuote: "Linear periodization software is optimized for plan creation, not plan evolution. The coach is left to improvise in the margins of a document that was designed for a different athlete in a different moment.",
        },
        {
          number: "2.",
          heading: "Coaching as Iterative Dialogue",
          content: [
            "The coach-athlete relationship has always been conversational. A session ends. The coach asks. The athlete answers. The next session is adjusted accordingly. This is not informal improvisation — it is structured information processing disguised as conversation.",
            "Conversational periodization formalizes this exchange. Athlete statements are parsed as structured inputs. 'Make day 2 more explosive' is not a note — it is a mutation instruction targeting session 2's energy system emphasis, requiring a specific class of exercise substitution and load redistribution. 'Lower fatigue this week' maps to a volume reduction and fatigue budget redistribution. 'Shift this toward hypertrophy' requires a rep range mutation and tempo adjustment.",
            "The formalization matters because it makes the athlete's contribution to the coaching relationship traceable. In a conversational periodization system, every dialogue turn that results in a structural program change is logged with the athlete's input, the system's interpretation, and the mutation executed. The coaching history is not reconstructed from memory — it is recovered from a structured record of every exchange that shaped the program.",
          ],
        },
        {
          number: "3.",
          heading: "Dynamic Block and Week Mutation",
          content: [
            "The training block is the natural unit of periodization. Dynamic block mutation allows individual weeks, sessions, or exercises within a block to be modified without invalidating the block's accumulated structure. The block's orientation — its training emphasis, peak target, and fatigue curve — is preserved even as its components are adjusted.",
            "This distinction matters architecturally. When a week is mutated, it is not replaced — it is transformed in place. The system maintains the relationship between that week and all other weeks in the block, recalculating downstream dependencies while preserving block-level coherence.",
            "Mutations are scoped to three levels. Block mutations change the block's training emphasis, periodization structure, or peak target and cascade through all contained weeks. Week mutations redistribute load, reorder sessions, or adjust volume within a single training week. Session mutations substitute exercises, modify sets and reps, or adjust tempo within a single session. This hierarchy determines the scope of recalculation required after any given change and ensures that mutations are applied at the lowest structural level that adequately addresses the coaching need.",
          ],
        },
        {
          number: "4.",
          heading: "Training-State Continuity",
          content: [
            "Training-state continuity is the principle that a program mutation should never discard the structural history that preceded it. Every session completed, every load managed, every fatigue signal registered — these form the training state that informs every subsequent decision.",
            "When a coach tells an athlete to 'start over,' the athlete never actually does. The nervous system remembers. The connective tissue remembers. A system that respects training-state continuity similarly refuses to treat any mutation as a clean-slate reset. Every change is a transformation of existing state, not a replacement of it.",
            "The training state comprises three components. Accumulated load: the total volume and intensity history across sessions and blocks. Mutation history: the complete record of all structural changes and the constraints or athlete inputs that triggered them. And progression trajectory: the directional load curve and peak readiness forecast derived from performance data. All three are required for coaching decisions that account for where the athlete has been, not just where they are.",
          ],
          pullQuote: "Training-state continuity refuses to treat any mutation as a clean-slate reset. Every change is a transformation of existing state, not a replacement of it.",
        },
        {
          number: "5.",
          heading: "Adaptive Sequencing Under Fatigue",
          content: [
            "Adaptive sequencing is the capacity to reorder, restructure, or redistribute training stimulus across a cycle when fatigue accumulation diverges from the plan. This is not deloading — it is structural resequencing that maintains cumulative adaptation intent while adjusting the path.",
            "A conversational periodization system can receive a fatigue signal mid-block — 'this week is too heavy' — and respond not by simply reducing weight, but by restructuring the remaining sessions to preserve the block's adaptation curve while returning the athlete to productive training.",
            "Three sequencing response types address different divergence scenarios. Load compression maintains the week's stimulus by concentrating it into fewer, higher-quality sessions — appropriate when schedule constraints reduce session availability. Forward displacement defers specific training demands to the following week without disrupting the block arc — appropriate when acute fatigue is high but recovery capacity is intact. Intensity-volume swap preserves total training stress by trading volume for reduced intensity, or vice versa — appropriate when one dimension of load needs reduction while the other can compensate.",
          ],
        },
        {
          number: "6.",
          heading: "Conversational Refinement Loops",
          content: [
            "A refinement loop is a structured cycle of feedback and structural response: the athlete reports, the system interprets, the program mutates, and the mutation is confirmed before execution. This sequence — observe, interpret, mutate, confirm — is the core operational unit of conversational periodization.",
            "The confirmation step is not optional. A system that applies mutations without surfacing them to the athlete has replaced coaching dialogue with unilateral adjustment. The value of conversational periodization is not just that the program responds — it is that the athlete understands and accepts the response.",
            "The refinement loop also functions as a data collection mechanism. Every confirmed mutation is evidence about what the athlete's training state required at that moment. Across a full training cycle, the accumulated loop history describes the actual path the athlete took through the program — not the planned path, but the real one. This data is the most accurate representation of the coaching relationship that exists, and it is the foundation for making better programming decisions in subsequent cycles.",
          ],
        },
        {
          number: "7.",
          heading: "Periodization as a Living System",
          content: [
            "The Living Systems Model proposes that a training program is not an object but an organism — one that must adapt to its environment to survive. An organism that cannot adapt does not simply underperform. It becomes irrelevant to the athlete it was designed to serve.",
            "Human-AI collaborative coaching closes the gap between what a coach can observe in a single session and what the program needs to know to remain structurally sound across dozens of sessions. The coach provides context, judgment, and oversight. The system provides structural consistency, mutation fidelity, and state continuity. Together, they produce something neither can produce alone: a program that is both structurally sound and genuinely responsive to real conditions.",
            "Conversational periodization is the implementation of this collaboration at the level of program architecture. It is not a feature added to existing periodization software. It is a different model of what a training plan is — one where dialogue is not an annotation on the plan but the mechanism through which the plan continues to develop.",
          ],
          pullQuote: "Conversational periodization is a different model of what a training plan is — one where dialogue is not an annotation on the plan but the mechanism through which the plan continues to develop.",
        },
      ]}
      figure={CP_FIGURE}
      citation={{
        formatted: `TrainChat®. (2026). Conversational Periodization: Toward Adaptive Training Systems Built Through Continuous Coaching Dialogue. TrainChat® Publications. https://www.trainchat.ai/whitepapers/conversational-periodization`,
        related: [
          "Constraint-Aware Coaching Systems — trainchat.ai/whitepapers/constraint-aware-coaching-systems",
          "The Deterministic-Generative Hybrid Model — trainchat.ai/whitepapers/deterministic-generative-hybrid-model",
          "The Problem With Static Programming — trainchat.ai/whitepapers/the-problem-with-static-programming",
        ],
        framework: [
          "Conversational Periodization — trainchat.ai/whitepapers/conversational-periodization",
          "Framework Diagrams — trainchat.ai/diagrams",
          "Methodology — trainchat.ai/methodology",
          "The Coaching Doctrine — trainchat.ai/doctrine",
        ],
        canonicalUrl: "trainchat.ai/whitepapers/conversational-periodization",
      }}
    />
  );
}
