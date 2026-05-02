// ─── Trusted Source Registry ──────────────────────────────────────────────────
//
// This registry defines the authoritative sources that TrainChat is allowed to
// draw from when ingesting research. Only sources listed here (or curated
// summaries derived from them) are permitted in the research pipeline.
//
// IMPORTANT: This system does NOT scrape the open web. It stores curated
// abstracts, position-stand summaries, and guideline excerpts that admins
// have reviewed and approved.

import type { ResearchCategory, TrustLevel } from "@workspace/db";

export interface TrustedSource {
  id: string;
  name: string;
  shortName: string;
  category: ResearchCategory;
  trustLevel: TrustLevel;
  baseUrl?: string;
  description: string;
  allowedUseCases: string[];
  disallowedUseCases: string[];
  notes: string;
}

export const TRUSTED_SOURCES: TrustedSource[] = [
  // ── Strength & Conditioning ─────────────────────────────────────────────────
  {
    id: "nsca",
    name: "National Strength and Conditioning Association — Position Stands & Textbooks",
    shortName: "NSCA",
    category: "strength_conditioning",
    trustLevel: "gold",
    baseUrl: "https://journals.lww.com/nsca-jscr",
    description:
      "The NSCA publishes the gold-standard textbooks and position statements for strength training, conditioning, and athletic performance. Includes NSCA Essentials of Strength Training and Conditioning.",
    allowedUseCases: [
      "Resistance training program design",
      "Progressive overload principles",
      "Exercise prescription for all populations",
      "Periodization and programming structure",
      "Plyometric and power development",
    ],
    disallowedUseCases: ["Medical diagnosis", "Clinical treatment"],
    notes: "Prefer position stands and textbook chapters over individual studies.",
  },
  {
    id: "acsm",
    name: "American College of Sports Medicine — Guidelines and Position Stands",
    shortName: "ACSM",
    category: "strength_conditioning",
    trustLevel: "gold",
    baseUrl: "https://journals.lww.com/acsm-msse",
    description:
      "ACSM produces the authoritative exercise prescription guidelines used globally. Position stands represent expert consensus reviewed by hundreds of researchers.",
    allowedUseCases: [
      "Exercise prescription by population",
      "Cardiovascular and resistance training guidelines",
      "FITT-VP principle application",
      "Youth and older adult programming",
    ],
    disallowedUseCases: ["Prescribing medical treatment", "Diagnosing conditions"],
    notes: "Use position stands for population-specific guidelines.",
  },
  {
    id: "jscr",
    name: "Journal of Strength and Conditioning Research",
    shortName: "JSCR",
    category: "strength_conditioning",
    trustLevel: "high",
    baseUrl: "https://journals.lww.com/nsca-jscr",
    description:
      "Peer-reviewed research journal published by the NSCA. Covers hypertrophy, strength, power, speed, and athletic performance.",
    allowedUseCases: [
      "Hypertrophy programming evidence",
      "Strength training volume and frequency",
      "Speed and power development",
      "Periodization research",
    ],
    disallowedUseCases: ["Medical treatment", "Clinical nutrition prescriptions"],
    notes: "Prefer meta-analyses and systematic reviews over single RCTs.",
  },
  {
    id: "sports_medicine",
    name: "Sports Medicine Journal (Springer)",
    shortName: "SportsMed",
    category: "strength_conditioning",
    trustLevel: "high",
    baseUrl: "https://link.springer.com/journal/40279",
    description:
      "High-impact peer-reviewed journal covering sports science, training methods, and athletic performance.",
    allowedUseCases: [
      "Concurrent training research",
      "Fatigue and recovery science",
      "Training load management",
      "Sprint and acceleration research",
    ],
    disallowedUseCases: ["Clinical treatment", "Injury diagnosis"],
    notes: "Excellent source for systematic reviews and meta-analyses.",
  },
  // ── Medical / Rehab Adjacent ────────────────────────────────────────────────
  {
    id: "pubmed_exercise",
    name: "PubMed — Exercise Science and Rehabilitation Research",
    shortName: "PubMed",
    category: "medical_rehab",
    trustLevel: "high",
    baseUrl: "https://pubmed.ncbi.nlm.nih.gov",
    description:
      "The US National Library of Medicine's database. Used for peer-reviewed exercise, rehabilitation, and clinical exercise science research. ONLY educational use — no diagnosis or treatment.",
    allowedUseCases: [
      "Pain-modification training principles",
      "Return-to-training after injury guidelines",
      "Load management for injury-adjacent populations",
      "Movement retraining principles",
    ],
    disallowedUseCases: [
      "Medical diagnosis",
      "Treatment recommendations",
      "Prescribing medication",
      "Clinical assessment replacement",
    ],
    notes:
      "Only ingest meta-analyses, systematic reviews, and clinical guidelines — NOT individual case reports or observational studies for medical claims.",
  },
  {
    id: "apta",
    name: "American Physical Therapy Association — Clinical Practice Guidelines",
    shortName: "APTA",
    category: "medical_rehab",
    trustLevel: "gold",
    baseUrl: "https://www.jospt.org",
    description:
      "Clinical practice guidelines for musculoskeletal rehabilitation and return-to-sport. Educational use only.",
    allowedUseCases: [
      "Joint-friendly exercise substitutions",
      "Post-rehabilitation training principles",
      "Load management for pain-adjacent conditions",
    ],
    disallowedUseCases: ["Clinical assessment", "Medical diagnosis", "Treatment prescription"],
    notes: "Educational reference only — always recommend professional evaluation for injury.",
  },
  // ── Nutrition ────────────────────────────────────────────────────────────────
  {
    id: "issn",
    name: "International Society of Sports Nutrition — Position Stands",
    shortName: "ISSN",
    category: "nutrition",
    trustLevel: "gold",
    baseUrl: "https://jissn.biomedcentral.com",
    description:
      "ISSN position stands represent expert consensus on sports nutrition topics including protein, creatine, hydration, timing, and energy balance.",
    allowedUseCases: [
      "Protein intake for muscle gain and performance",
      "Creatine supplementation principles",
      "Hydration and electrolyte guidelines",
      "Nutrient timing for performance and recovery",
      "Energy balance for body composition",
    ],
    disallowedUseCases: [
      "Prescribing specific supplement doses for individuals",
      "Medical nutrition therapy",
      "Clinical dietary treatment",
    ],
    notes:
      "Position stands are the gold standard. Avoid using as clinical prescriptions. Use conservative educational language.",
  },
  {
    id: "jissn_research",
    name: "Journal of the International Society of Sports Nutrition",
    shortName: "JISSN",
    category: "nutrition",
    trustLevel: "high",
    baseUrl: "https://jissn.biomedcentral.com",
    description:
      "Peer-reviewed research on sports nutrition. Covers protein synthesis, recovery nutrition, supplementation, and energy availability.",
    allowedUseCases: [
      "Post-workout nutrition principles",
      "Protein distribution research",
      "Caloric deficit and performance",
      "Micronutrient and sport performance",
    ],
    disallowedUseCases: ["Individual clinical nutrition prescriptions", "Medical nutrition therapy"],
    notes: "Conservative educational use only. Do not frame findings as personalized prescriptions.",
  },
  // ── Recovery & Wellness ──────────────────────────────────────────────────────
  {
    id: "sleep_science",
    name: "Sleep Research — Sleep, Journal of Sleep Research",
    shortName: "SleepSci",
    category: "recovery_wellness",
    trustLevel: "high",
    baseUrl: "https://academic.oup.com/sleep",
    description:
      "Peer-reviewed sleep science research applicable to athletic recovery, fatigue management, and performance optimization.",
    allowedUseCases: [
      "Sleep and athletic recovery",
      "Sleep deprivation and performance",
      "Recovery optimization principles",
      "Fatigue and readiness management",
    ],
    disallowedUseCases: ["Diagnosing sleep disorders", "Sleep disorder treatment"],
    notes: "Use for general sleep hygiene and recovery principles — not clinical sleep medicine.",
  },
  {
    id: "load_management",
    name: "British Journal of Sports Medicine — Load Management Research",
    shortName: "BJSM",
    category: "recovery_wellness",
    trustLevel: "high",
    baseUrl: "https://bjsm.bmj.com",
    description:
      "High-quality sports medicine and load management research. Covers training load monitoring, acute:chronic workload ratio, and overtraining prevention.",
    allowedUseCases: [
      "Training load and injury prevention",
      "Overtraining and underrecovery",
      "Readiness and HRV principles",
      "Volume management and adaptation",
    ],
    disallowedUseCases: ["Clinical injury treatment", "Medical diagnosis"],
    notes: "Excellent for load management and periodization evidence.",
  },
  // ── Sport Performance ────────────────────────────────────────────────────────
  {
    id: "sprint_mechanics",
    name: "Sprint Mechanics Research — International Journal of Sports Physiology and Performance",
    shortName: "IJSPP",
    category: "sport_performance",
    trustLevel: "high",
    baseUrl: "https://journals.humankinetics.com/view/journals/ijspp",
    description:
      "Leading journal for sport performance science including sprint mechanics, acceleration, change of direction, and jump training.",
    allowedUseCases: [
      "Sprint and acceleration programming",
      "Plyometric progressions",
      "Change of direction training",
      "Jump training for sport",
      "Explosive power development",
    ],
    disallowedUseCases: ["Medical treatment", "Clinical rehabilitation"],
    notes: "Primary reference for speed, power, and sport-specific programming.",
  },
  {
    id: "youth_training",
    name: "Pediatric Exercise Science — Youth Athlete Development Research",
    shortName: "PedExSci",
    category: "sport_performance",
    trustLevel: "gold",
    baseUrl: "https://journals.humankinetics.com/view/journals/pes",
    description:
      "Research on youth athlete development, long-term athletic development (LTAD), and age-appropriate training principles.",
    allowedUseCases: [
      "Youth resistance training guidelines",
      "Long-term athletic development principles",
      "Age-appropriate programming",
      "Youth sport specialization evidence",
    ],
    disallowedUseCases: ["Medical assessment", "Clinical pediatric treatment"],
    notes: "Use NSCA youth position stand and ACSM youth guidelines as primary references.",
  },
  {
    id: "older_adult_training",
    name: "Exercise and Aging Research — Journal of Aging and Physical Activity",
    shortName: "AgingExSci",
    category: "sport_performance",
    trustLevel: "gold",
    baseUrl: "https://journals.humankinetics.com/view/journals/japa",
    description:
      "Research on exercise for older adults including sarcopenia prevention, fall prevention, and resistance training safety.",
    allowedUseCases: [
      "Older adult resistance training safety",
      "Sarcopenia and muscle preservation",
      "Balance and fall prevention training",
      "Progressive programming for older adults",
    ],
    disallowedUseCases: ["Medical clearance", "Clinical geriatric treatment"],
    notes: "Apply conservative loading progressions. Always recommend medical clearance for older adults before starting.",
  },
];

export function getSourceById(id: string): TrustedSource | undefined {
  return TRUSTED_SOURCES.find((s) => s.id === id);
}

export function getSourcesByCategory(category: ResearchCategory): TrustedSource[] {
  return TRUSTED_SOURCES.filter((s) => s.category === category);
}

export function getGoldSources(): TrustedSource[] {
  return TRUSTED_SOURCES.filter((s) => s.trustLevel === "gold");
}
