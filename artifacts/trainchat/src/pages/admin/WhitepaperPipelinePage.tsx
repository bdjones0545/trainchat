import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useNoIndex } from "@/hooks/useNoIndex";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Topic {
  id: number;
  title: string;
  slug: string;
  code: string;
  subtitle: string | null;
  thesis: string | null;
  targetAudience: string | null;
  status: "queued" | "drafting" | "needs_review" | "approved" | "published" | "rejected";
  scheduledFor: string | null;
  sortOrder: number;
  createdAt: string;
}

interface Publication {
  id: number;
  topicId: number | null;
  title: string;
  slug: string;
  code: string;
  subtitle: string | null;
  abstract: string | null;
  keywords: string[] | null;
  estimatedPages: string | null;
  status: "needs_review" | "approved" | "published" | "rejected";
  publishedAt: string | null;
  createdAt: string;
}

interface Settings {
  autoGenerate: boolean;
  autoPublish: boolean;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  drafting: "bg-blue-500/10 text-blue-400",
  needs_review: "bg-yellow-500/10 text-yellow-400",
  approved: "bg-green-500/10 text-green-400",
  published: "bg-primary/10 text-primary",
  rejected: "bg-red-500/10 text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-mono font-medium ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Add Topic Form ───────────────────────────────────────────────────────────

function AddTopicForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({
    title: "",
    slug: "",
    code: "",
    subtitle: "",
    thesis: "",
    targetAudience: "",
    scheduledFor: "",
  });

  function slugify(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function handleTitleChange(v: string) {
    setForm((f) => ({ ...f, title: v, slug: slugify(v) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.slug || !form.code) {
      setErr("Title, slug, and code are required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      await apiFetch("/api/admin/whitepapers/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          scheduledFor: form.scheduledFor || null,
        }),
      });
      setForm({ title: "", slug: "", code: "", subtitle: "", thesis: "", targetAudience: "", scheduledFor: "" });
      setOpen(false);
      onAdded();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-primary hover:underline border border-primary/20 rounded px-3 py-1.5"
      >
        + Add Topic
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
      <p className="text-xs font-semibold text-foreground">New Topic</p>
      {err && <p className="text-xs text-red-400">{err}</p>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Title *</label>
          <input
            className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary"
            value={form.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="The Case For Mutable Programs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Slug *</label>
          <input
            className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary"
            value={form.slug}
            onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            placeholder="the-case-for-mutable-programs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Code * (2-5 uppercase letters)</label>
          <input
            className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:border-primary uppercase"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="CMP"
            maxLength={5}
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Subtitle</label>
          <input
            className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary"
            value={form.subtitle}
            onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
            placeholder="Optional descriptive subtitle"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground">Core Thesis</label>
          <textarea
            className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary resize-none"
            rows={3}
            value={form.thesis}
            onChange={(e) => setForm((f) => ({ ...f, thesis: e.target.value }))}
            placeholder="What is the central argument this paper makes?"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Target Audience</label>
          <input
            className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary"
            value={form.targetAudience}
            onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value }))}
            placeholder="Researchers, coaches, engineers"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Scheduled For</label>
          <input
            type="date"
            className="w-full mt-0.5 bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:border-primary"
            value={form.scheduledFor}
            onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="text-xs font-semibold bg-primary text-primary-foreground rounded px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add to Queue"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Topic Row ─────────────────────────────────────────────────────────────────

function TopicRow({ topic, onRefresh }: { topic: Topic; onRefresh: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [err, setErr] = useState("");

  async function handleGenerate() {
    if (!confirm(`Generate whitepaper for "${topic.title}"? This will use OpenAI.`)) return;
    setGenerating(true);
    setErr("");
    try {
      await apiFetch(`/api/admin/whitepapers/topics/${topic.id}/generate`, { method: "POST" });
      setTimeout(() => { onRefresh(); setGenerating(false); }, 3000);
    } catch (e: any) {
      setErr(e.message);
      setGenerating(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete topic "${topic.title}"?`)) return;
    try {
      await apiFetch(`/api/admin/whitepapers/topics/${topic.id}`, { method: "DELETE" });
      onRefresh();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function handleReorder(dir: -1 | 1) {
    try {
      await apiFetch(`/api/admin/whitepapers/topics/${topic.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: topic.sortOrder + dir }),
      });
      onRefresh();
    } catch {}
  }

