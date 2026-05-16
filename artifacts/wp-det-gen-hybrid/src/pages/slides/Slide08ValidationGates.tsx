export default function Slide08ValidationGates() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(145deg, #0D0E11 75%, #101218 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.15em" }}>SECTION 06</span>
          <div style={{ flex: 1, height: "1px", background: "#1C1E24" }} />
        </div>
        <h2 style={{ fontSize: "4vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Validation Gates</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75" }}>
            Every mutation passes through a validation gate before it reaches program state. The gate evaluates the proposed change against the full constraint registry — not just the constraints relevant to the mutation type, but all constraints whose invariants the mutation could indirectly affect. A mutation that passes local constraints may still fail global validation.
          </p>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75", marginTop: "2.5vh" }}>
            Failed mutations are not silently dropped. They are returned to the generative layer with a structured failure receipt that includes the violated constraint, the violation severity, and a suggested alternative operation. The coaching dialogue continues from the failure, not from a dead end.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "2vh" }}>VALIDATION PIPELINE</p>
          <div className="flex flex-col">
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", paddingBottom: "1.8vh" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #7B9FD4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "1.3vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>1</span>
                </div>
                <div style={{ width: "1px", height: "1.5vh", background: "#1C1E24", marginTop: "2px" }} />
              </div>
              <div><p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Schema Validation</p><p style={{ fontSize: "1.5vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Mutation has required fields and valid type</p></div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", paddingBottom: "1.8vh" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #7B9FD4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "1.3vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>2</span>
                </div>
                <div style={{ width: "1px", height: "1.5vh", background: "#1C1E24", marginTop: "2px" }} />
              </div>
              <div><p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Local Constraint Check</p><p style={{ fontSize: "1.5vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Constraints specific to this mutation type pass</p></div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", paddingBottom: "1.8vh" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #7B9FD4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: "1.3vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>3</span>
                </div>
                <div style={{ width: "1px", height: "1.5vh", background: "#1C1E24", marginTop: "2px" }} />
              </div>
              <div><p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Global Constraint Check</p><p style={{ fontSize: "1.5vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Full registry re-evaluated against proposed state</p></div>
            </div>
            <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
              <div style={{ width: "2.5vw", height: "2.5vw", border: "1px solid #7B9FD4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "1.3vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>4</span>
              </div>
              <div><p style={{ fontSize: "1.8vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 500 }}>Apply or Reject with Receipt</p><p style={{ fontSize: "1.5vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>Success or structured failure returned to coaching layer</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
