import WhitepaperPrintLayout from "./WhitepaperPrintLayout";

const LSM_FIGURE = (
  <>
    <div className="pub-figure-label">Figure 1</div>
    <div className="pub-figure-title">The Three Properties of a Living Training System</div>
    <p className="pub-figure-caption">
      Each property directly addresses a structural failure mode of static programming. Together they define the minimum architectural standard for a system that improves its decisions over time.
    </p>
    <div className="pub-properties">
      <div className="pub-property">
        <div className="pub-property-num">1</div>
        <div className="pub-property-content">
          <div className="pub-property-name">Persistence</div>
          <div className="pub-property-tag">Training Memory</div>
          <div className="pub-property-desc">The system retains all training history indefinitely and actively uses that history to inform future decisions. Every coaching decision has access to the athlete's complete adaptation rate, load history, injury history, and program evolution.</div>
          <div className="pub-property-addresses">Addresses: assumption failure · memory loss between cycles</div>
        </div>
      </div>
      <div className="pub-property">
        <div className="pub-property-num">2</div>
        <div className="pub-property-content">
          <div className="pub-property-name">Adaptability</div>
          <div className="pub-property-tag">Mutation Capability</div>
          <div className="pub-property-desc">The system modifies its prescriptions in response to actual performance data, athlete feedback, and changing context — without requiring a new program cycle. Modifications are targeted, documented, and do not require the program to be rebuilt from scratch.</div>
          <div className="pub-property-addresses">Addresses: context ignorance · assumption failure</div>
        </div>
      </div>
      <div className="pub-property">
        <div className="pub-property-num">3</div>
        <div className="pub-property-content">
          <div className="pub-property-name">Continuity</div>
          <div className="pub-property-tag">Persistent Coaching Intelligence</div>
          <div className="pub-property-desc">The system carries forward long-term context — not just the previous session but months of training history — into every coaching decision. The athlete's demonstrated adaptation rate is known and applied to current prescriptions.</div>
          <div className="pub-property-addresses">Addresses: progression rate mismatch · memory loss between cycles</div>
        </div>
      </div>
    </div>
    <div className="pub-figure-note">
      The LSM Properties — trainchat.ai/methodology#lsm · Available under Creative Commons for educational use with attribution to TrainChat®
    </div>
  </>
);

