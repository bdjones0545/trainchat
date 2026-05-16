export default function Slide02Abstract() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, #0D0E11 78%, #101218 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[3vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.15em" }}>ABSTRACT</span>
          <div style={{ flex: 1, height: "1px", background: "#1C1E24" }} />
        </div>
        <h2 style={{ fontSize: "3.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, textWrap: "balance", maxWidth: "75vw" }}>
          A coaching system that generates freely is untrustworthy. One that only executes rules is brittle. Neither is sufficient alone.
        </h2>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginTop: "2.5vh", marginBottom: "3.5vh" }} />
      </div>
      <div className="absolute flex gap-[5vw]" style={{ top: "34vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75" }}>
            Large language models are expressive but unstructured. They will generate a convincing training program that violates recovery constraints, ignores training age, or contradicts periodization logic — with no mechanism to detect or prevent the violation. Pure LLM generation is architecturally unsafe for precision coaching.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75" }}>
            The Deterministic-Generative Hybrid Model resolves this by assigning each capability to its appropriate component. Deterministic logic enforces structural constraints and produces valid program state. Generative intelligence handles interpretation, coaching dialogue, and the translation of athlete intent into typed system operations.
          </p>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[7vw] flex items-center gap-[3vw]">
        <div style={{ padding: "1vh 2vw", border: "1px solid #1C1E24", background: "#141519" }}>
          <span style={{ fontSize: "1.5vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>Hybrid Architecture</span>
        </div>
        <div style={{ padding: "1vh 2vw", border: "1px solid #1C1E24", background: "#141519" }}>
          <span style={{ fontSize: "1.5vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>Mutation Ontologies</span>
        </div>
        <div style={{ padding: "1vh 2vw", border: "1px solid #1C1E24", background: "#141519" }}>
          <span style={{ fontSize: "1.5vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>Coaching-State Persistence</span>
        </div>
      </div>
    </div>
  );
}
