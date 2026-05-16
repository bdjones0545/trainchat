export default function Slide08ConstraintMemory() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0E1117 72%, #12181E 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Section 06</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Constraint Memory and Persistence</h2>
        <div style={{ width: "5vw", height: "2px", background: "#C8A96E", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            A constraint handled once is valuable. A constraint handled consistently, with memory of prior responses, is architecture. Hierarchical persistence allows constraint-aware systems to build a constraint history that informs future decisions — not as notes, but as structured state that influences the mutation engine.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Constraint memory operates across three time horizons: session-level (immediate), cycle-level (this training block), and longitudinal (patterns across blocks). Each horizon informs different mutation types and different structural responses.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Persistence Layers</p>
          <div className="flex flex-col gap-[2.5vh]">
            <div style={{ display: "grid", gridTemplateColumns: "6vw 1fr", gap: "1.5vw", alignItems: "start" }}>
              <div style={{ background: "#1C2230", border: "1px solid #C8A96E", padding: "1vh", textAlign: "center" }}>
                <p className="font-display" style={{ fontSize: "1.4vw", color: "#C8A96E" }}>Session</p>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Immediate context</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Active constraints, current session state, RPE signals</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "6vw 1fr", gap: "1.5vw", alignItems: "start" }}>
              <div style={{ background: "#1C2230", border: "1px solid #4A90D9", padding: "1vh", textAlign: "center" }}>
                <p className="font-display" style={{ fontSize: "1.4vw", color: "#4A90D9" }}>Cycle</p>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Block accumulation</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Recurring constraint patterns, fatigue ledger, mutation history</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "6vw 1fr", gap: "1.5vw", alignItems: "start" }}>
              <div style={{ background: "#1C2230", border: "1px solid #5A6070", padding: "1vh", textAlign: "center" }}>
                <p className="font-display" style={{ fontSize: "1.4vw", color: "#7A8090" }}>Long</p>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Longitudinal intelligence</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Cross-block constraint patterns informing future program architecture</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
