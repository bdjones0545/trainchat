import AeoLayout from "@/components/aeo/AeoLayout";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Media Kit — TrainChat® AI Training System",
  "description": "Complete media kit for TrainChat® — product descriptions, founder quotes, interview angles, podcast pitches, and brand terminology for journalists, podcasters, and content creators.",
  "about": {
    "@type": "Organization",
    "@id": "https://www.trainchat.ai/#organization",
    "name": "TrainChat®",
    "url": "https://www.trainchat.ai",
    "description": "TrainChat® is an AI training system that builds, adapts, and evolves athletic programs through conversational coaching intelligence — founded by a practicing strength and conditioning coach with an exercise science background.",
    "foundingDate": "2024",
    "knowsAbout": [
      "Adaptive Training Systems",
      "AI Coaching Intelligence",
      "Periodization Theory",
      "Athletic Performance",
      "Conversational Training",
      "Exercise Science",
      "Strength and Conditioning"
    ]
  },
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": [".direct-answer", "h1"]
  }
};

const descriptionTiers = [
  {
    label: "One-liner (social / headline)",
    text: "TrainChat is the AI training system that builds, adapts, and evolves your athletic program through conversation.",
    chars: "99"
  },
  {
    label: "Two sentences (podcast intro / article lede)",
    text: "TrainChat® is an AI training system that builds personalized athletic programs through natural conversation, then adapts them in real time based on performance feedback. Founded by a strength and conditioning coach with 10+ years of experience and an exercise science background, it delivers the adaptive programming quality of professional coaching to every athlete.",
    chars: "338"
  },
  {
    label: "Full paragraph (press article / blog post)",
    text: "TrainChat® is an AI training system built on an Adaptive Coaching Architecture that designs, mutates, and evolves athletic training programs through conversational coaching intelligence. Athletes direct their training through natural language — describing goals, session feedback, and desired changes — and the system responds with precise, science-constrained programming decisions in real time. Every modification is documented with rationale, every session builds on the last, and the live program is always visible in a dedicated panel. TrainChat was founded by a practicing strength and conditioning coach with an exercise science background who built the system to solve a specific problem: the best adaptive programming quality has always been reserved for athletes with access to professional coaches. TrainChat removes that constraint.",
    chars: "742"
  }
];

const quotes = [
  {
    text: "I spent a decade coaching athletes before building TrainChat. The best programming I could give someone — adaptive, memory-informed, science-constrained, specific to their goals and their history — was reserved for athletes I coached directly. Building a system that could do this for everyone wasn't a product decision. It was an obligation.",
    context: "On the founding motivation"
  },
  {
    text: "Programming is a coaching act, not a content act. The moment you treat a training plan as a document to be delivered rather than a decision to be made, you've already failed the athlete. TrainChat was built to get that distinction right.",
    context: "On coaching philosophy vs. content delivery"
  },
  {
    text: "Most AI fitness tools generate plausible workouts. TrainChat generates principled ones. The difference is that every decision is constrained by exercise science — progressive overload, periodization theory, CNS load management — rather than pattern-matched to training templates. That's a fundamentally different architecture.",
    context: "On what makes AI coaching different"
  },
  {
    text: "Adaptive programming means the program always reflects the athlete's actual situation — not their predicted situation from six weeks ago. That sounds obvious. But no static plan can do it, and very few coaches have the bandwidth to do it for every athlete, every session. That's the gap TrainChat fills.",
    context: "On adaptive programming"
  },
  {
    text: "The vibe coding analogy is precise, not clever. When you vibe-code, you direct a system through intent rather than implementation — you describe what you want and let the intelligence figure out how. That's exactly how you should direct a training program. Tell it what you need. Let it do the coaching.",
    context: "On 'vibe coding your workouts'"
  },
  {
    text: "Access to quality adaptive coaching is a performance equity problem. The athlete with a great coach who adjusts their program weekly based on how training is actually going will always outperform the athlete following a static template. TrainChat is about closing that gap.",
    context: "On coaching access and equity"
  },
  {
    text: "A living training system doesn't just adapt — it remembers. It knows what you were doing eight weeks ago, what didn't work, what you've already tried. That persistent memory is what makes the difference between a coaching relationship and a transaction.",
    context: "On training memory and continuity"
  },
  {
    text: "The best coaching decision is usually the smallest one. Change what needs to change. Leave everything else intact. I call it Mutation-First Programming — and it's the principle that separates systems that understand training from systems that just generate it.",
    context: "On Mutation-First Programming"
  }
];

