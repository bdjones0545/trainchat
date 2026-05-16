export default function Slide03LinearLimits() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #0F1310 78%, #131A14 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Section 01</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>The Limits of Linear Periodization Software</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7EB8A0", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1.3 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            Periodization software treats the plan as a stable object — a document to be followed. The assumption is that if the plan is well-designed, execution is all that remains. This assumption breaks immediately when the athlete's training state diverges from what the plan anticipated.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            The problem is architectural. Linear periodization software is optimized for plan creation, not plan evolution. When circumstances change, the system has no native mechanism for structural response — only note-taking. The coach is left to improvise in the margins of a document that was designed for a different athlete in a different moment.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Structural Limitations</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ background: "#161D16", border: "1px solid #252D26", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Plan-as-Document</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>The plan lives as static text, not queryable state</p>
            </div>
            <div style={{ background: "#161D16", border: "1px solid #252D26", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Single-Author Bias</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>Athlete input has no formal place in the plan structure</p>
            </div>
            <div style={{ background: "#161D16", border: "1px solid #252D26", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Mutation Gap</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>Changes require manual reconstruction rather than structured mutation</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
