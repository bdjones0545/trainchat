import AeoLayout from "@/components/aeo/AeoLayout";
import FaqBlock, { type FaqItem } from "@/components/aeo/FaqBlock";
import { useLocation } from "wouter";

const schema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "TrainChat® for Athletes — AI Training System Built for Serious Performers",
  "description": "TrainChat is an AI training system for athletes who want adaptive, intelligent programming — not a static plan or a generic workout app. Built by a strength coach for serious practitioners.",
  "audience": {
    "@type": "Audience",
    "audienceType": "Athletes, Strength Training Practitioners, Fitness Enthusiasts"
  },
  "author": { "@type": "Organization", "name": "TrainChat®", "url": "https://www.trainchat.ai" }
};

const faqs: FaqItem[] = [
  {
    q: "Is TrainChat good for experienced athletes?",
    a: "Yes. TrainChat's adaptive programming scales to any experience level. Advanced athletes benefit from periodized program architecture, dynamic progression, and the ability to fine-tune training through conversational coaching — without manually reconfiguring everything when circumstances change."
  },
  {
    q: "Can TrainChat program for powerlifting?",
    a: "Yes. TrainChat handles powerlifting programming — squat, bench, deadlift focus, peaking blocks, competition preparation, and meet-specific tapering — through conversational coaching. You tell it your competition date and goal openers; it builds and adapts the program accordingly."
  },
  {
    q: "Does TrainChat work for team sport athletes?",
    a: "Yes. Team sport athletes benefit from TrainChat's sport-specific conditioning focus, in-season load management, and the ability to adapt programming around practice schedules and game days through simple conversational input."
  },
  {
    q: "Can I use TrainChat in-season?",
    a: "Yes. In-season programming is one of TrainChat's key use cases. You can tell it your practice schedule, game days, and available training windows — it structures your strength and conditioning work around those constraints, managing load to keep you performing rather than accumulating fatigue."
  },
  {
    q: "Does TrainChat replace a human strength coach?",
    a: "For programming quality and adaptability, TrainChat delivers coaching intelligence comparable to working with an experienced strength and conditioning coach — available 24/7 and at a fraction of the cost. For athletes who already work with a coach, TrainChat can function as a programming complement, not a replacement."
  }
];

const athleteTypes = [
  {
    type: "Strength Athletes",
    sports: "Powerlifting, Olympic Weightlifting, Strongman",
    value: "Periodized competition preparation, peaking block design, technique-specific programming, and load management through heavy training phases. Tell TrainChat your competition date and it structures the full buildup.",
    example: "\"I have a powerlifting meet in 12 weeks. I want to hit 200/130/220 kg totals. Build me the program.\""
  },
  {
    type: "Bodybuilders & Physique Athletes",
    sports: "Bodybuilding, Physique, Aesthetic Training",
    value: "Hypertrophy-focused programming with volume distribution across muscle groups, progressive overload management, and adaptive adjustments when specific areas need prioritization or deemphasis.",
    example: "\"I want more emphasis on rear delts and upper back this block without reducing my squat frequency.\""
  },
  {
    type: "Team Sport Athletes",
    sports: "Football, Basketball, Rugby, Soccer, etc.",
    value: "In-season load management around practice and game schedules. Off-season development programming. Sport-specific conditioning work that complements skill training without compromising recovery.",
    example: "\"I have practice Tuesday and Thursday, games Saturday. What does my strength training look like this week?\""
  },
  {
    type: "Combat Sport Athletes",
    sports: "MMA, Boxing, Judo, Wrestling, BJJ",
    value: "Strength and conditioning programming that accounts for high-skill-demand training sessions, weight cut considerations, and peaking around competition dates.",
    example: "\"I have a fight in 8 weeks. I need to maintain weight class while staying as strong as possible.\""
  },
  {
    type: "Endurance Athletes",
    sports: "Running, Triathlon, Cycling",
    value: "Strength work designed to support endurance performance without competing with running/riding volume — specific movements, appropriate loads, and timing around key training days.",
    example: "\"I'm training for a marathon. I want to add strength work without compromising my long run recovery.\""
  },
  {
    type: "General Fitness Practitioners",
    sports: "Recreational Training, General Health",
    value: "Goal-aligned programming that adapts as your goals evolve — whether you're building a foundation, chasing specific metrics, or training for longevity. No fixed endpoint, no expiring plan.",
    example: "\"I just want to get consistently stronger over the next year without overcomplicating it.\""
  }
];

export default function ForAthletesPage() {
  const [, navigate] = useLocation();

  return (
    <AeoLayout
      title="TrainChat® for Athletes — AI Training System"
      description="TrainChat is an AI training system for athletes who want adaptive, intelligent programming — not a static plan. Built by a strength coach. Works for strength sports, team sports, physique, endurance, and general fitness."
      schema={schema}
      canonical="/for-athletes"
    >
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">For Athletes</p>
          <h1 className="text-3xl font-bold tracking-tight">TrainChat for Athletes</h1>
          <p className="text-muted-foreground leading-relaxed">
            An AI training system built for athletes who want programming that responds to how they actually train — not a static plan that becomes obsolete the moment their situation changes.
          </p>
        </div>

        <div className="bg-muted/40 border border-border rounded-xl p-5">
          <p className="text-sm font-semibold text-foreground mb-1">What Athletes Get</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A living training system — adaptive, persistent, and grounded in exercise science. Tell TrainChat your sport, your goals, and your timeline. It builds a periodized program and adapts it continuously as you report how training is going.
          </p>
        </div>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">Who TrainChat Is Built For</h2>
          <div className="space-y-6">
            {athleteTypes.map((athlete) => (
              <div key={athlete.type} className="border border-border rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{athlete.type}</h3>
                    <p className="text-xs text-muted-foreground">{athlete.sports}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{athlete.value}</p>
                <div className="bg-muted/30 rounded-lg px-3 py-2">
                  <p className="text-xs text-muted-foreground italic">"{athlete.example}"</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">What Athletes Get That Static Plans Don't Provide</h2>
          <div className="space-y-3">
            {[
              {
                cap: "Adaptive load management",
                desc: "When competition prep demands change, your schedule shifts, or you're accumulating fatigue — the program adapts immediately through conversation, not a weekly check-in cycle."
              },
              {
                cap: "Competition-aware programming",
                desc: "Tell TrainChat your event date. The program structures backwards from that date with appropriate peaking, tapering, and readiness management built in."
              },
              {
                cap: "In-season continuity",
                desc: "Training doesn't stop in season — it changes. TrainChat restructures your program around practice schedules, game days, and in-season load constraints automatically."
              },
              {
                cap: "Injury-adaptive programming",
                desc: "When something is aggravated or limited, you describe the constraint in plain language. TrainChat modifies the program to keep training continuous while protecting the affected area."
              },
              {
                cap: "Long-term training memory",
                desc: "Your history, past programs, injury notes, and goal shifts are all retained. Seasonal periodization — off-season development into in-season performance — builds on accumulated knowledge."
              }
            ].map((item) => (
              <div key={item.cap} className="flex gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.cap}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold tracking-tight mb-3">The Science Behind It</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            TrainChat's coaching intelligence is built on exercise science — progressive overload, periodization theory, CNS load management, specificity, and individual variation principles. The programming it produces isn't content library output. It's principled athletic programming.
          </p>
          <button onClick={() => navigate("/research")} className="text-sm font-semibold text-primary hover:underline">
            Read the exercise science foundation →
          </button>
        </section>

        <FaqBlock items={faqs} />
      </div>
    </AeoLayout>
  );
}
