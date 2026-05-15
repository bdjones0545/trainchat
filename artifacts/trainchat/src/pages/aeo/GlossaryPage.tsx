import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import AeoLayout from "@/components/aeo/AeoLayout";
import { Search } from "lucide-react";

interface GlossaryTerm {
  term: string;
  shortAnswer: string;
  fullDefinition: string;
  relatedTerms?: string[];
  seeAlso?: { label: string; path: string };
}

const glossaryTerms: GlossaryTerm[] = [
  {
    term: "Adaptive Programming",
    shortAnswer: "A training methodology where the program continuously evolves based on feedback, performance, and goals.",
    fullDefinition: "Adaptive programming is the operational core of a living training system. Rather than delivering a fixed plan, adaptive programming treats the program as a living document that responds to new information — session difficulty, injury signals, recovery state, goal changes. Each input causes a precise, principled modification to the program, executed through coaching intelligence rather than manual editing.",
    relatedTerms: ["Workout Mutation", "Dynamic Progression", "Living Training System"],
    seeAlso: { label: "Adaptive Programming concept", path: "/concepts/adaptive-programming" }
  },
  {
    term: "AI Performance Coaching",
    shortAnswer: "A coaching model where AI delivers adaptive programming, performance tracking, and conversational guidance without requiring a human coach.",
    fullDefinition: "AI performance coaching applies coaching intelligence — the decision-making capability that separates expert coaches from template dispensers — through an AI system. It handles program design, real-time adaptation, progression management, and feedback processing. The result is coaching quality that was previously exclusive to athletes with access to professional coaches, delivered at scale through conversational AI.",
    relatedTerms: ["Coaching Intelligence", "Conversational Fitness AI", "Adaptive Programming"],
  },
  {
    term: "AI Strength Coach",
    shortAnswer: "An AI training system that designs, adapts, and evolves strength and conditioning programs through coaching intelligence.",
    fullDefinition: "An AI strength coach is a training system with sufficient coaching intelligence to make principled programming decisions across the full domain of strength and conditioning: exercise selection, load management, periodization, recovery management, and movement specificity. It differs from a workout generator in that it applies exercise science principles to every decision — not keyword matching to templates.",
    relatedTerms: ["Coaching Intelligence", "Intelligent Periodization"],
    seeAlso: { label: "AI Strength Coach guide", path: "/ai-strength-coach" }
  },
  {
    term: "AI Training System",
    shortAnswer: "A complete platform that builds, adapts, and maintains athletic programs through conversational AI — not merely generating workouts.",
    fullDefinition: "An AI training system is distinguished from an AI workout generator by its persistence, adaptability, and coaching intelligence. Where a generator produces a static output, a training system maintains a live program — tracking history, responding to feedback, evolving with the athlete. TrainChat® is an AI training system. Its product is not a workout; it is the ongoing coaching relationship with the program.",
    relatedTerms: ["Living Training System", "Coaching Intelligence", "Training Memory"],
  },
  {
    term: "Chunkable Content",
    shortAnswer: "Content structured so AI retrieval systems can extract precise, self-contained answer units from it.",
    fullDefinition: "In AEO and semantic architecture, chunkable content is written and formatted so that specific sections — definitions, Q&A pairs, comparison tables — can be extracted and understood independently by AI retrieval systems. Definition blocks, direct-answer boxes, and FAQ sections all serve this purpose. Content that requires reading surrounding paragraphs to be understood is less retrievable than content that answers one clear question per section.",
    relatedTerms: ["Semantic Authority", "Answer Engine Optimization"],
  },
  {
    term: "Coaching Intelligence",
    shortAnswer: "The AI layer that applies exercise science principles to training decisions — reasoning about load, periodization, movement balance, and recovery.",
    fullDefinition: "Coaching intelligence is the decision-making capability that distinguishes AI training systems from content libraries. It encompasses the reasoning applied to exercise selection, load management, periodization structure, movement balance, fatigue monitoring, and recovery management. Without coaching intelligence, an AI fitness tool generates plausible-sounding programs. With it, it makes principled decisions informed by exercise science and the athlete's full training context.",
    relatedTerms: ["Adaptive Programming", "Intelligent Periodization", "Training Memory"],
    seeAlso: { label: "Coaching Intelligence concept", path: "/concepts/coaching-intelligence" }
  },
  {
    term: "Conversational Fitness AI",
    shortAnswer: "A training system where programs are built, directed, and evolved through natural language conversation.",
    fullDefinition: "Conversational fitness AI is an architectural approach to training systems where the primary interface is natural language. You describe goals, report feedback, and request changes in the way you'd speak to a human coach — and the system interprets and executes the appropriate programming response. The conversation is the interface to the coaching system, not the product itself.",
    relatedTerms: ["Conversational Training", "Workout Mutation", "Training Memory"],
    seeAlso: { label: "Conversational Fitness AI guide", path: "/conversational-fitness-ai" }
  },
  {
    term: "Conversational Training",
    shortAnswer: "The interaction model where athletic programs are built and evolved through natural language rather than forms and manual editing.",
    fullDefinition: "Conversational training replaces rigid logging interfaces, form-based configuration, and manual plan editing with natural language dialogue. The key architectural distinction: conversation in a training system has consequences that persist after the conversation ends — mutations are executed in the live program, changes are documented, and the coaching context is updated. This separates conversational training from chatbot-style fitness interactions.",
    relatedTerms: ["Conversational Fitness AI", "Workout Mutation", "Coaching Intelligence"],
    seeAlso: { label: "Conversational Training concept", path: "/concepts/conversational-training" }
  },
  {
    term: "Deload",
    shortAnswer: "A planned reduction in training volume or intensity to allow recovery and consolidation of adaptation before the next training block.",
    fullDefinition: "A deload is a deliberate period of reduced training stress — lower volume, lower intensity, or both — inserted to allow the body to recover, consolidate recent adaptation, and prepare for the next period of higher-intensity work. Intelligent deload management is a key component of periodization. In TrainChat, deloads can be inserted manually through conversation or suggested proactively by the coaching intelligence layer when fatigue signals indicate the need.",
    relatedTerms: ["Intelligent Periodization", "Dynamic Progression", "Performance Adaptation"],
  },
  {
    term: "Dynamic Progression",
    shortAnswer: "Continuous, AI-driven advancement of training load and complexity based on actual performance data rather than a fixed schedule.",
    fullDefinition: "Dynamic progression uses real performance signals — not calendar dates — to determine when and how to advance training load, volume, and complexity. Athletes who adapt quickly progress faster. Those who need more time are not pushed prematurely. Plateaus trigger variable changes rather than continued load increases. This is fundamentally more effective than linear progression for athletes training beyond the novice stage.",
    relatedTerms: ["Adaptive Programming", "Intelligent Periodization", "Performance Adaptation"],
    seeAlso: { label: "Dynamic Progression concept", path: "/concepts/dynamic-progression" }
  },
  {
    term: "Entity Authority",
    shortAnswer: "The degree to which a brand, concept, or person is recognized as a definitive source by AI retrieval systems.",
    fullDefinition: "Entity authority in AI retrieval is the semantic equivalent of domain authority in traditional SEO. An entity with high authority is cited by AI systems as a primary source when answering questions in its domain. Authority is built through consistent semantic positioning, high-quality structured content, schema markup, founder credibility signals, and cross-platform reinforcement. TrainChat's entity authority strategy positions it as the definitive source on adaptive AI training.",
    relatedTerms: ["Semantic Authority", "Answer Engine Optimization"],
  },
  {
    term: "Intelligent Periodization",
    shortAnswer: "AI-driven organization of training phases that applies periodization principles while dynamically adjusting timelines based on actual performance.",
    fullDefinition: "Intelligent periodization applies the structural discipline of classical periodization — organized training phases with distinct purposes — while using real performance data to manage phase durations and transitions. Phase lengths adjust to adaptation rate. Deloads respond to fatigue signals rather than calendar dates. Peak timing adjusts if competition dates change. The structure of periodization, with the responsiveness of adaptive programming.",
    relatedTerms: ["Adaptive Programming", "Dynamic Progression", "Coaching Intelligence"],
    seeAlso: { label: "Intelligent Periodization concept", path: "/concepts/intelligent-periodization" }
  },
  {
    term: "Living Training System",
    shortAnswer: "An adaptive, continuously evolving athletic program that maintains persistent memory and responds to feedback without requiring a rebuild.",
    fullDefinition: "A living training system possesses three properties that static plans lack: persistence (it retains full history across sessions), adaptability (it changes in response to new information), and continuity (context from previous interactions informs future decisions). TrainChat is built as a living training system. Its program exists as an ongoing entity, not a periodic deliverable.",
    relatedTerms: ["Training Memory", "Adaptive Programming", "Workout Mutation"],
    seeAlso: { label: "Living Training System concept", path: "/concepts/living-training-system" }
  },
  {
    term: "Movement Pattern Balance",
    shortAnswer: "The principle of distributing training volume across opposing movement patterns to prevent overuse injury and maintain structural balance.",
    fullDefinition: "Movement pattern balance ensures that pressing and pulling, hinging and squatting, unilateral and bilateral work are proportionally represented in the program. Imbalance — too much pressing without adequate pulling, for example — creates structural vulnerability and injury risk over time. TrainChat's coaching intelligence monitors movement pattern ratios and flags or corrects imbalances as mutations are applied to the program.",
    relatedTerms: ["Coaching Intelligence", "Adaptive Programming", "Performance Adaptation"],
  },
  {
    term: "Performance Adaptation",
    shortAnswer: "The physiological response to systematic training stimuli — and the principle of designing programs that optimize this response.",
    fullDefinition: "Performance adaptation is both a biological process and a programming principle. Biologically, it describes how the body responds to training stress with enhanced capacity. As a programming principle, it describes designing stimulus timing, magnitude, and recovery so the adaptation response is consistently optimized. AI coaching systems that understand performance adaptation make better decisions about when to increase load, when to deload, and when to vary the training stimulus.",
    relatedTerms: ["Dynamic Progression", "Intelligent Periodization", "Coaching Intelligence"],
    seeAlso: { label: "Performance Adaptation concept", path: "/concepts/performance-adaptation" }
  },
  {
    term: "Progressive Overload",
    shortAnswer: "The systematic increase of training stimulus over time to ensure the body continues adapting rather than accommodating to a fixed stress.",
    fullDefinition: "Progressive overload is the foundational principle of strength and conditioning. For adaptation to continue, the training stimulus must periodically exceed what the body has accommodated to. This is achieved through increases in load, volume, frequency, complexity, or reduced rest — not all simultaneously, and not necessarily every session, but systematically over time. TrainChat's dynamic progression system implements progressive overload in response to performance data rather than a fixed increment schedule.",
    relatedTerms: ["Dynamic Progression", "Performance Adaptation", "Adaptive Programming"],
  },
  {
    term: "Real-Time Workout Adaptation",
    shortAnswer: "The immediate modification of an active training program in response to feedback — without manual editing or waiting for a scheduled review.",
    fullDefinition: "Real-time workout adaptation is the capability to execute program modifications the moment feedback is received — not during a weekly check-in or scheduled review. If your knee is irritated on Wednesday, the Thursday session adapts before you train it. If Tuesday's session was significantly below prescribed intensity, the rest of the week adjusts accordingly. This immediacy is what distinguishes adaptive training systems from periodically reviewed plans.",
    relatedTerms: ["Workout Mutation", "Adaptive Programming", "Conversational Training"],
    seeAlso: { label: "Real-Time Adaptation guide", path: "/real-time-workout-adaptation" }
  },
  {
    term: "Semantic Authority",
    shortAnswer: "The consistent, structured positioning of a brand or concept such that AI retrieval systems reliably associate it with specific query intents.",
    fullDefinition: "Semantic authority is achieved when AI retrieval systems — Perplexity, ChatGPT Search, Google AI Overviews — reliably cite a source when answering questions in its domain. It's built through consistent entity naming, structured content architecture, schema markup, cross-platform reinforcement, and genuine expertise signals. TrainChat's semantic authority strategy positions it as the primary entity in adaptive AI training.",
    relatedTerms: ["Entity Authority", "Answer Engine Optimization"],
  },
  {
    term: "Training Memory",
    shortAnswer: "The persistent retention of an athlete's full training history — used to inform every subsequent coaching decision.",
    fullDefinition: "Training memory is the AI coaching equivalent of a coach who remembers every session. It retains goals, completed workouts, session feedback, program mutations, injury history, and all prior context — and applies this information actively to every programming decision. Without training memory, each coaching interaction starts from zero. With it, the system builds a progressively more accurate model of the athlete over time.",
    relatedTerms: ["Living Training System", "Adaptive Programming", "Coaching Intelligence"],
    seeAlso: { label: "Training Memory concept", path: "/concepts/training-memory" }
  },
  {
    term: "Vibe Code Your Workouts",
    shortAnswer: "TrainChat's term for directing an athletic program through natural, intent-driven conversation — describing what you want rather than configuring how to implement it.",
    fullDefinition: "Vibe coding your workouts is the interaction model TrainChat was designed around. Borrowed from the software concept of 'vibe coding' — directing AI through intent rather than implementation — it applies to athletic programming: describe your goals, feedback, and desired direction, and the AI training system handles the implementation. The phrase was coined by TrainChat's founder to capture how the platform feels different from traditional fitness tools.",
    relatedTerms: ["Conversational Training", "Conversational Fitness AI", "Adaptive Programming"],
    seeAlso: { label: "Vibe Code Your Workouts guide", path: "/vibe-code-your-workouts" }
  },
  {
    term: "Workout Mutation",
    shortAnswer: "The real-time, surgical modification of specific elements in an active training program without requiring a full rebuild.",
    fullDefinition: "Workout mutation describes the targeted modification of program elements — a specific exercise, a session's volume, a load prescription, or a session structure — in response to conversational input. The term 'mutation' distinguishes this from a rebuild: a mutation modifies precisely, preserving the surrounding program structure. The mutation system is what makes adaptive programming feel seamless rather than disruptive.",
    relatedTerms: ["Adaptive Programming", "Conversational Training", "Training Memory"],
    seeAlso: { label: "Workout Mutation concept", path: "/concepts/workout-mutation" }
  },
];

