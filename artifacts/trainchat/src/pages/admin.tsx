import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
import { useNoIndex } from "@/hooks/useNoIndex";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FunnelStep {
  step: string;
  event: string;
  count: number;
  conversionFrom: string | null;
  conversionPct: number | null;
}

interface DropoffRow {
  stage: string;
  count: number;
  pct: number;
}

interface FunnelSummary {
  landingViewed: number;
  startFreeClicked: number;
  onboardingStarted: number;
  onboardingCompleted: number;
  programGenerated: number;
  paywallShown: number;
  paywallCtaClicked: number;
  signupStarted: number;
  signupCompleted: number;
  paymentStarted: number;
  paymentCompleted: number;
  guestConverted: number;
  guestReturned: number;
  followupUsed: number;
  generationFailed: number;
  overallConversionPct: number;
  paywallToCta: number;
  signupToPayment: number;
}

interface FunnelResponse {
  range: string;
  generatedAt: string;
  funnel: FunnelStep[];
  summary: FunnelSummary;
  dropoff: DropoffRow[];
}

interface AnalyticsResponse {
  users: {
    total: number;
    newThisWeek: number;
    paid: number;
    free: number;
    conversionRate: number;
  };
  messages: { total: number; thisWeek: number };
  programs: { total: number };
  sessionLogs: { total: number };
  planBreakdown: { plan: string; count: number }[];
  generatedAt: string;
}

interface RecentEvent {
  id: number;
  event: string;
  deviceId: string | null;
  guestSessionId: number | null;
  userId: number | null;
  properties: Record<string, unknown> | null;
  createdAt: string;
}

