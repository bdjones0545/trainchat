export default function Slide05SystemDesign() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0E1117 75%, #141B2A 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Section 03</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Constraint-Aware System Design</h2>
        <div style={{ width: "5vw", height: "2px", background: "#C8A96E", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1.3 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            A constraint-aware system does not merely tolerate disruption — it processes constraint signals as structured inputs and generates targeted structural responses. The program is not a static document; it is a mutable state that can be queried, updated, and versioned without losing its longitudinal coherence.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Three architectural properties distinguish constraint-aware systems from their static counterparts: hierarchical persistence, deterministic rule sets, and mutation-bounded editing.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <div className="flex flex-col gap-[2.5vh]">
            <div>
              <div className="flex items-center gap-[1vw] mb-[0.8vh]">
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #C8A96E", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="font-display" style={{ fontSize: "1.5vw", color: "#C8A96E" }}>01</span>
                </div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Hierarchical Persistence</p>
              </div>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090", lineHeight: "1.6" }}>Program structure is stored in versioned layers. Constraints modify specific layers without touching others.</p>
            </div>
            <div>
              <div className="flex items-center gap-[1vw] mb-[0.8vh]">
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #4A90D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="font-display" style={{ fontSize: "1.5vw", color: "#4A90D9" }}>02</span>
                </div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Deterministic Rule Sets</p>
              </div>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090", lineHeight: "1.6" }}>Constraint responses follow defined mutation pathways — no ad-hoc edits, no intent drift.</p>
            </div>
            <div>
              <div className="flex items-center gap-[1vw] mb-[0.8vh]">
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #5A6070", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="font-display" style={{ fontSize: "1.5vw", color: "#7A8090" }}>03</span>
                </div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Mutation-Bounded Editing</p>
              </div>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090", lineHeight: "1.6" }}>Every change is scoped, logged, and reversible. Continuity is never sacrificed for adaptability.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
