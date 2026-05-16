export default function Slide01Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0E1117 60%, #141B2A 100%)" }} />
      <div className="absolute top-0 left-0 w-[1px] h-full" style={{ background: "linear-gradient(to bottom, transparent, #C8A96E 30%, #C8A96E 70%, transparent)" }} />
      <div className="absolute top-0 right-[38vw] w-[1px] h-full" style={{ background: "linear-gradient(to bottom, transparent, #252A35 20%, #252A35 80%, transparent)" }} />
      <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: "7vw", paddingRight: "42vw" }}>
        <div className="mb-[2vh]">
          <span className="font-body font-500 tracking-widest uppercase" style={{ fontSize: "1.2vw", color: "#C8A96E", letterSpacing: "0.3em" }}>TrainChat Whitepaper Series · Vol. I</span>
        </div>
        <div className="mb-[1.5vh]" style={{ width: "6vw", height: "1px", background: "#C8A96E" }} />
        <h1 className="font-display leading-none tracking-tight" style={{ fontSize: "5.8vw", color: "#EDE8DC", textWrap: "balance" }}>
          Constraint-Aware Coaching Systems
        </h1>
        <p className="font-body font-300 mt-[2.5vh]" style={{ fontSize: "2.1vw", color: "#9AA0AE", lineHeight: "1.5", textWrap: "balance" }}>
          Why adaptive training systems outperform static programming in real-world coaching environments
        </p>
        <div className="mt-[4vh] flex items-center gap-[2vw]">
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#7A8090" }}>trainchat.ai/research/constraint-aware-coaching</span>
        </div>
      </div>
      <div className="absolute right-0 top-0 h-full flex flex-col justify-end" style={{ width: "35vw", paddingBottom: "8vh", paddingRight: "5vw" }}>
        <div style={{ borderLeft: "1px solid #252A35", paddingLeft: "3vw" }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[1vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Core Concepts</p>
          <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6070", lineHeight: "1.9" }}>Constraint-Aware Systems</p>
          <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6070", lineHeight: "1.9" }}>Fatigue Economics</p>
          <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6070", lineHeight: "1.9" }}>Mutation Architecture</p>
          <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6070", lineHeight: "1.9" }}>Training-State Continuity</p>
          <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6070", lineHeight: "1.9" }}>Conversational Coaching</p>
        </div>
      </div>
      <div className="absolute bottom-[4vh] left-[7vw]">
        <span className="font-body" style={{ fontSize: "1.4vw", color: "#3A3F4A" }}>Adaptive Coaching Architecture Series</span>
      </div>
    </div>
  );
}
