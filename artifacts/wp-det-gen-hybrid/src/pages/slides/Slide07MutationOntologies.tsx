export default function Slide07MutationOntologies() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0D0E11" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, #0D0E11 73%, #101218 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", letterSpacing: "0.15em" }}>SECTION 05</span>
          <div style={{ flex: 1, height: "1px", background: "#1C1E24" }} />
        </div>
        <h2 style={{ fontSize: "4vw", color: "#E8EAED", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Mutation Ontologies</h2>
        <div style={{ width: "5vw", height: "2px", background: "#7B9FD4", marginTop: "1.5vh", marginBottom: "2.5vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "27vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "2vw", color: "#9CA3AF", fontFamily: "DM Mono, monospace", lineHeight: "1.75" }}>
            A mutation ontology is a typed registry of every operation the coaching system can perform on the training program. Each mutation type has a defined target, a set of required parameters, and a constraint check that must pass before the operation can execute. The generative layer does not write program structures directly — it writes mutation instructions that the deterministic layer validates and executes.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: "1.1vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace", marginBottom: "2vh" }}>MUTATION REGISTRY EXAMPLES</p>
          <div className="flex flex-col gap-[1.5vh]">
            <div style={{ background: "#141519", border: "1px solid #1C1E24", padding: "1.2vh 1.5vw" }}>
              <p style={{ fontSize: "1.6vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>SUBSTITUTE_EXERCISE</p>
              <p style={{ fontSize: "1.4vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>target: exerciseId · params: replacement, rationale · check: movement_pattern_compatibility</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", padding: "1.2vh 1.5vw" }}>
              <p style={{ fontSize: "1.6vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>ADJUST_WEEKLY_VOLUME</p>
              <p style={{ fontSize: "1.4vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>target: weekId · params: delta_sets, focus_lane · check: fatigue_ceiling, min_effective_volume</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", padding: "1.2vh 1.5vw" }}>
              <p style={{ fontSize: "1.6vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>SHIFT_EMPHASIS</p>
              <p style={{ fontSize: "1.4vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>target: blockId · params: from_lane, to_lane · check: training_age, block_position</p>
            </div>
            <div style={{ background: "#141519", border: "1px solid #1C1E24", padding: "1.2vh 1.5vw" }}>
              <p style={{ fontSize: "1.6vw", color: "#7B9FD4", fontFamily: "DM Mono, monospace" }}>REORDER_SESSION</p>
              <p style={{ fontSize: "1.4vw", color: "#6B7280", fontFamily: "DM Mono, monospace" }}>target: sessionId · params: new_day_index · check: recovery_window, frequency_spacing</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