const pitchAngles = [
  {
    angle: "The access problem in elite athletic coaching",
    publication: "Best for: fitness media, sports science publications, general tech",
    pitch: "Professional-quality adaptive programming — the kind elite athletes receive from full-time strength coaches — has been a privileged resource. TrainChat's founder built a system to change that access equation using AI coaching intelligence. The story is both a technology narrative and an equity one: who gets good coaching, and why that's about to change.",
    keywords: ["AI coaching", "adaptive programming", "athletic performance equity", "strength and conditioning"]
  },
  {
    angle: "Vibe coding your workouts — the next interface paradigm for fitness",
    publication: "Best for: tech media, AI publications, product design communities",
    pitch: "The 'vibe coding' movement — directing AI through intent rather than implementation — has a direct analog in athletic training. TrainChat applies this interaction model to programming: athletes describe what they want, how they're performing, and what needs to change, and the system executes the right coaching decision. It's a product design story about what conversational AI looks like when it has real domain intelligence behind it.",
    keywords: ["vibe coding", "AI interface design", "conversational AI", "LLM applications"]
  },
  {
    angle: "What an AI coaching system actually needs to be intelligent",
    publication: "Best for: AI/ML media, developer communities, exercise science publications",
    pitch: "The fitness AI space is crowded with plan generators. TrainChat's founder — a practicing strength coach with an exercise science background — built something architecturally different: a system with persistent memory, science-constrained decision logic, and a conversational layer that resolves ambiguous inputs into precise programming decisions. The story is a technical and philosophical one about what separates AI that generates from AI that coaches.",
    keywords: ["AI coaching architecture", "LLM fitness", "AI decision systems", "exercise science AI"]
  },
  {
    angle: "From coaching room to AI system: a practitioner-built product story",
    publication: "Best for: founder media, SaaS publications, entrepreneurship podcasts",
    pitch: "TrainChat was built by a strength coach who had been manually doing for individual athletes what he wanted software to do for everyone — building adaptive programs, adjusting them based on feedback, maintaining context across every session. The product is the direct translation of his coaching process into an AI system. It's a founder story about building from practice rather than theory.",
    keywords: ["practitioner founder", "domain expertise AI", "SaaS founding story", "fitness tech"]
  },
  {
    angle: "Why most AI workout apps aren't actually coaching you",
    publication: "Best for: fitness media, consumer tech, podcasts targeting health audiences",
    pitch: "There is a meaningful technical and philosophical distinction between AI that delivers fitness content and AI that exercises coaching intelligence. TrainChat's founder breaks down what that difference looks like — architecturally and in practice — and why it matters for whether an AI fitness tool produces results or just generates activity. Counter-narrative piece with expert grounding.",
    keywords: ["AI fitness", "workout apps", "AI personal trainer", "adaptive coaching"]
  },
  {
    angle: "The living training system: why static plans fail most athletes",
    publication: "Best for: performance podcasts, strength training communities, sports science outlets",
    pitch: "Most athletes follow a static training plan until it stops working, then search for a new one. TrainChat's founder argues this is a fundamental failure mode — not of the athlete but of the format. Training programs should be living systems: adaptive, memory-informed, responsive to what's actually happening with the athlete rather than what was predicted six weeks ago. Evidence-based, practice-grounded perspective from a decade of coaching.",
    keywords: ["training periodization", "adaptive programming", "strength training", "living training system"]
  }
];