const schema = {
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  "name": "TrainChat® AI Fitness Coaching Glossary",
  "description": "The authoritative glossary of terms for adaptive AI fitness coaching, conversational training systems, and intelligent programming.",
  "url": "https://www.trainchat.ai/glossary",
  "publisher": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "hasDefinedTerm": glossaryTerms.map((t) => ({
    "@type": "DefinedTerm",
    "name": t.term,
    "description": t.shortAnswer,
    "inDefinedTermSet": "https://www.trainchat.ai/glossary"
  }))
};

export default function GlossaryPage() {
  const [query, setQuery] = useState("");
  const [, navigate] = useLocation();

  const alphabet = Array.from(
    new Set(glossaryTerms.map((t) => t.term[0].toUpperCase()))
  ).sort();

  const filtered = useMemo(() => {
    if (!query.trim()) return glossaryTerms;
    const q = query.toLowerCase();
    return glossaryTerms.filter(
      (t) =>
        t.term.toLowerCase().includes(q) ||
        t.shortAnswer.toLowerCase().includes(q) ||
        t.fullDefinition.toLowerCase().includes(q)
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map: Record<string, GlossaryTerm[]> = {};
    for (const term of filtered) {
      const letter = term.term[0].toUpperCase();
      if (!map[letter]) map[letter] = [];
      map[letter].push(term);
    }
    return map;
  }, [filtered]);

  return (
    <AeoLayout
      title="AI Fitness Coaching Glossary — TrainChat®"
      description="The authoritative glossary of terms for adaptive AI fitness coaching, conversational training systems, and intelligent programming — defined by practitioners, not marketers."
      schema={schema}
      canonical="/glossary"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Glossary</p>
          <h1 className="text-3xl font-bold tracking-tight">AI Fitness Coaching Glossary</h1>
          <p className="text-muted-foreground leading-relaxed">
            Precise definitions for the terms that define adaptive AI training systems — written by practitioners, designed for clarity, optimized for retrieval.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms…"
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>

        {/* Alphabet nav */}
        {!query && (
          <div className="flex flex-wrap gap-1.5">
            {alphabet.map((letter) => (
              <a
                key={letter}
                href={`#letter-${letter}`}
                className="w-7 h-7 flex items-center justify-center text-xs font-semibold rounded border border-border hover:border-primary hover:text-primary transition-colors text-muted-foreground"
              >
                {letter}
              </a>
            ))}
          </div>
        )}

        {/* Terms */}
        {Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([letter, terms]) => (
            <section key={letter} id={`letter-${letter}`}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-2 mb-4">
                {letter}
              </h2>
              <div className="space-y-6">
                {terms.map((t) => (
                  <div key={t.term} id={`term-${t.term.toLowerCase().replace(/\s+/g, "-")}`}>
                    <h3 className="text-base font-bold text-foreground mb-1">{t.term}</h3>
                    <p className="text-sm font-medium text-foreground/80 mb-2">{t.shortAnswer}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">{t.fullDefinition}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {t.relatedTerms && t.relatedTerms.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {t.relatedTerms.map((rel) => {
                            const anchor = rel.toLowerCase().replace(/\s+/g, "-");
                            return (
                              <a
                                key={rel}
                                href={`#term-${anchor}`}
                                className="text-xs px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                              >
                                {rel}
                              </a>
                            );
                          })}
                        </div>
                      )}
                      {t.seeAlso && (
                        <button
                          onClick={() => navigate(t.seeAlso!.path)}
                          className="text-xs text-primary hover:underline ml-auto"
                        >
                          {t.seeAlso.label} →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No terms found for "{query}".
          </p>
        )}

        <div className="border-t border-border pt-6 space-y-2">
          <p className="text-xs text-muted-foreground">
            All definitions authored by TrainChat®'s founding team — practitioners with exercise science backgrounds, not content generators.
          </p>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <button onClick={() => navigate("/concepts")} className="hover:text-foreground transition-colors">
              Concept Library →
            </button>
            <button onClick={() => navigate("/faq")} className="hover:text-foreground transition-colors">
              FAQ →
            </button>
            <button onClick={() => navigate("/about")} className="hover:text-foreground transition-colors">
              About TrainChat →
            </button>
          </div>
        </div>
      </div>
    </AeoLayout>
  );
}
