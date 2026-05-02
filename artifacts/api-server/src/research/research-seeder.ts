// ─── Research Seeder ──────────────────────────────────────────────────────────
//
// Seeds the database with curated, evidence-informed research summaries.
// These are NOT scraped from the web. They are synthesized coaching notes
// derived from authoritative position stands and guideline documents.
//
// Run via: POST /api/admin/research/seed (admin only)

import { db, researchDocumentsTable, researchChunksTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { createChunksForDocument } from "./research-ingestion";
import { logger } from "../lib/logger";
import type { InsertResearchDocument, ResearchDocument } from "@workspace/db";

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_DOCUMENTS: (InsertResearchDocument & {
  plainLanguageSummary: string;
  coachingImplications: string;
  programmingImplications: string;
  safetyConsiderations: string;
  limitations: string;
  contraindications: string;
})[] = [
  // ── Hypertrophy ─────────────────────────────────────────────────────────────
  {
    title: "Resistance Training Volume and Hypertrophy — NSCA / ACSM Guidelines",
    authors: "Schoenfeld BJ, Grgic J, Krieger JW",
    year: 2017,
    source: "NSCA",
    journal: "Journal of Strength and Conditioning Research",
    category: "strength_conditioning",
    topicTags: ["hypertrophy", "volume_management", "strength_training", "progressive_overload"],
    populationTags: ["intermediate", "advanced"],
    evidenceType: "meta_analysis",
    trustLevel: "gold",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract:
      "Meta-analysis examining the dose-response relationship between resistance training volume and hypertrophic adaptations.",
    plainLanguageSummary:
      "Higher weekly training volumes (10–20+ sets per muscle group) are associated with greater hypertrophic gains compared to low-volume approaches, though this relationship is dose-dependent and subject to diminishing returns. Evidence supports that total weekly sets — not single-session volume — is the primary driver of muscle growth.",
    coachingImplications:
      "For hypertrophy-focused clients, distribute training volume across the week rather than concentrating it in single sessions. Weekly per-muscle-group volume of 10–20 sets is a well-supported target for intermediate trainees, with volume landmarks adjustable based on recovery capacity and training age.",
    programmingImplications:
      "Structure programs to achieve adequate weekly per-muscle-group volume through frequency rather than session volume. A 3–4 day frequency with 4–6 working sets per muscle per session typically outperforms a 1–2 day approach with the same total volume due to superior recovery and stimulus distribution.",
    safetyConsiderations:
      "Volume should be increased progressively over weeks. Sudden large increases in weekly sets significantly raise injury risk and impair recovery. Newer trainees respond to far lower volumes (5–10 sets/muscle/week) and require conservative starting points.",
    limitations:
      "Most studies involve young, recreationally trained males. Optimal volume ranges likely differ substantially by training age, age, sex, and recovery capacity. These are population averages, not individual prescriptions.",
    contraindications:
      "High-volume hypertrophy programming is not appropriate for beginners (excessive DOMS, injury risk), those with recovery-limiting health conditions, or during competitive in-season phases where performance maintenance is the priority.",
  },
  {
    title: "Repetition Range and Hypertrophy — Evidence Review",
    authors: "Schoenfeld BJ, Grgic J",
    year: 2021,
    source: "NSCA",
    journal: "Strength and Conditioning Journal",
    category: "strength_conditioning",
    topicTags: ["hypertrophy", "strength_training", "volume_management"],
    populationTags: ["beginner", "intermediate", "advanced"],
    evidenceType: "systematic_review",
    trustLevel: "gold",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract:
      "Systematic review examining whether specific rep ranges produce differential hypertrophic responses.",
    plainLanguageSummary:
      "Muscle hypertrophy can be achieved across a broad rep range (approximately 5–30+ reps) when sets are taken to or near muscular failure. The total mechanical tension and metabolic stress produced — not the specific rep number — is the primary driver. Lower reps with heavier loads and higher reps with lighter loads produce similar hypertrophic outcomes.",
    coachingImplications:
      "Rep range selection should be based on exercise type, injury constraints, and training preference rather than strict hypertrophy dogma. Heavy compound movements often work best in moderate ranges (5–12 reps); isolation exercises and machine work can effectively be programmed in higher ranges (12–25 reps) with less joint stress.",
    programmingImplications:
      "Vary rep ranges across exercises and training phases. Heavy/moderate rep work for compounds (squat, press, row) and lighter/higher rep work for isolation/accessory movements is a practical, evidence-supported structure. Proximity to failure is more important than the absolute rep count.",
    safetyConsiderations:
      "Very heavy loading (1–3 RM) carries higher injury risk in hypertrophy phases and should be used sparingly. Consistently training to absolute muscular failure increases injury risk and recovery demands.",
    limitations:
      "Study quality varies. Most evidence does not distinguish between muscle fiber type proportions across individuals, which may affect optimal rep range selection. Long-term (12+ month) comparative data is limited.",
    contraindications:
      "Consistent high-failure-rate training should be avoided in clients with tendinopathies, active pain, early post-rehabilitation status, or significant recovery limitations.",
  },
  // ── Strength Training ───────────────────────────────────────────────────────
  {
    title: "Progressive Overload and Strength Adaptation — NSCA Principles",
    authors: "Kraemer WJ, Ratamess NA",
    year: 2004,
    source: "NSCA",
    journal: "Medicine & Science in Sports & Exercise",
    category: "strength_conditioning",
    topicTags: ["strength_training", "progressive_overload", "periodization", "volume_management"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "position_stand",
    trustLevel: "gold",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract: "NSCA-endorsed principles of progressive overload for strength development across populations.",
    plainLanguageSummary:
      "Progressive overload — systematically increasing training stress over time — is the foundational mechanism driving long-term strength adaptation. Overload can be applied through load, volume, density, range of motion, or movement complexity. Beginners adapt with any overload stimulus; advanced trainees require more sophisticated variation.",
    coachingImplications:
      "Program overload should be applied gradually and systematically. For beginners, adding small amounts of weight to the bar weekly is highly effective. Intermediate and advanced trainees benefit from periodized approaches where intensity and volume are varied across training blocks to manage fatigue and continue driving adaptation.",
    programmingImplications:
      "Build programs around clear overload mechanisms: planned load increases, volume progression (adding sets), or density improvements (same volume in less time). Document and track these metrics. Use deload weeks every 4–8 weeks to allow fatigue dissipation and supercompensation.",
    safetyConsiderations:
      "Overload must be recoverable to produce adaptation. Too-rapid load increases are a primary cause of overuse injury. Load increases of 2.5–5% per week for lower body, 1–2.5% for upper body are generally safe for intermediate trainees.",
    limitations:
      "Optimal progression rate is highly individual. This evidence provides guidelines, not exact prescriptions. Individual recovery capacity, sleep, nutrition, and stress significantly moderate adaptation rates.",
    contraindications:
      "Standard load-based progressive overload is not appropriate for clients in active pain flares, post-surgical recovery phases, or with acute injuries. Alternative overload methods (ROM, density, technique quality) should be used instead.",
  },
  // ── Speed & Sprint Mechanics ────────────────────────────────────────────────
  {
    title: "Sprint Acceleration Mechanics and Training — Applied Principles",
    authors: "Morin JB, Samozino P",
    year: 2016,
    source: "IJSPP",
    journal: "International Journal of Sports Physiology and Performance",
    category: "sport_performance",
    topicTags: ["sprint_mechanics", "sport_performance", "plyometrics", "strength_training"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "review",
    trustLevel: "high",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract:
      "Review of sprint acceleration biomechanics and training methods with practical programming applications.",
    plainLanguageSummary:
      "Sprint acceleration performance is primarily limited by the ability to produce horizontal ground reaction force relative to body mass. Athletes who can apply more force horizontally during the acceleration phase — not simply produce more total force — show superior sprint performance. Strength training optimized for horizontal force production (hip-dominant, sled work) transfers more directly to acceleration than vertical force training alone.",
    coachingImplications:
      "Sprint training programs should include both acceleration-specific work (short distance sprints 10–30m, hill sprints, sled pushes) and supporting strength work emphasizing hip extension power. Technical coaching of forward lean during acceleration phase is as important as physical capacity development.",
    programmingImplications:
      "Structure speed sessions early in the training week when the nervous system is fresh. Limit max-speed work to 2–3 sessions per week with 48+ hours between sessions. Sled-resisted sprints (light resistance: 10–20% bodyweight) are effective for acceleration development without significantly altering mechanics.",
    safetyConsiderations:
      "Sprint training carries hamstring strain risk, especially without adequate warm-up, in fatigued states, or during early season reintroduction. Progress sprint volumes conservatively — acute:chronic workload ratio monitoring is essential for speed athletes.",
    limitations:
      "Sprint force production research focuses largely on elite male athletes. Transfer to recreational populations, females, and youth may differ. Sled resistance recommendations vary across studies.",
    contraindications:
      "Maximum intensity sprint work should not be used with clients who have active hamstring injuries, significant hip flexor restrictions, or low training volume history. Return-to-sprint progressions should be used after injury.",
  },
  // ── Plyometrics ─────────────────────────────────────────────────────────────
  {
    title: "Plyometric Training for Athletic Performance — NSCA Position",
    authors: "Potach DH, Chu DA",
    year: 2016,
    source: "NSCA",
    journal: "Essentials of Strength Training and Conditioning",
    category: "sport_performance",
    topicTags: ["plyometrics", "sport_performance", "sprint_mechanics", "strength_training"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "guideline",
    trustLevel: "gold",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract: "NSCA guidelines for plyometric training design, progression, and safety.",
    plainLanguageSummary:
      "Plyometric training improves reactive strength, power output, and neuromuscular coordination when properly progressed. The stretch-shortening cycle (SSC) is the key mechanism: rapid muscle lengthening followed by explosive shortening produces greater power than concentric-only movements. Appropriate loading and progression are critical for safe and effective outcomes.",
    coachingImplications:
      "Plyometric exercises should be prescribed based on intensity level (low/medium/high impact), not just the exercise name. Beginners should start with low-intensity bilateral jumps and box work before progressing to depth jumps, single-leg plyometrics, and reactive drills. Strength prerequisites (1.5x BW squat minimum before high-intensity plyos) improve outcomes and reduce injury risk.",
    programmingImplications:
      "Volume is measured in foot contacts. Beginner sessions: 80–100 contacts. Intermediate: 100–150. Advanced: 120–200. Place plyometric sessions before strength training or on separate days. Minimum 48 hours between high-intensity plyometric sessions.",
    safetyConsiderations:
      "Landing mechanics quality is the primary safety variable. Knee valgus during landing significantly increases ACL injury risk. Landing quality should be trained before volume is increased. Soft surfaces reduce impact but may reduce stretch-shortening cycle training effect.",
    limitations:
      "Most plyometric studies are short-term (4–8 weeks). Long-term adaptation data is limited. Optimal volumes for retention versus development phases are not well defined.",
    contraindications:
      "High-intensity plyometrics are not appropriate for clients with active lower extremity injuries, significantly limited ankle or hip mobility, inadequate strength base, or poor landing mechanics that cannot be corrected with cueing.",
  },
  // ── Periodization ───────────────────────────────────────────────────────────
  {
    title: "Periodization Theory — Foundations and Applied Models",
    authors: "Issurin VB",
    year: 2010,
    source: "SportsMed",
    journal: "Sports Medicine",
    category: "strength_conditioning",
    topicTags: ["periodization", "volume_management", "strength_training", "sport_performance"],
    populationTags: ["intermediate", "advanced"],
    evidenceType: "review",
    trustLevel: "high",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract:
      "Review of periodization models including linear, undulating, and block periodization with evidence comparison.",
    plainLanguageSummary:
      "Periodization — the planned variation of training variables over time — is a well-established strategy for maximizing long-term performance while managing fatigue. Multiple models (linear, undulating, block) produce superior outcomes compared to non-periodized approaches. No single model is universally superior; the appropriate model depends on training level, goals, and competitive calendar.",
    coachingImplications:
      "General fitness trainees benefit most from linear or daily undulating periodization (DUP) due to simplicity and consistent adaptation. Competitive and advanced athletes benefit from block periodization with distinct accumulation, intensification, and realization phases. Periodization should match the user's life/season schedule — not be applied rigidly.",
    programmingImplications:
      "Structure programs in 3–6 week blocks with clear primary adaptations (e.g., volume accumulation, intensity focus, peak/deload). Use DUP (alternating strength/hypertrophy/power days within a week) for intermediate trainees as a practical middle ground. Plan deload weeks every 4–8 weeks.",
    safetyConsiderations:
      "Intensification phases with heavy loading require adequate work capacity built in accumulation phases. Skipping base-building and jumping to high-intensity training is a common cause of overuse injury.",
    limitations:
      "Most periodization research involves trained athletes. Evidence in untrained populations, older adults, and clinical populations is limited. Long-term (12+ month) comparative data across models is sparse.",
    contraindications:
      "Strict periodization models requiring high workload are not appropriate for beginners, those with significant health constraints, or clients without adequate time for structured recovery phases.",
  },
  // ── Concurrent Training ─────────────────────────────────────────────────────
  {
    title: "Concurrent Training — Interference Effect and Management Strategies",
    authors: "Wilson JM, Marin PJ, Rhea MR, Wilson SM",
    year: 2012,
    source: "JSCR",
    journal: "Journal of Strength and Conditioning Research",
    category: "strength_conditioning",
    topicTags: ["concurrent_training", "strength_training", "endurance", "volume_management"],
    populationTags: ["intermediate", "advanced"],
    evidenceType: "meta_analysis",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    abstract:
      "Meta-analysis examining interference effect in concurrent strength and endurance training.",
    plainLanguageSummary:
      "Combining strength and endurance training (concurrent training) produces a weaker hypertrophy and strength response compared to strength training alone — this is the 'interference effect.' The magnitude of interference depends on modality (cycling produces less interference than running), ordering (strength first reduces interference), volume, and recovery between sessions.",
    coachingImplications:
      "When clients need both strength and endurance adaptations, prioritize the primary goal. Separate strength and endurance sessions by at least 6 hours when possible. Cycling-based cardio interferes less with leg strength development than running.",
    programmingImplications:
      "For strength-priority concurrent programs: strength first in the day, limit endurance volume, prefer cycling or rowing over running. For endurance-priority programs: reduce resistance training volume and focus on neural efficiency (heavier, lower volume strength work) rather than hypertrophy.",
    safetyConsiderations:
      "High volumes of both training modes simultaneously increase overuse injury risk, particularly lower extremity stress injuries. Monitor overall training load carefully in concurrent training programs.",
    limitations:
      "Interference effect magnitude varies significantly between studies. Individual response to concurrent training is highly variable. Most research involves endurance-dominant modalities — concurrent strength + HIIT data is less robust.",
    contraindications:
      "High-volume concurrent programs are not recommended for individuals with limited recovery capacity, poor sleep, high stress loads, or injury histories affected by volume accumulation.",
  },
  // ── Recovery & Sleep ────────────────────────────────────────────────────────
  {
    title: "Sleep and Athletic Recovery — Performance Impact Research",
    authors: "Watson AM",
    year: 2017,
    source: "SleepSci",
    journal: "Current Sports Medicine Reports",
    category: "recovery_wellness",
    topicTags: ["sleep", "recovery", "load_management", "sport_performance"],
    populationTags: ["intermediate", "advanced", "youth_athlete", "older_adult"],
    evidenceType: "review",
    trustLevel: "high",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract:
      "Review of evidence on sleep's role in athletic performance, recovery, and injury risk.",
    plainLanguageSummary:
      "Sleep is the most powerful recovery tool available. Inadequate sleep (less than 7–9 hours for most adults) is associated with impaired reaction time, reduced strength and power output, elevated injury risk, impaired cognitive performance, and slower tissue repair. Sleep extension (reaching 9–10 hours) consistently improves athletic performance in sleep-deprived athletes.",
    coachingImplications:
      "Sleep quality and quantity should be assessed as a primary recovery variable. When clients report poor sleep, reduce training intensity and volume until sleep improves. Training performance on poor sleep predicts elevated injury risk.",
    programmingImplications:
      "Program harder sessions earlier in the week when sleep is typically better accumulated. Avoid high-intensity training when clients report multi-night sleep deficits. Use readiness scores to auto-adjust training load when possible.",
    safetyConsiderations:
      "Consistently training hard on inadequate sleep (< 6 hours) significantly elevates soft tissue injury risk. Sleep deprivation impairs pain perception accuracy and proprioception.",
    limitations:
      "Most sleep research involves elite athletes or controlled lab conditions. Dose-response relationships for the general population are not precisely established. Sleep quality (not just duration) is difficult to measure outside lab settings.",
    contraindications:
      "High-intensity or high-volume training sessions should be modified or postponed when clients are acutely sleep-deprived (< 5 hours), given elevated injury risk.",
  },
  // ── Protein Intake ──────────────────────────────────────────────────────────
  {
    title: "Protein Intake for Muscle Gain — ISSN Position Stand",
    authors: "Stokes T, Hector AJ, Morton RW, McGlory C, Phillips SM",
    year: 2018,
    source: "ISSN",
    journal: "Nutrients",
    category: "nutrition",
    topicTags: ["protein_intake", "hypertrophy", "strength_training", "sports_nutrition"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "position_stand",
    trustLevel: "gold",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract: "ISSN-based evidence review on dietary protein for muscle protein synthesis and hypertrophy.",
    plainLanguageSummary:
      "Protein intake of 1.6–2.2g per kg of body weight per day is supported by current evidence as the range for maximizing muscle protein synthesis in resistance-trained individuals. Distribution of protein intake across 3–5 meals (0.4g/kg per meal) is more effective than single large doses. Higher intakes (up to 3g/kg) appear safe and may benefit caloric deficit conditions.",
    coachingImplications:
      "When clients are not making expected hypertrophy progress despite adequate training, protein intake is one of the first nutritional variables to assess. Encourage clients to spread protein intake across the day rather than concentrating it in one meal.",
    programmingImplications:
      "Recovery between sessions is enhanced with adequate protein. Clients with high training volume, multiple weekly sessions, or concurrent training may benefit from the higher end of the 1.6–2.2g/kg range. Older adults (40+) often require higher protein intakes (1.8–2.4g/kg) due to anabolic resistance.",
    safetyConsiderations:
      "High protein intakes (up to 3g/kg) are well-tolerated in healthy individuals without kidney disease. The TrainChat system does not provide individual nutrition prescriptions — these are educational guidelines only. Clients with kidney disease should consult a registered dietitian.",
    limitations:
      "Optimal protein timing effects are modest relative to daily total intake. Individual protein requirements vary by genetics, training status, caloric intake, and age. This evidence does not prove a universal optimal intake.",
    contraindications:
      "High protein intake recommendations should not be applied to clients with chronic kidney disease, liver conditions, or metabolic disorders without medical supervision.",
  },
  // ── Pain Modification & Return to Training ──────────────────────────────────
  {
    title: "Pain-Modification Principles for Exercise Programming",
    authors: "Smith BE, Hendrick P, Smith T, et al.",
    year: 2017,
    source: "PubMed",
    journal: "British Journal of Sports Medicine",
    category: "medical_rehab",
    topicTags: ["pain_modification", "return_to_training", "load_management", "knee", "shoulder", "back"],
    populationTags: ["beginner", "intermediate", "advanced", "older_adult"],
    evidenceType: "systematic_review",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    abstract:
      "Systematic review examining exercise approaches for musculoskeletal pain with graded activity principles.",
    plainLanguageSummary:
      "Graded exposure to movement and load — rather than complete rest — is the evidence-supported approach for most musculoskeletal pain presentations. Maintaining movement with appropriate load modification typically produces better long-term outcomes than avoidance. Pain during exercise is not automatically a signal to stop; guided principles help distinguish productive discomfort from harmful loading.",
    coachingImplications:
      "When a client reports pain with a movement, the response should be to modify the movement (range, load, speed, positioning) rather than eliminate it entirely. Complete exercise avoidance often leads to deconditioning, which worsens long-term pain outcomes. Always recommend professional evaluation for persistent or severe pain.",
    programmingImplications:
      "Use pain monitoring scales (0–10) to guide load. A pain level of 0–3/10 during exercise is typically acceptable for continued graded loading. Pain above 5/10 warrants load reduction. Pain that does not settle within 24 hours of a session indicates too much load was applied.",
    safetyConsiderations:
      "Pain modification training is NOT a replacement for medical evaluation. Red-flag symptoms (sharp radiating pain, neurological symptoms, significant swelling, acute injury) require immediate professional evaluation. The TrainChat system does not diagnose conditions — it provides general movement modification principles only.",
    limitations:
      "Pain modification principles are most established for chronic musculoskeletal conditions. Acute injuries, post-surgical presentations, and complex pain conditions require individualized clinical management beyond general guidelines.",
    contraindications:
      "Pain modification programming should not override medical advice. Clients with acute injuries, recent surgery, or symptoms suggesting serious pathology should be directed to healthcare professionals first.",
  },
  // ── Older Adult Training ────────────────────────────────────────────────────
  {
    title: "Resistance Training for Older Adults — ACSM Position Stand",
    authors: "American College of Sports Medicine",
    year: 2019,
    source: "ACSM",
    journal: "Medicine & Science in Sports & Exercise",
    category: "sport_performance",
    topicTags: ["older_adult", "strength_training", "volume_management", "progressive_overload"],
    populationTags: ["older_adult"],
    evidenceType: "position_stand",
    trustLevel: "gold",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract: "ACSM position stand on resistance training prescription and safety for adults 65+.",
    plainLanguageSummary:
      "Resistance training is safe and highly beneficial for older adults, improving muscle mass, bone density, functional strength, balance, and metabolic health. ACSM guidelines recommend 2–3 sessions per week of moderate-to-vigorous resistance training, progressing conservatively from lower intensities. Starting loads of 40–60% 1RM are appropriate for beginners, progressing to 60–80% as tolerated.",
    coachingImplications:
      "Older adults require longer warm-ups, more conservative load progressions, and greater attention to form quality due to reduced proprioception and joint resilience. Balance and unilateral work should be integrated regularly. Focus on functional patterns (squat, hinge, push, pull) that support activities of daily living.",
    programmingImplications:
      "Use a 2–3 day/week frequency with 48+ hours between sessions. Start with machine-based or supported exercises to build confidence and reinforce mechanics before progressing to free weights. Reduce session duration relative to younger adults — 45–60 minutes is adequate. Include mobility and balance components.",
    safetyConsiderations:
      "Medical clearance is strongly recommended before older adults begin structured resistance training, particularly if sedentary or managing cardiovascular, metabolic, or orthopedic conditions. Avoid exercises with high fall risk (e.g., loaded overhead on unstable surfaces). Blood pressure response to exercise should be monitored in hypertensive individuals.",
    limitations:
      "Optimal programming parameters for older adults vary substantially based on health status, current fitness level, and presence of chronic conditions. These guidelines represent population averages for healthy older adults.",
    contraindications:
      "High-intensity explosive lifting, heavy spinal loading, and exercises requiring significant balance challenge without adequate progression are not appropriate for deconditioned older adults or those with osteoporosis, severe arthritis, or cardiovascular contraindications.",
  },
  // ── Youth Athlete Training ──────────────────────────────────────────────────
  {
    title: "Youth Resistance Training — NSCA Position Statement",
    authors: "Lloyd RS, Faigenbaum AD, Stone MH, et al.",
    year: 2014,
    source: "NSCA",
    journal: "Strength and Conditioning Journal",
    category: "sport_performance",
    topicTags: ["youth_athlete", "strength_training", "progressive_overload", "sport_performance"],
    populationTags: ["youth_athlete"],
    evidenceType: "position_stand",
    trustLevel: "gold",
    confidence: "strong",
    status: "approved",
    isActive: true,
    abstract: "NSCA position statement on resistance training for children and adolescents.",
    plainLanguageSummary:
      "Resistance training is safe and beneficial for children and adolescents when properly supervised and progressed. Youth training produces neuromuscular efficiency gains, improved bone density, injury prevention, and enhanced sport performance. The primary adaptation in prepubescent youth is neural — significant hypertrophy typically begins post-puberty.",
    coachingImplications:
      "Youth programming should emphasize technique quality, movement competency, and fundamental motor patterns before external loading is increased. Motivation and enjoyment are key to long-term adherence. Young athletes should learn the why behind programming to build intrinsic motivation.",
    programmingImplications:
      "Use a 2–3 day/week frequency. Prioritize fundamental movement patterns (squat, hinge, push, pull, carry). Start with bodyweight before adding load. Rep ranges of 6–15 are generally appropriate; avoid near-maximal loading until technical proficiency is established. Keep sessions engaging — variety is important for youth.",
    safetyConsiderations:
      "All youth resistance training requires qualified supervision. Avoid maximum effort lifts and ballistic loading until proper mechanics are established. Spinal loading (heavy squats, deadlifts) should be progressed conservatively. Never program to muscular failure for beginners.",
    limitations:
      "Youth training research is limited by ethical constraints around exercise intensity. Long-term development outcomes are difficult to study with sufficient rigor. LTAD frameworks (Long-Term Athlete Development) remain theoretical in parts.",
    contraindications:
      "High-intensity, maximal-effort, or unsupervised resistance training is not appropriate for youth athletes. Special care is needed during rapid growth phases when bone growth plates are vulnerable.",
  },
  // ── Load Management ─────────────────────────────────────────────────────────
  {
    title: "Training Load and Injury Risk — Acute:Chronic Workload Ratio Evidence",
    authors: "Gabbett TJ",
    year: 2016,
    source: "BJSM",
    journal: "British Journal of Sports Medicine",
    category: "recovery_wellness",
    topicTags: ["load_management", "recovery", "sport_performance", "volume_management"],
    populationTags: ["intermediate", "advanced", "youth_athlete"],
    evidenceType: "review",
    trustLevel: "high",
    confidence: "moderate",
    status: "approved",
    isActive: true,
    abstract: "Review of acute:chronic workload ratio and its relationship to injury risk in athletes.",
    plainLanguageSummary:
      "The acute:chronic workload ratio (ACWR) — the ratio of the current week's training load to the rolling 4-week average — is associated with injury risk. Spikes above 1.5 (25–50% above training average) significantly elevate injury risk. Athletes with high chronic load tolerate acute spikes better than those with low chronic load.",
    coachingImplications:
      "Avoid large week-to-week training load jumps, especially during schedule changes, early return from rest periods, or start of new training phases. Build aerobic and load base before intensifying training. The '10% rule' (increasing load by no more than 10% per week) is a practical heuristic.",
    programmingImplications:
      "Track training load trends over 4+ weeks. Plan any load spikes conservatively. After deload weeks or time off, reintroduce at 50–60% of pre-deload volume before progressing. Block periodization naturally manages ACWR by building load in accumulation and reducing it in deload.",
    safetyConsiderations:
      "Monotony in training load (same stimulus every week without variation) is also associated with injury and overtraining. Some variation is protective — but spikes above 1.5 ACWR are the primary risk factor to monitor.",
    limitations:
      "ACWR research has faced criticism for methodological limitations (session-RPE vs GPS vs HR methods produce different values). Individual responses vary significantly. The 1.5 threshold is a population average, not a precise individual cutoff.",
    contraindications:
      "High ACWR loading strategies should not be applied to athletes returning from injury, in early off-season phases, or with poor recovery indicators (sleep, readiness, subjective wellbeing).",
  },
];

// ─── Seeder Function ──────────────────────────────────────────────────────────

export async function isResearchLibraryEmpty(): Promise<boolean> {
  const [result] = await db.select({ n: count() }).from(researchDocumentsTable);
  return Number(result?.n ?? 0) === 0;
}

export async function seedResearchLibrary(force = false): Promise<{ inserted: number; skipped: number }> {
  const empty = await isResearchLibraryEmpty();

  if (!empty && !force) {
    return { inserted: 0, skipped: SEED_DOCUMENTS.length };
  }

  let inserted = 0;
  let skipped = 0;

  for (const docData of SEED_DOCUMENTS) {
    try {
      const [doc] = await db
        .insert(researchDocumentsTable)
        .values(docData)
        .onConflictDoNothing()
        .returning();

      if (doc) {
        await createChunksForDocument(doc as ResearchDocument);
        inserted++;
      } else {
        skipped++;
      }
    } catch (err) {
      logger.error({ err, title: docData.title }, "[ResearchSeeder] Failed to seed document");
      skipped++;
    }
  }

  logger.info({ inserted, skipped }, "[ResearchSeeder] Research library seeded");
  return { inserted, skipped };
}
