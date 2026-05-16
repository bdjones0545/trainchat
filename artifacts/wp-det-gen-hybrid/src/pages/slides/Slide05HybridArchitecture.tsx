export default function Slide05HybridArchitecture() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0D0E11 75%, #101218 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.15em" }}>SECTION 03</span>
          <div style={{ flex: 1, height: "1px", background: "#1C1E24" }} />
        </div>
        <h2 style={{ fontSize: "4vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>The Hybrid Architecture</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginTop: "1.5vh", marginBottom: "2.5vh" }} />
      </div>
      <div className="absolute flex gap-[3vw] items-stretch" style={{ top: "27vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1, background: "#141519", border: "1px solid #1C1E24", borderTop: "2px solid #C0392B", padding: "2.5vh 2vw" }}>
          <p style={{ fontSize: "1.1vw", color: "#C0392B", fontFamily: "DM Mono, monospace", marginBottom: "1.5vh", letterSpacing: "0.15em" }}>GENERATIVE LAYER</p>
          <p style={{ fontSize: "1.9vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, marginBottom: "1.5vh" }}>Language Intelligence</p>
          <div className="flex flex-col gap-[1.2vh]">
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Interprets athlete intent from natural language</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Resolves ambiguous or deictic references</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Asks clarifying questions when needed</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Produces typed mutation instructions for the deterministic layer</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "1vh", width: "6vw" }}>
          <div style={{ width: "100%", height: "1px", background: "#7B9FD4" }} />
          <span style={{ fontSize: "1.4vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>+</span>
          <div style={{ width: "100%", height: "1px", background: "#7B9FD4" }} />
        </div>
        <div style={{ flex: 1, background: "#141519", border: "1px solid #1C1E24", borderTop: "2px solid #7B9FD4", padding: "2.5vh 2vw" }}>
          <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "1.5vh", letterSpacing: "0.15em" }}>DETERMINISTIC LAYER</p>
          <p style={{ fontSize: "1.9vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, marginBottom: "1.5vh" }}>Structural Integrity</p>
          <div className="flex flex-col gap-[1.2vh]">
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Validates all mutations against constraint registry</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Maintains program state across sessions</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Executes typed operations with audit log</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Rejects or redirects invalid generation output</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "1vh", width: "6vw" }}>
          <div style={{ width: "100%", height: "1px", background: "#7B9FD4" }} />
          <span style={{ fontSize: "1.4vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>=</span>
          <div style={{ width: "100%", height: "1px", background: "#7B9FD4" }} />
        </div>
        <div style={{ flex: 1, background: "#141519", border: "1px solid #7B9FD4", borderTop: "2px solid #7B9FD4", padding: "2.5vh 2vw" }}>
          <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "1.5vh", letterSpacing: "0.15em" }}>RESULT</p>
          <p style={{ fontSize: "1.9vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, marginBottom: "1.5vh" }}>Trustworthy Coaching</p>
          <div className="flex flex-col gap-[1.2vh]">
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Expressive enough for real dialogue</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Constrained enough for safe program generation</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— State-aware across every interaction</p>
            <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>— Auditable from input to program output</p>
          </div>
        </div>
      </div>
    </div>
  );
}