export default function LsmPrintPage() {
  return (
    <WhitepaperPrintLayout
      meta={{
        docTitle: "TrainChat® — The Problem With Static Programming (2025)",
        brand: "TrainChat® · Publications · 2025",
        eyebrow: "Whitepaper · Living System Methodology",
        title: "The Problem With Static Programming",
        subtitle: "Why Fixed Plans Fail Athletes and What Living Systems Do Instead",
        tagline: '"Living training systems are not a premium alternative to fixed plans. They are the structural minimum for a training system that aspires to provide coaching quality."',
        author: "Bryan Jones",
        affiliation: "Founder, TrainChat®",
        year: "2025",
        canonical: "trainchat.ai/whitepapers/the-problem-with-static-programming",
        printBarLabel: "TrainChat® Publications · The Problem With Static Programming · 2025",
      }}
      abstract={{
        paragraphs: [
          "Fixed training plans are predictions. They encode assumptions about how an athlete will respond over a defined period — assumptions that are routinely wrong for specific individuals, wrong in specific weeks, and wrong as individual circumstances change. This paper makes the structural case against fixed planning: not as a preference argument, but as an argument about what fixed plans are architecturally capable of providing and what they cannot.",
          "We define the three properties that distinguish a living training system from a static program — persistence, adaptability, and continuity — and argue that each property represents a non-negotiable requirement for coaching quality over extended training periods. We then explain why meeting these requirements demands architectural choices that most fitness applications have not made.",
        ],
        keywords: ["Living System Methodology", "LSM", "Living Training System", "Static Programming", "Adaptive Programming", "Training Memory", "Persistence", "Adaptability", "Continuity"],
      }}
      sections={[
        {
          number: "1.",
          heading: "What Static Programming Actually Is",
          content: [
            "A static training program is a set of prescriptions — exercises, loads, progressions, schedules — that are determined in advance and executed as written. The defining feature of static programming is that its prescriptions do not update in response to actual performance data. What is written in week one governs what happens in week eight, regardless of what the athlete has demonstrated in the intervening seven weeks.",
            "Static programs are not bad in the simple sense. For beginners, whose adaptation to any structured stimulus is rapid and whose individual variation in response is lower relative to their adaptation potential, static programs produce meaningful results. The prescriptions are wrong in specifics and right in general — the general direction of more structured training produces improvement.",
            "As training age increases, this tolerance for imprecision narrows. Intermediate and advanced athletes show greater individual variation in adaptation rate, recovery requirements, and response to specific loading patterns. The fixed prescriptions that approximated the right answer for a beginner become increasingly wrong for a specific individual in a specific training phase. The problem is not the static plan as a tool — it is the static plan as an indefinite coaching strategy.",
          ],
          pullQuote: "As training age increases, the tolerance for imprecision narrows. The fixed prescriptions that approximated the right answer for a beginner become increasingly wrong for a specific individual in a specific training phase.",
        },
        {
          number: "2.",
          heading: "The Failure Modes of Fixed Plans",
          content: [
            "Static programs fail in four structurally predictable ways.",
            "Assumption failure. Static programs assume that the athlete will respond as predicted — that week four loads will be appropriate in week four, that the prescribed deload will arrive when accumulated fatigue requires it. Individual variation in recovery rate, stress load, sleep quality, and nutrition means these assumptions are frequently wrong for specific athletes in specific weeks. The program has no mechanism for detecting or responding to the mismatch.",
            "Context ignorance. Static programs cannot account for changes in the athlete's context — a work schedule that makes Thursday training impossible, an injury that contraindicated the primary squat movement, a competition added to the calendar that compresses the preparation timeline. The program continues as written; the athlete deviates manually and loses the program's coherence.",
            "Memory loss between iterations. When a static program concludes and a new one begins, the learning from the previous program — adaptation rate, exercise response, load tolerances — is rarely structurally integrated into the new program. The coach may remember and apply it; the program does not. Each new program starts from assumptions rather than from evidence.",
            "Progression rate mismatch. Static programs prescribe fixed progression increments on a fixed timeline. Athletes who adapt faster than predicted are held back; athletes who adapt slower are pushed forward. Over multiple training cycles, these systematic errors accumulate into meaningful suboptimal outcomes in both directions.",
          ],
        },
        {
          number: "3.",
          heading: "The Three Properties of a Living System",
          content: [
            "The Living System Methodology (LSM) defines the three properties that distinguish a living training system from a static one. Each property directly addresses a failure mode of static programming.",
            "Persistence: The system retains all training history indefinitely and actively uses that history to inform future decisions. Persistence addresses assumption failure and memory loss — a persistent system does not re-assume; it consults the record of what has actually happened. The athlete's adaptation rate, load history, injury history, and program evolution are available to every future coaching decision.",
            "Adaptability: The system modifies its prescriptions in response to actual performance data, athlete feedback, and changing context — without requiring a new program cycle to be initiated. Adaptability addresses context ignorance and assumption failure. When Thursday becomes unavailable, the system reorganizes. When an exercise is contraindicated, it is replaced. The modifications are targeted, documented, and do not require the program to be rebuilt from scratch.",
            "Continuity: The system carries forward long-term context — not just the previous session but months of training history — into every coaching decision. Continuity addresses progression rate mismatch and memory loss between cycles. A system with continuity knows the athlete's demonstrated adaptation rate across previous training blocks and can use it to calibrate current prescriptions.",
            "These three properties are not design aspirations. They are the minimum architectural requirements for a training system that improves its decisions over time as coaching relationships develop.",
          ],
          pullQuote: "These three properties are not design aspirations. They are the minimum architectural requirements for a training system that improves its decisions over time as coaching relationships develop.",
        },
        {
          number: "4.",
          heading: "Why Most Fitness Applications Build Static Programs",
          content: [
            "The prevalence of static programming in fitness applications is not accidental. Building a genuinely living training system requires architectural choices that most applications have not made — and that cannot be retrofitted easily.",
            "Training memory requires infrastructure beyond what session logging provides. The memory must be active — informing decisions — rather than passive (stored and available for the athlete to review). An active training memory must integrate with the coaching intelligence layer, not exist as a separate data store.",
            "Adaptability requires a mutation capability: the ability to modify specific elements of a live program without disrupting the coherent whole. This is architecturally different from generating a new program. Generation is stateless — no knowledge of what existed before is required. Mutation is stateful — it requires understanding what the current program is, which parts are implicated by the new information, and how to make a targeted change that preserves everything else.",
            "Continuity requires persistent coaching intelligence — a reasoning layer that actively references historical context rather than treating each session as an independent event. Most applications are session-scoped by default: the interface resets, the decisions restart. Continuity requires structural choices that prevent this reset.",
          ],
        },
        {
          number: "5.",
          heading: "The Coaching Quality Difference",
          content: [
            "The difference between static and living programming is not primarily a technological one. It is a coaching quality one.",
            "A coach who remembers nothing about their athlete from one session to the next is a worse coach than one with complete recall — regardless of their technical knowledge. The knowledge must be applied to the individual, which requires knowing the individual. Static programs are the equivalent of a coach with complete amnesia between sessions: technically sophisticated but individually blind.",
            "A living training system's advantage over a static program is, in this sense, the same as the advantage of a long-term coaching relationship over a one-time program purchase. The value compounds over time as context accumulates, decisions improve, and the program becomes increasingly specific to the individual athlete it is built for.",
            "This compounding cannot happen in a static architecture. It requires persistence, adaptability, and continuity — the three properties the LSM defines as the minimum standard for a training system that functions as a genuine coaching tool.",
          ],
        },
        {
          number: "6.",
          heading: "Conclusion",
          content: [
            "Fixed training plans are prediction documents. They encode assumptions that are wrong in predictable ways for advanced athletes, wrong in specific ways for individual athletes, and wrong in ways that compound over time as the gap between assumed and actual response widens.",
            "Living training systems are not a premium alternative to fixed plans. They are the structural minimum for a training system that aspires to provide coaching quality — which is defined by decisions that improve over time, account for the individual, and respond to actual rather than assumed conditions.",
            "The three properties of living systems — persistence, adaptability, continuity — are derivable from the failure modes of static programs. Each property addresses a specific, predictable limitation of the static model. A system that lacks any of the three is structurally incapable of providing coaching quality for extended training periods, regardless of how well-designed it is in other respects.",
          ],
          pullQuote: "Living training systems are not a premium alternative to fixed plans. They are the structural minimum for a training system that aspires to provide coaching quality.",
        },
      ]}
      figure={LSM_FIGURE}
      citation={{
        formatted: `Jones, B. (2025). The Problem With Static Programming: Why Fixed Plans Fail Athletes and What Living Systems Do Instead. TrainChat® Publications. https://www.trainchat.ai/whitepapers/the-problem-with-static-programming`,
        related: [
          "The Adaptive Coaching Architecture: A Framework for Reasoning About Adaptive AI Coaching Systems — trainchat.ai/whitepapers/adaptive-coaching-architecture",
          "Mutation-First Programming: A Change Management Principle for Adaptive Training Systems — trainchat.ai/whitepapers/mutation-first-programming",
        ],
        framework: [
          "Living System Methodology — trainchat.ai/methodology#lsm",
          "Framework Diagrams (all five) — trainchat.ai/diagrams",
          "Methodology — trainchat.ai/methodology",
          "The Coaching Doctrine — trainchat.ai/doctrine",
        ],
        canonicalUrl: "trainchat.ai/whitepapers/the-problem-with-static-programming",
      }}
    />
  );
}
