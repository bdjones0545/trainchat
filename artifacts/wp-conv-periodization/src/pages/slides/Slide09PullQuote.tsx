export default function Slide09PullQuote() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0C1210" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0C1210 60%, #101815 100%)" }} />
      <div className="absolute top-0 right-[8vw] w-[1px] h-full" style={{ background: "linear-gradient(to bottom, transparent, #7EB8A0 20%, #7EB8A0 80%, transparent)" }} />
      <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: "10vw", paddingRight: "14vw" }}>
        <div className="mb-[3vh]">
          <span style={{ fontSize: "6vw", color: "#7EB8A0", fontFamily: "Playfair Display, serif", lineHeight: 1, opacity: 0.35 }}>"</span>
        </div>
        <blockquote className="font-display" style={{ fontSize: "3.4vw", color: "#EDE8DC", lineHeight: "1.5", textWrap: "balance", fontStyle: "italic" }}>
          Periodization is not a plan that tolerates deviation. It is a process that requires it. The deviations are the data.
        </blockquote>
        <div style={{ width: "6vw", height: "2px", background: "#7EB8A0", marginTop: "3.5vh", marginBottom: "2.5vh" }} />
        <p className="font-body" style={{ fontSize: "1.8vw", color: "#5A6A5C" }}>
          Conversational Periodization — TrainChat Whitepaper Series, Vol. II
        </p>
      </div>
      <div className="absolute bottom-[5vh] left-[10vw]">
        <p className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#2D3A2E" }}>trainchat.ai/research</p>
      </div>
    </div>
  );
}
