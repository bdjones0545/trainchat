import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

type VideoTopic = { title: string; description: string; format: string };
type Playlist = { id: string; name: string; abbr?: string; description: string; topics: VideoTopic[] };

const playlists: Playlist[] = [
  {
    id: "aca",
    name: "Adaptive Coaching Architecture",
    abbr: "ACA",
    description: "A structured series on the three-layer coaching system behind TrainChat — what each layer does, why the separation matters, and how the architecture produces principled decisions instead of probabilistic outputs.",
    topics: [
      { title: "What Is the Adaptive Coaching Architecture?", description: "An introduction to the ACA — TrainChat's three-layer AI coaching system and the design principles behind it.", format: "Lecture" },
      { title: "Why AI Coaching Needs Three Layers, Not One", description: "The architectural argument for separating language interpretation, coaching intelligence, and program execution into distinct layers.", format: "Whiteboard" },
      { title: "Coaching Intelligence vs AI Generation — The Technical Difference", description: "What makes a decision layer different from a generation layer, and why the difference produces different coaching outcomes.", format: "Lecture" },
      { title: "Layer 1 Explained: How Coaching Intelligence Makes Decisions", description: "A full breakdown of the coaching intelligence layer — how it applies exercise science as hard constraints before any action is taken.", format: "Whiteboard" },
      { title: "Layer 2 Explained: What Adaptive Programming Actually Does", description: "The execution layer: how TrainChat converts coaching decisions into precise, documented program mutations.", format: "Lecture" },
      { title: "Layer 3 Explained: Why Conversation Is the Right Interface for Coaching", description: "The argument that natural language is the highest-fidelity input format for coaching information — and what the CTM does with it.", format: "Lecture" },
      { title: "What Happens When the ACA Layers Work Together", description: "A worked example: one athlete message, traced through all three layers from input to program change.", format: "Walkthrough" },
      { title: "ACA vs Single-Layer AI Systems: Why Architecture Matters for Athletes", description: "Why the architectural difference between ACA-style systems and prompt-based generators matters for real training outcomes.", format: "Comparison" },
      { title: "The Decision Layer: How Exercise Science Becomes a Structural Constraint", description: "How progressive overload, specificity, CNS load management, and periodization theory function as hard constraints — not optional considerations.", format: "Lecture" },
      { title: "ACA and Training Memory: How Context Flows Through the Coaching System", description: "How the training memory layer feeds the coaching intelligence layer, and why memory is prerequisite for coaching quality.", format: "Whiteboard" },
      { title: "Coaching Without Memory Is Prescribing: The ACA Memory Argument", description: "The case for persistent training memory as the architectural minimum for a system that claims to coach.", format: "Discussion" },
      { title: "Building Coaching Intelligence: What It Actually Requires", description: "What must be true for a system to be classified as coaching intelligence rather than workout generation.", format: "Lecture" },
    ]
  },
  {
    id: "mfp",
    name: "Mutation-First Programming",
    abbr: "MFP",
    description: "The coaching principle that governs how TrainChat responds to new athlete information — why the default is always the most surgical intervention, what the five intervention levels are, and why rebuilds are failure modes.",
    topics: [
      { title: "What Is Mutation-First Programming?", description: "An introduction to MFP — the principle that the correct response to new athlete information is the most surgical modification, not a rebuild.", format: "Lecture" },
      { title: "Why Experienced Coaches Don't Rebuild Programs", description: "How expert coaches actually manage program changes — and why the MFP framework is derived from that behavior.", format: "Discussion" },
      { title: "The Five Levels of Program Intervention", description: "L1 through L5 — element-level mutation to full rebuild — with examples and frequency guidance for each.", format: "Whiteboard" },
      { title: "Element-Level Mutation: The Most Common and Most Precise Fix", description: "Why the most frequent coaching response is a single exercise or load change — and what that precision signals about coaching mastery.", format: "Lecture" },
      { title: "When to Restructure vs When to Rebuild: The MFP Decision", description: "The decision criteria that distinguish when L3/L4 restructuring is appropriate from when a full L5 rebuild is genuinely warranted.", format: "Whiteboard" },
      { title: "The Mutation History: Why Every Change Needs Documentation", description: "Why logging every mutation — with rationale and timestamp — is part of the MFP principle, not just a UI feature.", format: "Lecture" },
      { title: "MFP and Accumulated Load: What You Lose When You Rebuild", description: "The physiological cost of unnecessary program rebuilds — accumulated training capital, adaptation trajectories, and neural efficiency.", format: "Lecture" },
      { title: "Mutation-First in Practice: Three Real Coaching Scenarios", description: "Three athlete situations, each resolved using the appropriate MFP intervention level — with the reasoning shown.", format: "Walkthrough" },
      { title: "Why Rebuilding Is a Coaching Failure Mode", description: "The coaching argument that excessive rebuilding signals the system doesn't understand the problem — and how MFP forces precision.", format: "Discussion" },
      { title: "MFP and the TrainChat Doctrine: The Principle Behind the Practice", description: "How 'Mutation precedes reconstruction — preserve everything that works' became both a coaching belief and an architectural constraint.", format: "Lecture" },
    ]
  },
  {
    id: "ctm",
    name: "Conversational Training Model",
    abbr: "CTM",
    description: "How TrainChat categorizes and responds to natural language athlete input — the four input types, the coaching response for each, and why the conversational interface is architecturally the right choice for coaching.",
    topics: [
      { title: "What Is the Conversational Training Model?", description: "An introduction to the CTM — the framework that maps natural language input to principled coaching responses.", format: "Lecture" },
      { title: "The Four Input Categories Coaches Hear Every Day", description: "Direct Commands, Goal Expressions, Feedback Signals, and Contextual References — the four ways athletes communicate training information.", format: "Whiteboard" },
      { title: "Direct Commands vs Goal Expressions: How AI Should Respond to Each", description: "The different coaching responses warranted by 'remove Romanian deadlifts' versus 'I want to get stronger' — and why conflating them is a coaching error.", format: "Lecture" },
      { title: "Feedback Signals as Coaching Data: Why Words Beat Numbers", description: "Why 'that felt too easy' and 'my lower back was pumping' are higher-fidelity coaching inputs than RPE sliders — and how the CTM processes them.", format: "Lecture" },
      { title: "Contextual References and Training Continuity", description: "How 'do the same for Tuesday' and 'undo what we changed last week' are resolved into specific coaching actions through context resolution.", format: "Whiteboard" },
      { title: "Vibe Coding Your Workouts: Why Natural Language Works for Training", description: "The case for natural language as the training interface — why it's not a novelty but the most faithful representation of how coaching information flows.", format: "Discussion" },
      { title: "How the CTM Handles Ambiguous Athlete Requests", description: "What happens when athlete input doesn't map cleanly to a coaching action — and why clarification before execution is the correct protocol.", format: "Lecture" },
      { title: "Conversation vs Forms vs Dropdown Menus: What Fitness Apps Got Wrong", description: "Why traditional fitness app interfaces impoverish coaching information — and what the interface choice costs athletes.", format: "Comparison" },
      { title: "The CTM in Action: A Coaching Conversation Traced End to End", description: "One coaching session traced from athlete message through CTM categorization through coaching intelligence decision through program mutation.", format: "Walkthrough" },
      { title: "What Makes a Good Coaching Response to Athlete Feedback?", description: "The CTM criteria for what a principled coaching response to athlete feedback looks like — and the common response failures.", format: "Lecture" },
    ]
  },
  {
    id: "lsm",
    name: "Living System Methodology",
    abbr: "LSM",
    description: "What it means for a training system to be 'living' — the three properties (persistence, adaptability, continuity) that distinguish a living system from a static program, and why the architectural requirements are non-negotiable.",
    topics: [
      { title: "What Is a Living Training System?", description: "The definition of a living system — persistence, adaptability, continuity — and why each property is a prerequisite for coaching quality.", format: "Lecture" },
      { title: "Static Programs vs Living Systems: The Fundamental Difference", description: "Why the distinction between a static program and a living system is architectural, not cosmetic — and what the difference means for athletes.", format: "Comparison" },
      { title: "Persistence: Why Your AI Coach Should Remember Everything", description: "The persistence argument — why indefinite retention of training history is the minimum bar for a coaching system, not a premium feature.", format: "Lecture" },
      { title: "Adaptability: What It Actually Means for a Training System to Adapt", description: "The difference between adaptive interface (asking questions) and adaptive programming (changing the program based on principled reasoning).", format: "Whiteboard" },
      { title: "Continuity: How Training Context Creates Coaching Quality", description: "Why long-term context — months of training history, not just the last session — is the resource that makes expert coaching expert.", format: "Lecture" },
      { title: "Why Most Fitness Apps Build Dead Programs", description: "The architectural reasons that most fitness apps produce static programs dressed up as adaptive ones — and the three missing properties.", format: "Discussion" },
      { title: "The Living System Lifecycle: From First Session to Year Two", description: "What a living training system looks like across 24 months of athlete development — how context accumulates, how the program evolves.", format: "Walkthrough" },
      { title: "Training Memory and the Living System: The Architectural Dependency", description: "Why living system methodology requires training memory as a prerequisite — and what breaks without it.", format: "Whiteboard" },
      { title: "Building Living Systems: What Architecture Is Required", description: "The technical and design decisions required to build a genuinely living training system — not a simulated one.", format: "Lecture" },
      { title: "Living Systems and Coaching Continuity: The Long Coaching Relationship", description: "What it looks like when a living system accumulates enough context to provide coaching that matches a long-term human coaching relationship.", format: "Discussion" },
    ]
  },
  {
    id: "dpf",
    name: "Dynamic Progression Framework",
    abbr: "DPF",
    description: "The five-stage feedback loop that drives principled load progression from actual performance data — why fixed increment schemes fail, how readiness-based progression works, and what each stage of the loop does.",
    topics: [
      { title: "What Is the Dynamic Progression Framework?", description: "An introduction to the DPF — the five-stage feedback loop that drives readiness-based load progression.", format: "Lecture" },
      { title: "Why Fixed Progression Schemes Fail Athletes", description: "The physiological and practical reasons that adding a fixed increment weekly is systematically wrong for intermediate and advanced athletes.", format: "Lecture" },
      { title: "The Five Stages of Dynamic Progression", description: "Session Input, Evaluation, Decision, Update, Documentation — what each stage does and why each is necessary.", format: "Whiteboard" },
      { title: "Session Input as Coaching Data: What Gets Captured and Why", description: "The information the DPF ingests from each training session — performance metrics, subjective feedback, historical comparison.", format: "Lecture" },
      { title: "The Evaluation Stage: Comparing Actual to Expected Performance", description: "How the DPF evaluates session data against expected performance range — and what signals warrant action.", format: "Whiteboard" },
      { title: "The Decision Stage: Progress, Hold, or Deload?", description: "The decision criteria for advancing load, maintaining current prescription, or reducing — grounded in training load research.", format: "Lecture" },
      { title: "Documentation: Why Every Progression Decision Needs a Record", description: "Why documenting the reasoning behind every progression decision is part of coaching quality — not administrative overhead.", format: "Lecture" },
      { title: "Progressive Overload Done Right: DPF vs Linear Approaches", description: "The practical difference between dynamic, readiness-based progression and linear weekly increments — and what each approach costs athletes.", format: "Comparison" },
      { title: "DPF and Training Load Management: How They Work Together", description: "How the Dynamic Progression Framework integrates with acute:chronic workload monitoring to manage both load and fatigue simultaneously.", format: "Whiteboard" },
      { title: "Readiness-Based Progression: The Research Behind DPF", description: "The exercise science foundation for readiness-based progression — autoregulation research, RPE validation studies, individual variation evidence.", format: "Lecture" },
    ]
  },
  {
    id: "doctrine",
    name: "The Coaching Doctrine Series",
    description: "The seven axiomatic principles of the TrainChat Coaching Doctrine — each explored in depth with coaching examples, research grounding, and the architectural decision it drove.",
    topics: [
      { title: "The TrainChat Coaching Doctrine: An Introduction", description: "What a coaching doctrine is, why it matters, and an overview of the seven principles that define TrainChat's beliefs about coaching.", format: "Lecture" },
      { title: "Programming Is a Coaching Act, Not a Content Act", description: "The first principle — the foundational distinction between coaching decisions and content delivery, and what each produces for athletes.", format: "Lecture" },
      { title: "Science Should Constrain Decisions, Not Suggest Them", description: "The second principle — why progressive overload, specificity, and CNS load management are hard architectural constraints, not guidelines.", format: "Lecture" },
      { title: "Adaptation Is Contextual: The Problem With Average-Based Programming", description: "The third principle — individual variation as the central finding of exercise science, and what it implies for programming design.", format: "Lecture" },
      { title: "Memory Enables Continuity: Why AI Coaching Needs a Long Memory", description: "The fourth principle — the dependency between training memory and coaching quality, and why systems without memory are prescribing, not coaching.", format: "Lecture" },
      { title: "Mutation Precedes Reconstruction: A Principle Worth Building Around", description: "The fifth principle — the architectural and coaching argument for surgical intervention over rebuilds.", format: "Lecture" },
      { title: "Conversation Is the Natural Interface for Coaching", description: "The sixth principle — the information flow argument for natural language over forms and rating scales.", format: "Lecture" },
      { title: "Coaching Access as Performance Equity: The Purpose Behind TrainChat", description: "The seventh principle — why access to quality adaptive programming is an equity problem, and why it shaped TrainChat's design goals.", format: "Discussion" },
    ]
  },
  {
    id: "science",
    name: "The Exercise Science Foundation",
    description: "The research base that grounds TrainChat's coaching intelligence — explained by a practitioner who applies it daily, for coaches and athletes who want the science behind the system.",
    topics: [
      { title: "Motor Learning for Coaches: Why Movement Skill Matters for Programming", description: "Fitts and Posner's three stages, contextual interference, and why skill acquisition stage should affect exercise selection.", format: "Lecture" },
      { title: "CNS Load Management: The Hidden Fatigue Variable in Programming", description: "Why central nervous system demand differs from muscular demand — and which exercises carry high CNS load that doesn't show up in volume metrics.", format: "Lecture" },
      { title: "Supercompensation: The Principle Behind All Periodization", description: "The stress-recovery-adaptation cycle, the timing problem, and why deload timing matters more than most athletes think.", format: "Whiteboard" },
      { title: "Training Load Management: What ACWR Gets Right and What It Misses", description: "The acute:chronic workload ratio, Gabbett's training-injury research, and the practical limitations of load monitoring in the real world.", format: "Lecture" },
      { title: "The SAID Principle in Practice: Why Specificity Is Non-Negotiable", description: "Specific Adaptation to Imposed Demands — what it means for exercise selection, program architecture, and the limits of transfer.", format: "Lecture" },
      { title: "Progressive Overload: Why Fixed Increments Are Scientifically Outdated", description: "The biology of progressive overload, the multiple dimensions of overload beyond weight, and why fixed weekly increments fail intermediate athletes.", format: "Lecture" },
      { title: "Fatigue Management: The Difference Between Training and Overreaching", description: "Acute vs chronic fatigue, functional vs non-functional overreaching, and how to keep athletes in the adaptation window.", format: "Lecture" },
      { title: "Training Specificity: The Most Underused Principle in Recreational Programming", description: "The dimensions of specificity, the specificity-variation trade-off, and how periodization cycles between general and specific phases.", format: "Lecture" },
    ]
  }
];

