export default function Slide08RefinementLoops() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0F1310" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, #0F1310 73%, #131A14 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Section 06</span>
          <div style={{ flex: 1, height: "1px", background: "#252D26" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Conversational Refinement Loops</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7EB8A0", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            A refinement loop is a structured cycle of feedback and structural response: the athlete reports, the system interprets, the program mutates, and the mutation is confirmed before execution. This sequence — observe, interpret, mutate, confirm — is the core operational unit of conversational periodization.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#A8B0A0", lineHeight: "1.75" }}>
            The confirmation step is not optional. A system that applies mutations without surfacing them to the athlete has replaced coaching dialogue with unilateral adjustment. The value of conversational periodization is not just that the program responds — it is that the athlete understands and accepts the response.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.1vw", color: "#7EB8A0" }}>Refinement Loop Stages</p>
          <div className="flex flex-col" style={{ gap: "0" }}>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", paddingBottom: "2vh" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #7EB8A0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="font-display" style={{ fontSize: "1.4vw", color: "#7EB8A0" }}>1</span>
                </div>
                <div style={{ width: "1px", flex: 1, background: "#252D26", marginTop: "4px" }} />
              </div>
              <div style={{ paddingTop: "0.3vh" }}>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Observe</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>Athlete reports training feedback through dialogue</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", paddingBottom: "2vh" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #4A7FC1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="font-display" style={{ fontSize: "1.4vw", color: "#4A7FC1" }}>2</span>
                </div>
                <div style={{ width: "1px", flex: 1, background: "#252D26", marginTop: "4px" }} />
              </div>
              <div style={{ paddingTop: "0.3vh" }}>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Interpret</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>System resolves input to a specific mutation type and target</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", paddingBottom: "2vh" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #3A5A3C", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="font-display" style={{ fontSize: "1.4vw", color: "#5A8A5C" }}>3</span>
                </div>
                <div style={{ width: "1px", flex: 1, background: "#252D26", marginTop: "4px" }} />
              </div>
              <div style={{ paddingTop: "0.3vh" }}>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Mutate</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>Program structure is modified and the change is logged</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #3A4A3C", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span className="font-display" style={{ fontSize: "1.4vw", color: "#7A8878" }}>4</span>
              </div>
              <div style={{ paddingTop: "0.3vh" }}>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Confirm</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#5A6A5C" }}>Mutation is surfaced and accepted before program execution</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
