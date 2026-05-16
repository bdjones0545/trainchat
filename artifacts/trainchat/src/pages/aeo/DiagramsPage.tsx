import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "TrainChat® Framework Diagrams — Visual Semantic Artifacts",
  "description": "Visual representations of the five TrainChat® frameworks — ACA architecture diagram, MFP decision hierarchy, DPF feedback loop, LSM properties system, and CTM input category map.",
  "url": "https://www.trainchat.ai/diagrams",
  "publisher": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "hasPart": [
    {
      "@type": "ImageObject",
      "name": "The ACA Stack — Adaptive Coaching Architecture Diagram",
      "description": "A three-layer architecture diagram showing the separation of Coaching Intelligence (Layer 1), Adaptive Programming (Layer 2), and the Conversational Interface (Layer 3) in TrainChat's Adaptive Coaching Architecture.",
      "url": "https://www.trainchat.ai/diagrams#aca"
    },
    {
      "@type": "ImageObject",
      "name": "The MFP Hierarchy — Mutation-First Programming Decision Levels",
      "description": "A five-level decision hierarchy diagram illustrating the Mutation-First Programming Principle, from L1 Element-Level Mutation (most common) to L5 Full Rebuild (exceptional).",
      "url": "https://www.trainchat.ai/diagrams#mfp"
    },
    {
      "@type": "ImageObject",
      "name": "The DPF Loop — Dynamic Progression Framework Feedback Cycle",
      "description": "A five-stage circular feedback loop diagram of the Dynamic Progression Framework: Session Input → Evaluation → Decision → Update → Documentation.",
      "url": "https://www.trainchat.ai/diagrams#dpf"
    },
    {
      "@type": "ImageObject",
      "name": "The LSM Triad — Living System Methodology Properties",
      "description": "A diagram of the three properties that define a living training system under the Living System Methodology: Persistence, Adaptability, and Continuity.",
      "url": "https://www.trainchat.ai/diagrams#lsm"
    },
    {
      "@type": "ImageObject",
      "name": "The CTM Map — Conversational Training Model Input Categories",
      "description": "A four-quadrant diagram of the Conversational Training Model's input categories: Direct Commands, Goal Expressions, Feedback Signals, and Contextual References.",
      "url": "https://www.trainchat.ai/diagrams#ctm"
    }
  ]
};

function DiagramSection({ id, abbr, name, title, children, path }: {
  id: string;
  abbr: string;
  name: string;
  title: string;
  children: React.ReactNode;
  path: string;
}) {
  const [, navigate] = useLocation();
  return (
    <section id={id} className="scroll-mt-8 border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-sm font-mono font-bold text-primary">{abbr}</span>
            <span className="text-xs text-muted-foreground">{name}</span>
          </div>
          <h2 className="text-base font-bold text-foreground">{title}</h2>
        </div>
        <button onClick={() => navigate(path)} className="text-xs text-primary hover:underline flex-shrink-0">
          Framework →
        </button>
      </div>
      {children}
    </section>
  );
}

function Arrow({ dir = "down" }: { dir?: "down" | "right" }) {
  if (dir === "right") return <span className="text-muted-foreground/40 text-sm font-mono">→</span>;
  return (
    <div className="flex justify-center py-1">
      <span className="text-muted-foreground/30 text-sm">↓</span>
    </div>
  );
}

