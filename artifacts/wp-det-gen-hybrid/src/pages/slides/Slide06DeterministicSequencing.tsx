export default function Slide06DeterministicSequencing() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #0D0E11 78%, #101218 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.15em" }}>SECTION 04</span>
          <div style={{ flex: 1, height: "1px", background: "#1C1E24" }} />
        </div>
        <h2 style={{ fontSize: "4vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Deterministic Sequencing</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1.3 }}>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75" }}>
            Deterministic sequencing governs the structural relationships between training elements: the order of exercises within a session, the progression of load across weeks, the distribution of stress across movement patterns. These relationships are not suggestions — they are constraints with known violations and enforcement logic.
          </p>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75", marginTop: "2.5vh" }}>
            The deterministic layer treats program structure as a typed data structure with invariants. A session is valid when all its component constraints are satisfied simultaneously. When a mutation would violate an invariant, the system rejects the mutation and surfaces the violation to the coaching layer rather than allowing a structurally invalid state to persist.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "2.5vh" }}>SEQUENCING INVARIANTS</p>
          <div className="flex flex-col gap-[2vh]">
            <div style={{ background: "#141519", borderLeft: "2px solid #7B9FD4", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Stimulus Ordering</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Primary lifts precede assistance work; neural demands before metabolic</p>
            </div>
            <div style={{ background: "#141519", borderLeft: "2px solid #7B9FD4", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Progressive Overload</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Load increases are bounded by prior session performance and recovery window</p>
            </div>
            <div style={{ background: "#141519", borderLeft: "2px solid #7B9FD4", padding: "1.5vh 1.5vw" }}>
              <p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Frequency Spacing</p>
              <p style={{ fontSize: "1.6vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Minimum recovery hours enforced per muscle group and energy system</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
