export default function Slide07AdaptiveSequencing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #0F1310 78%, #131A14 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Section 05</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Adaptive Sequencing Under Fatigue</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7EB8A0", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[5vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            Adaptive sequencing is the capacity to reorder, restructure, or redistribute training stimulus across a cycle when fatigue accumulation diverges from the plan. This is not deloading — it is structural resequencing that maintains cumulative adaptation intent while adjusting the path.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            A conversational periodization system can receive a fatigue signal mid-block — "this week is too heavy" — and respond not by simply reducing weight, but by restructuring the remaining sessions to preserve the block's adaptation curve while returning the athlete to productive training.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Sequencing Response Types</p>
          <div className="flex flex-col gap-[2.5vh]">
            <div>
              <div className="flex items-center gap-[1vw] mb-[0.8vh]">
                <div style={{ width: "0.6vw", height: "0.6vw", background: "#7EB8A0", borderRadius: "50%" }} />
                <p className="font-body font-500" style={{ fontSize: "1.9vw", color: "#EDE8DC" }}>Load Compression</p>
              </div>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C", lineHeight: "1.55", paddingLeft: "1.6vw" }}>Maintaining the week's stimulus by concentrating it into fewer, higher-quality sessions</p>
            </div>
            <div>
              <div className="flex items-center gap-[1vw] mb-[0.8vh]">
                <div style={{ width: "0.6vw", height: "0.6vw", background: "#4A7FC1", borderRadius: "50%" }} />
                <p className="font-body font-500" style={{ fontSize: "1.9vw", color: "#EDE8DC" }}>Forward Displacement</p>
              </div>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C", lineHeight: "1.55", paddingLeft: "1.6vw" }}>Deferring specific training demands to the following week without disrupting the block arc</p>
            </div>
            <div>
              <div className="flex items-center gap-[1vw] mb-[0.8vh]">
                <div style={{ width: "0.6vw", height: "0.6vw", background: "#3A4A3C", borderRadius: "50%" }} />
                <p className="font-body font-500" style={{ fontSize: "1.9vw", color: "#EDE8DC" }}>Intensity-Volume Swap</p>
              </div>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C", lineHeight: "1.55", paddingLeft: "1.6vw" }}>Preserving total stress by trading volume for reduced intensity, or vice versa</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
