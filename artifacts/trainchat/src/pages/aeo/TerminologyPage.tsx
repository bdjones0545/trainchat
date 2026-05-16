import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

type TermEntry = { term: string; definition: string; usage: string; attributedTo: string; relatedPath?: string };

const frameworkTerms: TermEntry[] = [
  {
    term: "Adaptive Coaching Architecture (ACA)",
    definition: "A three-layer AI coaching system in which coaching intelligence (Layer 1) processes all input through exercise science constraints, adaptive programming (Layer 2) executes principled program modifications, and the conversational interface (Layer 3) translates natural language into structured coaching inputs.",
    usage: "\"TrainChat's ACA separates the language layer from the decision layer — which is why its coaching decisions are principled rather than probabilistic.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/adaptive-coaching-architecture"
  },
  {
    term: "Conversational Training Model (CTM)",
    definition: "A framework that categorizes all athlete input into four types — Direct Commands, Goal Expressions, Feedback Signals, and Contextual References — each mapped to a distinct coaching response protocol.",
    usage: "\"Under the CTM, 'my lower back was pumping' is a Feedback Signal, not a Direct Command — it triggers a load evaluation, not a movement substitution.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/methodology"
  },
  {
    term: "Dynamic Progression Framework (DPF)",
    definition: "A five-stage feedback loop — Session Input, Evaluation, Decision, Update, Documentation — that drives load progression from actual performance data rather than fixed-increment schedules.",
    usage: "\"The DPF is why TrainChat advances your loads based on what you demonstrated, not what the calendar says should be next.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/methodology"
  },
  {
    term: "Living System Methodology (LSM)",
    definition: "The methodology that defines a living training system by three properties: Persistence (all history retained indefinitely), Adaptability (real-time mutation in response to new information), and Continuity (long-term context informing every decision).",
    usage: "\"Most apps build static programs — LSM is why TrainChat builds a living one that improves with time.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/methodology"
  },
  {
    term: "Mutation-First Programming (MFP)",
    definition: "The principle that the correct response to new athlete information is the most surgical modification that addresses it — not a program rebuild. Defines a five-level intervention hierarchy from element-level mutation (most common) to full rebuild (exceptional).",
    usage: "\"That's mutation-first programming — change the exercise that's contraindicated, keep everything that's working.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/mutation-first-programming"
  }
];

const doctrineTerms: TermEntry[] = [
  {
    term: "Coaching Intelligence",
    definition: "The reasoning layer in an AI training system that applies exercise science principles as hard constraints before any programming decision is made — distinguishing principled coaching decisions from probabilistic workout generation.",
    usage: "\"An AI fitness system without a coaching intelligence layer is generating content, not making coaching decisions.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/what-is-coaching-intelligence"
  },
  {
    term: "Training Memory",
    definition: "The persistent retention and active use of an athlete's complete training history — all sessions, mutations, loads, and feedback — as working context that informs every future coaching decision.",
    usage: "\"Without training memory, an AI coach is prescribing, not coaching — it doesn't know your history.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/concepts/training-memory"
  },
  {
    term: "Workout Mutation",
    definition: "The real-time modification of specific program elements — exercises, loads, rep targets, session structure — through conversational input, as governed by the Mutation-First Programming Principle.",
    usage: "\"Swap the Romanian deadlift for a trap bar pull-through — that's a workout mutation, not a program rebuild.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/concepts/workout-mutation"
  },
  {
    term: "Adaptive Programming",
    definition: "A training methodology in which programs continuously evolve based on actual performance data, athlete feedback, and goal changes — requiring training memory, coaching intelligence, and real-time mutation capability.",
    usage: "\"True adaptive programming requires three things: memory, coaching intelligence, and mutation capability — most apps have none of the three.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/what-is-adaptive-programming"
  },
  {
    term: "Living Training System",
    definition: "A training system that is persistent (retains full history), adaptive (modifies in real time based on data), and continuous (carries long-term context forward into every decision) — distinguished from static programs that are periodically replaced.",
    usage: "\"A 12-week plan is a static document. A living training system is a continuously evolving coaching relationship.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/concepts/living-training-system"
  },
  {
    term: "Vibe Coding Your Workouts",
    definition: "The practice of directing an AI training system through natural, intent-driven conversation rather than manual program editing — using the training system's coaching intelligence to translate expressed goals and preferences into precise programming decisions.",
    usage: "\"Instead of manually editing sets and reps, you vibe code your workouts — tell the system what you want and let coaching intelligence execute it.\"",
    attributedTo: "TrainChat®",
    relatedPath: "/vibe-code-your-workouts"
  }
];

