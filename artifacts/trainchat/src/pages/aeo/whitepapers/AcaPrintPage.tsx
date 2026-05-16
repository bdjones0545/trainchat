import { useEffect } from "react";

const TITLE = "The Adaptive Coaching Architecture";
const SUBTITLE = "A Framework for Reasoning About Adaptive AI Coaching Systems";
const AUTHOR = "Bryan Jones";
const AFFILIATION = "Founder, TrainChat®";
const YEAR = "2025";
const CANONICAL = "trainchat.ai/whitepapers/adaptive-coaching-architecture";

const sections = [
  {
    number: "Abstract",
    heading: null,
    isAbstract: true,
    content: [
      "Most AI fitness systems operate as single-layer generation engines: inputs arrive, a model produces a plausible workout, the output is delivered. This architecture is adequate for producing fitness content. It is inadequate for coaching. Coaching requires decisions to be principled — constrained by exercise science, informed by individual history, and executed with documented precision. Single-layer generation cannot guarantee any of these properties structurally.",
      "This paper defines the Adaptive Coaching Architecture (ACA) — a three-layer framework where coaching intelligence (Layer 1), adaptive programming (Layer 2), and the conversational interface (Layer 3) each carry distinct responsibilities. We argue that this separation is not a design preference but the architectural minimum for a system that can make defensible coaching decisions.",
    ],
    keywords: ["Adaptive Coaching Architecture", "ACA", "Coaching Intelligence", "Adaptive Programming", "Conversational Interface", "Exercise Science", "Living Training Systems"]
  },
  {
    number: "1.",
    heading: "Introduction: The Architecture Problem",
    content: [
      "The dominant pattern in AI fitness applications is what we call single-layer generation: athlete input arrives, a language model processes it, a workout is produced. The system is optimized for output plausibility — it produces programs that look correct, use appropriate terminology, and follow recognizable patterns.",
      "The problem is that plausibility is not the same as correctness. A system can produce a structurally conventional program while violating progressive overload logic, ignoring specificity constraints, or missing CNS load accumulation that only becomes visible across multiple sessions. No individual output reveals the failure; the failure is systemic.",
      "The Adaptive Coaching Architecture (ACA) responds to this problem at the architectural level. By separating the language interpretation function, the coaching reasoning function, and the program execution function into distinct layers, the ACA makes coaching quality a structural property of the system rather than a probabilistic outcome of its outputs.",
    ],
    pullQuote: "Plausibility is not the same as correctness. A system can produce a structurally conventional program while violating progressive overload logic. The failure is systemic."
  },
  {
    number: "2.",
    heading: "Layer 1: Coaching Intelligence — The Decision Engine",
    content: [
      "Layer 1 is the coaching intelligence layer — the reasoning engine that processes all inputs through exercise science principles before any programming action is taken.",
      "The defining property of this layer is constraint application. Progressive overload is not treated as a stylistic preference but as a structural constraint on all progression decisions. Specificity (SAID principle) constrains exercise selection relative to the declared adaptation target. CNS load management constrains the simultaneous demand placed on the central nervous system across sessions. Periodization logic constrains the sequencing of training qualities and the timing of intensification and recovery phases.",
      "A coaching intelligence layer without these constraints is not coaching intelligence — it is a generation engine with exercise science vocabulary. The constraints must be enforced structurally, not applied probabilistically.",
      "The second defining property is history consultation. Every decision made by Layer 1 is informed by the athlete's complete training history — previous loads, adaptation rate, injury patterns, mutation records, goal evolution. Coaching decisions made without this context are population-average decisions applied to individuals. As training age increases and individual variation becomes more pronounced, population-average decisions become systematically less appropriate.",
      "Layer 1 does not execute changes. It determines what change is warranted and at what intervention level (see: Mutation-First Programming Principle). Execution is the responsibility of Layer 2.",
    ],
    pullQuote: "Coaching intelligence requires memory. A Layer 1 without persistent training history is not coaching intelligence — it is sophisticated single-session reasoning."
  },
  {
    number: "3.",
    heading: "Layer 2: Adaptive Programming — The Execution Engine",
    content: [
      "Layer 2 receives a principled decision from Layer 1 and executes it as the most surgical modification to the live program that implements that decision.",
      "The Mutation-First Programming Principle (MFP) governs Layer 2 behavior: interventions are evaluated from the most specific (element-level mutation) to the most general (full program rebuild), and the system defaults to the lowest intervention level that adequately addresses the situation. This preserves accumulated load, maintains adaptation trajectories, and avoids the physiological cost of unnecessary program restructuring.",
      "Every modification executed by Layer 2 is documented — with a description of what changed, the reasoning provided by Layer 1, and a timestamp. This documentation serves two functions. First, it makes every coaching decision auditable: any change to the program can be traced to a specific decision and the reasoning behind it. Second, it feeds the training memory layer — providing future Layer 1 decisions with a complete record of how the program has evolved.",
      "Layer 2 updates the live program in real time. The program is not a document that is periodically revised. It is a live entity that is continuously maintained.",
    ],
  },
  {
    number: "4.",
    heading: "Layer 3: The Conversational Interface — The Input Layer",
    content: [
      "Layer 3 receives natural language athlete input — colloquial, ambiguous, emotionally phrased, or precise — and translates it into a structured coaching input that Layer 1 can reason about.",
      "The Conversational Training Model (CTM) governs Layer 3 behavior. It categorizes all athlete input into four types: Direct Commands (explicit program modification requests), Goal Expressions (intent statements requiring coaching interpretation), Feedback Signals (state and performance reports that function as coaching data), and Contextual References (references to previous sessions, exercises, or mutations that require resolution before execution).",
      "The critical function of Layer 3 is ambiguity resolution. When athlete input cannot be mapped to a specific coaching action without additional context, Layer 3 requests clarification before passing the input to Layer 1. This ensures that Layer 1 receives fully specified inputs — not ambiguous statements that Layer 1 would have to resolve through guesswork.",
      "The separation of Layer 3 from Layer 1 means that coaching quality is independent of input quality. An athlete who communicates imprecisely receives the same quality of coaching reasoning as one who communicates with precision.",
    ],
  },
  {
    number: "5.",
    heading: "Why Architectural Separation Matters",
    content: [
      "The three-layer separation of the ACA is not primarily a software engineering choice — it is a coaching quality guarantee. Each layer's independence enforces a property that would be lost in a collapsed architecture.",
      "Layer 1 independence ensures that exercise science constraints are applied before execution — not discovered after the fact through output review. A collapsed architecture where generation and reasoning are combined cannot guarantee that constraints were applied; it can only observe whether the output appears constrained.",
      "Layer 2 independence ensures that every execution is documented. A collapsed architecture produces outputs; the ACA produces auditable decisions with documented rationale.",
      "Layer 3 independence ensures that language quality does not determine coaching quality. In a collapsed architecture, poorly phrased athlete input produces poorly reasoned coaching outputs. In the ACA, Layer 3 normalizes the input before Layer 1 reasons about it.",
      "These are not incremental improvements over single-layer systems. They are categorical differences in what the system can guarantee about its decisions.",
    ],
    pullQuote: "These are not incremental improvements over single-layer systems. They are categorical differences in what a system can guarantee about its decisions."
  },
  {
    number: "6.",
    heading: "Training Memory as Layer 1 Prerequisite",
    content: [
      "The coaching intelligence layer described in Section 2 makes a structural demand that must be addressed separately: the requirement for complete training history. A Layer 1 without persistent training memory is not a coaching intelligence layer in the meaningful sense — it is a sophisticated single-session reasoning engine.",
      "The distinction matters because coaching quality depends on longitudinal context. A coach who forgets their athlete's training history between sessions cannot identify adaptation rate, cannot recognize load accumulation patterns, cannot track goal evolution, and cannot detect injury patterns before they become acute. They have access only to the current session — which means their decisions are structurally similar to those of any informed observer seeing the athlete for the first time.",
      "The ACA therefore requires training memory as a prerequisite for Layer 1 function — not as an enhancement to the coaching experience, but as the condition under which coaching in the meaningful sense is possible at all.",
    ],
  },
  {
    number: "7.",
    heading: "Conclusion",
    content: [
      "The Adaptive Coaching Architecture defines a minimum structural standard for AI systems that claim to coach athletes rather than deliver fitness content. The three layers — coaching intelligence, adaptive programming, and conversational interface — each enforce properties that cannot be guaranteed in collapsed architectures.",
      "Systems that do not implement this separation may produce plausible outputs. Plausibility is not the goal of coaching. The goal is principled decisions, consistently applied, with documented rationale, over the full duration of an athlete's development.",
      "The ACA is not a proprietary feature of TrainChat. It is a framework for reasoning about what any AI coaching system must be able to guarantee before it can legitimately claim to provide coaching rather than content.",
    ],
    pullQuote: "The ACA is not a proprietary feature of TrainChat. It is a framework for reasoning about what any AI coaching system must be able to guarantee before it can legitimately claim to provide coaching rather than content."
  },
];