interface KnowledgeEntry {
  id: number;
  type: "philosophy" | "exercise" | "rule" | "sport_template";
  content: string;
  tags: string[];
  sport: string | null;
  goal: string | null;
  bodyRegion: string | null;
  movementPattern: string | null;
  population: string | null;
  sourceType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

type DateRange = "7d" | "30d" | "all";
type AdminTab = "analytics" | "knowledge" | "research";

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWLEDGE_TYPES: KnowledgeEntry["type"][] = ["philosophy", "exercise", "rule", "sport_template"];

const TYPE_LABELS: Record<KnowledgeEntry["type"], string> = {
  philosophy: "Philosophy",
  exercise: "Exercise",
  rule: "Rule",
  sport_template: "Sport Template",
};

const TYPE_COLORS: Record<KnowledgeEntry["type"], string> = {
  philosophy: "hsl(270 70% 55%)",
  exercise: "hsl(142 60% 40%)",
  rule: "hsl(40 90% 50%)",
  sport_template: "hsl(199 89% 48%)",
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
      <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function PctBar({ value }: { value: number }) {
  const color = value >= 50 ? "hsl(142 70% 45%)" : value >= 20 ? "hsl(40 90% 50%)" : "hsl(0 70% 50%)";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "hsl(222 47% 18%)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
      <span className="text-xs font-mono w-12 text-right" style={{ color }}>{value.toFixed(1)}%</span>
    </div>
  );
}

// ─── Knowledge Base Component ─────────────────────────────────────────────────

const EMPTY_FORM = {
  type: "philosophy" as KnowledgeEntry["type"],
  content: "",
  tagsRaw: "",
  sport: "",
  goal: "",
  bodyRegion: "",
  movementPattern: "",
  population: "",
};

function KnowledgeBase() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterSport, setFilterSport] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ entries: KnowledgeEntry[] }>("/api/admin/knowledge");
      setEntries(data.entries);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(entry: KnowledgeEntry) {
    setEditingId(entry.id);
    setForm({
      type: entry.type,
      content: entry.content,
      tagsRaw: entry.tags.join(", "),
      sport: entry.sport ?? "",
      goal: entry.goal ?? "",
      bodyRegion: entry.bodyRegion ?? "",
      movementPattern: entry.movementPattern ?? "",
      population: entry.population ?? "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      const payload = {
        type: form.type,
        content: form.content.trim(),
        tags: form.tagsRaw.split(",").map((t) => t.trim()).filter(Boolean),
        sport: form.sport.trim() || null,
        goal: form.goal.trim() || null,
        bodyRegion: form.bodyRegion.trim() || null,
        movementPattern: form.movementPattern.trim() || null,
        population: form.population.trim() || null,
      };
      if (editingId !== null) {
        await apiFetch(`/api/admin/knowledge/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/admin/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this entry?")) return;
    try {
      await apiFetch(`/api/admin/knowledge/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleToggleActive(entry: KnowledgeEntry) {
    try {
      await apiFetch(`/api/admin/knowledge/${entry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const filtered = entries.filter((e) => {
    if (filterType !== "all" && e.type !== filterType) return false;
    if (filterSport && e.sport?.toLowerCase() !== filterSport.toLowerCase()) return false;
    return true;
  });

  const fieldStyle = {
    background: "hsl(222 47% 9%)",
    border: "1px solid hsl(222 47% 22%)",
    color: "#fff",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "13px",
    width: "100%",
    outline: "none",
  };

  const labelStyle = { fontSize: "11px", color: "hsl(0 0% 55%)", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "4px", display: "block" };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Knowledge Base</h2>
          <p className="text-zinc-500 text-xs mt-0.5">{entries.length} entries — injected into AI context at program-build time</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: "hsl(199 89% 48%)", color: "#fff" }}
        >
          + Add Entry
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ ...fieldStyle, width: "auto", paddingRight: "28px" }}
        >
          <option value="all">All types</option>
          {KNOWLEDGE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
        <input
          placeholder="Filter by sport..."
          value={filterSport}
          onChange={(e) => setFilterSport(e.target.value)}
          style={{ ...fieldStyle, width: "160px" }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg text-red-400 text-sm" style={{ background: "hsl(0 50% 10%)", border: "1px solid hsl(0 50% 20%)" }}>
          {error}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(199 89% 30%)" }}>
          <h3 className="text-sm font-semibold text-white">{editingId !== null ? "Edit Entry" : "New Entry"}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span style={labelStyle}>Type</span>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as KnowledgeEntry["type"] }))} style={fieldStyle}>
                {KNOWLEDGE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <span style={labelStyle}>Sport (optional)</span>
              <input placeholder="soccer, basketball..." value={form.sport} onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))} style={fieldStyle} />
            </div>
          </div>

          <div>
            <span style={labelStyle}>Content</span>
            <textarea
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={4}
              placeholder="Write the coaching rule, philosophy note, or exercise insight..."
              style={{ ...fieldStyle, resize: "vertical" as const }}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <span style={labelStyle}>Goal (optional)</span>
              <input placeholder="strength, hypertrophy..." value={form.goal} onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))} style={fieldStyle} />
            </div>
            <div>
              <span style={labelStyle}>Body Region (optional)</span>
              <input placeholder="shoulder, knee..." value={form.bodyRegion} onChange={(e) => setForm((f) => ({ ...f, bodyRegion: e.target.value }))} style={fieldStyle} />
            </div>
            <div>
              <span style={labelStyle}>Population (optional)</span>
              <input placeholder="in-season, youth..." value={form.population} onChange={(e) => setForm((f) => ({ ...f, population: e.target.value }))} style={fieldStyle} />
            </div>
          </div>

          <div>
            <span style={labelStyle}>Tags (comma-separated)</span>
            <input placeholder="strength, soccer, knee, in-season..." value={form.tagsRaw} onChange={(e) => setForm((f) => ({ ...f, tagsRaw: e.target.value }))} style={fieldStyle} />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving || !form.content.trim()}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
              style={{ background: "hsl(199 89% 48%)", color: "#fff" }}
            >
              {saving ? "Saving…" : editingId !== null ? "Save Changes" : "Add Entry"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-400 transition-all"
              style={{ background: "hsl(222 47% 16%)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Entries list */}
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading entries…</div>
      ) : filtered.length === 0 ? (
        <div className="text-zinc-600 text-sm py-8 text-center">
          {entries.length === 0 ? "No entries yet — add your first coaching rule or philosophy note." : "No entries match the filter."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl p-4"
              style={{
                background: "hsl(222 47% 10%)",
                border: `1px solid ${entry.isActive ? "hsl(222 47% 18%)" : "hsl(222 47% 13%)"}`,
                opacity: entry.isActive ? 1 : 0.5,
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: TYPE_COLORS[entry.type] + "22", color: TYPE_COLORS[entry.type], border: `1px solid ${TYPE_COLORS[entry.type]}44` }}
                >
                  {TYPE_LABELS[entry.type]}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-zinc-200 text-sm leading-relaxed">{entry.content}</p>

                  <div className="flex flex-wrap gap-2 mt-2">
                    {entry.sport && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(199 89% 15%)", color: "hsl(199 89% 65%)" }}>
                        ⚽ {entry.sport}
                      </span>
                    )}
                    {entry.goal && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(142 50% 12%)", color: "hsl(142 60% 55%)" }}>
                        🎯 {entry.goal}
                      </span>
                    )}
                    {entry.bodyRegion && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(0 50% 12%)", color: "hsl(0 60% 65%)" }}>
                        🦴 {entry.bodyRegion}
                      </span>
                    )}
                    {(entry.tags as string[]).map((tag) => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded text-zinc-500" style={{ background: "hsl(222 47% 16%)" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(entry)}
                    title={entry.isActive ? "Deactivate" : "Activate"}
                    className="text-xs px-2 py-1 rounded transition-all"
                    style={{
                      background: entry.isActive ? "hsl(142 50% 12%)" : "hsl(222 47% 16%)",
                      color: entry.isActive ? "hsl(142 60% 55%)" : "hsl(0 0% 45%)",
                    }}
                  >
                    {entry.isActive ? "Active" : "Off"}
                  </button>
                  <button onClick={() => openEdit(entry)} className="text-zinc-500 hover:text-zinc-200 text-xs transition-colors px-1">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className="text-zinc-600 hover:text-red-400 text-xs transition-colors px-1">
                    Del
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Research Dashboard Component ────────────────────────────────────────────

interface ResearchDoc {
  id: number;
  title: string;
  authors: string | null;
  year: number | null;
  source: string;
  journal: string | null;
  category: string;
  topicTags: string[];
  trustLevel: "gold" | "high" | "supporting";
  confidence: string;
  evidenceType: string | null;
  status: "pending" | "approved" | "rejected" | "archived";
  isActive: boolean;
  isFoundational: boolean;
  plainLanguageSummary: string | null;
  coachingImplications: string | null;
  programmingImplications: string | null;
  safetyConsiderations: string | null;
  limitations: string | null;
  contraindications: string | null;
  abstract: string | null;
  librarianRecommendation: "approve" | "reject" | "needs_review" | null;
  librarianAdminNotes: string | null;
  warningFlags: string[] | null;
  doi: string | null;
  url: string | null;
  createdAt: string;
  lastReviewedAt: string | null;
}

interface LibrarianResult {
  recommendation: "approve" | "reject" | "needs_review";
  confidence: string;
  evidenceType: string;
  trustLevel: string;
  plainLanguageSummary: string;
  coachingImplications: string[];
  programmingImplications: string[];
  safetyConsiderations: string[];
  contraindications: string[];
  limitations: string[];
  whatThisDoesNotProve: string[];
  topicTags: string[];
  populationTags: string[];
  sportTags: string[];
  goalTags: string[];
  retrievalChunks: { chunkText: string; topicTags: string[]; confidence: string }[];
  adminNotes: string;
  warningFlags: string[];
}

interface CandidateForm {
  title: string;
  authors: string;
  year: string;
  source: string;
  journal: string;
  url: string;
  abstract: string;
  category: string;
}

interface ResearchStats {
  total: number;
  approved: number;
  chunks: number;
  byCategory: { category: string; count: string }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  strength_conditioning: "Strength & Conditioning",
  medical_rehab: "Medical / Rehab",
  nutrition: "Nutrition",
  recovery_wellness: "Recovery & Wellness",
  sport_performance: "Sport Performance",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "hsl(40 80% 12%)", text: "hsl(40 90% 60%)" },
  approved: { bg: "hsl(142 50% 12%)", text: "hsl(142 60% 55%)" },
  rejected: { bg: "hsl(0 50% 12%)", text: "hsl(0 60% 60%)" },
  archived: { bg: "hsl(222 47% 16%)", text: "hsl(0 0% 45%)" },
};

const TRUST_COLORS: Record<string, string> = {
  gold: "hsl(40 90% 55%)",
  high: "hsl(142 60% 50%)",
  supporting: "hsl(199 70% 55%)",
};

const RECOMMENDATION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  approve: { bg: "hsl(142 50% 11%)", text: "hsl(142 60% 55%)", label: "Approve" },
  reject: { bg: "hsl(0 50% 11%)", text: "hsl(0 60% 60%)", label: "Reject" },
  needs_review: { bg: "hsl(270 50% 13%)", text: "hsl(270 60% 65%)", label: "Needs Review" },
};

const CONFIDENCE_COLORS: Record<string, string> = {
  strong: "hsl(142 60% 50%)",
  moderate: "hsl(199 70% 55%)",
  limited: "hsl(40 90% 60%)",
  conflicting: "hsl(0 60% 60%)",
};

const WARNING_FLAG_LABELS: Record<string, string> = {
  old_evidence: "Old Evidence",
  single_study: "Single Study",
  population_mismatch: "Pop. Mismatch",
  overclaim_risk: "Overclaim Risk",
  medical_claim_risk: "Medical Claim",
  supplement_claim_risk: "Supplement Claim",
  low_quality_source: "Low Quality Source",
  conflicting_evidence: "Conflicting Evidence",
  no_abstract: "No Abstract",
  unknown_source: "Unknown Source",
};

const EVIDENCE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  meta_analysis: { label: "Meta-Analysis", color: "hsl(142 60% 50%)" },
  systematic_review: { label: "Systematic Review", color: "hsl(142 50% 45%)" },
  position_stand: { label: "Position Stand", color: "hsl(199 70% 55%)" },
  consensus_statement: { label: "Consensus", color: "hsl(199 70% 55%)" },
  clinical_practice_guideline: { label: "Guideline", color: "hsl(199 70% 55%)" },
  guideline: { label: "Guideline", color: "hsl(199 70% 55%)" },
  rct: { label: "RCT", color: "hsl(40 90% 60%)" },
  randomized_trial: { label: "RCT", color: "hsl(40 90% 60%)" },
  cohort_study: { label: "Cohort Study", color: "hsl(0 0% 55%)" },
  prospective_study: { label: "Prospective", color: "hsl(0 0% 55%)" },
  review: { label: "Review", color: "hsl(0 0% 50%)" },
  expert_consensus: { label: "Expert Consensus", color: "hsl(270 50% 60%)" },
  observational_study: { label: "Observational", color: "hsl(0 0% 45%)" },
  case_study: { label: "Case Study", color: "hsl(0 0% 40%)" },
};

function inferEvidenceLabel(publicationTypes: string[]): { label: string; color: string } | null {
  const types = publicationTypes.map((t) => t.toLowerCase());
  if (types.some((t) => t.includes("meta") || t.includes("meta-analysis"))) return EVIDENCE_TYPE_LABELS.meta_analysis;
  if (types.some((t) => t.includes("systematic"))) return EVIDENCE_TYPE_LABELS.systematic_review;
  if (types.some((t) => t.includes("position stand"))) return EVIDENCE_TYPE_LABELS.position_stand;
  if (types.some((t) => t.includes("consensus"))) return EVIDENCE_TYPE_LABELS.consensus_statement;
  if (types.some((t) => t.includes("guideline"))) return EVIDENCE_TYPE_LABELS.guideline;
  if (types.some((t) => t.includes("randomized") || t.includes("randomised") || t.includes("rct") || t.includes("clinical trial"))) return EVIDENCE_TYPE_LABELS.rct;
  if (types.some((t) => t.includes("cohort"))) return EVIDENCE_TYPE_LABELS.cohort_study;
  if (types.some((t) => t.includes("review"))) return EVIDENCE_TYPE_LABELS.review;
  if (types.length > 0) return { label: publicationTypes[0], color: "hsl(0 0% 45%)" };
  return null;
}

// ─── Discovery Pipeline Types ─────────────────────────────────────────────────

interface DiscoveryRun {
  id: number;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  source: string | null;
  querySet: string[];
  candidatesFound: number;
  candidatesStored: number;
  duplicatesSkipped: number;
  librarianReviewed: number;
  approvedSuggested: number;
  needsReview: number;
  rejected: number;
  errors: string[];
}

interface PaperCandidate {
  id: number;
  title: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  pubmedId: string | null;
  semanticScholarId: string | null;
  abstract: string | null;
  sourceUrl: string | null;
  sourceApi: string | null;
  category: string;
  discoveryQuery: string | null;
  citationCount: number | null;
  publicationTypes: string[];
  discoveredAt: string;
  status: "discovered" | "librarian_reviewed" | "pending_admin" | "rejected" | "approved";
  librarianRecommendation: "approve" | "reject" | "needs_review" | null;
  trustLevel: string | null;
  confidence: string | null;
  warningFlags: string[] | null;
  librarianNotes: string | null;
}

const CANDIDATE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  discovered: { bg: "hsl(222 47% 14%)", text: "hsl(0 0% 55%)" },
  librarian_reviewed: { bg: "hsl(270 50% 14%)", text: "hsl(270 60% 65%)" },
  pending_admin: { bg: "hsl(40 80% 12%)", text: "hsl(40 90% 60%)" },
  rejected: { bg: "hsl(0 50% 12%)", text: "hsl(0 60% 60%)" },
  approved: { bg: "hsl(142 50% 12%)", text: "hsl(142 60% 55%)" },
};

const SOURCE_API_LABELS: Record<string, string> = {
  pubmed: "PubMed",
  semantic_scholar: "Semantic Scholar",
};

// ─── Discovery Panel Component ────────────────────────────────────────────────

function DiscoveryPanel() {
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [candidates, setCandidates] = useState<PaperCandidate[]>([]);
  const [candidateStats, setCandidateStats] = useState<{ status: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ stats: DiscoveryRun; durationMs: number } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("pending_admin");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterRecommendation, setFilterRecommendation] = useState<string>("all");

  const fieldStyle = {
    background: "hsl(222 47% 9%)",
    border: "1px solid hsl(222 47% 22%)",
    color: "#fff",
    borderRadius: "8px",
    padding: "6px 10px",
    fontSize: "13px",
    outline: "none",
  };

  async function loadAll() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (filterRecommendation !== "all") params.set("recommendation", filterRecommendation);
      params.set("limit", "100");

      const [runsData, candidatesData] = await Promise.all([
        apiFetch<{ runs: DiscoveryRun[] }>("/api/admin/research/discovery/runs"),
        apiFetch<{ candidates: PaperCandidate[]; byStatus: { status: string; count: number }[] }>(
          `/api/admin/research/candidates?${params}`
        ),
      ]);
      setRuns(runsData.runs);
      setCandidates(candidatesData.candidates);
      setCandidateStats(candidatesData.byStatus);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [filterStatus, filterCategory, filterRecommendation]);

  async function handleRunDiscovery() {
    setRunning(true);
    setError(null);
    setRunResult(null);
    try {
      const result = await apiFetch<{
        ok: boolean;
        runId: number;
        status: string;
        durationMs: number;
        stats: DiscoveryRun;
      }>("/api/admin/research/discovery/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setRunResult({ stats: result.stats, durationMs: result.durationMs });
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleApprove(id: number) {
    setActionLoading(id);
    setError(null);
    try {
      await apiFetch(`/api/admin/research/candidates/${id}/approve`, { method: "POST" });
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: number) {
    setActionLoading(id);
    setError(null);
    try {
      await apiFetch(`/api/admin/research/candidates/${id}/reject`, { method: "POST" });
      await loadAll();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionLoading(null);
    }
  }

  const lastRun = runs[0] ?? null;
  const pendingAdminCount = candidateStats.find((s) => s.status === "pending_admin")?.count ?? 0;
  const totalCandidates = candidateStats.reduce((sum, s) => sum + Number(s.count), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-white">Research Discovery Pipeline</h2>
          <p className="text-zinc-500 text-xs mt-0.5">
            Automated PubMed + Semantic Scholar search → Librarian evaluation → Admin approval
          </p>
          <p className="text-zinc-600 text-xs mt-1">
            No paper becomes retrievable by the Coach without Librarian evaluation + admin approval.
          </p>
        </div>
        <button
          onClick={handleRunDiscovery}
          disabled={running}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-40 shrink-0"
          style={{ background: "hsl(199 89% 48%)", color: "#fff" }}
        >
          {running ? "Running Discovery…" : "Run Discovery Now"}
        </button>
      </div>

      {/* Running indicator */}
      {running && (
        <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "hsl(199 89% 8%)", border: "1px solid hsl(199 89% 20%)" }}>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "hsl(199 89% 48%)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "hsl(199 89% 60%)" }}>Discovery running…</p>
            <p className="text-xs text-zinc-500 mt-0.5">Searching PubMed and Semantic Scholar across 21 query categories. Librarian review follows. This may take 3–8 minutes.</p>
          </div>
        </div>
      )}

      {/* Run result */}
      {runResult && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "hsl(142 50% 8%)", border: "1px solid hsl(142 50% 18%)" }}>
          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "hsl(142 60% 55%)" }}>
            Discovery Complete — {(runResult.durationMs / 1000).toFixed(0)}s
          </p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Found", value: (runResult.stats as any).candidatesFound ?? 0 },
              { label: "Stored", value: (runResult.stats as any).candidatesStored ?? 0 },
              { label: "Duplicates", value: (runResult.stats as any).duplicatesSkipped ?? 0 },
              { label: "Librarian", value: (runResult.stats as any).librarianReviewed ?? 0 },
              { label: "Suggested", value: (runResult.stats as any).approvedSuggested ?? 0 },
              { label: "Rejected", value: (runResult.stats as any).rejected ?? 0 },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-zinc-500 text-xs">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last run summary */}
      {lastRun && !runResult && (
        <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 18%)" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Last Run</span>
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{
                background: lastRun.status === "completed" ? "hsl(142 50% 12%)" : lastRun.status === "failed" ? "hsl(0 50% 12%)" : "hsl(222 47% 14%)",
                color: lastRun.status === "completed" ? "hsl(142 60% 55%)" : lastRun.status === "failed" ? "hsl(0 60% 60%)" : "hsl(0 0% 60%)",
              }}
            >
              {lastRun.status}
            </span>
            <span className="text-zinc-600 text-xs ml-auto">
              {new Date(lastRun.startedAt).toLocaleString()}
            </span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Found", value: lastRun.candidatesFound },
              { label: "Stored", value: lastRun.candidatesStored },
              { label: "Dupes Skipped", value: lastRun.duplicatesSkipped },
              { label: "Librarian", value: lastRun.librarianReviewed },
              { label: "Suggested Approve", value: lastRun.approvedSuggested },
              { label: "Rejected", value: lastRun.rejected },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-sm font-bold text-white">{value}</p>
                <p className="text-zinc-500 text-xs">{label}</p>
              </div>
            ))}
          </div>
          {lastRun.errors.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid hsl(222 47% 16%)" }}>
              <p className="text-xs text-zinc-600">Errors: {lastRun.errors.slice(0, 3).join("; ")}{lastRun.errors.length > 3 ? ` +${lastRun.errors.length - 3} more` : ""}</p>
            </div>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
          <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Total Candidates</p>
          <p className="text-2xl font-bold text-white">{totalCandidates}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(40 80% 20%)" }}>
          <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Pending Admin</p>
          <p className="text-2xl font-bold" style={{ color: "hsl(40 90% 60%)" }}>{pendingAdminCount}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(142 50% 16%)" }}>
          <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Approved</p>
          <p className="text-2xl font-bold" style={{ color: "hsl(142 60% 55%)" }}>
            {candidateStats.find((s) => s.status === "approved")?.count ?? 0}
          </p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(0 50% 16%)" }}>
          <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Rejected</p>
          <p className="text-2xl font-bold" style={{ color: "hsl(0 60% 60%)" }}>
            {candidateStats.find((s) => s.status === "rejected")?.count ?? 0}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...fieldStyle, paddingRight: "28px" }}>
          <option value="all">All statuses</option>
          <option value="discovered">Discovered</option>
          <option value="librarian_reviewed">Librarian Reviewed</option>
          <option value="pending_admin">Pending Admin</option>
          <option value="rejected">Rejected</option>
          <option value="approved">Approved</option>
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} style={{ ...fieldStyle, paddingRight: "28px" }}>
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={filterRecommendation} onChange={(e) => setFilterRecommendation(e.target.value)} style={{ ...fieldStyle, paddingRight: "28px" }}>
          <option value="all">All recommendations</option>
          <option value="approve">Librarian: Approve</option>
          <option value="needs_review">Librarian: Needs Review</option>
          <option value="reject">Librarian: Reject</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg text-red-400 text-sm" style={{ background: "hsl(0 50% 10%)", border: "1px solid hsl(0 50% 20%)" }}>
          {error}
        </div>
      )}

      {/* Candidate list */}
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading candidates…</div>
      ) : candidates.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-zinc-400 text-sm mb-2">No candidates found.</p>
          <p className="text-zinc-600 text-xs">Click "Run Discovery Now" to search PubMed and Semantic Scholar for new papers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((c) => {
            const statusStyle = CANDIDATE_STATUS_COLORS[c.status] ?? CANDIDATE_STATUS_COLORS.discovered;
            const isExpanded = expandedId === c.id;
            const isWorking = actionLoading === c.id;
            const canAct = c.status === "pending_admin" || c.status === "discovered" || c.status === "librarian_reviewed";

            return (
              <div
                key={c.id}
                className="rounded-xl"
                style={{
                  background: "hsl(222 47% 10%)",
                  border: `1px solid ${c.status === "rejected" ? "hsl(222 47% 13%)" : c.status === "approved" ? "hsl(142 50% 16%)" : "hsl(222 47% 18%)"}`,
                  opacity: c.status === "rejected" ? 0.5 : 1,
                }}
              >
                <div className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.text}33` }}
                      >
                        {c.status.replace(/_/g, " ")}
                      </span>
                      {c.librarianRecommendation && (() => {
                        const rc = RECOMMENDATION_COLORS[c.librarianRecommendation];
                        return rc ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.text}33` }}>
                            AI: {rc.label}
                          </span>
                        ) : null;
                      })()}
                      {c.trustLevel && c.trustLevel !== "reject" && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: TRUST_COLORS[c.trustLevel] ?? "#fff", background: (TRUST_COLORS[c.trustLevel] ?? "#fff") + "18" }}>
                          {c.trustLevel} trust
                        </span>
                      )}
                      {c.confidence && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: CONFIDENCE_COLORS[c.confidence] ?? "#aaa", background: (CONFIDENCE_COLORS[c.confidence] ?? "#888") + "22" }}>
                          {c.confidence}
                        </span>
                      )}
                      {c.sourceApi && (
                        <span className="text-xs px-1.5 py-0.5 rounded text-zinc-500" style={{ background: "hsl(222 47% 14%)" }}>
                          {SOURCE_API_LABELS[c.sourceApi] ?? c.sourceApi}
                        </span>
                      )}
                      {c.citationCount != null && c.citationCount > 0 && (
                        <span className="text-xs text-zinc-600">↗ {c.citationCount} citations</span>
                      )}
                    </div>

                    {/* Warning flags */}
                    {c.warningFlags && c.warningFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {c.warningFlags.map((f) => (
                          <span key={f} className="text-xs px-1 py-0.5 rounded" style={{ background: "hsl(40 80% 10%)", color: "hsl(40 90% 55%)" }}>
                            {WARNING_FLAG_LABELS[f] ?? f}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-zinc-100 text-sm font-medium leading-snug">{c.title}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">
                      {c.authors}{c.year ? ` (${c.year})` : ""}
                      {c.journal ? ` — ${c.journal}` : ""}
                      {c.doi ? (
                        <> · <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300 transition-colors">DOI: {c.doi}</a></>
                      ) : c.sourceUrl ? (
                        <> · <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300 transition-colors">View source ↗</a></>
                      ) : null}
                    </p>

                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(199 89% 12%)", color: "hsl(199 89% 60%)" }}>
                        {CATEGORY_LABELS[c.category] ?? c.category}
                      </span>
                      {(() => {
                        const ev = inferEvidenceLabel(c.publicationTypes ?? []);
                        return ev ? (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: ev.color, background: ev.color + "18", border: `1px solid ${ev.color}33` }}>
                            {ev.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="text-xs px-2 py-1 rounded transition-all"
                      style={{ background: "hsl(222 47% 16%)", color: "hsl(0 0% 60%)" }}
                    >
                      {isExpanded ? "Hide" : "View"}
                    </button>
                    {canAct && (
                      <>
                        <button
                          onClick={() => handleApprove(c.id)}
                          disabled={isWorking}
                          className="text-xs px-2 py-1 rounded font-medium transition-all disabled:opacity-40"
                          style={{ background: "hsl(142 50% 12%)", color: "hsl(142 60% 55%)" }}
                        >
                          {isWorking ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => handleReject(c.id)}
                          disabled={isWorking}
                          className="text-xs px-2 py-1 rounded font-medium transition-all disabled:opacity-40"
                          style={{ background: "hsl(0 50% 12%)", color: "hsl(0 60% 60%)" }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid hsl(222 47% 15%)" }}>
                    <div className="pt-3 space-y-3">
                      {c.abstract && (
                        <div>
                          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Abstract</p>
                          <p className="text-zinc-300 text-sm leading-relaxed">{c.abstract}</p>
                        </div>
                      )}
                      {c.librarianNotes && (
                        <div className="rounded-lg p-3 space-y-1" style={{ background: "hsl(270 30% 9%)", border: "1px solid hsl(270 50% 18%)" }}>
                          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "hsl(270 60% 65%)" }}>Librarian Notes</p>
                          <p className="text-zinc-300 text-xs leading-relaxed italic">{c.librarianNotes}</p>
                        </div>
                      )}
                      {c.sourceUrl && (
                        <p className="text-xs text-zinc-600">
                          Source: <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400 transition-colors">{c.sourceUrl}</a>
                        </p>
                      )}
                      {c.discoveryQuery && (
                        <p className="text-xs text-zinc-700">Query: {c.discoveryQuery}</p>
                      )}
                      {canAct && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleApprove(c.id)}
                            disabled={isWorking}
                            className="text-xs px-3 py-1.5 rounded font-medium transition-all disabled:opacity-40"
                            style={{ background: "hsl(142 50% 12%)", color: "hsl(142 60% 55%)", border: "1px solid hsl(142 50% 20%)" }}
                          >
                            {isWorking ? "…" : "Approve for Coach Agent"}
                          </button>
                          <button
                            onClick={() => handleReject(c.id)}
                            disabled={isWorking}
                            className="text-xs px-3 py-1.5 rounded font-medium transition-all disabled:opacity-40"
                            style={{ background: "hsl(0 50% 12%)", color: "hsl(0 60% 60%)", border: "1px solid hsl(0 50% 20%)" }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Safety reminder */}
      <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(222 47% 14%)" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-1">Safety Rule</p>
        <p className="text-zinc-600 text-xs leading-relaxed">
          No auto-discovered paper enters Coach retrieval without Librarian evaluation + admin approval.
          The pipeline creates candidates only. "Approve" creates the research document and activates it.
          "Reject" permanently discards the candidate without creating any document.
        </p>
      </div>
    </div>
  );
}

function ResearchDashboard() {
  const [subTab, setSubTab] = useState<"library" | "discovery">("library");

  const subTabStyle = (tab: "library" | "discovery") => ({
    padding: "5px 14px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer" as const,
    background: subTab === tab ? "hsl(199 89% 48%)" : "transparent",
    color: subTab === tab ? "#fff" : "hsl(0 0% 55%)",
    border: "none",
    transition: "all 0.15s",
  });

  return (
    <div className="space-y-6">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
          <button style={subTabStyle("library")} onClick={() => setSubTab("library")}>Research Library</button>
          <button style={subTabStyle("discovery")} onClick={() => setSubTab("discovery")}>Discovery Pipeline</button>
        </div>
        {subTab === "discovery" && (
          <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: "hsl(199 89% 12%)", color: "hsl(199 89% 60%)" }}>
            PubMed · Semantic Scholar · Crossref
          </span>
        )}
      </div>

      {subTab === "discovery" ? (
        <DiscoveryPanel />
      ) : (
        <ResearchLibraryPanel />
      )}
    </div>
  );
}

function ResearchLibraryPanel() {
  const [docs, setDocs] = useState<ResearchDoc[]>([]);
  const [stats, setStats] = useState<ResearchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);

  // ── Librarian state ────────────────────────────────────────────────────────
  const [librarianLoading, setLibrarianLoading] = useState<number | "batch" | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [showCandidatePanel, setShowCandidatePanel] = useState(false);
  const [candidateResult, setCandidateResult] = useState<LibrarianResult | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [candidateForm, setCandidateForm] = useState<CandidateForm>({
    title: "", authors: "", year: "", source: "", journal: "", url: "", abstract: "", category: "strength_conditioning",
  });

  const fieldStyle = {
    background: "hsl(222 47% 9%)",
    border: "1px solid hsl(222 47% 22%)",
    color: "#fff",
    borderRadius: "8px",
    padding: "6px 10px",
    fontSize: "13px",
    outline: "none",
  };

  async function loadAll() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterCategory !== "all") params.set("category", filterCategory);
      const [docsData, statsData] = await Promise.all([
        apiFetch<{ documents: ResearchDoc[] }>(`/api/admin/research?${params}`),
        apiFetch<ResearchStats>("/api/admin/research/stats"),
      ]);
      setDocs(docsData.documents);
      setStats(statsData);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, [filterStatus, filterCategory]);

  async function handleApprove(id: number) {
    setActionLoading(id);
    try {
      await apiFetch(`/api/admin/research/${id}/approve`, { method: "POST" });
      await loadAll();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  }

  async function handleReject(id: number) {
    setActionLoading(id);
    try {
      await apiFetch(`/api/admin/research/${id}/reject`, { method: "POST" });
      await loadAll();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  }

  async function handleToggle(doc: ResearchDoc) {
    setActionLoading(doc.id);
    try {
      await apiFetch(`/api/admin/research/${doc.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !doc.isActive }),
      });
      await loadAll();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  }

  async function handleToggleFoundational(doc: ResearchDoc) {
    setActionLoading(doc.id);
    try {
      await apiFetch(`/api/admin/research/${doc.id}/toggle-foundational`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFoundational: !doc.isFoundational }),
      });
      await loadAll();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  }

  async function handleResummarize(id: number) {
    setActionLoading(id);
    try {
      await apiFetch(`/api/admin/research/${id}/summarize`, { method: "POST" });
      await loadAll();
    } catch (e: any) { setError(e.message); }
    finally { setActionLoading(null); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this research document?")) return;
    try {
      await apiFetch(`/api/admin/research/${id}`, { method: "DELETE" });
      await loadAll();
    } catch (e: any) { setError(e.message); }
  }

  async function handleSeed(force = false) {
    setSeeding(true);
    try {
      const url = `/api/admin/research/seed${force ? "?force=true" : ""}`;
      const result = await apiFetch<{ ok: boolean; inserted: number; skipped: number }>(url, { method: "POST" });
      await loadAll();
      alert(`Seeded: ${result.inserted} inserted, ${result.skipped} skipped`);
    } catch (e: any) { setError(e.message); }
    finally { setSeeding(false); }
  }

  // ── Librarian handlers ─────────────────────────────────────────────────────

  async function handleLibrarianAnalyze(id: number) {
    setLibrarianLoading(id);
    setError(null);
    try {
      await apiFetch(`/api/admin/research/${id}/librarian/analyze`, { method: "POST" });
      await loadAll();
    } catch (e: any) { setError(e.message); }
    finally { setLibrarianLoading(null); }
  }

  async function handleLibrarianChunks(id: number) {
    setLibrarianLoading(id);
    setError(null);
    try {
      await apiFetch(`/api/admin/research/${id}/librarian/chunks`, { method: "POST" });
      await loadAll();
    } catch (e: any) { setError(e.message); }
    finally { setLibrarianLoading(null); }
  }

  async function handleBatchAnalyze() {
    if (selectedIds.size === 0) return;
    setLibrarianLoading("batch");
    setBatchStatus(null);
    setError(null);
    try {
      const result = await apiFetch<{ ok: boolean; results: { id: number; ok: boolean; recommendation?: string; error?: string }[] }>(
        "/api/admin/research/librarian/batch-analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        }
      );
      const succeeded = result.results.filter((r) => r.ok).length;
      const failed = result.results.filter((r) => !r.ok).length;
      setBatchStatus(`${succeeded} analyzed${failed > 0 ? `, ${failed} failed` : ""}`);
      setSelectedIds(new Set());
      await loadAll();
    } catch (e: any) { setError(e.message); }
    finally { setLibrarianLoading(null); }
  }

  async function handleCandidateReview() {
    if (!candidateForm.title || !candidateForm.source) return;
    setCandidateLoading(true);
    setCandidateResult(null);
    setCandidateError(null);
    try {
      const result = await apiFetch<{ ok: boolean; result: LibrarianResult }>(
        "/api/admin/research/librarian/review-candidate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: candidateForm.title,
            authors: candidateForm.authors || undefined,
            year: candidateForm.year ? parseInt(candidateForm.year, 10) : undefined,
            source: candidateForm.source,
            journal: candidateForm.journal || undefined,
            url: candidateForm.url || undefined,
            abstract: candidateForm.abstract || undefined,
            category: candidateForm.category,
          }),
        }
      );
      setCandidateResult(result.result);
    } catch (e: any) { setCandidateError(e.message); }
    finally { setCandidateLoading(false); }
  }

  function toggleSelectDoc(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === docs.length ? new Set() : new Set(docs.map((d) => d.id))
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Research Knowledge Base</h2>
          <p className="text-zinc-500 text-xs mt-0.5">
            Evidence-informed coaching notes retrieved during AI responses
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleSeed(false)}
            disabled={seeding}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            style={{ background: "hsl(142 50% 15%)", color: "hsl(142 60% 55%)", border: "1px solid hsl(142 50% 22%)" }}
          >
            {seeding ? "Seeding…" : "Seed Library"}
          </button>
          <button
            onClick={() => handleSeed(true)}
            disabled={seeding}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
            style={{ background: "hsl(222 47% 14%)", color: "hsl(0 0% 55%)", border: "1px solid hsl(222 47% 22%)" }}
          >
            Force Re-seed
          </button>
        </div>
      </div>

      {/* ── Research Librarian Panel ───────────────────────────────────────── */}
      <div className="rounded-xl overflow-hidden" style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(270 50% 22%)" }}>
        <button
          onClick={() => setShowCandidatePanel((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
          style={{ background: "transparent", border: "none", cursor: "pointer" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "hsl(270 60% 65%)" }}>Research Librarian Agent</span>
            <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: "hsl(270 50% 18%)", color: "hsl(270 60% 65%)" }}>Internal</span>
          </div>
          <span className="text-zinc-500 text-xs">{showCandidatePanel ? "▲ Hide" : "▼ Expand"}</span>
        </button>

        {showCandidatePanel && (
          <div className="px-4 pb-4 space-y-4" style={{ borderTop: "1px solid hsl(270 50% 18%)" }}>
            <div className="pt-3">
              <p className="text-zinc-400 text-xs mb-3 leading-relaxed">
                The Research Librarian Agent evaluates source quality, assigns confidence &amp; evidence type, extracts coaching implications, and generates retrieval chunks. It never auto-approves — admin approval is always required.
              </p>

              {/* Batch Analyze */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs px-2 py-1 rounded transition-all"
                  style={{ background: "hsl(222 47% 16%)", color: "hsl(0 0% 55%)", border: "1px solid hsl(222 47% 22%)" }}
                >
                  {selectedIds.size === docs.length && docs.length > 0 ? "Deselect All" : "Select All"}
                </button>
                {selectedIds.size > 0 && (
                  <>
                    <span className="text-zinc-500 text-xs">{selectedIds.size} selected</span>
                    <button
                      onClick={handleBatchAnalyze}
                      disabled={librarianLoading === "batch"}
                      className="text-xs px-3 py-1 rounded font-medium transition-all disabled:opacity-40"
                      style={{ background: "hsl(270 50% 18%)", color: "hsl(270 60% 65%)", border: "1px solid hsl(270 50% 26%)" }}
                    >
                      {librarianLoading === "batch" ? "Analyzing…" : `Batch Analyze ${selectedIds.size}`}
                    </button>
                  </>
                )}
                {batchStatus && <span className="text-xs text-zinc-400">{batchStatus}</span>}
              </div>

              {/* Candidate Review Form */}
              <div className="rounded-lg p-3 space-y-3" style={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(222 47% 16%)" }}>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Review Candidate Source</p>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Title *" value={candidateForm.title} onChange={(e) => setCandidateForm((f) => ({ ...f, title: e.target.value }))} style={{ ...fieldStyle, fontSize: "12px" }} />
                  <input placeholder="Source / Publisher *" value={candidateForm.source} onChange={(e) => setCandidateForm((f) => ({ ...f, source: e.target.value }))} style={{ ...fieldStyle, fontSize: "12px" }} />
                  <input placeholder="Authors" value={candidateForm.authors} onChange={(e) => setCandidateForm((f) => ({ ...f, authors: e.target.value }))} style={{ ...fieldStyle, fontSize: "12px" }} />
                  <input placeholder="Year" value={candidateForm.year} onChange={(e) => setCandidateForm((f) => ({ ...f, year: e.target.value }))} style={{ ...fieldStyle, fontSize: "12px" }} />
                  <input placeholder="Journal" value={candidateForm.journal} onChange={(e) => setCandidateForm((f) => ({ ...f, journal: e.target.value }))} style={{ ...fieldStyle, fontSize: "12px" }} />
                  <input placeholder="URL or DOI" value={candidateForm.url} onChange={(e) => setCandidateForm((f) => ({ ...f, url: e.target.value }))} style={{ ...fieldStyle, fontSize: "12px" }} />
                </div>
                <textarea
                  placeholder="Abstract (paste the abstract here for best results)"
                  value={candidateForm.abstract}
                  onChange={(e) => setCandidateForm((f) => ({ ...f, abstract: e.target.value }))}
                  rows={3}
                  style={{ ...fieldStyle, fontSize: "12px", width: "100%", resize: "vertical" }}
                />
                <div className="flex items-center gap-2">
                  <select value={candidateForm.category} onChange={(e) => setCandidateForm((f) => ({ ...f, category: e.target.value }))} style={{ ...fieldStyle, fontSize: "12px" }}>
                    {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <button
                    onClick={handleCandidateReview}
                    disabled={candidateLoading || !candidateForm.title || !candidateForm.source}
                    className="text-xs px-3 py-1.5 rounded font-medium transition-all disabled:opacity-40"
                    style={{ background: "hsl(270 50% 18%)", color: "hsl(270 60% 65%)", border: "1px solid hsl(270 50% 26%)" }}
                  >
                    {candidateLoading ? "Reviewing…" : "Review with Librarian"}
                  </button>
                </div>

                {candidateError && <p className="text-red-400 text-xs">{candidateError}</p>}

                {/* Candidate result */}
                {candidateResult && (
                  <div className="rounded-lg p-3 space-y-2 mt-2" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(() => {
                        const rc = RECOMMENDATION_COLORS[candidateResult.recommendation];
                        return rc ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: rc.bg, color: rc.text }}>{rc.label}</span> : null;
                      })()}
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: CONFIDENCE_COLORS[candidateResult.confidence] ?? "#fff", background: (CONFIDENCE_COLORS[candidateResult.confidence] ?? "#888") + "22" }}>
                        {candidateResult.confidence}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded text-zinc-400" style={{ background: "hsl(222 47% 16%)" }}>
                        {candidateResult.evidenceType?.replace(/_/g, " ")}
                      </span>
                    </div>
                    {candidateResult.warningFlags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {candidateResult.warningFlags.map((f) => (
                          <span key={f} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(40 80% 10%)", color: "hsl(40 90% 55%)" }}>
                            {WARNING_FLAG_LABELS[f] ?? f}
                          </span>
                        ))}
                      </div>
                    )}
                    {candidateResult.plainLanguageSummary && <p className="text-zinc-300 text-xs leading-relaxed">{candidateResult.plainLanguageSummary}</p>}
                    {candidateResult.adminNotes && <p className="text-zinc-500 text-xs italic">{candidateResult.adminNotes}</p>}
                    {candidateResult.coachingImplications?.length > 0 && (
                      <div>
                        <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Coaching Implications</p>
                        <ul className="space-y-0.5">
                          {candidateResult.coachingImplications.map((c, i) => <li key={i} className="text-zinc-300 text-xs">• {c}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
            <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Total Documents</p>
            <p className="text-2xl font-bold text-white">{stats.total}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
            <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Active & Approved</p>
            <p className="text-2xl font-bold" style={{ color: "hsl(142 60% 55%)" }}>{stats.approved}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
            <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Retrieval Chunks</p>
            <p className="text-2xl font-bold text-white">{stats.chunks}</p>
          </div>
          <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
            <p className="text-zinc-500 text-xs uppercase tracking-wide mb-1">Categories</p>
            <p className="text-2xl font-bold text-white">{stats.byCategory.length}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ ...fieldStyle, paddingRight: "28px" }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{ ...fieldStyle, paddingRight: "28px" }}
        >
          <option value="all">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg text-red-400 text-sm" style={{ background: "hsl(0 50% 10%)", border: "1px solid hsl(0 50% 20%)" }}>
          {error}
        </div>
      )}

      {/* Documents list */}
      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading research documents…</div>
      ) : docs.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: "hsl(222 47% 10%)", border: "1px solid hsl(222 47% 16%)" }}>
          <p className="text-zinc-400 text-sm mb-2">No research documents found.</p>
          <p className="text-zinc-600 text-xs">Click "Seed Library" to load curated evidence-based research notes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => {
            const statusStyle = STATUS_COLORS[doc.status] ?? STATUS_COLORS.pending;
            const isExpanded = expandedId === doc.id;
            const isWorking = actionLoading === doc.id;
            return (
              <div
                key={doc.id}
                className="rounded-xl"
                style={{
                  background: "hsl(222 47% 10%)",
                  border: `1px solid ${doc.isActive ? "hsl(222 47% 18%)" : "hsl(222 47% 13%)"}`,
                  opacity: doc.status === "rejected" ? 0.5 : 1,
                }}
              >
                {/* Row */}
                <div className="p-4 flex items-start gap-3">
                  {/* Batch select checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.has(doc.id)}
                    onChange={() => toggleSelectDoc(doc.id)}
                    className="mt-1 shrink-0 cursor-pointer"
                    style={{ accentColor: "hsl(270 60% 65%)" }}
                  />
                  <div className="flex-1 min-w-0">
                    {/* Title & badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: statusStyle.bg, color: statusStyle.text, border: `1px solid ${statusStyle.text}33` }}
                      >
                        {doc.status}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ color: TRUST_COLORS[doc.trustLevel] ?? "#fff", background: (TRUST_COLORS[doc.trustLevel] ?? "#fff") + "18" }}
                      >
                        {doc.trustLevel} trust
                      </span>
                      {doc.evidenceType && (() => {
                        const ev = EVIDENCE_TYPE_LABELS[doc.evidenceType];
                        return ev ? (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: ev.color, background: ev.color + "18", border: `1px solid ${ev.color}33` }}>
                            {ev.label}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-500 px-1.5 py-0.5 rounded" style={{ background: "hsl(222 47% 14%)" }}>
                            {doc.evidenceType.replace(/_/g, " ")}
                          </span>
                        );
                      })()}
                      {doc.isFoundational && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ color: "hsl(40 90% 60%)", background: "hsl(40 80% 10%)", border: "1px solid hsl(40 80% 22%)" }}>
                          ★ Foundational
                        </span>
                      )}
                      {doc.librarianRecommendation && (() => {
                        const rc = RECOMMENDATION_COLORS[doc.librarianRecommendation];
                        return rc ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.text}33` }}>
                            AI: {rc.label}
                          </span>
                        ) : null;
                      })()}
                      {doc.confidence && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: CONFIDENCE_COLORS[doc.confidence] ?? "#aaa", background: (CONFIDENCE_COLORS[doc.confidence] ?? "#888") + "22" }}>
                          {doc.confidence}
                        </span>
                      )}
                    </div>
                    {/* Warning flags */}
                    {doc.warningFlags && doc.warningFlags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1">
                        {doc.warningFlags.map((f) => (
                          <span key={f} className="text-xs px-1 py-0.5 rounded" style={{ background: "hsl(40 80% 10%)", color: "hsl(40 90% 55%)" }}>
                            {WARNING_FLAG_LABELS[f] ?? f}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-zinc-100 text-sm font-medium leading-snug">{doc.title}</p>
                    {doc.authors && (
                      <p className="text-zinc-500 text-xs mt-0.5">
                        {doc.authors}{doc.year ? ` (${doc.year})` : ""} — {doc.source}
                        {doc.doi ? (
                          <> · <a href={`https://doi.org/${doc.doi}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300 transition-colors">DOI ↗</a></>
                        ) : doc.url ? (
                          <> · <a href={doc.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300 transition-colors">View ↗</a></>
                        ) : null}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "hsl(199 89% 12%)", color: "hsl(199 89% 60%)" }}>
                        {CATEGORY_LABELS[doc.category] ?? doc.category}
                      </span>
                      {(Array.isArray(doc.topicTags) ? doc.topicTags : []).slice(0, 4).map((tag) => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded text-zinc-500" style={{ background: "hsl(222 47% 16%)" }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-1.5 flex-wrap justify-end">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                      className="text-xs px-2 py-1 rounded transition-all"
                      style={{ background: "hsl(222 47% 16%)", color: "hsl(0 0% 60%)" }}
                    >
                      {isExpanded ? "Hide" : "View"}
                    </button>
                    {doc.status === "pending" && (
                      <>
                        <button
                          onClick={() => handleApprove(doc.id)}
                          disabled={isWorking}
                          className="text-xs px-2 py-1 rounded transition-all disabled:opacity-40"
                          style={{ background: "hsl(142 50% 12%)", color: "hsl(142 60% 55%)" }}
                        >
                          {isWorking ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => handleReject(doc.id)}
                          disabled={isWorking}
                          className="text-xs px-2 py-1 rounded transition-all disabled:opacity-40"
                          style={{ background: "hsl(0 50% 12%)", color: "hsl(0 60% 60%)" }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {doc.status === "approved" && (
                      <button
                        onClick={() => handleToggle(doc)}
                        disabled={isWorking}
                        className="text-xs px-2 py-1 rounded transition-all disabled:opacity-40"
                        style={{
                          background: doc.isActive ? "hsl(142 50% 12%)" : "hsl(222 47% 16%)",
                          color: doc.isActive ? "hsl(142 60% 55%)" : "hsl(0 0% 45%)",
                        }}
                      >
                        {doc.isActive ? "Active" : "Disabled"}
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleFoundational(doc)}
                      disabled={isWorking}
                      title={doc.isFoundational ? "Unmark as foundational" : "Mark as foundational (exempts from age penalty)"}
                      className="text-xs px-2 py-1 rounded transition-all disabled:opacity-40"
                      style={{
                        background: doc.isFoundational ? "hsl(40 80% 10%)" : "hsl(222 47% 16%)",
                        color: doc.isFoundational ? "hsl(40 90% 60%)" : "hsl(0 0% 40%)",
                        border: doc.isFoundational ? "1px solid hsl(40 80% 22%)" : "1px solid transparent",
                      }}
                    >
                      ★
                    </button>
                    <button
                      onClick={() => handleResummarize(doc.id)}
                      disabled={isWorking}
                      className="text-xs px-2 py-1 rounded transition-all disabled:opacity-40"
                      style={{ background: "hsl(270 50% 14%)", color: "hsl(270 60% 65%)" }}
                    >
                      {isWorking ? "…" : "Resummarize"}
                    </button>
                    <button
                      onClick={() => handleLibrarianAnalyze(doc.id)}
                      disabled={isWorking || librarianLoading === doc.id}
                      className="text-xs px-2 py-1 rounded transition-all disabled:opacity-40"
                      style={{ background: "hsl(270 50% 18%)", color: "hsl(270 60% 70%)", border: "1px solid hsl(270 50% 26%)" }}
                    >
                      {librarianLoading === doc.id ? "…" : "Librarian"}
                    </button>
                    <button
                      onClick={() => handleLibrarianChunks(doc.id)}
                      disabled={isWorking || librarianLoading === doc.id}
                      className="text-xs px-2 py-1 rounded transition-all disabled:opacity-40"
                      style={{ background: "hsl(222 47% 16%)", color: "hsl(0 0% 50%)" }}
                    >
                      Chunks
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-xs px-1 py-1 rounded text-zinc-600 hover:text-red-400 transition-colors"
                    >
                      Del
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid hsl(222 47% 15%)" }}>
                    <div className="pt-3 space-y-3">
                      {doc.plainLanguageSummary && (
                        <div>
                          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Summary</p>
                          <p className="text-zinc-300 text-sm leading-relaxed">{doc.plainLanguageSummary}</p>
                        </div>
                      )}
                      {doc.coachingImplications && (
                        <div>
                          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Coaching Implications</p>
                          <p className="text-zinc-300 text-sm leading-relaxed">{doc.coachingImplications}</p>
                        </div>
                      )}
                      {doc.programmingImplications && (
                        <div>
                          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Programming Implications</p>
                          <p className="text-zinc-300 text-sm leading-relaxed">{doc.programmingImplications}</p>
                        </div>
                      )}
                      {doc.safetyConsiderations && (
                        <div>
                          <p className="text-xs font-medium" style={{ color: "hsl(40 90% 55%)", textTransform: "uppercase", letterSpacing: "0.06em", fontSize: "11px", marginBottom: "4px" }}>Safety</p>
                          <p className="text-zinc-300 text-sm leading-relaxed">{doc.safetyConsiderations}</p>
                        </div>
                      )}
                      {doc.limitations && (
                        <div>
                          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Limitations</p>
                          <p className="text-zinc-500 text-sm leading-relaxed italic">{doc.limitations}</p>
                        </div>
                      )}
                      {!doc.plainLanguageSummary && doc.abstract && (
                        <div>
                          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1">Abstract</p>
                          <p className="text-zinc-400 text-sm leading-relaxed">{doc.abstract}</p>
                        </div>
                      )}
                      {!doc.plainLanguageSummary && !doc.abstract && (
                        <p className="text-zinc-600 text-sm italic">No summary yet — click "Resummarize" or "Librarian" to generate analysis.</p>
                      )}

                      {/* ── Librarian Agent Output ─────────────────────────────── */}
                      {(doc.librarianRecommendation || doc.librarianAdminNotes) && (
                        <div className="rounded-lg p-3 space-y-2 mt-2" style={{ background: "hsl(270 30% 9%)", border: "1px solid hsl(270 50% 18%)" }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "hsl(270 60% 65%)" }}>Librarian</span>
                            {doc.librarianRecommendation && (() => {
                              const rc = RECOMMENDATION_COLORS[doc.librarianRecommendation];
                              return rc ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: rc.bg, color: rc.text }}>{rc.label}</span> : null;
                            })()}
                          </div>
                          {doc.librarianAdminNotes && (
                            <p className="text-zinc-400 text-xs leading-relaxed italic">{doc.librarianAdminNotes}</p>
                          )}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {doc.librarianRecommendation === "approve" && doc.status === "pending" && (
                              <button
                                onClick={() => handleApprove(doc.id)}
                                className="text-xs px-2 py-1 rounded font-medium transition-all"
                                style={{ background: "hsl(142 50% 12%)", color: "hsl(142 60% 55%)" }}
                              >
                                Approve for Coach Agent
                              </button>
                            )}
                            {doc.librarianRecommendation === "reject" && doc.status !== "rejected" && (
                              <button
                                onClick={() => handleReject(doc.id)}
                                className="text-xs px-2 py-1 rounded font-medium transition-all"
                                style={{ background: "hsl(0 50% 12%)", color: "hsl(0 60% 60%)" }}
                              >
                                Reject
                              </button>
                            )}
                            {doc.status === "approved" && (
                              <button
                                onClick={() => handleToggle(doc)}
                                className="text-xs px-2 py-1 rounded font-medium transition-all"
                                style={{ background: doc.isActive ? "hsl(142 50% 12%)" : "hsl(222 47% 16%)", color: doc.isActive ? "hsl(142 60% 55%)" : "hsl(0 0% 45%)" }}
                              >
                                {doc.isActive ? "Disable from Retrieval" : "Enable Retrieval"}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  useNoIndex();
  const [, navigate] = useLocation();
  const { data: me, isLoading: meLoading } = useGetMe();

  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");
  const [range, setRange] = useState<DateRange>("30d");
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meLoading && !me) navigate("/login");
  }, [me, meLoading, navigate]);

  useEffect(() => {
    if (!me || activeTab !== "analytics") return;

    setLoading(true);
    setError(null);

    Promise.all([
      apiFetch<FunnelResponse>(`/api/admin/funnel?range=${range}`),
      apiFetch<AnalyticsResponse>(`/api/admin/analytics`),
      apiFetch<{ events: RecentEvent[] }>(`/api/admin/events?range=${range}&limit=50`),
    ])
      .then(([funnelData, analyticsData, eventsData]) => {
        setFunnel(funnelData);
        setAnalytics(analyticsData);
        setEvents(eventsData.events ?? []);
      })
      .catch((err) => setError(err.message ?? "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [me, range, activeTab]);

  if (meLoading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(222 47% 7%)" }}>
        <div className="text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  const tabStyle = (tab: AdminTab) => ({
    padding: "6px 16px",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    background: activeTab === tab ? "hsl(199 89% 48%)" : "transparent",
    color: activeTab === tab ? "#fff" : "hsl(0 0% 55%)",
    border: "none",
    transition: "all 0.15s",
  });

  return (
    <div className="min-h-screen text-white" style={{ background: "hsl(222 47% 7%)" }}>
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(222 47% 14%)" }}>
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-xl font-bold">TrainChat Admin</h1>
            <p className="text-zinc-500 text-xs mt-0.5">Platform management & coaching intelligence</p>
          </div>
          <div className="flex gap-1 rounded-lg p-1" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
            <button style={tabStyle("analytics")} onClick={() => setActiveTab("analytics")}>Analytics</button>
            <button style={tabStyle("knowledge")} onClick={() => setActiveTab("knowledge")}>Knowledge Base</button>
            <button style={tabStyle("research")} onClick={() => setActiveTab("research")}>Research</button>
          </div>
        </div>

        {activeTab === "analytics" && (
          <div className="flex gap-1 rounded-lg p-1" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
            {(["7d", "30d", "all"] as DateRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: range === r ? "hsl(199 89% 48%)" : "transparent",
                  color: range === r ? "#fff" : "hsl(0 0% 60%)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "All time"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto">
        {/* ── Knowledge Base Tab ── */}
        {activeTab === "knowledge" && <KnowledgeBase />}

        {/* ── Research Tab ── */}
        {activeTab === "research" && <ResearchDashboard />}

        {/* ── Analytics Tab ── */}
        {activeTab === "analytics" && (
          <div className="space-y-8">
            {error && (
              <div className="p-4 rounded-xl text-red-400 text-sm" style={{ background: "hsl(0 50% 10%)", border: "1px solid hsl(0 50% 20%)" }}>
                {error === "403 Forbidden"
                  ? "Access denied — your account is not an admin. Set ADMIN_EMAILS in environment variables."
                  : error}
              </div>
            )}

            {loading && (
              <div className="text-zinc-500 text-sm py-12 text-center">Loading analytics…</div>
            )}

            {!loading && analytics && (
              <>
                <section>
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Platform Overview</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard label="Total Users" value={analytics.users.total} sub={`+${analytics.users.newThisWeek} this week`} />
                    <StatCard label="Paid Users" value={analytics.users.paid} sub={`${analytics.users.conversionRate}% conversion`} />
                    <StatCard label="Total Messages" value={analytics.messages.total.toLocaleString()} sub={`${analytics.messages.thisWeek} this week`} />
                    <StatCard label="Programs Generated" value={analytics.programs.total} />
                  </div>

                  {analytics.planBreakdown.length > 0 && (
                    <div className="mt-3 rounded-xl p-4 flex flex-wrap gap-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
                      {analytics.planBreakdown.map((p) => (
                        <div key={p.plan} className="flex items-center gap-2">
                          <span className="capitalize text-zinc-300 text-sm">{p.plan}</span>
                          <span className="text-white font-bold text-sm">{p.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {funnel && (
                  <>
                    <section>
                      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Key Conversion Metrics</h2>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <StatCard label="Overall Conversion" value={`${funnel.summary.overallConversionPct}%`} sub="Landing → Signup" />
                        <StatCard label="Paywall → CTA" value={`${funnel.summary.paywallToCta}%`} sub="Paywall click-through" />
                        <StatCard label="Signup → Payment" value={`${funnel.summary.signupToPayment}%`} sub="Paid conversion" />
                        <StatCard label="Returning Guests" value={funnel.summary.guestReturned} sub="Returned before converting" />
                        <StatCard label="Follow-up Uses" value={funnel.summary.followupUsed} sub="Coach interactions" />
                        <StatCard label="AI Errors" value={funnel.summary.generationFailed} sub="Generation failures" />
                      </div>
                    </section>

                    <section>
                      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Acquisition Funnel</h2>
                      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(222 47% 18%)" }}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ background: "hsl(222 47% 11%)", borderBottom: "1px solid hsl(222 47% 18%)" }}>
                              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Step</th>
                              <th className="text-right px-4 py-3 text-zinc-500 font-medium w-24">Users</th>
                              <th className="px-4 py-3 text-zinc-500 font-medium w-44">Conversion</th>
                            </tr>
                          </thead>
                          <tbody>
                            {funnel.funnel.map((row, i) => (
                              <tr key={row.event} style={{ background: i % 2 === 0 ? "hsl(222 47% 8%)" : "hsl(222 47% 9%)", borderBottom: "1px solid hsl(222 47% 14%)" }}>
                                <td className="px-4 py-3 text-zinc-200">{row.step}</td>
                                <td className="px-4 py-3 text-right font-mono text-white font-semibold">{row.count.toLocaleString()}</td>
                                <td className="px-4 py-3">
                                  {row.conversionPct !== null ? <PctBar value={row.conversionPct} /> : <span className="text-zinc-600 text-xs">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    <section>
                      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Drop-off Analysis</h2>
                      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(222 47% 18%)" }}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ background: "hsl(222 47% 11%)", borderBottom: "1px solid hsl(222 47% 18%)" }}>
                              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Stage</th>
                              <th className="text-right px-4 py-3 text-zinc-500 font-medium w-24">Dropped</th>
                              <th className="px-4 py-3 text-zinc-500 font-medium w-44">Drop Rate</th>
                            </tr>
                          </thead>
                          <tbody>
                            {funnel.dropoff.map((row, i) => (
                              <tr key={row.stage} style={{ background: i % 2 === 0 ? "hsl(222 47% 8%)" : "hsl(222 47% 9%)", borderBottom: "1px solid hsl(222 47% 14%)" }}>
                                <td className="px-4 py-3 text-zinc-300">{row.stage}</td>
                                <td className="px-4 py-3 text-right font-mono text-zinc-200">{row.count.toLocaleString()}</td>
                                <td className="px-4 py-3">{row.count > 0 ? <PctBar value={row.pct} /> : <span className="text-zinc-600 text-xs">—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                )}

                {events.length > 0 && (
                  <section>
                    <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
                      Recent Events <span className="text-zinc-600 font-normal normal-case tracking-normal">({events.length})</span>
                    </h2>
                    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid hsl(222 47% 18%)" }}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ background: "hsl(222 47% 11%)", borderBottom: "1px solid hsl(222 47% 18%)" }}>
                              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Event</th>
                              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Device</th>
                              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Time</th>
                              <th className="text-left px-4 py-3 text-zinc-500 font-medium">Properties</th>
                            </tr>
                          </thead>
                          <tbody>
                            {events.map((ev, i) => (
                              <tr key={ev.id} style={{ background: i % 2 === 0 ? "hsl(222 47% 8%)" : "hsl(222 47% 9%)", borderBottom: "1px solid hsl(222 47% 13%)" }}>
                                <td className="px-4 py-2.5">
                                  <span className="inline-block px-2 py-0.5 rounded text-xs font-mono" style={{ background: "hsl(199 89% 15%)", color: "hsl(199 89% 65%)" }}>
                                    {ev.event}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">
                                  {ev.deviceId ? ev.deviceId.substring(0, 12) + "…" : ev.userId ? `user:${ev.userId}` : "—"}
                                </td>
                                <td className="px-4 py-2.5 text-xs text-zinc-500 whitespace-nowrap">{new Date(ev.createdAt).toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-xs text-zinc-600 max-w-xs truncate">{ev.properties ? JSON.stringify(ev.properties) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </section>
                )}

                <section>
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">A/B Testing</h2>
                  <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
                    <p className="text-zinc-300 text-sm mb-2">
                      A/B variant assignment is active. New guest sessions are randomly assigned <code className="text-blue-400">control</code> or <code className="text-blue-400">variant_a</code> (50/50).
                    </p>
                  </div>
                </section>

                <p className="text-zinc-700 text-xs text-center pb-4">
                  Data refreshed at {funnel ? new Date(funnel.generatedAt).toLocaleString() : new Date(analytics.generatedAt).toLocaleString()}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
