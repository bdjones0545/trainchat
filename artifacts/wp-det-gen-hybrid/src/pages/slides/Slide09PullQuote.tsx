export default function Slide09PullQuote() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0A0B0D" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0A0B0D 65%, #0D0E12 100%)" }} />
      <div className="absolute top-0 left-[6vw] bottom-0" style={{ width: "1px", background: "linear-gradient(to bottom, transparent, #7B9FD4 20%, #7B9FD4 80%, transparent)" }} />
      <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: "12vw", paddingRight: "10vw" }}>
        <div style={{ marginBottom: "1.5vh" }}>
          <span style={{ fontSize: "5.5vw", color: "#7B9FD4", fontFamily: "Space Grotesk, sans-serif", lineHeight: 1, opacity: 0.25 }}>"</span>
        </div>
        <blockquote style={{ fontSize: "3.4vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, lineHeight: "1.45", textWrap: "balance" }}>
          The generative layer interprets. The deterministic layer decides. Neither can do the other's job without breaking the system.
        </blockquote>
        <div style={{ width: "6vw", height: "2px", background: "#7B9FD4", marginTop: "3.5vh", marginBottom: "2.5vh" }} />
        <p style={{ fontSize: "1.8vw", color: "#4B5563", fontFamily: "DM Mono, monospace" }}>
          The Deterministic-Generative Hybrid Model — TrainChat Whitepaper Series, Vol. III
        </p>
      </div>
      <div className="absolute bottom-[5vh] left-[12vw]">
        <p style={{ fontSize: "1.1vw", color: "#1C1E24", fontFamily: "DM Mono, monospace" }}>trainchat.ai/research</p>
      </div>
    </div>
  );
}
