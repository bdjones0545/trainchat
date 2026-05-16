export default function Slide02Abstract() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0F1310 75%, #121A13 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[3vh]">
          <span className="font-body font-500 uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Abstract</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <h2 className="font-display leading-tight" style={{ fontSize: "3.8vw", color: "#EDE8DC", textWrap: "balance", maxWidth: "72vw" }}>
          A plan designed upfront and executed linearly is a plan that ignores what happens next.
        </h2>
        <div style={{ width: "5vw", height: "2px", background: "#7EB8A0", marginTop: "2.5vh", marginBottom: "3.5vh" }} />
      </div>
      <div className="absolute flex gap-[5vw]" style={{ top: "33vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            Traditional periodization treats the training plan as a blueprint — designed in full before the first session and executed linearly from there. Real coaching is not a blueprint. It is a continuous series of observations, interpretations, and adjustments informed by what actually happened during training.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            Conversational periodization describes a model where the training plan is not fixed but mutable — evolving through coaching dialogue while preserving longitudinal coherence. Each exchange is not a deviation from the plan. It is the plan continuing to develop in response to new information.
          </p>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[7vw] flex items-center gap-[3vw]">
        <div style={{ padding: "1vh 2vw", border: "1px solid #252D26", background: "#161D16" }}>
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#7EB8A0" }}>Conversational Periodization</span>
        </div>
        <div style={{ padding: "1vh 2vw", border: "1px solid #252D26", background: "#161D16" }}>
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#7EB8A0" }}>Dynamic Block Refinement</span>
        </div>
        <div style={{ padding: "1vh 2vw", border: "1px solid #252D26", background: "#161D16" }}>
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#7EB8A0" }}>Training-State Evolution</span>
        </div>
      </div>
    </div>
  );
}