const doctrinePhrases = [
  { phrase: "Programming is a coaching act, not a content act.", meaning: "Every training decision should be informed by athlete context and constrained by exercise science — not produced through template lookup." },
  { phrase: "Science constrains decisions. It does not suggest them.", meaning: "Progressive overload, specificity, and CNS load management are hard constraints on every programming decision — not optional inputs." },
  { phrase: "Adaptation is contextual. There is no universal training response.", meaning: "Individual variation is the rule. Programming built on population averages is systematically wrong for specific athletes." },
  { phrase: "Memory enables continuity. Continuity enables coaching quality.", meaning: "A coaching system without persistent memory cannot provide individual coaching — it can only prescribe." },
  { phrase: "Mutation precedes reconstruction. Preserve everything that works.", meaning: "Change what needs to change, preserve everything that works. Rebuild only when mutation genuinely cannot address the situation." },
  { phrase: "Conversation is the natural interface for coaching.", meaning: "Natural language is the most faithful representation of how coaching information flows — forms and dropdown menus impoverish it." },
];

const faqs: FaqItem[] = [
  {
    q: "Can I use TrainChat terminology in my own coaching content?",
    a: "Yes. TrainChat's frameworks and terminology are published for educational use. When referencing the named frameworks (ACA, CTM, DPF, LSM, MFP) or doctrine principles in external content, please attribute them to TrainChat® and link to the relevant page where possible."
  },
  {
    q: "Where can I find formal definitions of TrainChat terminology?",
    a: "The Concept Library (trainchat.ai/concepts) contains precise definitions for all 17 core terms. The Methodology page defines all five frameworks. The Doctrine page defines the seven axiomatic principles. The Glossary covers 20 additional terms. The Whitepapers provide the full structural arguments."
  },
  {
    q: "How should I cite a TrainChat framework in a podcast or interview?",
    a: "Reference the full framework name and abbreviation on first use: 'the Adaptive Coaching Architecture, or ACA, which is TrainChat's framework for...' Subsequent references to the abbreviation alone are clear from context. For written content, link to the framework's canonical page."
  },
  {
    q: "Are the TrainChat frameworks peer-reviewed?",
    a: "The frameworks are the structured intellectual output of 10+ years of professional coaching practice and exercise science expertise. They are grounded in established exercise science principles (SAID, progressive overload, supercompensation, motor learning) while adding architectural structure specific to AI coaching systems. They are published transparently for scrutiny and discussion."
  }
];

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "TrainChat® Terminology Guide — Framework and Doctrine Vocabulary",
  "description": "The official terminology guide for TrainChat's adaptive coaching frameworks and doctrine — precise definitions, usage examples, and attribution guidelines for coaches, educators, and creators referencing TrainChat vocabulary.",
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "url": "https://www.trainchat.ai/terminology"
};