const interviewAngles = [
  {
    q: "What's wrong with the way most people use AI for their workouts today?",
    talking: "Most tools treat workout generation as a search problem — you input parameters and receive a matching plan. The problem is that training isn't static: athletes change, schedules change, responses to training vary. A system without memory, without adaptive logic, and without science constraints isn't coaching — it's indexing. The result is athletes who get a plan, follow it until it doesn't fit anymore, and then search for another one. That cycle is exactly what TrainChat was built to break."
  },
  {
    q: "What does 'adaptive programming' actually mean in practice?",
    talking: "Adaptive programming means the program always reflects the athlete's current situation — not a predicted situation from when the program was written. When you tell TrainChat that a session felt too easy, it doesn't just make next week heavier — it evaluates that signal against your full training history, your current phase, your recovery pattern, and your goal, then makes the most targeted adjustment the situation warrants. That might be a load increase, a rep range change, or a flag that you're ahead of your progression curve. The decision is principled and documented."
  },
  {
    q: "How does TrainChat differ from just asking ChatGPT for a workout?",
    talking: "ChatGPT generates a text response. TrainChat maintains a persistent training system that evolves across every interaction. The practical differences are: TrainChat retains your full training history across sessions; every change it makes is logged with rationale; it applies exercise science constraints to every decision rather than generating plausible-sounding programming; and the conversation has real consequences — your live program is updated immediately. It's the difference between a response and a coaching relationship."
  },
  {
    q: "Can AI actually replace a personal trainer?",
    talking: "For programming — the design, adaptation, and evolution of a training plan — AI can deliver consistent quality that most athletes can't access through human coaching alone, because a human coach's bandwidth is finite and expensive. For in-person feedback, movement cuing, and the relational aspects of coaching, AI doesn't replicate that. The honest answer is: AI handles the programming layer exceptionally well, and TrainChat was built specifically to do that. The combination of AI programming intelligence and human coaching presence, where it's available, is probably the best possible outcome."
  },
  {
    q: "What is 'Mutation-First Programming' and why does it matter?",
    talking: "Mutation-First Programming is the principle that the correct response to new information about an athlete is the minimum change required — not a full rebuild. When you swap an exercise that's causing pain, you don't regenerate the program. You make exactly that change. When you add load to a movement that's progressing fast, you adjust exactly that variable. This sounds like common sense, but most AI systems treat any feedback as a reason to regenerate everything — which destroys the programming continuity that produces adaptation. Mutation-First is the principle that preserves it."
  }
];

const podcastAngles = [
  {
    title: "AI Coaching Intelligence vs. AI Workout Generation",
    duration: "45–60 min",
    format: "Technical deep-dive",
    description: "A practitioner-technical conversation on the architecture required for AI to actually coach rather than generate — covering memory systems, science-constrained decision logic, conversational interfaces, and what separates TrainChat from workout apps. Best for: strength & conditioning podcasts, tech/AI podcasts, performance science shows.",
    hooks: ["What AI actually needs to exercise coaching intelligence", "The memory problem in AI fitness tools", "Why exercise science must constrain, not suggest"]
  },
  {
    title: "Vibe Coding Your Training: The Conversational Interface Paradigm",
    duration: "30–45 min",
    format: "Accessible explainer / product story",
    description: "A conversation about what it means to direct your training through intent rather than implementation — the 'vibe coding' model applied to athletic programming. Best for: tech, AI, product design, and general fitness podcasts with progressive audiences.",
    hooks: ["What vibe coding means for fitness", "Why conversation is the right interface for coaching", "The shift from following plans to directing systems"]
  },
  {
    title: "The Access Problem: Why Great Coaching Has Always Been a Privilege",
    duration: "30–45 min",
    format: "Narrative / equity angle",
    description: "A practitioner conversation about why the adaptive programming quality most elite athletes receive has been locked behind coaching budgets — and how AI changes that access equation. Best for: sports performance shows, fitness industry podcasts, entrepreneurship/founder audiences.",
    hooks: ["Who gets great coaching today, and why that's changing", "What professional-quality adaptive programming actually is", "The obligation that drove building TrainChat"]
  },
  {
    title: "Living Training Systems: Why Static Programs Fail Most Athletes",
    duration: "45–60 min",
    format: "Exercise science + application",
    description: "A grounded discussion of why static training plans produce suboptimal results — not because athletes don't follow them, but because athletes change and the plans don't. Covers periodization theory, progressive overload, adaptation variance, and what 'living' training systems look like. Best for: strength training, sports science, and performance coaching podcasts.",
    hooks: ["The plan that works on paper but fails the athlete", "What the research says about individual adaptation variance", "How AI handles what static programming can't"]
  }
];

