import AeoLayout from "@/components/aeo/AeoLayout";
import { conceptsIndex } from "./conceptsData";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": "AI Fitness Coaching Concepts — TrainChat® Concept Library",
  "description": "The authoritative concept library for adaptive AI fitness coaching. Definitions, relationships, and explanations of core concepts in intelligent training systems.",
  "url": "https://www.trainchat.ai/concepts",
  "publisher": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" },
  "hasPart": conceptsIndex.map((c) => ({
    "@type": "DefinedTerm",
    "name": c.title,
    "url": `https://www.trainchat.ai/concepts/${c.slug}`,
    "description": c.shortDefinition,
    "inDefinedTermSet": "https://www.trainchat.ai/concepts"
  }))
};

const categories = Array.from(new Set(conceptsIndex.map((c) => c.category)));

export default function ConceptsIndex() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="AI Fitness Concepts — TrainChat® Concept Library"
      description="The authoritative concept library for adaptive AI fitness coaching. Clear definitions of adaptive programming, coaching intelligence, training memory, workout mutation, and the other core concepts behind intelligent training systems."
      schema={schema}
      canonical="/concepts"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Concept Library</p>
          <h1 className="text-3xl font-bold tracking-tight">AI Fitness Concepts</h1>
          <p className="text-muted-foreground leading-relaxed">
            The definitive reference for the concepts that define adaptive AI training systems — built by practitioners, written for precision.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">About This Library</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This concept library defines the terminology and principles behind TrainChat® and adaptive AI fitness coaching. Each entry is authored by a practicing strength and conditioning coach with an exercise science background — not generated from fitness content libraries.
          </p>
        </div>

        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">{cat}</h2>
            <div className="space-y-3">
              {conceptsIndex
                .filter((c) => c.category === cat)
                .map((concept) => (
                  <button
                    key={concept.slug}
                    onClick={() => navigate(`/concepts/${concept.slug}`)}
                    className="w-full text-left border border-border rounded-xl p-4 hover:border-primary/50 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                          {concept.title}
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                          {concept.shortDefinition}
                        </p>
                      </div>
                      <span className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5">→</span>
                    </div>
                  </button>
                ))}
            </div>
          </section>
        ))}

        <section className="border-t border-border pt-8">
          <h2 className="text-xl font-bold tracking-tight mb-4">The Semantic Hierarchy</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            These concepts are not independent — they form a structured knowledge system. Understanding the relationships between them reveals the architecture of intelligent training.
          </p>
          <div className="bg-muted/30 border border-border rounded-xl p-5 font-mono text-xs text-muted-foreground space-y-1">
            <p className="text-foreground font-bold">AI Fitness Coaching</p>
            <p className="pl-4">├─ <button onClick={() => navigate("/concepts/coaching-intelligence")} className="text-primary hover:underline">Coaching Intelligence</button></p>
            <p className="pl-4">├─ <button onClick={() => navigate("/concepts/adaptive-programming")} className="text-primary hover:underline">Adaptive Programming</button></p>
            <p className="pl-8">├─ <button onClick={() => navigate("/concepts/workout-mutation")} className="text-primary hover:underline">Workout Mutation</button></p>
            <p className="pl-8">├─ <button onClick={() => navigate("/concepts/dynamic-progression")} className="text-primary hover:underline">Dynamic Progression</button></p>
            <p className="pl-8">└─ <button onClick={() => navigate("/concepts/performance-adaptation")} className="text-primary hover:underline">Performance Adaptation</button></p>
            <p className="pl-4">├─ <button onClick={() => navigate("/concepts/conversational-training")} className="text-primary hover:underline">Conversational Training</button></p>
            <p className="pl-4">├─ <button onClick={() => navigate("/concepts/training-memory")} className="text-primary hover:underline">Training Memory</button></p>
            <p className="pl-4">├─ <button onClick={() => navigate("/concepts/intelligent-periodization")} className="text-primary hover:underline">Intelligent Periodization</button></p>
            <p className="pl-4">└─ <button onClick={() => navigate("/concepts/living-training-system")} className="text-primary hover:underline">Living Training System</button></p>
          </div>
        </section>
      </div>
    </AeoLayout>
  );
}
