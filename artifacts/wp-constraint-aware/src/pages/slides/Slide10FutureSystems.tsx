export default function Slide10FutureSystems() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #0E1117 75%, #141B2A 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Section 07</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>The Future of Adaptive Coaching Systems</h2>
        <div style={{ width: "5vw", height: "2px", background: "#C8A96E", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[5vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            The next generation of coaching systems will not be distinguished by the sophistication of their programming methodology — that problem is largely solved. They will be distinguished by their capacity to process constraint signals in real time, maintain structural coherence across program mutations, and preserve the coaching relationship even when the conditions change.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Constraint-aware architecture is not a feature of advanced systems — it is the baseline requirement for any system that intends to function in real-world coaching environments. The question is not whether to build it, but how to build it without sacrificing the deterministic coherence that makes a program trustworthy.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Architecture Requirements</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
              <div style={{ width: "0.6vw", height: "0.6vw", background: "#C8A96E", borderRadius: "50%", flexShrink: 0 }} />
              <p className="font-body" style={{ fontSize: "1.8vw", color: "#B8B0A0", lineHeight: "1.5" }}>Real-time constraint signal processing from dialogue</p>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
              <div style={{ width: "0.6vw", height: "0.6vw", background: "#C8A96E", borderRadius: "50%", flexShrink: 0 }} />
              <p className="font-body" style={{ fontSize: "1.8vw", color: "#B8B0A0", lineHeight: "1.5" }}>Deterministic mutation pathways with validation gates</p>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
              <div style={{ width: "0.6vw", height: "0.6vw", background: "#4A90D9", borderRadius: "50%", flexShrink: 0 }} />
              <p className="font-body" style={{ fontSize: "1.8vw", color: "#B8B0A0", lineHeight: "1.5" }}>Fatigue budget accounting across session and cycle layers</p>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
              <div style={{ width: "0.6vw", height: "0.6vw", background: "#4A90D9", borderRadius: "50%", flexShrink: 0 }} />
              <p className="font-body" style={{ fontSize: "1.8vw", color: "#B8B0A0", lineHeight: "1.5" }}>Versioned program state with full mutation history</p>
            </div>
            <div style={{ display: "flex", gap: "1vw", alignItems: "center" }}>
              <div style={{ width: "0.6vw", height: "0.6vw", background: "#7A8090", borderRadius: "50%", flexShrink: 0 }} />
              <p className="font-body" style={{ fontSize: "1.8vw", color: "#B8B0A0", lineHeight: "1.5" }}>Longitudinal constraint pattern memory across training blocks</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