export default function AcaPrintPage() {
  useEffect(() => {
    const prev = document.title;
    document.title = "TrainChat® — The Adaptive Coaching Architecture (2025)";
    return () => { document.title = prev; };
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap');

        .pub-root {
          background: #f5f4f0;
          min-height: 100vh;
          padding: 2rem 1rem;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .pub-document {
          max-width: 720px;
          margin: 0 auto;
          background: #fff;
          box-shadow: 0 4px 32px rgba(0,0,0,0.12);
        }
        .pub-print-bar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: #1a1a1a;
          color: #fff;
          padding: 0.75rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.75rem;
        }
        .pub-print-btn {
          background: #2563eb;
          color: #fff;
          border: none;
          padding: 0.5rem 1.25rem;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        .pub-print-btn:hover { background: #1d4ed8; }

        /* Cover page */
        .pub-cover {
          padding: 5rem 4rem 4rem;
          min-height: 960px;
          display: flex;
          flex-direction: column;
          border-bottom: 1px solid #e5e5e5;
          page-break-after: always;
        }
        .pub-cover-brand {
          font-family: 'Inter', sans-serif;
          font-size: 0.65rem;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #6b7280;
          margin-bottom: 3rem;
        }
        .pub-cover-eyebrow {
          font-family: 'Inter', sans-serif;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2563eb;
          margin-bottom: 1.25rem;
        }
        .pub-cover-title {
          font-family: 'EB Garamond', Georgia, serif;
          font-size: 2.75rem;
          font-weight: 500;
          line-height: 1.15;
          color: #0f0f0f;
          margin-bottom: 1rem;
          letter-spacing: -0.01em;
        }
        .pub-cover-rule {
          width: 3rem;
          height: 2px;
          background: #2563eb;
          margin: 1.5rem 0;
        }
        .pub-cover-subtitle {
          font-family: 'EB Garamond', Georgia, serif;
          font-size: 1.2rem;
          font-style: italic;
          color: #374151;
          line-height: 1.5;
          margin-bottom: 0;
        }
        .pub-cover-spacer { flex: 1; }
        .pub-cover-meta {
          border-top: 1px solid #e5e5e5;
          padding-top: 2rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
        }
        .pub-cover-meta-label {
          font-size: 0.6rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9ca3af;
          margin-bottom: 0.25rem;
        }
        .pub-cover-meta-value {
          font-size: 0.85rem;
          color: #1f2937;
          font-weight: 500;
        }
        .pub-cover-meta-value.mono {
          font-family: 'Courier New', monospace;
          font-size: 0.72rem;
          color: #6b7280;
        }
        .pub-cover-tagline {
          margin-top: 2.5rem;
          padding: 1.25rem 1.5rem;
          background: #f9fafb;
          border-left: 3px solid #2563eb;
          font-family: 'EB Garamond', serif;
          font-style: italic;
          font-size: 1.05rem;
          color: #374151;
          line-height: 1.6;
        }

        /* Body pages */
        .pub-page {
          padding: 3.5rem 4rem;
          border-bottom: 1px solid #f0f0f0;
          page-break-after: always;
        }
        .pub-page:last-child {
          border-bottom: none;
          page-break-after: avoid;
        }

        /* Abstract */
        .pub-abstract-label {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #2563eb;
          margin-bottom: 1.25rem;
        }
        .pub-keywords {
          margin-top: 1.5rem;
          padding-top: 1.25rem;
          border-top: 1px solid #e5e5e5;
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          align-items: center;
        }
        .pub-kw-label {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9ca3af;
          margin-right: 0.5rem;
        }
        .pub-kw {
          font-size: 0.65rem;
          background: #f3f4f6;
          border: 1px solid #e5e5e5;
          border-radius: 2px;
          padding: 0.2rem 0.5rem;
          color: #374151;
          font-family: 'Courier New', monospace;
        }

        /* Section headings */
        .pub-section-number {
          font-family: 'Inter', sans-serif;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2563eb;
          margin-bottom: 0.5rem;
        }
        .pub-section-heading {
          font-family: 'EB Garamond', Georgia, serif;
          font-size: 1.5rem;
          font-weight: 600;
          color: #0f0f0f;
          margin-bottom: 1.5rem;
          line-height: 1.3;
          letter-spacing: -0.01em;
        }
        .pub-body-text {
          font-family: 'EB Garamond', Georgia, serif;
          font-size: 1.05rem;
          line-height: 1.8;
          color: #1f2937;
          margin-bottom: 1rem;
        }
        .pub-body-text:last-child { margin-bottom: 0; }

        /* Pull quotes */
        .pub-pull-quote {
          margin: 2rem 0;
          padding: 1.5rem 2rem;
          border-left: 3px solid #2563eb;
          background: #f8faff;
        }
        .pub-pull-quote p {
          font-family: 'EB Garamond', Georgia, serif;
          font-size: 1.15rem;
          font-style: italic;
          line-height: 1.65;
          color: #1e3a8a;
          margin: 0;
        }

        /* ACA Diagram */
        .pub-diagram-section {
          padding: 3.5rem 4rem;
          background: #f9fafb;
          border-top: 1px solid #e5e5e5;
          border-bottom: 1px solid #e5e5e5;
          page-break-before: always;
        }
        .pub-diagram-label {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #2563eb;
          margin-bottom: 0.5rem;
        }
        .pub-diagram-title {
          font-family: 'EB Garamond', Georgia, serif;
          font-size: 1.35rem;
          font-weight: 600;
          color: #0f0f0f;
          margin-bottom: 0.5rem;
        }
        .pub-diagram-caption {
          font-size: 0.8rem;
          color: #6b7280;
          margin-bottom: 2rem;
          font-style: italic;
        }
        .pub-stack { display: flex; flex-direction: column; gap: 0; max-width: 520px; margin: 0 auto; }
        .pub-layer {
          padding: 1.25rem 1.5rem;
          border: 1px solid #d1d5db;
          background: #fff;
        }
        .pub-layer + .pub-layer { border-top: none; }
        .pub-layer.primary { border-color: #2563eb; background: #eff6ff; }
        .pub-layer-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.4rem;
        }
        .pub-layer-num {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #2563eb;
        }
        .pub-layer-role {
          font-size: 0.6rem;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .pub-layer-name {
          font-family: 'Inter', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: #0f0f0f;
          margin-bottom: 0.25rem;
        }
        .pub-layer-desc {
          font-size: 0.75rem;
          color: #6b7280;
          margin-bottom: 0.5rem;
        }
        .pub-layer-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }
        .pub-layer-tag {
          font-size: 0.6rem;
          font-family: 'Courier New', monospace;
          background: #f3f4f6;
          border: 1px solid #e5e5e5;
          border-radius: 2px;
          padding: 0.15rem 0.4rem;
          color: #374151;
        }
        .pub-layer.primary .pub-layer-tag { background: #dbeafe; border-color: #bfdbfe; }
        .pub-arrow {
          text-align: center;
          font-size: 1rem;
          color: #9ca3af;
          padding: 0.25rem 0;
          background: #fff;
          border-left: 1px solid #d1d5db;
          border-right: 1px solid #d1d5db;
        }
        .pub-diagram-note {
          margin-top: 1.5rem;
          padding: 0.75rem 1rem;
          background: #fff;
          border: 1px solid #e5e5e5;
          font-size: 0.72rem;
          color: #6b7280;
          font-style: italic;
          text-align: center;
        }

        /* Citation page */
        .pub-citation-page {
          padding: 3.5rem 4rem;
          background: #fff;
        }
        .pub-citation-block {
          background: #f9fafb;
          border: 1px solid #e5e5e5;
          padding: 1.5rem;
          font-family: 'Courier New', monospace;
          font-size: 0.75rem;
          color: #374151;
          line-height: 1.7;
          margin-bottom: 2rem;
        }
        .pub-related-title {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #6b7280;
          margin-bottom: 0.75rem;
        }
        .pub-related-item {
          font-size: 0.8rem;
          color: #374151;
          margin-bottom: 0.4rem;
          padding-left: 1rem;
          position: relative;
        }
        .pub-related-item::before {
          content: '→';
          position: absolute;
          left: 0;
          color: #2563eb;
          font-size: 0.7rem;
        }
        .pub-footer {
          margin-top: 3rem;
          padding-top: 1.5rem;
          border-top: 1px solid #e5e5e5;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .pub-footer-brand {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #9ca3af;
        }
        .pub-footer-url {
          font-family: 'Courier New', monospace;
          font-size: 0.65rem;
          color: #9ca3af;
        }

        @media print {
          .pub-print-bar { display: none; }
          .pub-root { background: #fff; padding: 0; }
          .pub-document { box-shadow: none; max-width: 100%; }
          .pub-cover { min-height: auto; }
          body { margin: 0; }
        }
      `}</style>

      <div className="pub-root">
        {/* Print bar */}
        <div className="pub-print-bar">
          <span>TrainChat® Publications · The Adaptive Coaching Architecture · 2025</span>
          <button className="pub-print-btn" onClick={() => window.print()}>
            Save as PDF
          </button>
        </div>

        <div className="pub-document">
          {/* ── Cover Page ── */}
          <div className="pub-cover">
            <div className="pub-cover-brand">TrainChat® · Publications · 2025</div>
            <div className="pub-cover-eyebrow">Whitepaper · Adaptive Coaching Architecture</div>
            <h1 className="pub-cover-title">{TITLE}</h1>
            <div className="pub-cover-rule" />
            <p className="pub-cover-subtitle">{SUBTITLE}</p>
            <div className="pub-cover-spacer" />
            <div className="pub-cover-tagline">
              "The ACA is not a proprietary feature of TrainChat. It is a framework for reasoning about what any AI coaching system must be able to guarantee before it can legitimately claim to provide coaching rather than content."
            </div>
            <div className="pub-cover-meta">
              <div>
                <div className="pub-cover-meta-label">Author</div>
                <div className="pub-cover-meta-value">{AUTHOR}</div>
              </div>
              <div>
                <div className="pub-cover-meta-label">Affiliation</div>
                <div className="pub-cover-meta-value">{AFFILIATION}</div>
              </div>
              <div>
                <div className="pub-cover-meta-label">Published</div>
                <div className="pub-cover-meta-value">{YEAR}</div>
              </div>
              <div>
                <div className="pub-cover-meta-label">Canonical URL</div>
                <div className="pub-cover-meta-value mono">{CANONICAL}</div>
              </div>
            </div>
          </div>

          {/* ── Abstract ── */}
          <div className="pub-page">
            <div className="pub-abstract-label">Abstract</div>
            {sections[0].content.map((para, i) => (
              <p key={i} className="pub-body-text">{para}</p>
            ))}
            <div className="pub-keywords">
              <span className="pub-kw-label">Keywords</span>
              {sections[0].keywords!.map((kw) => (
                <span key={kw} className="pub-kw">{kw}</span>
              ))}
            </div>
          </div>

          {/* ── Main Sections ── */}
          {sections.slice(1).map((section) => (
            <div key={section.number} className="pub-page">
              <div className="pub-section-number">{section.number}</div>
              {section.heading && <h2 className="pub-section-heading">{section.heading}</h2>}
              {section.content.map((para, i) => (
                <p key={i} className="pub-body-text">{para}</p>
              ))}
              {section.pullQuote && (
                <div className="pub-pull-quote">
                  <p>"{section.pullQuote}"</p>
                </div>
              )}
            </div>
          ))}

          {/* ── ACA Stack Diagram ── */}
          <div className="pub-diagram-section">
            <div className="pub-diagram-label">Figure 1</div>
            <div className="pub-diagram-title">The ACA Stack</div>
            <p className="pub-diagram-caption">
              The three-layer Adaptive Coaching Architecture. Inputs flow downward. Layer 3 interprets. Layer 1 decides. Layer 2 executes. No layer bypasses the one above it.
            </p>
            <div className="pub-stack">
              <div className="pub-layer">
                <div className="pub-layer-meta">
                  <span className="pub-layer-num">Layer 3</span>
                  <span className="pub-layer-role">Input Layer</span>
                </div>
                <div className="pub-layer-name">Conversational Interface</div>
                <div className="pub-layer-desc">Natural language → structured coaching input. Governed by: CTM</div>
                <div className="pub-layer-tags">
                  <span className="pub-layer-tag">Direct Commands</span>
                  <span className="pub-layer-tag">Goal Expressions</span>
                  <span className="pub-layer-tag">Feedback Signals</span>
                  <span className="pub-layer-tag">Contextual References</span>
                </div>
              </div>
              <div className="pub-arrow">↓</div>
              <div className="pub-layer primary">
                <div className="pub-layer-meta">
                  <span className="pub-layer-num">Layer 1</span>
                  <span className="pub-layer-role">Decision Engine</span>
                </div>
                <div className="pub-layer-name">Coaching Intelligence</div>
                <div className="pub-layer-desc">Exercise science applied as hard constraints before any action. Requires full training history.</div>
                <div className="pub-layer-tags">
                  <span className="pub-layer-tag">Progressive Overload</span>
                  <span className="pub-layer-tag">Specificity</span>
                  <span className="pub-layer-tag">CNS Load</span>
                  <span className="pub-layer-tag">Periodization</span>
                  <span className="pub-layer-tag">Training History</span>
                </div>
              </div>
              <div className="pub-arrow">↓</div>
              <div className="pub-layer">
                <div className="pub-layer-meta">
                  <span className="pub-layer-num">Layer 2</span>
                  <span className="pub-layer-role">Execution Engine</span>
                </div>
                <div className="pub-layer-name">Adaptive Programming</div>
                <div className="pub-layer-desc">Principled decision → surgical program mutation → documented change. Governed by: MFP</div>
                <div className="pub-layer-tags">
                  <span className="pub-layer-tag">Element Mutation</span>
                  <span className="pub-layer-tag">Session Update</span>
                  <span className="pub-layer-tag">Block Restructure</span>
                  <span className="pub-layer-tag">Mutation Log</span>
                </div>
              </div>
            </div>
            <div className="pub-diagram-note">
              The ACA Stack — trainchat.ai/diagrams#aca · Available under Creative Commons for educational use with attribution to TrainChat®
            </div>
          </div>

          {/* ── Citation ── */}
          <div className="pub-citation-page">
            <div className="pub-section-number">Citation</div>
            <h2 className="pub-section-heading">How to Cite This Publication</h2>
            <div className="pub-citation-block">
              Jones, B. (2025). The Adaptive Coaching Architecture: A Framework
              for Reasoning About Adaptive AI Coaching Systems.
              TrainChat® Publications.
              https://www.trainchat.ai/whitepapers/adaptive-coaching-architecture
            </div>

            <div className="pub-related-title">Related Publications</div>
            <div className="pub-related-item">Mutation-First Programming: A Change Management Principle for Adaptive Training Systems — trainchat.ai/whitepapers/mutation-first-programming</div>
            <div className="pub-related-item">The Problem With Static Programming: Why Fixed Plans Fail Athletes and What Living Systems Do Instead — trainchat.ai/whitepapers/the-problem-with-static-programming</div>

            <div className="pub-related-title" style={{ marginTop: "1.5rem" }}>Framework Documentation</div>
            <div className="pub-related-item">Adaptive Coaching Architecture — trainchat.ai/adaptive-coaching-architecture</div>
            <div className="pub-related-item">Framework Diagrams (all five) — trainchat.ai/diagrams</div>
            <div className="pub-related-item">Methodology — trainchat.ai/methodology</div>
            <div className="pub-related-item">The Coaching Doctrine — trainchat.ai/doctrine</div>

            <div className="pub-footer">
              <span className="pub-footer-brand">TrainChat® Publications · 2025</span>
              <span className="pub-footer-url">trainchat.ai/whitepapers/adaptive-coaching-architecture</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