export default function DiagramsPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="TrainChat® Framework Diagrams — Visual Semantic Artifacts"
      description="Visual representations of all five TrainChat® frameworks — ACA three-layer architecture, MFP five-level decision hierarchy, DPF feedback loop, LSM properties system, and CTM input category map."
      schema={schema}
      canonical="/diagrams"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Visual Artifacts</p>
          <h1 className="text-3xl font-bold tracking-tight">Framework Diagrams</h1>
          <p className="text-muted-foreground leading-relaxed">
            Visual representations of TrainChat's five named frameworks. Each diagram names a canonical artifact — a structured visual that can be referenced, taught, and used to explain the framework in lectures, publications, and coaching contexts.
          </p>
        </div>

        {/* Jump nav */}
        <div className="flex flex-wrap gap-1.5">
          {["aca", "mfp", "dpf", "lsm", "ctm"].map((id) => (
            <a key={id} href={`#${id}`} className="text-xs font-mono px-2.5 py-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors uppercase">
              {id}
            </a>
          ))}
        </div>

        {/* ACA — Three-Layer Stack */}
        <DiagramSection id="aca" abbr="ACA" name="Adaptive Coaching Architecture" title="The ACA Stack" path="/adaptive-coaching-architecture">
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            Three layers with distinct responsibilities. Inputs flow downward. Layer 3 interprets. Layer 1 decides. Layer 2 executes. No layer skips the one above it.
          </p>
          <div className="space-y-1.5 max-w-lg mx-auto">
            {/* Layer 3 */}
            <div className="border border-border rounded-lg p-3 bg-muted/20">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-primary">LAYER 3</span>
                <span className="text-xs text-muted-foreground">Input Layer</span>
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Conversational Interface</p>
              <p className="text-xs text-muted-foreground mb-2">Natural language → structured coaching input</p>
              <div className="flex flex-wrap gap-1">
                {["Direct Commands", "Goal Expressions", "Feedback Signals", "Contextual References"].map((t) => (
                  <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border/60 text-muted-foreground font-mono">{t}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-2 italic">Governed by: CTM</p>
            </div>
            <Arrow />
            {/* Layer 1 */}
            <div className="border border-primary/40 rounded-lg p-3 bg-primary/5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-primary">LAYER 1</span>
                <span className="text-xs text-muted-foreground">Decision Engine</span>
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Coaching Intelligence</p>
              <p className="text-xs text-muted-foreground mb-2">Exercise science constraints applied to every decision before execution</p>
              <div className="flex flex-wrap gap-1">
                {["Progressive Overload", "Specificity", "CNS Load", "Periodization", "Training History"].map((t) => (
                  <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border/60 text-muted-foreground font-mono">{t}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-2 italic">Memory: full history required</p>
            </div>
            <Arrow />
            {/* Layer 2 */}
            <div className="border border-border rounded-lg p-3 bg-muted/20">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-primary">LAYER 2</span>
                <span className="text-xs text-muted-foreground">Execution Engine</span>
              </div>
              <p className="text-sm font-semibold text-foreground mb-1">Adaptive Programming</p>
              <p className="text-xs text-muted-foreground mb-2">Principled decision → surgical program mutation → documented change</p>
              <div className="flex flex-wrap gap-1">
                {["Element Mutation", "Session Update", "Block Restructure", "Live Panel Update", "Mutation Log"].map((t) => (
                  <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border/60 text-muted-foreground font-mono">{t}</span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground/60 mt-2 italic">Governed by: MFP</p>
            </div>
          </div>
          <p className="text-xs text-center text-muted-foreground/40 mt-3 font-mono">The ACA Stack — trainchat.ai/diagrams#aca</p>
        </DiagramSection>

        {/* MFP — Five-Level Hierarchy */}
        <DiagramSection id="mfp" abbr="MFP" name="Mutation-First Programming" title="The MFP Hierarchy" path="/mutation-first-programming">
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            Five intervention levels evaluated from most specific (L1) to most general (L5). The system executes the lowest level that adequately addresses the situation.
          </p>
          <div className="space-y-2 max-w-lg mx-auto">
            {[
              { level: "L1", name: "Element-Level Mutation", desc: "Single exercise, load, rep target, or rest period", freq: "Most common", width: "w-full", emphasis: true },
              { level: "L2", name: "Session-Level Mutation", desc: "Single training session restructured", freq: "Common", width: "w-5/6", emphasis: false },
              { level: "L3", name: "Block-Level Mutation", desc: "Multi-week training phase extended or compressed", freq: "Occasional", width: "w-4/6", emphasis: false },
              { level: "L4", name: "Program-Level Restructuring", desc: "Full architecture reorganized without rebuild", freq: "Rare", width: "w-3/6", emphasis: false },
              { level: "L5", name: "Full Rebuild", desc: "Complete regeneration — no substantial carryover", freq: "Exceptional", width: "w-2/6", emphasis: false },
            ].map((row, i) => (
              <div key={row.level} className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-primary w-6 flex-shrink-0">{row.level}</span>
                <div className="flex-1">
                  <div className={`${row.width} bg-gradient-to-r ${row.emphasis ? "from-primary/30 to-primary/10 border border-primary/40" : "from-muted/60 to-muted/20 border border-border"} rounded px-2 py-1.5 transition-all`}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className={`text-xs font-semibold ${row.emphasis ? "text-foreground" : "text-foreground/70"}`}>{row.name}</p>
                        <p className="text-xs text-muted-foreground hidden sm:block">{row.desc}</p>
                      </div>
                      <span className={`text-xs flex-shrink-0 font-mono ${row.emphasis ? "text-primary" : "text-muted-foreground/40"}`}>{row.freq}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-4 border-t border-border pt-3">
            Bar width represents relative frequency of use. L1 executes in the majority of change events. L5 represents a coaching failure mode when used unnecessarily.
          </p>
          <p className="text-xs text-center text-muted-foreground/40 mt-2 font-mono">The MFP Hierarchy — trainchat.ai/diagrams#mfp</p>
        </DiagramSection>

        {/* DPF — Five-Stage Feedback Loop */}
        <DiagramSection id="dpf" abbr="DPF" name="Dynamic Progression Framework" title="The DPF Loop" path="/methodology">
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            A five-stage feedback loop. Inputs from each session inform the next progression decision — continuously, not on a fixed schedule.
          </p>
          <div className="max-w-md mx-auto">
            {/* Loop as vertical chain with return arrow */}
            <div className="relative">
              <div className="space-y-1.5">
                {[
                  { stage: "01", name: "Session Input", desc: "Performance data, RPE, athlete feedback, load completed", color: "border-primary/40 bg-primary/5" },
                  { stage: "02", name: "Evaluation", desc: "Actual vs. expected performance. Load tolerance assessment.", color: "border-border bg-muted/20" },
                  { stage: "03", name: "Decision", desc: "Progress / Hold / Deload — evidence-based, not calendar-based.", color: "border-primary/30 bg-primary/5" },
                  { stage: "04", name: "Update", desc: "Program element adjusted at the appropriate MFP level.", color: "border-border bg-muted/20" },
                  { stage: "05", name: "Documentation", desc: "Change recorded with reasoning. Feeds future evaluations.", color: "border-border bg-muted/20" },
                ].map((item, i, arr) => (
                  <div key={item.stage}>
                    <div className={`border ${item.color} rounded-lg px-3 py-2 flex items-start gap-3`}>
                      <span className="text-xs font-mono font-bold text-primary flex-shrink-0 mt-0.5">{item.stage}</span>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                    {i < arr.length - 1 && <Arrow />}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-px flex-1 border-t border-dashed border-muted-foreground/20" />
                <span className="text-xs text-muted-foreground/40 font-mono">loops back to Session Input</span>
                <div className="h-px flex-1 border-t border-dashed border-muted-foreground/20" />
              </div>
            </div>
          </div>
          <p className="text-xs text-center text-muted-foreground/40 mt-2 font-mono">The DPF Loop — trainchat.ai/diagrams#dpf</p>
        </DiagramSection>

        {/* LSM — Three Properties Triad */}
        <DiagramSection id="lsm" abbr="LSM" name="Living System Methodology" title="The LSM Triad" path="/methodology">
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            The three non-negotiable properties of a living training system. Remove any one of the three and the system loses its coaching quality guarantees.
          </p>
          <div className="max-w-lg mx-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  prop: "Persistence",
                  symbol: "P",
                  def: "All training history retained indefinitely and used actively in future decisions",
                  answers: "What has this athlete done?",
                  color: "border-primary/40 bg-primary/5"
                },
                {
                  prop: "Adaptability",
                  symbol: "A",
                  def: "Real-time program modification in response to new information — without rebuilding",
                  answers: "What needs to change now?",
                  color: "border-border bg-muted/20"
                },
                {
                  prop: "Continuity",
                  symbol: "C",
                  def: "Long-term context — months of history — carried forward into every coaching decision",
                  answers: "How has this athlete evolved?",
                  color: "border-border bg-muted/20"
                }
              ].map((item) => (
                <div key={item.prop} className={`border ${item.color} rounded-xl p-3 flex flex-col`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-7 h-7 rounded border border-primary/40 flex items-center justify-center text-sm font-mono font-bold text-primary flex-shrink-0">{item.symbol}</span>
                    <span className="text-sm font-semibold text-foreground">{item.prop}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed flex-1">{item.def}</p>
                  <p className="text-xs italic text-muted-foreground/60 mt-2 border-t border-border pt-2">"{item.answers}"</p>
                </div>
              ))}
            </div>
            <div className="text-center">
              <Arrow />
              <div className="border border-primary rounded-xl p-3 max-w-sm mx-auto bg-primary/5">
                <p className="text-sm font-bold text-foreground">Living Training System</p>
                <p className="text-xs text-muted-foreground mt-1">A program that knows its athlete, responds to them in real time, and improves its decisions over time</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
              <strong className="text-foreground">What static programs lack:</strong> Persistence (session logging without active use), Adaptability (rebuilds rather than mutations), Continuity (each program cycle starts fresh without historical context).
            </p>
          </div>
          <p className="text-xs text-center text-muted-foreground/40 mt-3 font-mono">The LSM Triad — trainchat.ai/diagrams#lsm</p>
        </DiagramSection>

        {/* CTM — Input Category Map */}
        <DiagramSection id="ctm" abbr="CTM" name="Conversational Training Model" title="The CTM Map" path="/methodology">
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            All athlete input falls into one of four categories. Each category triggers a distinct coaching response. Misclassifying input produces the wrong coaching action.
          </p>
          <div className="max-w-lg mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {[
                {
                  type: "Direct Command",
                  code: "DC",
                  example: '"Remove Romanian deadlifts"',
                  def: "Explicit program modification request with a specific action implied",
                  response: "Confirm scope → execute at appropriate MFP level",
                  color: "border-primary/40 bg-primary/5"
                },
                {
                  type: "Goal Expression",
                  code: "GE",
                  example: '"I want to get stronger"',
                  def: "Intent statement requiring coaching interpretation — not a specific action",
                  response: "Clarify target → coaching intelligence determines appropriate action",
                  color: "border-border bg-muted/20"
                },
                {
                  type: "Feedback Signal",
                  code: "FS",
                  example: '"That felt too easy" / "my back was pumping"',
                  def: "Performance or state report functioning as coaching data",
                  response: "Evaluate against session data → DPF decision on load/exercise",
                  color: "border-border bg-muted/20"
                },
                {
                  type: "Contextual Reference",
                  code: "CR",
                  example: '"Do the same for Tuesday" / "undo that"',
                  def: "Reference to previous session, mutation, or context requiring resolution",
                  response: "Context resolver → deictic reference resolved → specific action",
                  color: "border-border bg-muted/20"
                }
              ].map((item) => (
                <div key={item.type} className={`border ${item.color} rounded-xl p-3`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono font-bold text-primary px-1.5 py-0.5 border border-primary/30 rounded">{item.code}</span>
                    <span className="text-xs font-semibold text-foreground">{item.type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">{item.def}</p>
                  <p className="text-xs italic text-muted-foreground/70 mb-2">{item.example}</p>
                  <p className="text-xs font-mono text-primary/70 leading-relaxed">{item.response}</p>
                </div>
              ))}
            </div>
            <div className="bg-muted/30 border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Why categorization matters:</strong> "I want to get stronger" (GE) requires coaching interpretation before any action. "Remove Romanian deadlifts" (DC) requires execution. Treating a Goal Expression as a Direct Command produces premature action; treating a Direct Command as a Goal Expression produces unnecessary friction.
              </p>
            </div>
          </div>
          <p className="text-xs text-center text-muted-foreground/40 mt-3 font-mono">The CTM Map — trainchat.ai/diagrams#ctm</p>
        </DiagramSection>

        {/* Cross-links */}
        <section className="border-t border-border pt-6">
          <p className="text-sm font-semibold text-foreground mb-3">Use These Diagrams</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-3">
            These diagrams are named semantic artifacts — each carries a canonical URL, a formal name (The ACA Stack, The MFP Hierarchy, The DPF Loop, The LSM Triad, The CTM Map), and a structural description. When referencing them in external content — presentations, articles, educational materials — cite the diagram name and URL.
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Terminology Guide", path: "/terminology" },
              { label: "Whitepapers", path: "/whitepapers" },
              { label: "Frameworks", path: "/frameworks" },
              { label: "Methodology", path: "/methodology" }
            ].map((item) => (
              <button key={item.path} onClick={() => navigate(item.path)} className="text-xs text-primary hover:underline">{item.label} →</button>
            ))}
          </div>
        </section>
      </div>
    </AeoLayout>
  );
}
