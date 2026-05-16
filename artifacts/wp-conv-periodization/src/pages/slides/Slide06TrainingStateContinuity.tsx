export default function Slide06TrainingStateContinuity() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0F1310 70%, #12181A 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Section 04</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Training-State Continuity</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7EB8A0", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1.3 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            Training-state continuity is the principle that a program mutation should never discard the structural history that preceded it. Every session completed, every load managed, every fatigue signal registered — these form the training state that informs every subsequent decision.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            When a coach tells an athlete to "start over," the athlete never actually does. The nervous system remembers. The connective tissue remembers. A system that respects training-state continuity similarly refuses to treat any mutation as a clean-slate reset. Every change is a transformation of existing state, not a replacement of it.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>State Components</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ background: "#161D16", borderLeft: "2px solid #7EB8A0", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Accumulated Load</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>Total volume and intensity history across sessions and blocks</p>
            </div>
            <div style={{ background: "#161D16", borderLeft: "2px solid #4A7FC1", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Mutation History</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>Record of all structural changes and the constraints that triggered them</p>
            </div>
            <div style={{ background: "#161D16", borderLeft: "2px solid #3A4A3C", padding: "1.5vh 1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Progression Trajectory</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>Directional load curve and peak readiness forecast</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