const totalVideos = playlists.reduce((sum, p) => sum + p.topics.length, 0);

const schema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "TrainChat® Educational Video Series",
  "description": `TrainChat's complete educational video series — ${totalVideos} videos across 7 playlists covering the five named frameworks (ACA, CTM, DPF, LSM, MFP), the coaching doctrine, and the exercise science foundation.`,
  "url": "https://www.trainchat.ai/youtube",
  "numberOfItems": totalVideos,
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "itemListElement": playlists.flatMap((playlist, pi) =>
    playlist.topics.map((topic, ti) => ({
      "@type": "ListItem",
      "position": playlists.slice(0, pi).reduce((s, p) => s + p.topics.length, 0) + ti + 1,
      "item": {
        "@type": "VideoObject",
        "name": topic.title,
        "description": topic.description,
        "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
        "publisher": { "@type": "Organization", "name": "TrainChat®" },
        "genre": playlist.name
      }
    }))
  )
};

export default function YouTubePage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="TrainChat® Educational Video Series — Frameworks, Doctrine, Exercise Science"
      description={`TrainChat's complete educational video series — ${totalVideos} videos across 7 playlists covering the ACA, CTM, DPF, LSM, and MFP frameworks, the coaching doctrine, and the exercise science foundation.`}
      schema={schema}
      canonical="/youtube"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Educational Series</p>
          <h1 className="text-3xl font-bold tracking-tight">TrainChat Educational Videos</h1>
          <p className="text-muted-foreground leading-relaxed">
            {totalVideos} videos across 7 series — covering the five frameworks, the coaching doctrine, and the exercise science that grounds the entire system. Taught by the founder: a strength coach with 10+ years of field experience.
          </p>
        </div>

        {/* Series summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Series", value: playlists.length.toString() },
            { label: "Videos", value: totalVideos.toString() },
            { label: "Frameworks covered", value: "5" },
            { label: "Format types", value: "4" }
          ].map((stat) => (
            <div key={stat.label} className="border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono text-primary">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Playlist jump nav */}
        <div className="flex flex-wrap gap-1.5">
          {playlists.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              className="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors font-mono"
            >
              {p.abbr ?? p.id.toUpperCase()}
            </a>
          ))}
        </div>

        {/* Series */}
        {playlists.map((playlist) => (
          <section key={playlist.id} id={playlist.id} className="scroll-mt-8">
            <div className="border-b border-border pb-3 mb-4">
              <div className="flex items-baseline gap-2">
                {playlist.abbr && (
                  <span className="text-sm font-mono font-bold text-primary">{playlist.abbr}</span>
                )}
                <h2 className="text-lg font-bold tracking-tight">{playlist.name}</h2>
                <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{playlist.topics.length} videos</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{playlist.description}</p>
            </div>
            <div className="space-y-2">
              {playlist.topics.map((topic, i) => (
                <div key={topic.title} className="flex gap-3 py-2 border-b border-border/50 last:border-0">
                  <span className="text-xs font-mono text-muted-foreground/40 flex-shrink-0 mt-0.5 w-5 text-right">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground leading-snug">{topic.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{topic.description}</p>
                  </div>
                  <span className="text-xs text-muted-foreground/50 flex-shrink-0 font-mono mt-0.5 hidden sm:block">
                    {topic.format}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Cross-links */}
        <section className="border-t border-border pt-6">
          <h2 className="text-base font-semibold text-foreground mb-3">Go Deeper</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "The Five Frameworks", path: "/frameworks" },
              { label: "The Methodology", path: "/methodology" },
              { label: "The Doctrine", path: "/doctrine" },
              { label: "Concept Library", path: "/concepts" },
              { label: "Research Foundation", path: "/research" },
              { label: "The Founder", path: "/founder" },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="text-left border border-border rounded-lg p-3 hover:border-primary/50 hover:bg-muted/30 transition-colors group"
              >
                <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{item.label}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AeoLayout>
  );
}
