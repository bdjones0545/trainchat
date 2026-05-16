export default function Slide11References() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0E1117 80%, #141B2A 100%)" }} />
      <div className="absolute top-0 right-0 w-[1px] h-full" style={{ background: "linear-gradient(to bottom, transparent, #C8A96E 30%, #C8A96E 70%, transparent)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[10vw]">
        <div className="flex items-center gap-[1.5vw] mb-[3vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Metadata + References</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <div className="flex gap-[5vw]">
          <div style={{ flex: 1 }}>
            <p className="font-body font-700 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>SEO / AEO Metadata</p>
            <div className="flex flex-col gap-[1.5vh]">
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.6vw", color: "#EDE8DC" }}>Canonical URL</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#4A90D9" }}>trainchat.ai/research/constraint-aware-coaching-systems</p>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.6vw", color: "#EDE8DC" }}>SEO Title</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#7A8090" }}>Constraint-Aware Coaching Systems: Adaptive Training Architecture</p>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.6vw", color: "#EDE8DC" }}>Description</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#7A8090", lineHeight: "1.5" }}>How constraint-aware training systems preserve movement balance, progression, and fatigue economics while adapting structurally to real-world coaching constraints.</p>
              </div>
              <div className="mt-[1vh]">
                <p className="font-body font-500 mb-[1vh]" style={{ fontSize: "1.6vw", color: "#EDE8DC" }}>Keywords</p>
                <div className="flex flex-wrap gap-[0.8vw]">
                  <span style={{ padding: "0.4vh 0.8vw", border: "1px solid #252A35", background: "#181D27", fontSize: "1.4vw", color: "#7A8090", fontFamily: "DM Sans, sans-serif" }}>adaptive training systems</span>
                  <span style={{ padding: "0.4vh 0.8vw", border: "1px solid #252A35", background: "#181D27", fontSize: "1.4vw", color: "#7A8090", fontFamily: "DM Sans, sans-serif" }}>fatigue economics</span>
                  <span style={{ padding: "0.4vh 0.8vw", border: "1px solid #252A35", background: "#181D27", fontSize: "1.4vw", color: "#7A8090", fontFamily: "DM Sans, sans-serif" }}>mutation architecture</span>
                  <span style={{ padding: "0.4vh 0.8vw", border: "1px solid #252A35", background: "#181D27", fontSize: "1.4vw", color: "#7A8090", fontFamily: "DM Sans, sans-serif" }}>training-state continuity</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <p className="font-body font-700 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Whitepaper Series</p>
            <div className="flex flex-col gap-[2vh]">
              <div style={{ borderLeft: "2px solid #C8A96E", paddingLeft: "1.5vw" }}>
                <p className="font-body font-500" style={{ fontSize: "1.7vw", color: "#EDE8DC" }}>Vol. I — Constraint-Aware Coaching Systems</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#C8A96E" }}>Current paper</p>
              </div>
              <div style={{ borderLeft: "2px solid #252A35", paddingLeft: "1.5vw" }}>
                <p className="font-body font-500" style={{ fontSize: "1.7vw", color: "#EDE8DC" }}>Vol. II — Conversational Periodization</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#7A8090" }}>trainchat.ai/research/conversational-periodization</p>
              </div>
              <div style={{ borderLeft: "2px solid #252A35", paddingLeft: "1.5vw" }}>
                <p className="font-body font-500" style={{ fontSize: "1.7vw", color: "#EDE8DC" }}>Vol. III — The Deterministic-Generative Hybrid Model</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#7A8090" }}>trainchat.ai/research/deterministic-generative-hybrid</p>
              </div>
              <div style={{ borderLeft: "2px solid #252A35", paddingLeft: "1.5vw" }}>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#5A6070" }}>Related: Adaptive Coaching Architecture (ACA) · Mutation-First Programming (MFP) · Living Systems Model (LSM)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[4vh] left-[7vw]">
        <p className="font-body" style={{ fontSize: "1.4vw", color: "#3A3F4A" }}>TrainChat — Adaptive Coaching Architecture Series · 2026</p>
      </div>
    </div>
  );
}