  const canGenerate = ["queued", "rejected"].includes(topic.status);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <div className="flex flex-col gap-0.5 mt-0.5">
          <button onClick={() => handleReorder(-1)} className="text-muted-foreground hover:text-foreground text-xs leading-none">▲</button>
          <button onClick={() => handleReorder(1)} className="text-muted-foreground hover:text-foreground text-xs leading-none">▼</button>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-primary">{topic.code}</span>
            <StatusBadge status={topic.status} />
            {topic.scheduledFor && (
              <span className="text-xs text-muted-foreground">Scheduled: {fmt(topic.scheduledFor)}</span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground mt-0.5">{topic.title}</p>
          {topic.subtitle && (
            <p className="text-xs text-muted-foreground">{topic.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Hide" : "Details"}
          </button>
          {canGenerate && (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate →"}
            </button>
          )}
          <button
            onClick={handleDelete}
            className="text-xs text-muted-foreground hover:text-red-400"
          >
            ✕
          </button>
        </div>
      </div>
      {err && <p className="text-xs text-red-400 px-3 pb-2">{err}</p>}
      {generating && (
        <p className="text-xs text-muted-foreground px-3 pb-2 italic">
          Generation started — check Publications tab in a minute.
        </p>
      )}
      {expanded && (
        <div className="border-t border-border bg-muted/10 p-3 space-y-2">
          {topic.thesis && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Thesis</p>
              <p className="text-xs text-foreground leading-relaxed">{topic.thesis}</p>
            </div>
          )}
          {topic.targetAudience && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Target Audience</p>
              <p className="text-xs text-foreground">{topic.targetAudience}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Added: {fmt(topic.createdAt)}</p>
        </div>
      )}
    </div>
  );
}

// ─── Publication Row ───────────────────────────────────────────────────────────

function PublicationRow({ pub, onRefresh }: { pub: Publication; onRefresh: () => void }) {
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState(false);
  const [err, setErr] = useState("");

  async function act(action: "approve" | "publish" | "reject") {
    const labels = { approve: "Approve", publish: "Publish", reject: "Reject" };
    if (!confirm(`${labels[action]} "${pub.title}"?`)) return;
    setActing(true);
    setErr("");
    try {
      await apiFetch(`/api/admin/whitepapers/publications/${pub.id}/${action}`, { method: "POST" });
      onRefresh();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-primary">{pub.code}</span>
            <StatusBadge status={pub.status} />
            {pub.publishedAt && (
              <span className="text-xs text-muted-foreground">Published: {fmt(pub.publishedAt)}</span>
            )}
            {!pub.publishedAt && (
              <span className="text-xs text-muted-foreground">Created: {fmt(pub.createdAt)}</span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground mt-0.5">{pub.title}</p>
          {pub.subtitle && (
            <p className="text-xs text-muted-foreground">{pub.subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Hide" : "Preview"}
          </button>
          {pub.status === "published" && (
            <button
              onClick={() => navigate(`/whitepapers/${pub.slug}`)}
              className="text-xs text-primary hover:underline"
            >
              View →
            </button>
          )}
          {pub.status === "needs_review" && (
            <>
              <button
                onClick={() => act("approve")}
                disabled={acting}
                className="text-xs font-semibold text-green-400 hover:underline disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => act("reject")}
                disabled={acting}
                className="text-xs text-red-400 hover:underline disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          {pub.status === "approved" && (
            <button
              onClick={() => act("publish")}
              disabled={acting}
              className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
            >
              Publish →
            </button>
          )}
        </div>
      </div>
      {err && <p className="text-xs text-red-400 px-3 pb-2">{err}</p>}
      {expanded && (
        <div className="border-t border-border bg-muted/10 p-3 space-y-3">
          {pub.abstract && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Abstract</p>
              <p className="text-xs text-foreground leading-relaxed line-clamp-6">{pub.abstract}</p>
            </div>
          )}
          {pub.keywords && pub.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pub.keywords.map((k) => (
                <span key={k} className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground font-mono">
                  {k}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            {pub.estimatedPages && (
              <span className="text-xs text-muted-foreground">{pub.estimatedPages}</span>
            )}
            <span className="text-xs font-mono text-muted-foreground">/whitepapers/{pub.slug}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel({ settings, onSave }: {
  settings: Settings;
  onSave: (s: Settings) => Promise<void>;
}) {
  const [local, setLocal] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(settings); }, [settings]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await onSave(local);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <p className="text-xs font-semibold text-foreground">Automation Settings</p>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-foreground">Auto-Generate</p>
          <p className="text-xs text-muted-foreground">Run the daily cron job to generate one whitepaper per day from the queue.</p>
        </div>
        <button
          onClick={() => setLocal((s) => ({ ...s, autoGenerate: !s.autoGenerate }))}
          className={`relative w-10 h-5 rounded-full transition-colors ${local.autoGenerate ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${local.autoGenerate ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-foreground">Auto-Publish</p>
          <p className="text-xs text-muted-foreground">Publish drafts immediately without manual review. Not recommended.</p>
        </div>
        <button
          onClick={() => setLocal((s) => ({ ...s, autoPublish: !s.autoPublish }))}
          className={`relative w-10 h-5 rounded-full transition-colors ${local.autoPublish ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${local.autoPublish ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="text-xs font-semibold bg-primary text-primary-foreground rounded px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
      </button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "queue" | "publications" | "settings";

export default function WhitepaperPipelinePage() {
  const [, navigate] = useLocation();
  useNoIndex();

  const [tab, setTab] = useState<Tab>("queue");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [settings, setSettings] = useState<Settings>({ autoGenerate: true, autoPublish: false });
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [loadingPubs, setLoadingPubs] = useState(true);
  const [runningJob, setRunningJob] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [globalErr, setGlobalErr] = useState("");

  const loadTopics = useCallback(async () => {
    setLoadingTopics(true);
    try {
      const data = await apiFetch("/api/admin/whitepapers/topics");
      setTopics(data.topics ?? []);
    } catch (e: any) {
      setGlobalErr(e.message);
    } finally {
      setLoadingTopics(false);
    }
  }, []);

  const loadPublications = useCallback(async () => {
    setLoadingPubs(true);
    try {
      const data = await apiFetch("/api/admin/whitepapers/publications");
      setPublications(data.publications ?? []);
    } catch (e: any) {
      setGlobalErr(e.message);
    } finally {
      setLoadingPubs(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const data = await apiFetch("/api/admin/whitepapers/settings");
      if (data.settings) setSettings(data.settings);
    } catch {}
  }, []);

  useEffect(() => {
    loadTopics();
    loadPublications();
    loadSettings();
  }, [loadTopics, loadPublications, loadSettings]);

  async function handleSeedDefaults() {
    setSeeding(true);
    try {
      const data = await apiFetch("/api/admin/whitepapers/topics/seed-defaults", { method: "POST" });
      if (data.skipped) {
        alert("Queue already has topics — seed skipped.");
      } else {
        await loadTopics();
      }
    } catch (e: any) {
      setGlobalErr(e.message);
    } finally {
      setSeeding(false);
    }
  }

  async function handleRunJob() {
    if (!confirm("Manually trigger the daily generation job? It will pick the next queued topic.")) return;
    setRunningJob(true);
    try {
      await apiFetch("/api/admin/whitepapers/run-job", { method: "POST" });
      setTimeout(() => {
        loadTopics();
        loadPublications();
        setRunningJob(false);
      }, 4000);
    } catch (e: any) {
      setGlobalErr(e.message);
      setRunningJob(false);
    }
  }

  async function handleSaveSettings(s: Settings) {
    await apiFetch("/api/admin/whitepapers/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    setSettings(s);
  }

  const needsReviewCount = publications.filter((p) => p.status === "needs_review").length;
  const queuedCount = topics.filter((t) => t.status === "queued").length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate("/admin")}
              className="text-xs text-muted-foreground hover:text-foreground mb-1 block"
            >
              ← Admin Dashboard
            </button>
            <h1 className="text-lg font-bold tracking-tight">Whitepaper Pipeline</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage the topic queue, review generated drafts, and control auto-generation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunJob}
              disabled={runningJob}
              className="text-xs font-semibold border border-border rounded px-3 py-1.5 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              {runningJob ? "Running…" : "▶ Run Job Now"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {globalErr && (
          <div className="text-xs text-red-400 border border-red-400/20 rounded p-3 bg-red-400/5">
            {globalErr}
            <button onClick={() => setGlobalErr("")} className="ml-2 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Queued Topics", value: queuedCount },
            { label: "Needs Review", value: needsReviewCount },
            { label: "Published", value: publications.filter((p) => p.status === "published").length },
          ].map((s) => (
            <div key={s.label} className="border border-border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold font-mono text-primary">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {(["queue", "publications", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs font-medium px-3 py-2 border-b-2 transition-colors capitalize ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "queue" ? `Queue (${queuedCount})` : t === "publications" ? `Publications (${publications.length})` : "Settings"}
            </button>
          ))}
        </div>

        {/* Queue Tab */}
        {tab === "queue" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {topics.length === 0
                  ? "No topics yet."
                  : `${topics.length} topic${topics.length === 1 ? "" : "s"} — ordered by sort priority.`}
              </p>
              <div className="flex items-center gap-2">
                {topics.length === 0 && (
                  <button
                    onClick={handleSeedDefaults}
                    disabled={seeding}
                    className="text-xs text-muted-foreground hover:text-primary border border-border rounded px-3 py-1 disabled:opacity-50"
                  >
                    {seeding ? "Seeding…" : "Seed 7 defaults"}
                  </button>
                )}
                <AddTopicForm onAdded={loadTopics} />
              </div>
            </div>

            {loadingTopics ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : topics.length === 0 ? (
              <div className="border border-border rounded-lg p-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">No topics in the queue yet.</p>
                <p className="text-xs text-muted-foreground">Add a topic above, or seed the 7 suggested defaults to get started.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topics.map((t) => (
                  <TopicRow key={t.id} topic={t} onRefresh={loadTopics} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Publications Tab */}
        {tab === "publications" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {publications.length === 0
                  ? "No publications yet."
                  : `${publications.length} publication${publications.length === 1 ? "" : "s"}.`}
                {needsReviewCount > 0 && (
                  <span className="ml-2 text-yellow-400 font-medium">{needsReviewCount} waiting for review.</span>
                )}
              </p>
              <button
                onClick={loadPublications}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Refresh
              </button>
            </div>

            {loadingPubs ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : publications.length === 0 ? (
              <div className="border border-border rounded-lg p-8 text-center">
                <p className="text-sm text-muted-foreground mb-2">No publications generated yet.</p>
                <p className="text-xs text-muted-foreground">
                  Add topics to the queue and run the daily job, or click "Generate →" on any queued topic.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {publications.map((p) => (
                  <PublicationRow key={p.id} pub={p} onRefresh={loadPublications} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
        {tab === "settings" && (
          <div className="space-y-4 max-w-lg">
            <SettingsPanel settings={settings} onSave={handleSaveSettings} />
            <div className="border border-border rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground">Daily Cron Schedule</p>
              <p className="text-xs text-muted-foreground">
                The job runs automatically at <span className="font-mono text-foreground">06:00</span> server time each day.
                It picks the next queued topic (by sort order) where the scheduled date has passed, generates a full draft,
                and saves it as <span className="font-mono text-yellow-400">needs_review</span>.
              </p>
              <p className="text-xs text-muted-foreground">
                Use "▶ Run Job Now" above to trigger a generation outside the schedule.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
