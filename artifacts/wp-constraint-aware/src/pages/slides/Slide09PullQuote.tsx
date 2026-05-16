export default function Slide09PullQuote() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0C1019" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0C1019 60%, #111B2A 100%)" }} />
      <div className="absolute top-0 left-[7vw] w-[1px] h-full" style={{ background: "linear-gradient(to bottom, transparent, #C8A96E 20%, #C8A96E 80%, transparent)" }} />
      <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: "12vw", paddingRight: "10vw" }}>
        <div className="mb-[3vh]">
          <span style={{ fontSize: "6vw", color: "#C8A96E", fontFamily: "DM Serif Display, serif", lineHeight: 1, opacity: 0.4 }}>"</span>
        </div>
        <blockquote className="font-display" style={{ fontSize: "3.5vw", color: "#EDE8DC", lineHeight: "1.45", textWrap: "balance" }}>
          A program that cannot absorb constraint is not a training system — it is a schedule. The distinction matters because schedules break. Systems adapt.
        </blockquote>
        <div style={{ width: "6vw", height: "2px", background: "#C8A96E", marginTop: "3.5vh", marginBottom: "2.5vh" }} />
        <p className="font-body" style={{ fontSize: "1.8vw", color: "#7A8090" }}>
          Constraint-Aware Coaching Systems — TrainChat Whitepaper Series, Vol. I
        </p>
      </div>
      <div className="absolute bottom-[5vh] right-[7vw]">
        <p className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#3A3F4A" }}>trainchat.ai/research</p>
      </div>
    </div>
  );
}
