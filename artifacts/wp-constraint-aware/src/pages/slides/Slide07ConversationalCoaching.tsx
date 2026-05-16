export default function Slide07ConversationalCoaching() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0E1117 75%, #141B2A 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Section 05</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Conversational Coaching Systems</h2>
        <div style={{ width: "5vw", height: "2px", background: "#C8A96E", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            The most natural channel for constraint input is language. An athlete says: "I only have 45 minutes today" or "my left knee is bothering me" or "I'm travelling Thursday through Saturday." These are constraint declarations — and a conversational coaching system processes them as structured mutations rather than free-form notes.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            The key architectural distinction: conversational input must be resolved before execution. A system that accepts vague references ("change that exercise") without resolving them against the actual program state produces incorrect mutations. The Conversation Context Resolver pattern addresses this by translating deictic language into fully-specified mutation targets before any structural change occurs.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Constraint Dialogue → Program State</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ background: "#181D27", borderLeft: "2px solid #C8A96E", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-300" style={{ fontSize: "1.7vw", color: "#7A8090" }}>Athlete input</p>
              <p className="font-display" style={{ fontSize: "1.9vw", color: "#EDE8DC" }}>"I only have 40 minutes today"</p>
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <span style={{ fontSize: "1.6vw", color: "#C8A96E" }}>↓ Constraint Resolution</span>
            </div>
            <div style={{ background: "#181D27", borderLeft: "2px solid #4A90D9", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-300" style={{ fontSize: "1.7vw", color: "#7A8090" }}>Mutation target</p>
              <p className="font-body" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Session duration constraint → fatigue redistribution → accessory pruning</p>
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <span style={{ fontSize: "1.6vw", color: "#4A90D9" }}>↓ Structural Preservation</span>
            </div>
            <div style={{ background: "#181D27", borderLeft: "2px solid #5A6070", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-300" style={{ fontSize: "1.7vw", color: "#7A8090" }}>Program output</p>
              <p className="font-body" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Compressed session with primary movements intact and intent preserved</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
