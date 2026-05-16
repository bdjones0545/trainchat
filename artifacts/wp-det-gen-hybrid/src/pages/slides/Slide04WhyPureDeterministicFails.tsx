export default function Slide04WhyPureDeterministicFails() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, #0D0E11 72%, #101218 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.15em" }}>SECTION 02</span>
          <div style={{ flex: 1, height: "1px", background: "#1C1E24" }} />
        </div>
        <h2 style={{ fontSize: "4vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Why Pure Deterministic Programming Fails</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75" }}>
            Pure deterministic systems are structurally sound but linguistically rigid. They can enforce constraints, maintain state, and produce valid program output — but only in response to inputs that exactly match their predefined operation types. They cannot handle the ambiguity, nuance, and free-form communication that characterizes real coaching dialogue.
          </p>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75", marginTop: "2.5vh" }}>
            The athlete who says "make week 3 more aggressive" has expressed a valid training intent. A purely deterministic system cannot parse this. It has no mechanism for resolving natural language into the typed operation — load increase, intensity shift, exercise selection change — the statement implies.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "2.5vh" }}>FAILURE MODES</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #B8A99A", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Input Rigidity</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Cannot accept natural language without a parsing translation layer</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #B8A99A", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Coaching Inertness</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Cannot ask clarifying questions, interpret goals, or reason about intent</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #B8A99A", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Operational Brittleness</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Breaks on edge cases not explicitly anticipated in the rule set</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
