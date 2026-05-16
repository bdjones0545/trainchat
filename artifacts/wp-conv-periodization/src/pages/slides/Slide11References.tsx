export default function Slide11References() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0F1310 80%, #131A14 100%)" }} />
      <div className="absolute top-0 right-0 w-[1px] h-full" style={{ background: "linear-gradient(to bottom, transparent, #7EB8A0 30%, #7EB8A0 70%, transparent)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[10vw]">
        <div className="flex items-center gap-[1.5vw] mb-[3vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Metadata + References</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <div className="flex gap-[5vw]">
          <div style={{ flex: 1 }}>
            <p className="font-body font-700 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>SEO / AEO Metadata</p>
            <div className="flex flex-col gap-[1.5vh]">
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.6vw", color: "#EDE8DC" }}>Canonical URL</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#4A7FC1" }}>trainchat.ai/research/conversational-periodization</p>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.6vw", color: "#EDE8DC" }}>SEO Title</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#7A8878" }}>Conversational Periodization: Adaptive Training Through Coaching Dialogue</p>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.6vw", color: "#EDE8DC" }}>Description</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#7A8878", lineHeight: "1.5" }}>How adaptive training systems can evolve through continuous coaching dialogue while preserving long-term structural coherence and adaptation continuity.</p>
              </div>
              <div className="mt-[1vh]">
                <p className="font-body font-500 mb-[1vh]" style={{ fontSize: "1.6vw", color: "#EDE8DC" }}>Keywords</p>
                <div className="flex flex-wrap gap-[0.8vw]">
                  <span style={{ padding: "0.4vh 0.8vw", border: "1px solid #252D26", background: "#161D16", fontSize: "1.4vw", color: "#7A8878", fontFamily: "DM Sans, sans-serif" }}>conversational periodization</span>
                  <span style={{ padding: "0.4vh 0.8vw", border: "1px solid #252D26", background: "#161D16", fontSize: "1.4vw", color: "#7A8878", fontFamily: "DM Sans, sans-serif" }}>adaptive sequencing</span>
                  <span style={{ padding: "0.4vh 0.8vw", border: "1px solid #252D26", background: "#161D16", fontSize: "1.4vw", color: "#7A8878", fontFamily: "DM Sans, sans-serif" }}>training-state evolution</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <p className="font-body font-700 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Whitepaper Series</p>
            <div className="flex flex-col gap-[2vh]">
              <div style={{ borderLeft: "2px solid #252D26", paddingLeft: "1.5vw" }}>
                <p className="font-body font-500" style={{ fontSize: "1.7vw", color: "#EDE8DC" }}>Vol. I — Constraint-Aware Coaching Systems</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#5A6A5C" }}>trainchat.ai/research/constraint-aware-coaching-systems</p>
              </div>
              <div style={{ borderLeft: "2px solid #7EB8A0", paddingLeft: "1.5vw" }}>
                <p className="font-body font-500" style={{ fontSize: "1.7vw", color: "#EDE8DC" }}>Vol. II — Conversational Periodization</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#7EB8A0" }}>Current paper</p>
              </div>
              <div style={{ borderLeft: "2px solid #252D26", paddingLeft: "1.5vw" }}>
                <p className="font-body font-500" style={{ fontSize: "1.7vw", color: "#EDE8DC" }}>Vol. III — The Deterministic-Generative Hybrid Model</p>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#5A6A5C" }}>trainchat.ai/research/deterministic-generative-hybrid</p>
              </div>
              <div style={{ borderLeft: "2px solid #252D26", paddingLeft: "1.5vw" }}>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#3A4A3C" }}>Related: Mutation-First Programming (MFP) · Living Systems Model (LSM) · ACA</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[4vh] left-[7vw]">
        <p className="font-body" style={{ fontSize: "1.4vw", color: "#2D3A2E" }}>TrainChat — Adaptive Coaching Architecture Series · 2026</p>
      </div>
    </div>
  );
}
