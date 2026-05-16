export default function Slide01Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0D0E11 60%, #101218 100%)" }} />
      <div className="absolute top-0 left-[45vw] bottom-0" style={{ width: "1px", background: "linear-gradient(to bottom, transparent, #7B9FD4 20%, #7B9FD4 80%, transparent)" }} />
      <div className="absolute inset-0 flex flex-col justify-center" style={{ paddingLeft: "6vw", paddingRight: "57vw" }}>
        <div className="mb-[2vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.18em" }}>TRAINCHAT WHITEPAPER · VOL. III</span>
        </div>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginBottom: "2.5vh" }} />
        <h1 style={{ fontSize: "4.6vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, lineHeight: "1.1", textWrap: "balance" }}>
          The Deterministic-Generative Hybrid Model
        </h1>
        <p style={{ fontSize: "1.9vw", color: "#6B7280", fontFamily: "DM Mono, monospace", marginTop: "2.5vh", lineHeight: "1.55", textWrap: "balance" }}>
          A structured architecture for AI coaching that requires both deterministic logic and generative intelligence
        </p>
        <div style={{ marginTop: "4vh" }}>
          <span style={{ fontSize: "1.4vw", color: "#272930", fontFamily: "DM Mono, monospace" }}>trainchat.ai/research/deterministic-generative-hybrid</span>
        </div>
      </div>
      <div className="absolute top-0 bottom-0 right-0 flex flex-col justify-center" style={{ left: "47vw", paddingRight: "5vw", paddingLeft: "3vw" }}>
        <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "2.5vh" }}>ARCHITECTURE COMPONENTS</p>
        <div className="flex flex-col gap-[2vh]">
          <div style={{ borderLeft: "1px solid #1C1E24", paddingLeft: "1.5vw" }}>
            <p style={{ fontSize: "1.7vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Deterministic Sequencing</p>
            <p style={{ fontSize: "1.4vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Rule-governed structure</p>
          </div>
          <div style={{ borderLeft: "1px solid #7B9FD4", paddingLeft: "1.5vw" }}>
            <p style={{ fontSize: "1.7vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Mutation Ontologies</p>
            <p style={{ fontSize: "1.4vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Typed change operations</p>
          </div>
          <div style={{ borderLeft: "1px solid #1C1E24", paddingLeft: "1.5vw" }}>
            <p style={{ fontSize: "1.7vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Validation Gates</p>
            <p style={{ fontSize: "1.4vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Constraint-enforcement layer</p>
          </div>
          <div style={{ borderLeft: "1px solid #1C1E24", paddingLeft: "1.5vw" }}>
            <p style={{ fontSize: "1.7vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Coaching-State Persistence</p>
            <p style={{ fontSize: "1.4vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Cross-session memory</p>
          </div>
        </div>
      </div>
      <div className="absolute bottom-[4vh] left-[6vw]">
        <span style={{ fontSize: "1.4vw", color: "#1C1E24", fontFamily: "DM Mono, monospace" }}>Adaptive Coaching Architecture Series</span>
      </div>
    </div>
  );
}