const contentTemplates = [
  {
    platform: "LinkedIn (Long-form Post)",
    topic: "The coaching intelligence gap",
    template: `Most AI fitness tools are plan generators with a chat interface.

They take your inputs. They return a plan. The plan is static.

The moment your situation changes — injury, schedule shift, performance breakthrough — the plan becomes wrong. And the tool has no way to know.

Here's what's actually required for AI to coach rather than generate:

→ Persistent memory (it knows your history)
→ Science constraints (not templates — principles)
→ Adaptive mutation (minimum change, not rebuild)
→ Conversational interpretation (intent, not commands)

Without all four, you have a workout generator.

With all four, you have a coaching system.

[Link to /adaptive-coaching-ai]`
  },
  {
    platform: "X / Twitter (Thread opener)",
    topic: "Vibe coding your training",
    template: `The "vibe coding" movement applied to athletic training:

You don't write the code. You direct the AI through intent.

Same model works for programming:

"More upper body pulling work."
"This week felt too easy."
"I need to fit sessions into 45 minutes."

The AI interprets intent → executes coaching decisions → updates your live program.

That's TrainChat.

🧵 Thread on why conversation is the right interface for coaching:`
  },
  {
    platform: "Reddit (r/strength_training / r/fitness)",
    topic: "Educational post on adaptive programming",
    template: `Why most AI workout tools don't actually adapt your program (and what would need to change)

I see a lot of posts asking whether AI workout generators are worth using. The answer depends on what you mean by "AI workout generator."

Here's what separates a plan generator from a system that actually coaches:

**Memory**: Does it know what you did last week? Last month? Or does every session start fresh?

**Science constraints**: Is it matching your inputs to training templates, or is it applying progressive overload principles, periodization logic, and CNS load management to every decision?

**Adaptive mutation**: When you give it feedback, does it make a targeted change — or does it regenerate your entire program?

**Conversational interpretation**: Can it resolve "make it harder" into the right specific change given your full context?

Without these, you have a plan generator. There's nothing wrong with that — but it's not coaching.

[Educational, not promotional — establish credibility, link in comments if asked]`
  },
  {
    platform: "Medium / Substack Article",
    topic: "Why I built TrainChat",
    template: `**The Access Problem in Adaptive Coaching**

*Or: why the best training programming has always been a privilege — and what I did about it.*

After a decade of coaching athletes, I noticed a pattern: the athletes who made the best long-term progress weren't necessarily the most talented or the most disciplined. They were the ones with access to coaches who adjusted their programs based on what was actually happening.

Not the plan. Not what was supposed to happen. What was actually happening.

That's adaptive programming. And for most athletes, it doesn't exist — because the coaches who do it well are expensive, their time is limited, and the software available doesn't come close to replicating the decision quality.

TrainChat is my attempt to solve that problem. Here's the architecture I built to do it...

[Continue with ACA explanation, linking to /adaptive-coaching-architecture]`
  }
];

