export default function Slide03WhyPureLLMFails() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #0D0E11 75%, #101218 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.15em" }}>SECTION 01</span>
          <div style={{ flex: 1, height: "1px", background: "#1C1E24" }} />
        </div>
        <h2 style={{ fontSize: "4vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Why Pure LLM Generation Fails</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1.3 }}>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75" }}>
            LLMs produce output that is grammatically and semantically consistent. They do not produce output that is structurally valid with respect to constraints they have never been given the authority to enforce. A model told to "write a strength program" will write one. It will not check whether the athlete has the training history to support the volumes specified.
          </p>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75", marginTop: "2.5vh" }}>
            The failure mode is not hallucination — it is unconstrained generation. The model produces structurally plausible output that violates domain-specific constraints it has no mechanism to represent or enforce.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "2.5vh" }}>FAILURE MODES</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #C0392B", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Constraint Blindness</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Generates programs that violate recovery or load constraints</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #C0392B", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>State Amnesia</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>No persistent knowledge of prior sessions or accumulated load</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", borderLeft: "2px solid #C0392B", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Structural Drift</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Each response can silently re-generate rather than mutate coherently</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
