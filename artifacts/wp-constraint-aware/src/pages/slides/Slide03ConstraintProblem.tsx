export default function Slide03ConstraintProblem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0E1117" }}>
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #0E1117 80%, #141820 100%)" }} />
      <div className="absolute top-[6vh] left-[7vw] right-[7vw]">
        <div className="flex items-center gap-[1.5vw] mb-[2.5vh]">
          <span className="font-body uppercase tracking-widest" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Section 01</span>
          <div style={{ flex: 1, height: "1px", background: "#252A35" }} />
        </div>
        <h2 className="font-display" style={{ fontSize: "4vw", color: "#EDE8DC" }}>The Constraint Problem</h2>
        <div style={{ width: "5vw", height: "2px", background: "#C8A96E", marginTop: "1.5vh", marginBottom: "3vh" }} />
      </div>
      <div className="absolute flex gap-[4vw]" style={{ top: "28vh", left: "7vw", right: "7vw" }}>
        <div style={{ flex: 1.4 }}>
          <p className="font-body" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Every coach encounters a moment when the program they designed becomes incompatible with the athlete's actual state. Not because the program was poorly written — but because the world changed.
          </p>
          <p className="font-body mt-[2.5vh]" style={{ fontSize: "2vw", color: "#B8B0A0", lineHeight: "1.75" }}>
            Constraints are not edge cases. They are the dominant feature of real coaching environments. Fatigue accumulates. Schedules compress. Equipment is unavailable. Psychological readiness drops without warning. Competition windows shift. A system that cannot acknowledge these inputs will generate output that is structurally correct but practically useless.
          </p>
        </div>
        <div style={{ flex: 1 }}>
          <p className="font-body font-700 uppercase tracking-widest mb-[2vh]" style={{ fontSize: "1.1vw", color: "#C8A96E" }}>Constraint Categories</p>
          <div className="flex flex-col gap-[1.5vh]">
            <div style={{ borderLeft: "2px solid #C8A96E", paddingLeft: "1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Physiological</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Fatigue, injury, readiness fluctuation</p>
            </div>
            <div style={{ borderLeft: "2px solid #4A90D9", paddingLeft: "1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Environmental</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Equipment limits, facility access</p>
            </div>
            <div style={{ borderLeft: "2px solid #5A6070", paddingLeft: "1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Temporal</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Schedule disruption, competition calendars, travel</p>
            </div>
            <div style={{ borderLeft: "2px solid #5A6070", paddingLeft: "1.5vw" }}>
              <p className="font-body font-500" style={{ fontSize: "1.8vw", color: "#EDE8DC" }}>Psychological</p>
              <p className="font-body" style={{ fontSize: "1.6vw", color: "#7A8090" }}>Stress, motivation, perceived exertion</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
