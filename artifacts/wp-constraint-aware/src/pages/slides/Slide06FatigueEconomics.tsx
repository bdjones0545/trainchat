export default function Slide06FatigueEconomics() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0E1117 70%, #12181E 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Section 04</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>Fatigue Economics and Structural Preservation</h2>
        <div style={{ width: "5vw", height: "2px", background: "#C8A96E", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[5vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Fatigue is not a variable to be minimized — it is a resource to be allocated. The concept of fatigue economics reframes load management as a structural problem: given a finite fatigue budget per training cycle, how should that budget be redistributed when constraints compress available sessions or reduce athlete capacity?
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Structural preservation is the operating principle. When a session must be shortened, the system does not randomly trim volume — it preserves the highest-priority movement patterns and redistributes the remaining fatigue budget to maintain adaptation intent.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2.5vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Fatigue Budget Principles</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "4vw", height: "4vw", background: "#1C2230", border: "1px solid #C8A96E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span className="font-display" style={{ fontSize: "1.8vw", color: "#C8A96E" }}>P</span>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Priority Preservation</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090", lineHeight: "1.5" }}>High-priority movements are protected under constraint pressure</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "4vw", height: "4vw", background: "#1C2230", border: "1px solid #4A90D9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span className="font-display" style={{ fontSize: "1.8vw", color: "#4A90D9" }}>R</span>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Redistribution</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090", lineHeight: "1.5" }}>Displaced volume is redistributed across available sessions, not discarded</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "4vw", height: "4vw", background: "#1C2230", border: "1px solid #5A6070", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span className="font-display" style={{ fontSize: "1.8vw", color: "#7A8090" }}>A</span>
              </div>
              <div>
                <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Accounting</p>
                <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090", lineHeight: "1.5" }}>Every constraint response is logged against the cycle's fatigue ledger</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
