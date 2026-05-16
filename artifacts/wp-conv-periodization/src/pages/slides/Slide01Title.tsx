export default function Slide01Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0F1310 55%, #131A14 100%)" }} />
      <div className="absolute top-0 bottom-0 right-[40vw]" style={{ width: "1px", background: "linear-gradient(to bottom, transparent, #7EB8A0 25%, #7EB8A0 75%, transparent)" }} />
      <div className="absolute top-[5vh] right-0" style={{ width: "38vw", height: "1px", background: "linear-gradient(to right, transparent, #252D26)" }} />
      <div className="absolute bottom-[5vh] right-0" style={{ width: "38vw", height: "1px", background: "linear-gradient(to right, transparent, #252D26)" }} />
      <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: "7vw", paddingRight: "44vw" }}>
        <div className="mb-[2vh]">
          <span className="font-body font-500 tracking-widest uppercase" style={{ fontSize: "1.2vw", color: "#7EB8A0", letterSpacing: "0.3em" }}>TrainChat Whitepaper Series · Vol. II</span>
        </div>
        <div className="mb-[1.5vh]" style={{ width: "6vw", height: "1px", background: "#7EB8A0" }} />
        <h1 className="font-display leading-none" style={{ fontSize: "5.6vw", color: "#EDE8DC", textWrap: "balance" }}>
          Conversational Periodization
        </h1>
        <p className="font-body font-300 mt-[2.5vh]" style={{ fontSize: "2vw", color: "#7A8878", lineHeight: "1.5", textWrap: "balance" }}>
          Toward adaptive training systems built through continuous coaching dialogue
        </p>
        <div className="mt-[4vh]">
          <span className="font-body" style={{ fontSize: "1.5vw", color: "#4A5A4C" }}>trainchat.ai/research/conversational-periodization</span>
        </div>
      </div>
      <div className="absolute right-0 top-0 h-full flex flex-col justify-center" style={{ width: "37vw", paddingRight: "5vw", paddingLeft: "3vw" }}>
        <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Dialogue Examples</p>
        <div className="flex flex-col gap-[2vh]">
          <div style={{ borderLeft: "1px solid #252D26", paddingLeft: "2vw" }}>
            <p className="font-display" style={{ fontSize: "1.8vw", color: "#7A8878", fontStyle: "italic" }}>"Make day 2 more explosive"</p>
          </div>
          <div style={{ borderLeft: "1px solid #252D26", paddingLeft: "2vw" }}>
            <p className="font-display" style={{ fontSize: "1.8vw", color: "#7A8878", fontStyle: "italic" }}>"Lower fatigue this week"</p>
          </div>
          <div style={{ borderLeft: "1px solid #252D26", paddingLeft: "2vw" }}>
            <p className="font-display" style={{ fontSize: "1.8vw", color: "#7A8878", fontStyle: "italic" }}>"Shift this toward hypertrophy"</p>
          </div>
          <div style={{ borderLeft: "1px solid #252D26", paddingLeft: "2vw" }}>
            <p className="font-display" style={{ fontSize: "1.8vw", color: "#7A8878", fontStyle: "italic" }}>"Remove squats temporarily"</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[4vh] left-[7vw]">
        <span className="font-body" style={{ fontSize: "1.4vw", color: "#2D3A2E" }}>Adaptive Coaching Architecture Series</span>
      </div>
    </div>
  );
}
