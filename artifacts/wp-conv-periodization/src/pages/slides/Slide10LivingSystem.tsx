export default function Slide10LivingSystem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #0F1310 75%, #131A14 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Section 07 — 08</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Periodization as a Living System</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7EB8A0", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            The Living Systems Model proposes that a training program is not an object but an organism — one that must adapt to its environment to survive. An organism that cannot adapt does not simply underperform. It becomes irrelevant to the athlete it was designed to serve.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            Human-AI collaborative coaching closes the gap between what a coach can observe in a single session and what the program needs to know to remain structurally sound across dozens of sessions. The coach provides context, judgment, and oversight. The system provides structural consistency, mutation fidelity, and state continuity.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Human-AI Collaboration Model</p>
          <div className="flex flex-col gap-[2.5vh]">
            <div style={{ background: "#161D16", border: "1px solid #252D26", padding: "2vh 1.5vw" }}>
              <p className="font-body font-700 uppercase tracking-widest mb-[1vh]" style={{ fontSize: "1vw", color: "#7EB8A0" }}>Coach provides</p>
              <p className="font-body" style={{ fontSize: "1.7vw", color: "#A8B0A0", lineHeight: "1.6" }}>Context, athlete knowledge, clinical judgment, override authority</p>
            </div>
            <div style={{ background: "#161D16", border: "1px solid #252D26", padding: "2vh 1.5vw" }}>
              <p className="font-body font-700 uppercase tracking-widest mb-[1vh]" style={{ fontSize: "1vw", color: "#4A7FC1" }}>System provides</p>
              <p className="font-body" style={{ fontSize: "1.7vw", color: "#A8B0A0", lineHeight: "1.6" }}>Structural consistency, mutation fidelity, fatigue accounting, state memory</p>
            </div>
            <div style={{ background: "#161D16", border: "1px solid #252D26", padding: "2vh 1.5vw" }}>
              <p className="font-body font-700 uppercase tracking-widest mb-[1vh]" style={{ fontSize: "1vw", color: "#5A6A5C" }}>Together they produce</p>
              <p className="font-body" style={{ fontSize: "1.7vw", color: "#A8B0A0", lineHeight: "1.6" }}>A program that is both structurally sound and genuinely responsive to real conditions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
