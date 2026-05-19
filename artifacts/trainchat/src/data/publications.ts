export type Publication = {
  title: string;
  subtitle: string;
  abbr: string;
  description: string;
  path: string;
  pdfPath?: string;
  year: string;
  pages: string;
};

export const publications: Publication[] = [
  {
    title: "The Adaptive Coaching Architecture",
    subtitle: "A Three-Layer Framework for Principled AI Coaching Systems",
    abbr: "ACA",
    description: "Defines the structural design of TrainChat's AI coaching system — three layers (coaching intelligence, adaptive programming, conversational interface) with distinct responsibilities — and argues that architectural separation is the minimum condition for principled coaching decisions.",
    path: "/whitepapers/adaptive-coaching-architecture",
    pdfPath: "/whitepapers/aca-pdf",
    year: "2025",
    pages: "~12 pages"
  },
  {
    title: "Mutation-First Programming",
    subtitle: "A Change Management Principle for Adaptive Training Systems",
    abbr: "MFP",
    description: "Establishes the principle that the correct response to new athlete information is the most surgical available intervention — not a program rebuild — and defines the five-level decision hierarchy through which coaching precision is operationalized.",
    path: "/whitepapers/mutation-first-programming",
    pdfPath: "/whitepapers/mfp-pdf",
    year: "2025",
    pages: "~10 pages"
  },
  {
    title: "The Problem With Static Programming",
    subtitle: "Why Fixed Plans Fail Athletes and What Living Systems Do Instead",
    abbr: "LSM",
    description: "The case against fixed training plans — not as a preference argument, but as a structural one. Establishes the three properties that distinguish a living training system from a static program, and explains why the architectural requirements are non-negotiable for coaching quality.",
    path: "/whitepapers/the-problem-with-static-programming",
    pdfPath: "/whitepapers/lsm-pdf",
    year: "2025",
    pages: "~11 pages"
  },
  {
    title: "Constraint-Aware Coaching Systems",
    subtitle: "How Training Constraints Shape Every Coaching Decision",
    abbr: "CACS",
    description: "Defines the taxonomy of training constraints, the constraint registry architecture, and the principle that constraint-awareness is the structural minimum for AI coaching systems that can make safe, defensible programming decisions.",
    path: "/whitepapers/constraint-aware-coaching-systems",
    pdfPath: "/whitepapers/cacs-pdf",
    year: "2026",
    pages: "~11 pages"
  },
  {
    title: "Conversational Periodization",
    subtitle: "Toward Adaptive Training Systems Built Through Continuous Coaching Dialogue",
    abbr: "CP",
    description: "A model where the training plan is not fixed but mutable — evolving through coaching dialogue while preserving longitudinal coherence. Covers dynamic block mutation, training-state continuity, adaptive sequencing, and conversational refinement loops.",
    path: "/whitepapers/conversational-periodization",
    pdfPath: "/whitepapers/cp-pdf",
    year: "2026",
    pages: "~11 pages"
  },
  {
    title: "The Deterministic-Generative Hybrid Model",
    subtitle: "A Structured Architecture for AI Coaching",
    abbr: "DGH",
    description: "Defines the hybrid architecture combining deterministic structural logic with generative language intelligence. The generative layer interprets; the deterministic layer decides. Covers mutation ontologies, validation gates, and coaching-state persistence.",
    path: "/whitepapers/deterministic-generative-hybrid-model",
    pdfPath: "/whitepapers/dgh-pdf",
    year: "2026",
    pages: "~11 pages"
  }
];
