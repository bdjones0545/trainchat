export default function Slide10CoachingStatePersistence() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #0D0E11 78%, #101218 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.15em" }}>SECTION 07</span>
          <div style={{ flex: 1, height: "1px", background: "#1C1E24" }} />
        </div>
        <h2 style={{ fontSize: "4vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Coaching-State Persistence</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75" }}>
            Coaching-state persistence is the property that makes a hybrid coaching system coherent across time. It is not just memory — it is the maintenance of a consistent world model: who this athlete is, what they have done, what constraints apply to them, and what the current state of their program is at this moment.
          </p>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75", marginTop: "2.5vh" }}>
            The stateless interaction model of consumer LLMs is architecturally incompatible with precision coaching. Every coaching decision depends on prior decisions. A system that cannot retrieve and reason about its own history cannot produce consistent, structurally coherent long-term programming.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "2.5vh" }}>PERSISTENT STATE COMPONENTS</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #7B9FD4", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Athlete Profile</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Training age, capacity estimates, constraint history, goals</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #7B9FD4", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Program State</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Current block, week, session, and their complete structural definitions</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #7B9FD4", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Mutation Ledger</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Ordered log of every structural change, its rationale, and outcome</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
