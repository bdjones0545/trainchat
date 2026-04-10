import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useGetMe } from "@workspace/api-client-react";

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
type AdminTab = "analytics" | "knowledge";

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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
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
