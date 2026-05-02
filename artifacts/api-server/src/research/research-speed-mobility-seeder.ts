// ─── Speed + Mobility Research Seed Pack ─────────────────────────────────────
//
// Curated principle documents for speed development and mobility.
// These are NOT fake citations. They are synthesized coaching principles
// derived from established sports science frameworks (NSCA, CSCS, sprint
// biomechanics literature, and motor control research).
//
// Admin note on every document:
//   "Seed principle document. Replace or supplement with source-backed
//    evidence as library matures."
//
// Run via: POST /api/admin/research/seed-speed-mobility (admin only)

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { createChunksForDocument } from "./research-ingestion";
import { logger } from "../lib/logger";
import type { InsertResearchDocument, ResearchDocument } from "@workspace/db";

// ─── Seed Data ────────────────────────────────────────────────────────────────

const ADMIN_NOTE =
  "Seed principle document. Replace or supplement with source-backed evidence as library matures.";

const SPEED_MOBILITY_SEED_DOCUMENTS: (InsertResearchDocument & {
  plainLanguageSummary: string;
  coachingImplications: string;
  programmingImplications: string;
  safetyConsiderations: string;
  limitations: string;
  contraindications: string;
})[] = [
  // ── SPEED DOCUMENTS ─────────────────────────────────────────────────────────

  // 1. Sprint Acceleration Principles
  {
    title: "Sprint Acceleration Principles — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["sprint_mechanics", "speed", "acceleration", "sport_performance"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for sprint acceleration training based on established sports science frameworks including horizontal force emphasis, short distances, full recovery, and technique quality.",
    plainLanguageSummary:
      "Sprint acceleration is driven by the ability to produce horizontal force against the ground during the first 10–30 meters of a sprint. Effective acceleration training uses short sprint distances, full rest between efforts, and high intent on every rep. Quality of each sprint is more important than total distance covered.",
    coachingImplications:
      "Program acceleration work early in training sessions when the nervous system is fresh. Use short distances (10–30m) for acceleration development. Sled pushes, hill sprints, and wall-drill acceleration sequences are highly effective. Technical coaching of forward lean, drive phase mechanics, and arm action directly improves acceleration output. Never turn acceleration work into conditioning by compressing rest.",
    programmingImplications:
      "Structure speed sessions 2–3 times per week, separated by 48+ hours. Keep high-intensity sprint reps to 4–8 per session for neuromuscular quality. Rest fully between reps (2–5 minutes). Progress by reducing resistance (resisted → free sprint), increasing distance segments, and improving mechanics — not by adding more reps. Place sprint work before strength training in the same session.",
    safetyConsiderations:
      "Sprint training carries significant hamstring strain risk if performed fatigued or without adequate warm-up. Always use a full dynamic warm-up before sprint work. Increase sprint volume no more than 10% per week. Never program max-speed sprint work immediately after heavy lower-body strength training.",
    limitations:
      "These are curated coaching principles, not derived from a single study. Individual acceleration response varies by training history, muscle fiber type, and technical background. Resisted sprint load recommendations should be adjusted per athlete based on mechanics assessment.",
    contraindications:
      "Maximum intensity sprint work is contraindicated for athletes with active hamstring injuries, significant hip flexor restrictions, or inadequate warm-up base. Return-to-sprint progressions must be used after any lower-body soft tissue injury.",
  },

  // 2. Max Velocity Sprinting
  {
    title: "Max Velocity Sprinting — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["sprint_mechanics", "speed", "max_velocity", "sport_performance"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for max velocity sprint development including upright mechanics, high-speed exposure, low initial volume, adequate rest, and quality-over-quantity programming.",
    plainLanguageSummary:
      "Max velocity sprinting (top-speed running) requires upright posture, high stride frequency, powerful hip flexion and extension, and elastic ground contact. Top-speed exposure is a separate training quality from acceleration — it requires flying starts or adequate run-up distance. Low initial volume with high quality is the correct starting prescription.",
    coachingImplications:
      "Max velocity work requires different set-up than acceleration: flying sprints (20–30m builds into 20–30m max zone), wicket runs for stride frequency, and posture-focused drills (A-skips, B-skips, falling starts). Athletes need to reach top speed before the timed zone — simply sprinting from a standing start does not train max velocity. This quality is often neglected in team sport athletes.",
    programmingImplications:
      "Introduce max velocity work conservatively: 2–4 exposures per session, full recovery (5–8 minutes between reps). Volume should be low initially (200–400 meters total top-speed distance per session). Schedule only 1–2 max velocity sessions per week due to high CNS demand. Separate from heavy lower-body strength by at least 24–48 hours.",
    safetyConsiderations:
      "High-speed running is the single highest injury-risk activity in team sport training. Adequate chronic workload base is required before max velocity work is introduced. Fatigue significantly elevates hamstring strain risk at top speed. Never program max velocity runs when athletes are acutely fatigued from prior sessions.",
    limitations:
      "Max velocity development is most relevant for athletes who actually reach top speed in their sport (sprinters, wide receivers, wingers). Many team sport athletes spend most game time in submaximal acceleration — optimal allocation of max velocity vs. acceleration work varies by sport and position.",
    contraindications:
      "Max velocity sprinting is not appropriate for athletes returning from hamstring or hip flexor injuries without cleared graduated return-to-speed protocols. Athletes without adequate strength base (posterior chain weakness) have elevated risk at top speed.",
  },

  // 3. Plyometric Training Dosage
  {
    title: "Plyometric Training Dosage and Progression — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["plyometrics", "speed", "power", "sport_performance"],
    populationTags: ["beginner", "intermediate", "advanced", "youth_athlete"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated plyometric programming principles covering dosage by experience level, landing quality emphasis, contact count management, and low-to-high intensity progression.",
    plainLanguageSummary:
      "Plyometric training improves reactive strength, power output, and neuromuscular coordination through the stretch-shortening cycle. Dosage must be managed by experience level — beginners use low foot-contact volumes with bilateral exercises; advanced athletes can tolerate higher volumes with unilateral and reactive drills. Landing quality is always the primary safety and training variable.",
    coachingImplications:
      "Prescribe plyometrics by intensity level, not just exercise name. Beginners: low-impact bilateral jumps, box step-ups, and simple bound patterns. Intermediate: box jumps, broad jumps, lateral bounds. Advanced: depth jumps, single-leg reactive work, sprint-specific reactive drills. Strength prerequisites matter — a 1.5x bodyweight squat base before high-intensity plyos is a commonly recommended threshold. Prioritize landing quality over jump height or distance.",
    programmingImplications:
      "Volume is measured in foot contacts. Beginner: 80–100 contacts/session, 2 sessions/week. Intermediate: 100–150 contacts/session. Advanced: 150–200+ contacts/session. Place plyometric work before strength training or on separate days. Allow 48–72 hours between high-intensity plyometric sessions. Progress from bilateral to unilateral, and low amplitude to high amplitude, over weeks.",
    safetyConsiderations:
      "Landing mechanics are the primary safety variable. Knee valgus during landing significantly elevates ACL injury risk and must be corrected before volume is increased. Soft surfaces reduce impact forces but reduce stretch-shortening cycle training effect. Never program plyometrics when athletes are fatigued from prior heavy lower-body sessions.",
    limitations:
      "Optimal plyometric volume for different training goals is not precisely established in the literature — dose ranges represent coaching best-practice estimates. Individual landing mechanics and joint tolerance vary widely. Strength prerequisites recommendations are evidence-informed but not absolute thresholds.",
    contraindications:
      "High-intensity plyometrics are contraindicated for athletes with active lower extremity injuries, limited ankle or hip mobility, inadequate strength base, or poor landing mechanics that cannot be corrected with cueing.",
  },

  // 4. Change of Direction and Deceleration
  {
    title: "Change of Direction and Deceleration Training — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["agility", "change_of_direction", "deceleration", "sport_performance"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for change-of-direction and deceleration training covering braking mechanics, cutting progression, deceleration strength, and avoiding unstructured agility programming.",
    plainLanguageSummary:
      "Change of direction (COD) and deceleration ability are distinct athletic qualities that require dedicated training. Deceleration involves eccentric loading of the hip and knee extensors to brake forward momentum — this must be trained as a strength quality. Cutting ability requires both deceleration strength and proper cutting mechanics. Random ladder-only agility work provides minimal transfer to sport-specific COD performance.",
    coachingImplications:
      "Deceleration training should be a deliberate programming element, not an afterthought. Include deceleration-specific strength work (Nordic curls, Romanian deadlifts, step-behind decelerations, sled braking). Progress COD drills from planned → semi-reactive → fully reactive, over weeks. Teach and reinforce cutting mechanics: shin angle, hip load, foot placement relative to center of mass. Avoid random cone/ladder circuits as the primary agility method.",
    programmingImplications:
      "Structure COD training with controlled intensities: begin with planned cutting patterns at submaximal speed, progress to reactive stimuli over 4–6 weeks. Deceleration strength exercises (eccentric-focused squats, trap bar deadlift decelerations) support cutting mechanics. Allow 48 hours between high-intensity COD sessions. COD intensity scales with cutting angle and speed — progress complexity before adding velocity.",
    safetyConsiderations:
      "Aggressive cutting under fatigue significantly elevates ACL and ankle injury risk. Athletes must demonstrate adequate deceleration strength and cutting mechanics at lower speeds before increasing velocity or reactivity. Athletes with knee pain should modify cutting angles and avoid high-load braking patterns until cleared.",
    limitations:
      "COD research distinguishes between planned COD tasks and reactive agility — training transfer between these qualities is moderate at best. Sport-specific COD ability also depends on perceptual-cognitive elements that structured drills alone cannot fully develop.",
    contraindications:
      "High-velocity reactive cutting is contraindicated for athletes with active knee, ankle, or hip injuries. Athletes returning from ACL reconstruction require progressive graduated return-to-cutting protocols — do not introduce reactive cutting without clearance.",
  },

  // 5. Strength-Speed Relationship
  {
    title: "Strength-Speed Relationship and Force-Velocity Continuum — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["strength_training", "speed", "force_velocity", "sport_performance"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for understanding how max strength supports speed development and how power training bridges the gap between strength and sprint expression.",
    plainLanguageSummary:
      "Maximum strength provides the force-production foundation for speed and power. The force-velocity relationship describes a continuum from maximal force (heavy strength) to maximal velocity (sprint speed) — effective speed athletes need qualities across this entire spectrum. Power training (moderate loads moved at high intent) bridges max strength to sprint speed expression.",
    coachingImplications:
      "Athletes who lack adequate strength base will have limited potential for speed development. Prioritize building a strength foundation before extensive sprint training in underdeveloped athletes. Once a strength base exists, power training (trap bar deadlift jumps, hang power cleans, jump squats, medicine ball throws) develops force-velocity qualities. Heavy lifts placed before sprint sessions should be managed to avoid fatigue that degrades sprint quality.",
    programmingImplications:
      "Structure speed-strength programs across the force-velocity continuum: heavy strength (2–4 days/week), power/ballistic work (1–2 days), and sprint development (2–3 days). Separate heavy strength days from max-velocity sprint days by at least 24 hours. In-season: maintain strength with lower volume (1–2 sessions/week) while prioritizing sport-specific sprint quality. Power exercises should be programmed when CNS is fresh — before strength or conditioning work.",
    safetyConsiderations:
      "Heavy lower-body lifting on the same day as max-speed sprint work creates cumulative fatigue that increases hamstring injury risk. If combining in one session, perform power/sprint work first, then strength — never reverse this order for speed-priority programming.",
    limitations:
      "The transfer of strength gains to sprint speed is meaningful but not automatic — athletes require exposure to sport-specific speeds and mechanics alongside strength development. The optimal strength-to-speed training ratio varies by sport, position, and training age.",
    contraindications:
      "Athletes with lower back or hip issues should modify heavy axial loading (back squats, deadlifts) with appropriate alternatives before resuming full force-velocity training. Power exercises at high velocity are not appropriate without a prior strength base.",
  },

  // 6. Speed Training Fatigue Management
  {
    title: "Speed Training Fatigue Management — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["recovery", "load_management", "speed", "sprint_mechanics"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for managing fatigue in speed-focused training programs, including rest interval guidelines, session separation, and avoiding conditioning confusion.",
    plainLanguageSummary:
      "Speed and sprint quality are acutely sensitive to fatigue. A fatigued nervous system cannot produce maximal output — sprint sessions under heavy fatigue provide poor neuromuscular training stimulus and elevated injury risk. Speed development requires long rest intervals, low-fatigue session context, and deliberate separation from high-fatigue conditioning work.",
    coachingImplications:
      "Never program maximal sprint work in a fatigued state — fatigue is the primary killer of speed quality. Rest intervals between sprint reps should be complete (2–5 minutes for acceleration, 5–8 minutes for max velocity) rather than compressed for conditioning effect. If the goal is speed, the session structure must prioritize speed quality. Conditioning adaptations should be pursued in separate sessions from speed development.",
    programmingImplications:
      "Place speed sessions first in weekly microcycle when CNS is freshest (typically Monday/Tuesday after rest days). Separate high-output sprint sessions from high-fatigue conditioning (HIIT, tempo runs, heavy metabolic work) by at least 48 hours. In-season: protect 1–2 speed quality sessions per week even at reduced volume. Use work:rest ratios of 1:6–1:10 for pure speed work (e.g., 5s sprint = 30–50s rest minimum).",
    safetyConsiderations:
      "Sprint work performed under significant fatigue substantially elevates hamstring strain risk. Athletes should be able to objectively assess their readiness before max-speed sessions. If athletes report high fatigue, soreness, or poor sleep, reduce sprint intensity to submaximal or postpone the session.",
    limitations:
      "Individual fatigue tolerance for speed work varies significantly by training history and neuromuscular recovery rate. These are population-level guidelines — some athletes can maintain quality with shorter rest; others require more. Subjective readiness assessment has measurement limitations.",
    contraindications:
      "Max-intensity sprint work should not be programmed for athletes who are acutely fatigued from previous sessions, multi-day travel, illness, or significant sleep deprivation.",
  },

  // ── MOBILITY DOCUMENTS ────────────────────────────────────────────────────

  // 7. Mobility vs Flexibility
  {
    title: "Mobility vs Flexibility — Defining Usable Range — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["mobility", "flexibility", "movement_quality", "range_of_motion"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles distinguishing mobility from flexibility — mobility as active, controlled range of motion paired with stability, versus flexibility as passive range without functional control.",
    plainLanguageSummary:
      "Mobility is the ability to actively control movement through a range of motion — it requires both flexibility (passive range) and neuromuscular control. Flexibility alone does not equal movement capacity. An athlete can be flexible yet lack functional mobility if they cannot actively control the range they passively access. Effective mobility training pairs range-of-motion work with stability and control.",
    coachingImplications:
      "When clients request flexibility or mobility work, assess whether the limitation is passive range or active control. Passive stretching increases flexibility but may not improve functional mobility without concurrent control training. Pair every mobility intervention with stability or motor control work in the end range — this builds usable range, not just tissue length. Examples: passive hip stretch followed by controlled hip circles, thoracic extension followed by pallof press.",
    programmingImplications:
      "Integrate mobility work within the warm-up (dynamic, active) and cool-down (passive, static). Active mobility (CARs, controlled articulation) can be trained daily without excessive recovery cost. Static stretching is most effective post-session or on low-intensity days — not before power or speed work. Program at least one joint-specific mobility exercise per training session, matched to the primary movement pattern of that session.",
    safetyConsiderations:
      "Hypermobility without stability is a risk factor — avoid programming extensive passive stretching for already hypermobile joints without concurrent stability training. Do not use aggressive stretching to force range — gradual progressive loading in end range is safer and more effective for long-term mobility development.",
    limitations:
      "The distinction between flexibility and mobility is conceptual — research on their independent effects on performance is mixed. Individual baseline range of motion varies significantly by genetics, joint structure, and training history. These are general principles, not individual prescriptions.",
    contraindications:
      "Aggressive end-range passive stretching is not appropriate for joints with active inflammation, recent hypermobility-related injuries, or immediately following intense loading of that joint. Do not use forceful stretching to override protective muscle tension in post-injury contexts.",
  },

  // 8. Dynamic Warm-Ups and Movement Prep
  {
    title: "Dynamic Warm-Ups and Movement Preparation — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["dynamic_warmup", "mobility", "movement_quality", "sport_performance"],
    populationTags: ["beginner", "intermediate", "advanced", "youth_athlete", "older_adult"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for dynamic warm-up and movement preparation, covering exercise selection, intensity ramp-up, session positioning, and the evidence base for dynamic over static pre-training protocols.",
    plainLanguageSummary:
      "Dynamic warm-up protocols (movement-based, actively increasing intensity) are well-supported as pre-training preparation, particularly before power, speed, and strength sessions. Dynamic warm-ups increase tissue temperature, joint range of motion, neural readiness, and movement quality. Static stretching held for 30+ seconds pre-activity can transiently reduce force production, making dynamic preparation the preferred pre-power choice.",
    coachingImplications:
      "Program a 10–15 minute dynamic warm-up before every training session. Match warm-up movement patterns to the session focus: hip-dominant movement prep before squat/hinge sessions, shoulder and thoracic mobility before pressing sessions, and full lower-body activation before sprint or jump sessions. Static stretching should be reserved for post-session or separate mobility blocks, not as the primary pre-training protocol.",
    programmingImplications:
      "Dynamic warm-up progression: general movement (light jog, arm swings) → joint mobility (leg swings, hip circles, thoracic rotations) → activation (glute bridges, band walks, mini-band squats) → movement-specific preparation (A-skips, acceleration drills, or sport-specific patterns). The warm-up should mirror the session's demands at reduced intensity. Time investment: 10–15 minutes minimum for high-intensity sessions.",
    safetyConsiderations:
      "Insufficient warm-up is associated with elevated soft tissue injury risk, particularly in sprint and power training. Warm-up intensity should ramp progressively — do not jump directly to high-velocity movements without adequate preparation. Older adults may require longer warm-up periods (15–20 minutes) due to slower tissue temperature increase.",
    limitations:
      "Research on the performance enhancement effect of dynamic warm-up is generally positive but effect sizes are variable. Optimal warm-up duration and content depends on individual training history, environment temperature, and session demands.",
    contraindications:
      "High-intensity ballistic warm-up movements (depth jumps, reactive sprints) should not be used as early warm-up elements — these belong in the later, fully prepared phase of preparation, not the initial warm-up.",
  },

  // 9. Hip Mobility for Athletes
  {
    title: "Hip Mobility for Athletic Performance — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["hip_mobility", "mobility", "sport_performance", "sprint_mechanics"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for hip mobility training in athletic populations, covering hip extension and flexion control, active mobility for sprint mechanics, positional strength, and integration with lower-body programming.",
    plainLanguageSummary:
      "Hip mobility — particularly the ability to actively control hip extension and flexion through full range — directly supports sprinting, lower-body strength movements, and athletic performance. Restricted hip mobility is commonly associated with compensatory patterns in the lumbar spine and knee. Effective hip mobility development pairs passive range increases with positional strength and active control in the newly acquired range.",
    coachingImplications:
      "Common hip mobility restrictions: hip flexor shortening (affects hip extension in sprint stride), limited hip external rotation (affects squat depth and cutting mechanics), and restricted hip flexion (affects stride length and deceleration). Key exercises: hip 90/90 with active transitions, deep lunge with rotation (world's greatest stretch), hip CARs, single-leg hip hinge with full hip extension. Pair each with a stability exercise in that same range.",
    programmingImplications:
      "Integrate hip mobility work into every lower-body session warm-up (2–3 exercises, 5–10 minutes). For athletes with significant hip restrictions, add dedicated 10–15 minute mobility blocks on non-training days. Active hip mobility exercises (CARs, controlled hip circles) can be performed daily. Pair hip mobility with glute activation (banded hip thrusts, single-leg glute bridges) to develop control in newly acquired ranges.",
    safetyConsiderations:
      "Hip impingement presentations (sharp pinching at front of hip during flexion) require assessment before loading end-range hip flexion. Do not force hip mobility into impingement positions — modify range to pain-free zone and consult appropriate practitioner for clinical evaluation. Deep hip loading under restriction increases lumbar compensatory risk.",
    limitations:
      "Hip mobility restrictions have multiple potential causes (capsular, muscular, bony — particularly femoroacetabular impingement). Mobility exercises address muscular and capsular limitations but cannot change bony architecture. Persistent restrictions despite consistent training may indicate structural factors requiring clinical assessment.",
    contraindications:
      "Deep loaded hip flexion (deep squat, deep lunge) is not appropriate for athletes with active hip impingement, labral pathology, or hip joint inflammation without clinical guidance. Single-leg exercises that reproduce groin or hip pain should be modified or excluded.",
  },

  // 10. Ankle Mobility and Lower-Body Mechanics
  {
    title: "Ankle Mobility and Its Role in Lower-Body Mechanics — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["ankle_mobility", "mobility", "movement_quality"],
    populationTags: ["beginner", "intermediate", "advanced"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for ankle dorsiflexion mobility and its effect on squat, landing, and deceleration mechanics, with progressive loading and joint-specific mobility interventions.",
    plainLanguageSummary:
      "Ankle dorsiflexion range of motion directly affects squat depth, landing mechanics, and deceleration ability. Restricted ankle dorsiflexion creates compensatory patterns including heel rise in squats, increased knee valgus in landing, and altered deceleration mechanics. Improving ankle mobility requires addressing both muscular (gastrocnemius/soleus) and joint capsule restrictions through a combination of soft tissue work and controlled progressive loading.",
    coachingImplications:
      "Assess ankle dorsiflexion with the wall ankle test (knee-to-wall with foot approximately 10–12cm from wall). Athletes falling short of this benchmark frequently show compensatory squat and landing mechanics. Ankle mobility interventions: banded joint mobilization, wall ankle mobilization (controlled rocking), single-leg calf raises through full range, eccentric heel drops. Dorsiflexion restriction is particularly relevant for change-of-direction athletes and those performing deep lower-body movements.",
    programmingImplications:
      "Include 2–3 ankle mobility exercises in lower-body session warm-ups. Banded ankle joint mobilization (30–60 seconds per direction) combined with active dorsiflexion in lunge position is an efficient pre-session protocol. Eccentric calf strengthening through full dorsiflexion range addresses both mobility and tissue tolerance simultaneously. Elevate heels (heel plates, squat wedge) as a short-term accommodation while ankle mobility is being developed.",
    safetyConsiderations:
      "Bony ankle limitations (prior fractures, osteophytes) may not respond to soft tissue mobility work and require clinical assessment. Do not attempt to force range through pain at the ankle joint — this can provoke impingement. Always distinguish between gastrocnemius-soleus tightness (responsive to stretching) and bony restriction (requires clinical management).",
    limitations:
      "Ankle dorsiflexion response to mobility work varies significantly — bony restrictions will not respond the same way as muscular restrictions. Time to meaningful mobility change varies; consistent daily work over 4–8+ weeks is typically required to see functional improvements.",
    contraindications:
      "Aggressive loaded ankle dorsiflexion is not appropriate following acute ankle sprains, fractures, or with active ankle joint inflammation. Banded mobilization should not be applied over swollen or acutely painful ankles.",
  },

  // 11. Thoracic Mobility and Upper-Body Mechanics
  {
    title: "Thoracic Mobility and Upper-Body Performance — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["thoracic_mobility", "mobility", "rotation", "movement_quality"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated principles for thoracic spine mobility training covering rotation, extension, effects on overhead mechanics, rotational sports performance, and sprint posture.",
    plainLanguageSummary:
      "The thoracic spine is the primary source of spinal rotation and extension — mobility in this region directly affects overhead pressing mechanics, rotational sport performance, and upright sprint posture. Restricted thoracic mobility commonly drives compensatory movement at the lumbar spine and shoulders. Thoracic mobility work pairs extension and rotation drills with trunk control exercises to build functional range.",
    coachingImplications:
      "Thoracic restriction commonly presents as rounded upper back, limited overhead reach, and compensatory lumbar extension during pressing. Key thoracic mobility exercises: thoracic extension over foam roller, seated thoracic rotation, quadruped thoracic rotation, open book stretch. These exercises are effective as warm-up elements before pressing, overhead, and rotational training sessions. For sprint athletes, improved thoracic rotation supports arm drive mechanics.",
    programmingImplications:
      "Include 2–3 thoracic mobility exercises in pressing or upper-body session warm-ups, and before rotational or overhead movements. Thoracic CARs (controlled articular rotations) are effective as a daily maintenance protocol. Pair thoracic rotation mobility with trunk anti-rotation stability (pallof press, bird dogs) to transfer mobility gains into functional control. Frequency: daily thoracic work (5–10 minutes) is appropriate and has low fatigue cost.",
    safetyConsiderations:
      "Avoid aggressive over-pressure or partner-assisted thoracic manipulation without appropriate training. For clients with a history of thoracic fracture, severe osteoporosis, or disc pathology, thoracic mobility must be approached conservatively — prioritize gentle, active mobility over loaded extension.",
    limitations:
      "Thoracic mobility improvements are highly dependent on consistency — sporadic mobility work produces minimal lasting change. Bony thoracic restriction (ankylosing spondylitis, fused vertebrae, severe kyphosis) may not respond to standard mobility exercises and requires medical management.",
    contraindications:
      "Aggressive thoracic extension exercises are not appropriate for clients with osteoporosis-related fracture risk, severe thoracic kyphosis, or active disc pathology in the thoracic region. Modify to gentle active range-of-motion work and consult appropriate practitioners.",
  },

  // 12. Mobility and Injury Risk — Conservative Framing
  {
    title: "Mobility and Injury Risk — Conservative Evidence Framing — Curated TrainChat Seed",
    authors: "TrainChat Research Team",
    year: 2024,
    source: "Curated TrainChat Research Seed",
    category: "sport_performance",
    topicTags: ["mobility", "movement_quality", "pain_modification"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "expert_consensus",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    librarianAdminNotes: ADMIN_NOTE,
    abstract:
      "Curated evidence framing for the relationship between mobility and injury risk — avoiding overclaiming, framing mobility as one component of movement quality, and maintaining appropriate coaching language.",
    plainLanguageSummary:
      "The evidence that mobility training directly prevents injury is not strong enough to make definitive causal claims. Mobility deficits may contribute to injury risk as one of many interacting factors — but adequate mobility alone does not prevent injury. Mobility is best framed as a component of movement quality, readiness, and tissue tolerance, rather than as an injury prevention tool in isolation.",
    coachingImplications:
      "Avoid saying 'This will prevent injury' when prescribing mobility work. Instead frame: 'This supports movement quality and helps prepare your joints for training.' Coach athletes to appreciate mobility as part of readiness, not as a protective guarantee. Mobility work has genuine value for session preparation, range-of-motion development, and recovery — these benefits can be communicated without making injury-prevention medical claims.",
    programmingImplications:
      "Include mobility work in programs as a preparation and quality tool — not as the primary injury prevention strategy. Combine mobility with strength, load management, and adequate recovery for a holistic approach to injury risk reduction. When a client reports pain or injury, mobility exercises should be selected symptom-guided and within pain-free range — never forced through pain as a 'fix.'",
    safetyConsiderations:
      "Do not use mobility interventions as a substitute for medical evaluation when clients report injury or significant pain. Mobility work in a pain context must stay well within symptom-free ranges. Never make diagnoses or treatment claims — TrainChat's role is to support movement quality within coaching scope.",
    limitations:
      "The causal relationship between mobility and injury risk reduction has not been established with strong evidence. Most mobility-injury risk research is observational. Individual injury risk is multifactorial — workload, strength, neuromuscular control, recovery, and psychological factors all contribute. Mobility is one piece of a complex picture.",
    contraindications:
      "Aggressive mobility work targeting a painful joint is not appropriate without clinical clearance. Hypermobile athletes should not be prescribed extensive passive stretching without concurrent stability training — additional passive range in hypermobile joints can be a risk factor, not a benefit.",
  },
];

// ─── Seeder Function ──────────────────────────────────────────────────────────

export async function hasSpeedMobilityResearch(): Promise<boolean> {
  const [result] = await db
    .select({ n: count() })
    .from(researchDocumentsTable)
    .where(eq(researchDocumentsTable.source, "Curated TrainChat Research Seed"));
  return Number(result?.n ?? 0) > 0;
}

export async function seedSpeedMobilityResearch(force = false): Promise<{
  inserted: number;
  skipped: number;
  chunks: number;
}> {
  const alreadySeeded = await hasSpeedMobilityResearch();

  if (alreadySeeded && !force) {
    return { inserted: 0, skipped: SPEED_MOBILITY_SEED_DOCUMENTS.length, chunks: 0 };
  }

  let inserted = 0;
  let skipped = 0;
  let totalChunks = 0;

  for (const docData of SPEED_MOBILITY_SEED_DOCUMENTS) {
    try {
      const [doc] = await db
        .insert(researchDocumentsTable)
        .values(docData)
        .onConflictDoNothing()
        .returning();

      if (doc) {
        const chunkCount = await createChunksForDocument(doc as ResearchDocument);
        totalChunks += chunkCount;
        inserted++;
        logger.info({ title: doc.title, chunkCount }, "[SpeedMobilitySeeder] Seeded document");
      } else {
        skipped++;
      }
    } catch (err) {
      logger.error({ err, title: docData.title }, "[SpeedMobilitySeeder] Failed to seed document");
      skipped++;
    }
  }

  logger.info(
    { inserted, skipped, totalChunks },
    "[SpeedMobilitySeeder] Speed + Mobility research seeded",
  );
  return { inserted, skipped, chunks: totalChunks };
}
