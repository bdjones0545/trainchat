export default function Slide04CoachingDialogue() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, #0F1310 72%, #131A14 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Section 02</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Coaching as Iterative Dialogue</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7EB8A0", marginTop: "1.5vh", marginBottom: "2.5vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "27vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            The coach-athlete relationship has always been conversational. A session ends. The coach asks. The athlete answers. The next session is adjusted accordingly. This is not informal improvisation — it is structured information processing disguised as conversation.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            Conversational periodization formalizes this exchange. Athlete statements are parsed as structured inputs. "Make day 2 more explosive" is not a note — it is a mutation instruction targeting session 2's energy system emphasis, requiring a specific class of exercise substitution and load redistribution.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Dialogue as Structured Input</p>
          <div className="flex flex-col gap-[1.8vh]">
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1vw", alignItems: "center" }}>
              <div style={{ background: "#161D16", borderLeft: "2px solid #7EB8A0", padding: "1.2vh 1vw" }}>
                <p className="font-display" style={{ fontSize: "1.6vw", color: "#7A8878", fontStyle: "italic" }}>"Make day 2 more explosive"</p>
              </div>
              <span style={{ fontSize: "1.4vw", color: "#7EB8A0" }}>→</span>
              <div style={{ background: "#161D16", padding: "1.2vh 1vw", border: "1px solid #252D26" }}>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#EDE8DC" }}>Energy system re-emphasis + movement substitution</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1vw", alignItems: "center" }}>
              <div style={{ background: "#161D16", borderLeft: "2px solid #4A7FC1", padding: "1.2vh 1vw" }}>
                <p className="font-display" style={{ fontSize: "1.6vw", color: "#7A8878", fontStyle: "italic" }}>"Lower fatigue this week"</p>
              </div>
              <span style={{ fontSize: "1.4vw", color: "#4A7FC1" }}>→</span>
              <div style={{ background: "#161D16", padding: "1.2vh 1vw", border: "1px solid #252D26" }}>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#EDE8DC" }}>Volume reduction + fatigue budget redistribution</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1vw", alignItems: "center" }}>
              <div style={{ background: "#161D16", borderLeft: "2px solid #5A6A5C", padding: "1.2vh 1vw" }}>
                <p className="font-display" style={{ fontSize: "1.6vw", color: "#7A8878", fontStyle: "italic" }}>"Shift this toward hypertrophy"</p>
              </div>
              <span style={{ fontSize: "1.4vw", color: "#7A8878" }}>→</span>
              <div style={{ background: "#161D16", padding: "1.2vh 1vw", border: "1px solid #252D26" }}>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#EDE8DC" }}>Rep range mutation + tempo and TUT adjustments</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1vw", alignItems: "center" }}>
              <div style={{ background: "#161D16", borderLeft: "2px solid #5A6A5C", padding: "1.2vh 1vw" }}>
                <p className="font-display" style={{ fontSize: "1.6vw", color: "#7A8878", fontStyle: "italic" }}>"Remove squats temporarily"</p>
              </div>
              <span style={{ fontSize: "1.4vw", color: "#7A8878" }}>→</span>
              <div style={{ background: "#161D16", padding: "1.2vh 1vw", border: "1px solid #252D26" }}>
                <p className="font-body" style={{ fontSize: "1.5vw", color: "#EDE8DC" }}>Movement substitution + load rebalance for knee-safe alternatives</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
