export default function Slide05DynamicBlockMutation() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0F1310 75%, #131A14 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Section 03</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Dynamic Block and Week Mutation</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7EB8A0", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            The training block is the natural unit of periodization. Dynamic block mutation allows individual weeks, sessions, or exercises within a block to be modified without invalidating the block's accumulated structure. The block's orientation — its training emphasis, peak target, and fatigue curve — is preserved even as its components are adjusted.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            This distinction matters architecturally. When a week is mutated, it is not replaced — it is transformed in place. The system maintains the relationship between that week and all other weeks in the block, recalculating downstream dependencies while preserving block-level coherence.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Mutation Scope Hierarchy</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "stretch" }}>
              <div style={{ width: "0.4vw", background: "#7EB8A0", borderRadius: "2px" }} />
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.9vw", color: "#EDE8DC" }}>Block Mutation</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C", lineHeight: "1.5" }}>Changes to training emphasis, periodization structure, or peak target. Cascades through all weeks.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "stretch" }}>
              <div style={{ width: "0.4vw", background: "#4A7FC1", borderRadius: "2px" }} />
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.9vw", color: "#EDE8DC" }}>Week Mutation</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C", lineHeight: "1.5" }}>Load redistribution, session reordering, or volume adjustments within a single training week.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "stretch" }}>
              <div style={{ width: "0.4vw", background: "#3A4A3C", borderRadius: "2px" }} />
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.9vw", color: "#EDE8DC" }}>Session Mutation</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C", lineHeight: "1.5" }}>Exercise substitution, set/rep changes, tempo adjustments within a single session.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