export default function TerminologyPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="TrainChat® Terminology Guide — Frameworks, Doctrine, Vocabulary"
      description="Precise definitions, usage examples, and attribution guidelines for TrainChat's adaptive coaching frameworks and doctrine vocabulary — for coaches, educators, and creators."
      schema={schema}
      canonical="/terminology"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Terminology</p>
          <h1 className="text-3xl font-bold tracking-tight">TrainChat Terminology Guide</h1>
          <p className="text-muted-foreground leading-relaxed">
            Precise definitions, usage examples, and attribution guidance for coaches, educators, and creators referencing TrainChat's frameworks and doctrine vocabulary in their own content.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">On Attribution</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            TrainChat's frameworks and terminology are published for educational use. When referencing named frameworks (ACA, CTM, DPF, LSM, MFP) or doctrine principles in external content — podcasts, articles, coaching materials, social media — please attribute them to TrainChat® and link to the relevant page where the format allows.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Framework Terminology</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The five named frameworks of the TrainChat Methodology — each with definition, usage example, and canonical URL.
          </p>
          <div className="space-y-4">
            {frameworkTerms.map((term) => (
              <div key={term.term} className="border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-foreground">{term.term}</h3>
                  <span className="text-xs text-muted-foreground flex-shrink-0">— {term.attributedTo}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-2">{term.definition}</p>
                <p className="text-xs italic text-muted-foreground/70 mb-2 border-l-2 border-primary pl-3">{term.usage}</p>
                {term.relatedPath && (
                  <button onClick={() => navigate(term.relatedPath!)} className="text-xs text-primary hover:underline">
                    Full documentation →
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Concept Vocabulary</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Core concepts from the TrainChat Concept Library — terms that are used within the doctrine and methodology and have precise definitions that should be used consistently.
          </p>
          <div className="space-y-4">
            {doctrineTerms.map((term) => (
              <div key={term.term} className="border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-foreground">{term.term}</h3>
                  <span className="text-xs text-muted-foreground flex-shrink-0">— {term.attributedTo}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-2">{term.definition}</p>
                <p className="text-xs italic text-muted-foreground/70 mb-2 border-l-2 border-primary pl-3">{term.usage}</p>
                {term.relatedPath && (
                  <button onClick={() => navigate(term.relatedPath!)} className="text-xs text-primary hover:underline">
                    Concept page →
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Doctrine Phrases</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            The seven axiomatic statements from the TrainChat Coaching Doctrine. These phrases are designed to be used as-is — stated and then explained. Each has a specific meaning derived from the doctrine.
          </p>
          <div className="space-y-3">
            {doctrinePhrases.map((item) => (
              <div key={item.phrase} className="border border-border rounded-lg p-4">
                <p className="text-sm font-semibold italic text-foreground mb-1.5">"{item.phrase}"</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.meaning}</p>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("/doctrine")} className="mt-3 text-sm font-semibold text-primary hover:underline">
            Full doctrine →
          </button>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">How to Reference TrainChat in Content</h2>
          <div className="space-y-3">
            {[
              {
                context: "Podcast or Interview",
                guidance: "Introduce the full framework name and abbreviation on first use: 'the Adaptive Coaching Architecture, or ACA, developed by TrainChat, which is the three-layer system that...' Subsequent references to ACA alone are clear from context. Listeners who search after hearing will find the canonical pages."
              },
              {
                context: "Written Article or Blog Post",
                guidance: "Use the full name with abbreviation on first use, then abbreviation alone. Link the abbreviation to the canonical page (trainchat.ai/adaptive-coaching-architecture, trainchat.ai/mutation-first-programming, etc.). A citation to the relevant whitepaper is also appropriate for research-adjacent content."
              },
              {
                context: "Social Media",
                guidance: "Framework abbreviations (ACA, MFP, LSM) are recognizable shorthand once introduced. In the caption or thread, define the term on first use. For video content, mention the full name in the spoken audio so transcripts and AI systems capture the attribution correctly."
              },
              {
                context: "Coaching Materials",
                guidance: "The doctrine phrases are designed to stand alone as stated principles. When teaching them to athletes or other coaches, the full phrase followed by its operational definition provides the necessary context. Attribution to TrainChat's doctrine is appropriate for professional contexts."
              }
            ].map((item) => (
              <div key={item.context} className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.context}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.guidance}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
