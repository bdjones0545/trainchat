export interface WhitepaperDefinition {
  slug: string;
  code: string;
  title: string;
  subtitle: string;
  description: string;
  year: string;
  estimatedPages: string;
  tags?: string[];
}

export const WHITEPAPERS: WhitepaperDefinition[] = [
  {
    slug: "adaptive-coaching-architecture",
    code: "ACA",
    title: "The Adaptive Coaching Architecture",
    subtitle: "A Three-Layer Framework for Principled AI Coaching Systems",
    description:
      "Defines the structural design of TrainChat's AI coaching system — three layers (coaching intelligence, adaptive programming, conversational interface) with distinct responsibilities — and argues that architectural separation is the minimum condition for principled coaching decisions.",
    year: "2025",
    estimatedPages: "~12 pages",
    tags: ["ACA", "Coaching Intelligence", "Adaptive Programming", "Conversational Interface", "Exercise Science"],
  },
  {
    slug: "mutation-first-programming",
    code: "MFP",
    title: "Mutation-First Programming",
    subtitle: "A Change Management Principle for Adaptive Training Systems",
    description:
      "Establishes the principle that the correct response to new athlete information is the most surgical available intervention — not a program rebuild — and defines the five-level decision hierarchy through which coaching precision is operationalized.",
    year: "2025",
    estimatedPages: "~10 pages",
    tags: ["MFP", "Mutation Hierarchy", "Surgical Intervention", "Program Continuity", "Decision Framework"],
  },
  {
    slug: "the-problem-with-static-programming",
    code: "LSM",
    title: "The Problem With Static Programming",
    subtitle: "Why Fixed Plans Fail Athletes and What Living Systems Do Instead",
    description:
      "The case against fixed training plans — not as a preference argument, but as a structural one. Establishes the three properties that distinguish a living training system from a static program, and explains why the architectural requirements are non-negotiable for coaching quality.",
    year: "2025",
    estimatedPages: "~11 pages",
    tags: ["LSM", "Living Training System", "Static Programming", "Adaptive Architecture", "Program Failure"],
  },
  {
    slug: "constraint-aware-coaching-systems",
    code: "CACS",
    title: "Constraint-Aware Coaching Systems",
    subtitle: "How Training Constraints Shape Every Coaching Decision",
    description:
      "Defines the taxonomy of training constraints, the constraint registry architecture, and the principle that constraint-awareness is the structural minimum for AI coaching systems that can make safe, defensible programming decisions.",
    year: "2026",
    estimatedPages: "~11 pages",
    tags: ["CACS", "Constraint Registry", "Athlete Profile Resolver", "Fatigue Budgets", "Clinical Integration"],
  },
  {
    slug: "conversational-periodization",
    code: "CP",
    title: "Conversational Periodization",
    subtitle: "Toward Adaptive Training Systems Built Through Continuous Coaching Dialogue",
    description:
      "A model where the training plan is not fixed but mutable — evolving through coaching dialogue while preserving longitudinal coherence. Covers dynamic block mutation, training-state continuity, adaptive sequencing, and conversational refinement loops.",
    year: "2026",
    estimatedPages: "~11 pages",
    tags: ["CP", "Dynamic Block Mutation", "Training-State Continuity", "Adaptive Sequencing", "Refinement Loops"],
  },
  {
    slug: "deterministic-generative-hybrid-model",
    code: "DGH",
    title: "The Deterministic-Generative Hybrid Model",
    subtitle: "A Structured Architecture for AI Coaching",
    description:
      "Defines the hybrid architecture combining deterministic structural logic with generative language intelligence. The generative layer interprets; the deterministic layer decides. Covers mutation ontologies, validation gates, and coaching-state persistence.",
    year: "2026",
    estimatedPages: "~11 pages",
    tags: ["DGH", "Mutation Ontologies", "Validation Gates", "Coaching-State Persistence", "Hybrid Architecture"],
  },
];

export function getWhitepaperReadRoute(slug: string): string {
  return `/whitepapers/${slug}`;
}

export function getWhitepaperPdfRoute(slug: string): string {
  const wp = WHITEPAPERS.find((w) => w.slug === slug);
  if (!wp) {
    // Dynamic (DB-generated) whitepapers use the /whitepapers/:slug/pdf route
    return `/whitepapers/${slug}/pdf`;
  }
  return `/whitepapers/${wp.code.toLowerCase()}-pdf`;
}

export function getWhitepaperBySlug(slug: string): WhitepaperDefinition | undefined {
  return WHITEPAPERS.find((w) => w.slug === slug);
}

if (import.meta.env.DEV) {
  const slugSet = new Set<string>();
  const codeSet = new Set<string>();

  WHITEPAPERS.forEach((wp) => {
    if (slugSet.has(wp.slug)) {
      console.error(`[Whitepapers] Duplicate slug detected: "${wp.slug}"`);
    }
    slugSet.add(wp.slug);

    if (codeSet.has(wp.code)) {
      console.error(`[Whitepapers] Duplicate code detected: "${wp.code}"`);
    }
    codeSet.add(wp.code);

    const required = ["slug", "code", "title", "subtitle", "description", "year", "estimatedPages"] as const;
    required.forEach((field) => {
      if (!wp[field]) {
        console.error(`[Whitepapers] Missing required field "${field}" on whitepaper "${wp.slug || wp.code}"`);
      }
    });
  });
}
