export default function Slide04FailureModes() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(150deg, #0E1117 70%, #12181F 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Section 02</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Static Programming Failure Modes</h2>
        <div style={{ width: "5vw", height: "2px", background: "#C8A96E", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute grid" style={{ top: "28vh", left: "7vw", right: "7vw", gridTemplateColumns: "1fr 1fr", gap: "3vw" }}>
        <div>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Static programs fail not because coaches lack expertise, but because the architecture cannot absorb new information. When an athlete reports that a session was too fatiguing, a static system has no structural mechanism to respond — so the coach either ignores the signal or rebuilds from scratch.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Neither response preserves the original program's intent. The first accumulates structural debt. The second discards valid work. Both fail the athlete.
          </p>
        </div>
        <div className="flex flex-col gap-[2vh]">
          <p className="font-body font-700 uppercase tracking-widest mb-[0.5vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Structural Failure Patterns</p>
          <div style={{ background: "#181D27", border: "1px solid #252A35", padding: "1.5vh 1.5vw" }}>
            <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Signal Blindness</p>
            <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Athlete feedback enters the system but cannot alter program structure</p>
          </div>
          <div style={{ background: "#181D27", border: "1px solid #252A35", padding: "1.5vh 1.5vw" }}>
            <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Rebuild Reflex</p>
            <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Constraint changes trigger full program restart rather than targeted mutation</p>
          </div>
          <div style={{ background: "#181D27", border: "1px solid #252A35", padding: "1.5vh 1.5vw" }}>
            <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Continuity Loss</p>
            <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Accumulated adaptation context is discarded when the program changes</p>
          </div>
          <div style={{ background: "#181D27", border: "1px solid #252A35", padding: "1.5vh 1.5vw" }}>
            <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Intent Drift</p>
            <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Piecemeal edits erode the program's original movement balance and periodization logic</p>
          </div>
        </div>
      </div>
    </div>
  );
}