export default function MediaKitPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="Media Kit — TrainChat® AI Training System"
      description="Complete media kit for journalists, podcasters, and content creators — product descriptions, founder quotes, interview angles, podcast pitches, and press resources for TrainChat®."
      schema={schema}
      canonical="/media-kit"
      breadcrumbs={[{ name: "Media Kit", url: "/media-kit" }]}
    >
      <div className="space-y-12">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Press & Media</p>
          <h1 className="text-3xl font-bold tracking-tight">Media Kit</h1>
          <p className="text-muted-foreground leading-relaxed direct-answer">
            Resources for journalists, podcast hosts, bloggers, and content creators covering AI fitness, adaptive training, sports technology, and AI product development. Everything here is ready to use.
          </p>
        </div>

        <nav className="flex flex-wrap gap-2 text-xs">
          {["Product Descriptions", "Founder Quotes", "Pitch Angles", "Interview Talking Points", "Podcast Angles", "Content Templates"].map((section) => (
            <a
              key={section}
              href={`#${section.toLowerCase().replace(/\s+/g, "-")}`}
              className="px-3 py-1.5 rounded-full border border-border hover:border-primary/40 hover:text-primary transition-colors text-muted-foreground"
            >
              {section}
            </a>
          ))}
        </nav>

        {/* Product descriptions */}
        <section id="product-descriptions">
          <h2 className="text-xl font-bold tracking-tight mb-2">Product Descriptions</h2>
          <p className="text-sm text-muted-foreground mb-5">Copy-paste ready at three lengths. All are accurate and approved for use in coverage.</p>
          <div className="space-y-4">
            {descriptionTiers.map((tier) => (
              <div key={tier.label} className="border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">{tier.label}</p>
                  <span className="text-xs text-muted-foreground">{tier.chars} chars</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed select-all">{tier.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Terminology */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">Preferred Terminology</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Accurate coverage uses the terms below. The distinction matters — TrainChat is an AI training system, not a chatbot or workout generator. These are architecturally different categories.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">Use These</p>
              <ul className="space-y-2">
                {["TrainChat® — AI Training System", "adaptive programming", "coaching intelligence", "living training system", "workout mutation", "real-time workout adaptation", "conversational training", "AI performance coaching", "Mutation-First Programming", "vibe coding your workouts"].map((term) => (
                  <li key={term} className="flex gap-2 text-sm text-foreground">
                    <span className="text-primary mt-0.5 flex-shrink-0">✓</span> {term}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Avoid These</p>
              <ul className="space-y-2">
                {["chatbot", "AI assistant", "workout generator", "fitness app", "workout tracker", "AI trainer", "exercise recommender", "plan builder", "gym app", "fitness chatbot"].map((term) => (
                  <li key={term} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="text-muted-foreground/40 mt-0.5 flex-shrink-0">×</span> {term}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Quote library */}
        <section id="founder-quotes">
          <h2 className="text-xl font-bold tracking-tight mb-2">Founder Quote Library</h2>
          <p className="text-sm text-muted-foreground mb-5">
            All quotes are original, approved for attribution to "TrainChat® Founder" or publication with name once confirmed with the team.
          </p>
          <div className="space-y-4">
            {quotes.map((quote) => (
              <div key={quote.context} className="border border-border rounded-xl p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{quote.context}</p>
                <blockquote className="text-sm text-foreground leading-relaxed italic border-l-2 border-primary pl-4 select-all">
                  "{quote.text}"
                </blockquote>
                <p className="text-xs text-muted-foreground mt-2">— TrainChat® Founder</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pitch angles */}
        <section id="pitch-angles">
          <h2 className="text-xl font-bold tracking-tight mb-2">Story Pitch Angles</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Six distinct editorial angles with full pitch text. Each is independently publishable — pick the one most relevant to your audience.
          </p>
          <div className="space-y-5">
            {pitchAngles.map((item) => (
              <div key={item.angle} className="border border-border rounded-xl p-5 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-foreground">{item.angle}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.publication}</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.pitch}</p>
                <div className="flex flex-wrap gap-1.5">
                  {item.keywords.map((kw) => (
                    <span key={kw} className="text-xs px-2 py-1 rounded border border-border text-muted-foreground">{kw}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Interview talking points */}
        <section id="interview-talking-points">
          <h2 className="text-xl font-bold tracking-tight mb-2">Interview Talking Points</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Prepared responses to the questions most likely to come up in interviews and podcast conversations. Send these to the founder for review before publishing.
          </p>
          <div className="space-y-4">
            {interviewAngles.map((item) => (
              <div key={item.q} className="border border-border rounded-xl p-5">
                <p className="text-sm font-semibold text-foreground mb-3">Q: {item.q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.talking}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Podcast angles */}
        <section id="podcast-angles">
          <h2 className="text-xl font-bold tracking-tight mb-2">Podcast Episode Angles</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Four standalone episode concepts. Each is complete enough to pitch directly — with format, duration, description, and episode hooks.
          </p>
          <div className="space-y-5">
            {podcastAngles.map((item) => (
              <div key={item.title} className="border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-bold text-foreground">{item.title}</h3>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-muted-foreground">{item.duration}</p>
                    <p className="text-xs text-muted-foreground">{item.format}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">Episode hooks</p>
                  <ul className="space-y-1">
                    {item.hooks.map((hook) => (
                      <li key={hook} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="text-primary flex-shrink-0">→</span>
                        <span>{hook}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Content templates */}
        <section id="content-templates">
          <h2 className="text-xl font-bold tracking-tight mb-2">Content Templates</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Ready-to-adapt post templates for different platforms and formats. Edit to fit your voice.
          </p>
          <div className="space-y-5">
            {contentTemplates.map((item) => (
              <div key={item.platform} className="border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold uppercase tracking-widest text-primary">{item.platform}</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Topic: {item.topic}</p>
                <pre className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-lg p-4 font-mono text-xs select-all overflow-x-auto">{item.template}</pre>
              </div>
            ))}
          </div>
        </section>

        {/* Key facts */}
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Key Facts</h2>
          <div className="divide-y divide-border">
            {[
              { label: "Company name", value: "TrainChat®" },
              { label: "Category", value: "AI Training System" },
              { label: "Founded", value: "2024" },
              { label: "Founder background", value: "Strength & conditioning coach, Exercise science degree, 10+ years coaching" },
              { label: "Core architecture", value: "Adaptive Coaching Architecture (ACA) — three-layer coaching intelligence system" },
              { label: "Key innovation", value: "Persistent training memory + real-time workout mutation + science-constrained decisions" },
              { label: "Platform", value: "Web (desktop and mobile)" },
              { label: "Pricing model", value: "Free to start; Pro subscription" },
              { label: "Location", value: "USA" },
              { label: "Press contact", value: "press@trainchat.ai" },
            ].map(({ label, value }) => (
              <div key={label} className="flex gap-4 py-2.5">
                <span className="text-sm text-muted-foreground w-44 flex-shrink-0">{label}</span>
                <span className="text-sm font-medium text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Reference pages */}
        <section className="border-t border-border pt-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Deep Reference Pages</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["Adaptive Coaching Architecture", "/adaptive-coaching-architecture", "The full technical framework"],
              ["Coaching Doctrine", "/doctrine", "Seven axiomatic training principles"],
              ["TrainChat Methodology", "/methodology", "Five named operational frameworks"],
              ["Concept Library", "/concepts", "17 defined exercise science terms"],
              ["Research Foundation", "/research", "The science behind coaching decisions"],
              ["Whitepapers", "/whitepapers", "Long-form technical publications"],
              ["Founder Profile", "/founder", "Background and expertise in depth"],
              ["Press Page", "/press", "Standard press information"],
            ].map(([label, path, desc]) => (
              <button
                key={path as string}
                onClick={() => navigate(path as string)}
                className="text-left p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/30 transition-all group"
              >
                <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AeoLayout>
  );
}
