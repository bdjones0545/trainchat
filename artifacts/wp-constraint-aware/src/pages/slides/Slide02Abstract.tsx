export default function Slide02Abstract() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0E1117 75%, #121820 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[3vh]">
          <span className="font-body font-500 uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Abstract</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <h2 className="font-display leading-tight" style={{ fontSize: "3.8vw", color: "#EDE8DC", textWrap: "balance", maxWidth: "72vw" }}>
          Real coaching environments are not stable. They never have been.
        </h2>
        <div style={{ width: "5vw", height: "2px", background: "#C8A96E", marginTop: "2.5vh", marginBottom: "3.5vh" }} />
      </div>
      <div className="absolute flex gap-[5vw]" style={{ top: "32vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Static programming assumes conditions remain constant. They do not. Fatigue accumulates unexpectedly, schedules compress, injuries surface, psychological readiness fluctuates. A program designed for stable conditions fails structurally when conditions change — not because the programming was poor, but because the system had no mechanism for adaptation.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Constraint-aware coaching systems solve this by embedding constraint detection, fatigue economics, and mutation architecture directly into the program structure. The result is a system that preserves training intent and adaptation continuity while restructuring itself around real-world conditions — without requiring the athlete to start over.
          </p>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[7vw] flex items-center gap-[3vw]">
        <div style={{ padding: "1vh 2vw", border: "1px solid #252A35", background: "#181D27" }}>
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#C8A96E" }}>Constraint-Aware Systems</span>
        </div>
        <div style={{ padding: "1vh 2vw", border: "1px solid #252A35", background: "#181D27" }}>
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#C8A96E" }}>Fatigue Economics</span>
        </div>
        <div style={{ padding: "1vh 2vw", border: "1px solid #252A35", background: "#181D27" }}>
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#C8A96E" }}>Mutation Architecture</span>
        </div>
        <div style={{ padding: "1vh 2vw", border: "1px solid #252A35", background: "#181D27" }}>
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#C8A96E" }}>Training-State Continuity</span>
        </div>
      </div>
    </div>
  );
}
