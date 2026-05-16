import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useNoIndex } from "@/hooks/useNoIndex";
import {
  ArrowLeft, CreditCard, Calendar, AlertCircle, CheckCircle, XCircle, Zap,
  Crown, Star, User, Mail, LogOut, Trash2, ChevronRight, Dumbbell, Target,
  Brain, Shield, Edit2, Save, X, ToggleLeft, BarChart2, AlertTriangle,
  Loader2, Pencil, Activity, TrendingUp, TrendingDown, Minus, Download,
  RefreshCw, CheckCircle2, ChevronDown, ChevronUp, Heart, Clock, Siren,
  Bell, BellOff, Sparkles, Settings2, Lock, Unlock, Sliders, RotateCcw,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import PricingModal from "@/components/PricingModal";
import AnonymousUpgradeModal from "@/components/AnonymousUpgradeModal";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { clearAuthState } from "@/lib/routing";

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchSubscription() {
  const r = await fetch("/api/subscription", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load subscription");
  return r.json();
}

async function fetchProfile() {
  const r = await fetch("/api/profile", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load profile");
  return r.json();
}

async function fetchMemories() {
  const r = await fetch("/api/memories", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load memories");
  return r.json() as Promise<MemoryEntry[]>;
}

async function saveProfile(data: Record<string, unknown>) {
  const r = await fetch("/api/profile", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to save profile");
  }
  return r.json();
}

async function openPortal() {
  const r = await fetch("/api/subscription/portal", { method: "POST", credentials: "include" });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to open billing portal");
  }
  const { url } = await r.json();
  return url as string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MemoryEntry {
  id: number;
  type: string;
  subject: string;
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
  source: string;
  detail: string;
  status: "active" | "monitor" | "resolved";
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(date));
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function lsGet(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsBool(key: string, defaultTrue = false): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultTrue;
    return v !== "false";
  } catch { return defaultTrue; }
}
function lsSet(key: string, value: string | boolean) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

// ─── Design system components ─────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3 px-1">
      <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-muted-foreground flex-shrink-0">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card/50 overflow-hidden divide-y divide-border/60 ${className}`}>
      {children}
    </div>
  );
}

function SettingsRow({
  label, value, onClick, rightElement, destructive, disabled, badge, description,
}: {
  label: string; value?: string; onClick?: () => void; rightElement?: React.ReactNode;
  destructive?: boolean; disabled?: boolean; badge?: string; description?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`flex items-center justify-between py-3.5 px-4 transition-all duration-150 w-full text-left
        ${onClick && !disabled ? "cursor-pointer hover:bg-accent/30 active:bg-accent/50" : ""}
        ${disabled ? "opacity-40 cursor-default" : ""}`}
    >
      <div className="flex items-start gap-2 min-w-0 flex-1 pr-3">
        <div>
          <span className={`text-sm font-medium ${destructive ? "text-red-400" : "text-foreground"} truncate`}>{label}</span>
          {badge && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold">{badge}</span>
          )}
          {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {value && <span className="text-sm text-muted-foreground truncate max-w-[140px]">{value}</span>}
        {rightElement}
        {onClick && !rightElement && !disabled && (
          <ChevronRight className={`w-4 h-4 ${destructive ? "text-red-400/50" : "text-muted-foreground/50"}`} />
        )}
      </div>
    </button>
  );
}

function SwitchRow({ label, description, checked, onCheckedChange }: {
  label: string; description?: string; checked: boolean; onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3.5 px-4">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    active: { label: "Active", icon: <CheckCircle className="w-3 h-3" />, className: "text-green-400 bg-green-400/10 border-green-400/20" },
    trialing: { label: "Trial", icon: <Zap className="w-3 h-3" />, className: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
    past_due: { label: "Payment due", icon: <AlertCircle className="w-3 h-3" />, className: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
    canceled_within_period: { label: "Canceling", icon: <XCircle className="w-3 h-3" />, className: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
    canceled: { label: "Canceled", icon: <XCircle className="w-3 h-3" />, className: "text-red-400 bg-red-400/10 border-red-400/20" },
    free: { label: "Free plan", icon: null, className: "text-muted-foreground bg-muted/30 border-border" },
  };
  const c = config[status] ?? config.free;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.className}`}>
      {c.icon}{c.label}
    </span>
  );
}

// ─── Section: Overview Card ───────────────────────────────────────────────────

function AtlasOverviewCard({ profile, memories }: { profile: Record<string, any> | undefined; memories: MemoryEntry[] }) {
  const activeMemories = memories.filter(m => m.status !== "resolved" && m.confidence >= 3);
  const hasDNA = !!(profile?.athleteDNA);
  const score = profile?.coachingPrecisionScore ?? 0;

  const summaryBullets: string[] = [];
  if (profile?.trainingGoal) summaryBullets.push(`${profile.trainingGoal.replace(/_/g, " ")} goals`);
  if (profile?.injuries) summaryBullets.push(`Injury history: ${profile.injuries.split(",")[0].trim()}`);
  if (lsGet("coach_aggression", "balanced") !== "balanced") summaryBullets.push(`${lsGet("coach_aggression", "balanced")} training preference`);
  if (profile?.trainingStyle) summaryBullets.push(`${profile.trainingStyle.replace(/_/g, " ")} style`);
  const painMemories = activeMemories.filter(m => m.type === "pain_pattern");
  if (painMemories.length > 0) summaryBullets.push(`${painMemories.length} active constraint${painMemories.length > 1 ? "s" : ""}`);

  if (summaryBullets.length === 0 && activeMemories.length === 0 && !hasDNA) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
          <Brain className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-sm font-bold text-foreground">Atlas currently understands</p>
        {score > 0 && (
          <span className="ml-auto text-[11px] text-primary/70 font-semibold">{score}% calibrated</span>
        )}
      </div>

      {summaryBullets.length > 0 ? (
        <ul className="space-y-1">
          {summaryBullets.map((b, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3 h-3 text-primary/50 flex-shrink-0" />
              {b}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Start chatting with Atlas to build your coaching profile.</p>
      )}

      {activeMemories.length > 0 && (
        <p className="text-[11px] text-muted-foreground/50 mt-3">
          {activeMemories.length} active memor{activeMemories.length === 1 ? "y" : "ies"} · coaching continuously
        </p>
      )}
    </div>
  );
}

// ─── Section: Athlete Identity ────────────────────────────────────────────────

function AthleteIdentitySection({
  me, profile, isAnonymousUser, navigate,
}: {
  me: any; profile: Record<string, any> | undefined; isAnonymousUser: boolean; navigate: (p: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const { refetch: refetchMe } = useGetMe();

  const userName = me?.name ?? "";
  const userEmail = me?.email ?? "";

  async function saveName() {
    if (!nameInput.trim() || nameSaving) return;
    setNameSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error ?? "Failed to update name"); }
      await refetchMe();
      setIsEditingName(false);
      toast({ title: "Name updated" });
    } catch (err: any) {
      toast({ title: "Failed to save name", description: err.message, variant: "destructive" });
    } finally { setNameSaving(false); }
  }

  function startEdit() {
    setForm({
      trainingGoal: profile?.trainingGoal ?? "",
      experienceLevel: profile?.experienceLevel ?? "",
      trainingStyle: profile?.trainingStyle ?? "",
      daysPerWeek: String(profile?.daysPerWeek ?? ""),
      sessionDuration: String(profile?.sessionDuration ?? ""),
      equipmentAccess: profile?.equipmentAccess ?? "",
      sportFocus: profile?.sportFocus ?? "",
      injuries: profile?.injuries ?? "",
    });
    setIsEditing(true);
  }

  const saveMutation = useMutation({
    mutationFn: (raw: Record<string, string>) => saveProfile({
      ...raw,
      daysPerWeek: raw.daysPerWeek ? Number(raw.daysPerWeek) : undefined,
      sessionDuration: raw.sessionDuration ? Number(raw.sessionDuration) : undefined,
      injuries: raw.injuries || null,
      sportFocus: raw.sportFocus || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      setIsEditing(false);
      toast({ title: "Preferences saved" });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const GOALS = ["muscle_gain", "fat_loss", "strength", "endurance", "general_fitness", "sport_performance"];
  const LEVELS = ["beginner", "intermediate", "advanced", "elite"];
  const STYLES = ["bodybuilding", "powerlifting", "crossfit", "calisthenics", "general_strength", "cardio", "hybrid"];
  const chip = (val: string) => val.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  function ChipGroup({ field, options }: { field: string; options: string[] }) {
    return (
      <div className="flex flex-wrap gap-2">
        {options.map(o => (
          <button key={o} onClick={() => setForm(f => ({ ...f, [field]: o }))}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
              ${form[field] === o ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
            {chip(o)}
          </button>
        ))}
      </div>
    );
  }

  const initials = isAnonymousUser ? "TC" : userName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <section>
      <SectionHeader icon={<User className="w-4 h-4" />} title="Athlete Identity" subtitle="Who Atlas is coaching" />

      {/* Account card */}
      <Card className="mb-3">
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-base font-bold text-primary flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            {isEditingName && !isAnonymousUser ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setIsEditingName(false); }}
                  maxLength={100} placeholder="Your name"
                  className="flex-1 min-w-0 bg-background border border-primary/40 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary/70"
                />
                <button onClick={saveName} disabled={nameSaving || !nameInput.trim()} className="flex-shrink-0 p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors disabled:opacity-40">
                  {nameSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                </button>
                <button onClick={() => setIsEditingName(false)} className="flex-shrink-0 p-1.5 rounded-lg hover:bg-accent/40 text-muted-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <p className="text-base font-bold text-foreground truncate">
                  {isAnonymousUser ? "Guest User" : userName || "Your Account"}
                </p>
                {!isAnonymousUser && (
                  <button onClick={() => { setNameInput(userName); setIsEditingName(true); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-all">
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            {!isEditingName && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {isAnonymousUser ? "No account — create one to save your data" : userEmail || "No email on file"}
              </p>
            )}
          </div>
        </div>

        {isAnonymousUser ? (
          <div className="px-4 py-3">
            <button onClick={() => navigate("/register")}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all">
              Create account to save progress
            </button>
          </div>
        ) : (
          <>
            {userEmail && (
              <div className="flex items-center justify-between py-3.5 px-4">
                <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-muted-foreground" /><span className="text-sm font-medium text-foreground">Email</span></div>
                <span className="text-sm text-muted-foreground truncate max-w-[180px]">{userEmail}</span>
              </div>
            )}
            <SettingsRow label="Sign out" onClick={() => { clearAuthState(); window.location.replace("/login"); }} rightElement={<LogOut className="w-4 h-4 text-muted-foreground/60" />} />
          </>
        )}
      </Card>

      {/* Training preferences */}
      <div className="mb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Training Preferences</p>
      </div>

      {isEditing ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 overflow-hidden p-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-foreground">Edit Training Preferences</p>
            <button onClick={() => setIsEditing(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Primary Goal</label>
            <ChipGroup field="trainingGoal" options={GOALS} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Experience Level</label>
            <ChipGroup field="experienceLevel" options={LEVELS} />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Training Style</label>
            <ChipGroup field="trainingStyle" options={STYLES} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Days/Week</label>
              <div className="flex gap-1.5 flex-wrap">
                {[2, 3, 4, 5, 6].map(d => (
                  <button key={d} onClick={() => setForm(f => ({ ...f, daysPerWeek: String(d) }))}
                    className={`w-9 h-9 rounded-lg text-sm font-bold border transition-all ${form.daysPerWeek === String(d) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Session (min)</label>
              <div className="flex gap-1.5 flex-wrap">
                {[30, 45, 60, 75, 90].map(m => (
                  <button key={m} onClick={() => setForm(f => ({ ...f, sessionDuration: String(m) }))}
                    className={`px-2 h-9 rounded-lg text-xs font-bold border transition-all ${form.sessionDuration === String(m) ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Equipment Access</label>
            <textarea value={form.equipmentAccess} onChange={e => setForm(f => ({ ...f, equipmentAccess: e.target.value }))}
              placeholder="e.g. Full gym with barbells, cables, machines..." rows={2}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Sport Focus <span className="text-muted-foreground/40 normal-case font-normal">(optional)</span></label>
            <input value={form.sportFocus} onChange={e => setForm(f => ({ ...f, sportFocus: e.target.value }))}
              placeholder="e.g. BJJ, soccer, marathon running..."
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50" />
          </div>
          <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60">
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "Saving…" : "Save preferences"}
          </button>
        </div>
      ) : (
        <Card>
          {[
            { label: "Primary goal", value: profile?.trainingGoal ? chip(profile.trainingGoal) : undefined },
            { label: "Experience", value: profile?.experienceLevel ? chip(profile.experienceLevel) : undefined },
            { label: "Training style", value: profile?.trainingStyle ? chip(profile.trainingStyle) : undefined },
            { label: "Days per week", value: profile?.daysPerWeek ? `${profile.daysPerWeek} days` : undefined },
            { label: "Session length", value: profile?.sessionDuration ? `${profile.sessionDuration} min` : undefined },
            { label: "Equipment", value: profile?.equipmentAccess || undefined },
            { label: "Sport focus", value: profile?.sportFocus || undefined },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between py-3.5 px-4">
              <span className="text-sm font-medium text-foreground">{label}</span>
              <span className="text-sm text-muted-foreground max-w-[160px] text-right truncate">
                {value ?? <span className="text-muted-foreground/40 italic">Not set</span>}
              </span>
            </div>
          ))}
          <div className="px-4 py-3">
            <button onClick={startEdit}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all">
              <Edit2 className="w-3.5 h-3.5" />Edit training preferences
            </button>
          </div>
        </Card>
      )}
    </section>
  );
}

// ─── Section: Atlas Intelligence ──────────────────────────────────────────────

function AtlasIntelligenceSection({ profile, memories }: { profile: Record<string, any> | undefined; memories: MemoryEntry[] }) {
  const score = profile?.coachingPrecisionScore ?? 0;
  const history = profile?.coachingPrecisionHistory as Array<{ score: number; generatedAt: string }> | null;
  const prevScore = history && history.length >= 2 ? history[history.length - 2].score : null;
  const trend = prevScore !== null ? score - prevScore : 0;

  const tier = score >= 76 ? "Performance Intelligence"
    : score >= 51 ? "Adaptive"
    : score >= 26 ? "Context-Aware"
    : "Basic";

  const tierColor = score >= 76 ? "text-amber-400" : score >= 51 ? "text-primary" : score >= 26 ? "text-sky-400" : "text-muted-foreground";

  const memoryOn = lsBool("coach_memory", true);
  const readinessOn = lsBool("coach_readiness_adapt", true);
  const autoAdjust = lsBool("coach_autoadjust", true);
  const aggression = lsGet("coach_aggression", "balanced");

  // P2: Server-backed active systems grid — fetched from real server state
  const { data: intelligenceStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["intelligence-status"],
    queryFn: () => fetch("/api/intelligence-status", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    staleTime: 30_000,
  });

  const hasDNA = !!(intelligenceStatus?.hasDNA ?? profile?.athleteDNA);
  const serverMemoryCount = intelligenceStatus?.memoryCount ?? memories.length;
  const hasReadiness = intelligenceStatus?.hasReadiness ?? false;

  // P3: Forecasting status based on real server data — not guessed from localStorage
  const forecastStatus = intelligenceStatus?.forecastStatus;
  const forecastLabel = forecastStatus === "active" ? "Active"
    : forecastStatus === "learning" ? "Learning"
    : forecastStatus === "unavailable" ? "Not available on current plan"
    : "Inactive";
  const forecastActive = forecastStatus === "active" || forecastStatus === "learning";

  const systems = [
    { label: "Memory Tracking", status: memoryOn ? (serverMemoryCount > 0 ? `Active — ${serverMemoryCount} entries` : "Active") : "Off", active: memoryOn },
    { label: "Recovery Monitoring", status: hasReadiness ? "Active" : readinessOn ? "Enabled — no check-ins yet" : "Paused", active: readinessOn },
    { label: "Athlete DNA Calibration", status: hasDNA ? `${score}%` : "Not calibrated", active: hasDNA },
    { label: "Adaptation Engine", status: autoAdjust ? aggression.charAt(0).toUpperCase() + aggression.slice(1) : "Suggest-only", active: autoAdjust },
    { label: "Readiness Monitoring", status: hasReadiness ? "Active" : "Waiting for check-ins", active: hasReadiness },
    { label: "Forecasting", status: forecastLabel, active: forecastActive },
  ];

  return (
    <section>
      <SectionHeader icon={<Sparkles className="w-4 h-4" />} title="Atlas Intelligence" subtitle="How well Atlas knows you" />

      {/* Precision score */}
      <div className="rounded-2xl border border-border bg-card/50 p-5 mb-3">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1">Intelligence Score</p>
            <p className={`text-3xl font-black ${tierColor}`}>{score}<span className="text-base font-medium text-muted-foreground ml-1">/ 100</span></p>
            <p className={`text-xs font-bold mt-1 ${tierColor}`}>{tier}</p>
          </div>
          <div className="text-right">
            {trend !== 0 && (
              <div className={`flex items-center gap-1 text-xs font-semibold ${trend > 0 ? "text-green-400" : "text-red-400"}`}>
                {trend > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {trend > 0 ? "+" : ""}{trend} points
              </div>
            )}
            {prevScore !== null && (
              <p className="text-[10px] text-muted-foreground/50 mt-1">vs last calibration</p>
            )}
          </div>
        </div>
        <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden mb-3">
          <div className={`h-full rounded-full transition-all duration-700 ${score >= 76 ? "bg-amber-400" : score >= 51 ? "bg-primary" : score >= 26 ? "bg-sky-400" : "bg-muted-foreground/40"}`}
            style={{ width: `${Math.max(score, 3)}%` }} />
        </div>
        <div className="flex items-center justify-between text-[10px] text-muted-foreground/50">
          <span>Basic</span><span>Context-Aware</span><span>Adaptive</span><span>Performance</span>
        </div>
        <p className="text-xs text-muted-foreground/60 mt-3 leading-relaxed">
          Score grows as you train, check in, and have more conversations. Run calibration to accelerate it.
        </p>
      </div>

      {/* Active systems — server-backed */}
      <Card>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Systems</p>
            {statusLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />}
          </div>
          <div className="space-y-2">
            {systems.map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-xs text-foreground/70">{s.label}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.active ? "text-green-400 bg-green-400/10" : "text-muted-foreground/50 bg-muted/20"}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground/30 mt-2">Status reflects real server state</p>
        </div>
      </Card>
    </section>
  );
}

// ─── Section: Coaching Behavior ───────────────────────────────────────────────

function CoachingBehaviorSection() {
  const [style, setStyle] = useState<string>(() => lsGet("coach_style", "supportive"));
  const [depth, setDepth] = useState<string>(() => lsGet("coach_depth", "balanced"));
  const [concise, setConcise] = useState(() => localStorage.getItem("coach_concise") === "true");
  const [proactive, setProactive] = useState(() => lsBool("coach_proactive", true));
  const [memory, setMemory] = useState(() => lsBool("coach_memory", true));

  const styleOptions = [
    { id: "direct", label: "Direct", description: "Performance-focused, no padding" },
    { id: "supportive", label: "Supportive", description: "Warm and encouraging" },
    { id: "analytical", label: "Analytical", description: "Data-driven and educational" },
  ];

  const depthOptions = [
    { id: "minimal", label: "Minimal", description: "Conclusions only" },
    { id: "balanced", label: "Balanced", description: "Brief rationale when helpful" },
    { id: "detailed", label: "Detailed", description: "Full reasoning & context" },
  ];

  return (
    <section>
      <SectionHeader icon={<Brain className="w-4 h-4" />} title="Coaching Behavior" subtitle="How Atlas communicates with you" />

      {/* Coaching style */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Coaching Voice</p>
        <div className="grid grid-cols-3 gap-2">
          {styleOptions.map(o => (
            <button key={o.id} onClick={() => { setStyle(o.id); lsSet("coach_style", o.id); }}
              className={`rounded-xl border p-3 text-left transition-all ${style === o.id ? "border-primary/50 bg-primary/10" : "border-border bg-card/50 hover:border-primary/30"}`}>
              <p className={`text-xs font-bold mb-1 ${style === o.id ? "text-primary" : "text-foreground"}`}>{o.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{o.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Explanation depth — P2: dimmed when concise responses override is on */}
      <div className={`mb-3 transition-opacity ${concise ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Explanation Depth</p>
          {concise && (
            <p className="text-[10px] text-amber-400/80 font-medium">Overridden by concise mode</p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {depthOptions.map(o => (
            <button key={o.id} onClick={() => { setDepth(o.id); lsSet("coach_depth", o.id); }}
              className={`rounded-xl border p-3 text-left transition-all ${depth === o.id ? "border-primary/50 bg-primary/10" : "border-border bg-card/50 hover:border-primary/30"}`}>
              <p className={`text-xs font-bold mb-1 ${depth === o.id ? "text-primary" : "text-foreground"}`}>{o.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{o.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <Card>
        <SwitchRow label="Proactive insights" description="Atlas surfaces trends and suggestions unprompted" checked={proactive} onCheckedChange={v => { setProactive(v); lsSet("coach_proactive", v); }} />
        <SwitchRow label="Memory personalization" description="Uses saved preferences, history, and patterns. Injury and safety constraints remain active regardless." checked={memory} onCheckedChange={v => { setMemory(v); lsSet("coach_memory", v); }} />
        <SwitchRow label="Concise responses" description="Short, direct answers instead of detailed explanations" checked={concise} onCheckedChange={v => { setConcise(v); lsSet("coach_concise", v); }} />
      </Card>
    </section>
  );
}

// ─── Section: Adaptation + Recovery ──────────────────────────────────────────

function AdaptationSection() {
  const [aggression, setAggression] = useState(() => lsGet("coach_aggression", "balanced"));
  const [autoAdjust, setAutoAdjust] = useState(() => lsBool("coach_autoadjust", true));
  const [approvalStructural, setApprovalStructural] = useState(() => localStorage.getItem("coach_approval_structural") === "true");
  const [approvalDeload, setApprovalDeload] = useState(() => localStorage.getItem("coach_approval_deload") === "true");
  const [readinessAdapt, setReadinessAdapt] = useState(() => lsBool("coach_readiness_adapt", true));
  const [missedAdapt, setMissedAdapt] = useState(() => lsBool("coach_missed_adapt", true));

  const aggressionOptions = [
    { id: "conservative", label: "Conservative", description: "Recovery-first, sustainable progression" },
    { id: "balanced", label: "Balanced", description: "Standard overload with appropriate recovery" },
    { id: "aggressive", label: "Aggressive", description: "Bias toward overload and rapid progression" },
    { id: "competition", label: "Competition", description: "Peak-phase performance maximization" },
  ];

  const aggressionColors: Record<string, string> = {
    conservative: "border-sky-400/50 bg-sky-400/10",
    balanced: "border-primary/50 bg-primary/10",
    aggressive: "border-orange-400/50 bg-orange-400/10",
    competition: "border-red-400/50 bg-red-400/10",
  };
  const aggressionTextColors: Record<string, string> = {
    conservative: "text-sky-400", balanced: "text-primary", aggressive: "text-orange-400", competition: "text-red-400",
  };

  return (
    <section>
      <SectionHeader icon={<Sliders className="w-4 h-4" />} title="Adaptation + Recovery" subtitle="How aggressively Atlas drives your training" />

      {/* Progression aggression */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Progression Philosophy</p>
        <div className="grid grid-cols-2 gap-2">
          {aggressionOptions.map(o => (
            <button key={o.id} onClick={() => { setAggression(o.id); lsSet("coach_aggression", o.id); }}
              className={`rounded-xl border p-3 text-left transition-all ${aggression === o.id ? aggressionColors[o.id] : "border-border bg-card/50 hover:border-primary/30"}`}>
              <p className={`text-xs font-bold mb-1 ${aggression === o.id ? aggressionTextColors[o.id] : "text-foreground"}`}>{o.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{o.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Mutation authority */}
      <div className="mb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Approval Gates</p>
      </div>
      <Card className="mb-3">
        <SwitchRow
          label="Auto-apply adjustments"
          description="Atlas applies minor tweaks automatically based on your feedback and readiness"
          checked={autoAdjust}
          onCheckedChange={v => { setAutoAdjust(v); lsSet("coach_autoadjust", v); }}
        />
        {autoAdjust && (
          <>
            <SwitchRow
              label="Require approval for structural changes"
              description="Phase shifts, program rebuilds, focus changes — confirm before applying"
              checked={approvalStructural}
              onCheckedChange={v => { setApprovalStructural(v); lsSet("coach_approval_structural", v); }}
            />
            <SwitchRow
              label="Require approval for deload weeks"
              description="Atlas will propose deloads but wait for your confirmation"
              checked={approvalDeload}
              onCheckedChange={v => { setApprovalDeload(v); lsSet("coach_approval_deload", v); }}
            />
          </>
        )}
      </Card>

      {/* Adaptation triggers */}
      <div className="mb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Adaptation Triggers</p>
      </div>
      <Card>
        <SwitchRow
          label="Adapt from readiness check-ins"
          description="Atlas adjusts training load based on how you're feeling before sessions"
          checked={readinessAdapt}
          onCheckedChange={v => { setReadinessAdapt(v); lsSet("coach_readiness_adapt", v); }}
        />
        <SwitchRow
          label="Adapt from missed sessions"
          description="Atlas restructures the week intelligently when you miss a scheduled session"
          checked={missedAdapt}
          onCheckedChange={v => { setMissedAdapt(v); lsSet("coach_missed_adapt", v); }}
        />
      </Card>
    </section>
  );
}

// ─── Section: Memory + Privacy ────────────────────────────────────────────────

function MemoryPrivacySection({ memories, onMemoriesChanged }: {
  memories: MemoryEntry[]; onMemoriesChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());
  const [clearingCategory, setClearingCategory] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const patchMemory = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { status?: string; confidence?: number } }) =>
      fetch(`/api/memories/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["memories"] }); onMemoriesChanged(); },
    onError: () => toast({ title: "Failed to update memory", variant: "destructive" }),
  });

  const deleteMemory = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/memories/${id}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["memories"] }); onMemoriesChanged(); toast({ title: "Memory removed" }); },
    onError: () => toast({ title: "Failed to remove memory", variant: "destructive" }),
  });

  const clearCategory = async (category: string) => {
    setClearingCategory(category);
    try {
      const r = await fetch("/api/memories/clear-category", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      const data = await r.json();
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      onMemoriesChanged();
      toast({ title: "Category cleared", description: `${data.count ?? 0} memor${data.count === 1 ? "y" : "ies"} removed` });
    } catch {
      toast({ title: "Failed to clear category", variant: "destructive" });
    } finally { setClearingCategory(null); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const [memoriesData, profileData] = await Promise.all([
        fetch("/api/memories", { credentials: "include" }).then(r => r.json()),
        fetch("/api/profile", { credentials: "include" }).then(r => r.json()),
      ]);
      const exportData = {
        exportedAt: new Date().toISOString(),
        profile: profileData,
        memories: memoriesData,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `trainchat-data-${new Date().toISOString().split("T")[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      toast({ title: "Data exported", description: "Your coaching data has been downloaded." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally { setExporting(false); }
  };

  const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
    sport_context: { label: "Sport & Athletic Context", color: "text-blue-400" },
    pain_pattern: { label: "Pain Patterns & Limitations", color: "text-red-400" },
    exercise_preference: { label: "Exercise & Equipment", color: "text-primary" },
    training_preference: { label: "Training Emphasis", color: "text-amber-400" },
    time_constraint: { label: "Session Time", color: "text-violet-400" },
    session_preference: { label: "Session Preferences", color: "text-emerald-400" },
    volume_response: { label: "Volume & Intensity Response", color: "text-orange-400" },
    recovery_pattern: { label: "Recovery Patterns", color: "text-sky-400" },
    split_preference: { label: "Schedule & Structure", color: "text-teal-400" },
    adherence_pattern: { label: "Consistency", color: "text-indigo-400" },
    communication_preference: { label: "Coaching Style", color: "text-fuchsia-400" },
  };

  const grouped = new Map<string, MemoryEntry[]>();
  memories.filter(m => m.confidence >= 2).forEach(m => {
    const existing = grouped.get(m.type) ?? [];
    existing.push(m);
    grouped.set(m.type, existing);
  });

  const activeCount = memories.filter(m => m.status === "active").length;
  const resolvedCount = memories.filter(m => m.status === "resolved").length;

  function sourceBadge(source: string): string {
    const map: Record<string, string> = { onboarding: "Setup", feedback: "Session feedback", readiness: "Check-ins", conversation: "Conversation", inferred: "Observed" };
    return map[source] ?? source;
  }

  const clearableCategories = [
    { key: "pain_pattern", label: "Pain & injury history" },
    { key: "adherence_pattern", label: "Behavioral patterns" },
    { key: "training_preference", label: "Training preferences" },
    { key: "recovery_pattern", label: "Recovery trends" },
    { key: "volume_response", label: "Volume response data" },
  ];

  return (
    <section>
      <SectionHeader icon={<Brain className="w-4 h-4" />} title="Memory + Privacy" subtitle="What Atlas knows and how to control it" />

      {/* Summary */}
      <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 mb-3 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs font-semibold text-foreground">{activeCount} active memor{activeCount === 1 ? "y" : "ies"}</p>
          {resolvedCount > 0 && <p className="text-[11px] text-muted-foreground">{resolvedCount} resolved</p>}
        </div>
        <p className="text-[10px] text-muted-foreground/50 max-w-[160px] text-right leading-relaxed">
          Atlas uses these to coach you. Remove or resolve any that are outdated.
        </p>
      </div>

      {/* Memory panel */}
      {grouped.size === 0 ? (
        <div className="rounded-2xl border border-border bg-card/50 p-6 text-center mb-3">
          <Brain className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">No memories yet</p>
          <p className="text-xs text-muted-foreground">Memory builds as you train, check in, and chat with Atlas.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {Array.from(grouped.entries()).map(([type, entries]) => {
            const config = CATEGORY_CONFIG[type] ?? { label: type.replace(/_/g, " "), color: "text-primary" };
            const isExpanded = expandedTypes.has(type);
            const activeEntries = entries.filter(e => e.status !== "resolved");
            const resolvedEntries = entries.filter(e => e.status === "resolved");

            return (
              <div key={type} className="rounded-xl border border-border bg-card/50 overflow-hidden">
                <button onClick={() => setExpandedTypes(prev => { const next = new Set(prev); next.has(type) ? next.delete(type) : next.add(type); return next; })}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/20 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${config.color.replace("text-", "bg-")}`} />
                    <span className="text-xs font-semibold text-foreground">{config.label}</span>
                    <span className="text-[10px] text-muted-foreground/50">{entries.length}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-border/50">
                    {activeEntries.map(entry => (
                      <div key={entry.id} className="px-4 py-3 border-b border-border/30 last:border-0">
                        <div className="flex items-start gap-2 mb-2">
                          <p className="text-[11px] text-foreground/85 leading-relaxed flex-1">{entry.detail}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${entry.status === "monitor" ? "bg-amber-400/20 text-amber-400" : "bg-green-400/15 text-green-400"}`}>
                            {entry.status === "monitor" ? "Monitor" : "Active"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[9px] text-muted-foreground/50 mb-2">
                          <span>{sourceBadge(entry.source)}</span>
                          <span>·</span>
                          <span>{formatRelativeDate(entry.updatedAt)}</span>
                          {entry.confidence >= 4 && <span className="text-primary/60 font-medium">High confidence</span>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {entry.status === "active" && (
                            <button onClick={() => patchMemory.mutate({ id: entry.id, data: { status: "monitor" } })}
                              className="text-[10px] px-2 py-1 rounded-lg border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 transition-colors">
                              Move to Monitor
                            </button>
                          )}
                          {entry.status !== "resolved" && (
                            <button onClick={() => patchMemory.mutate({ id: entry.id, data: { status: "resolved" } })}
                              className="text-[10px] px-2 py-1 rounded-lg border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-colors">
                              Mark Resolved
                            </button>
                          )}
                          {entry.confidence > 1 && (
                            <button onClick={() => patchMemory.mutate({ id: entry.id, data: { confidence: Math.max(1, entry.confidence - 1) } })}
                              className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:bg-accent/30 transition-colors">
                              Downgrade confidence
                            </button>
                          )}
                          <button onClick={() => deleteMemory.mutate(entry.id)}
                            className="text-[10px] px-2 py-1 rounded-lg border border-red-400/20 text-red-400/70 hover:bg-red-400/10 transition-colors ml-auto">
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    {resolvedEntries.length > 0 && (
                      <div className="px-4 py-2 bg-muted/10">
                        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1.5">Resolved</p>
                        {resolvedEntries.map(entry => (
                          <div key={entry.id} className="flex items-center justify-between py-1.5 opacity-50">
                            <p className="text-[10px] text-muted-foreground line-through flex-1 pr-2">{entry.detail}</p>
                            <button onClick={() => patchMemory.mutate({ id: entry.id, data: { status: "active" } })}
                              className="text-[9px] text-muted-foreground hover:text-foreground border border-border/50 rounded px-1.5 py-0.5 flex-shrink-0">
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Selective clear */}
      <div className="rounded-2xl border border-border bg-card/50 overflow-hidden mb-3">
        <div className="px-4 py-3 border-b border-border/50">
          <p className="text-xs font-bold text-foreground">Selective Memory Clear</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Remove specific categories without wiping everything</p>
        </div>
        <div className="divide-y divide-border/40">
          {clearableCategories.map(c => (
            <div key={c.key} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-foreground/80">{c.label}</span>
              <button onClick={() => clearCategory(c.key)} disabled={clearingCategory === c.key}
                className="text-[10px] px-2.5 py-1 rounded-lg border border-red-400/20 text-red-400/70 hover:bg-red-400/10 transition-colors disabled:opacity-50">
                {clearingCategory === c.key ? "Clearing…" : "Clear"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <Card>
        <SettingsRow
          label="Export my data"
          description="Download your memories, profile, and coaching history as JSON"
          onClick={handleExport}
          rightElement={exporting ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Download className="w-4 h-4 text-muted-foreground/60" />}
        />
      </Card>

      {/* What Atlas uses */}
      <div className="mt-3 rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">What Atlas uses to coach you</p>
        <ul className="space-y-1 text-[10px] text-muted-foreground/70 leading-relaxed">
          <li>· Check-in data and readiness signals</li>
          <li>· Conversation history and stated preferences</li>
          <li>· Session logs and exercise performance</li>
          <li>· Inferred behavioral patterns</li>
          <li>· Injury and pain notes (always active for safety)</li>
        </ul>
      </div>
    </section>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────

function NotificationsSection() {
  const [preSesh, setPreSesh] = useState(() => localStorage.getItem("notif_presession") === "true");
  const [missed, setMissed] = useState(() => localStorage.getItem("notif_missed") === "true");
  const [weekly, setWeekly] = useState(() => localStorage.getItem("notif_weekly") === "true");
  const [forecast, setForecast] = useState(() => localStorage.getItem("notif_forecast") === "true");
  const [recovery, setRecovery] = useState(() => localStorage.getItem("notif_recovery") === "true");
  const [plateau, setPlateau] = useState(() => localStorage.getItem("notif_plateau") === "true");
  const [saving, setSaving] = useState(false);

  // P3: Persist notification preferences server-side (fire-and-forget after localStorage save)
  async function persistToServer(updated: Record<string, boolean>) {
    try {
      setSaving(true);
      await fetch("/api/intelligence-status/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
    } catch {
      // Non-fatal — localStorage is the source of truth for delivery gating
    } finally {
      setSaving(false);
    }
  }

  function t(key: string, val: boolean, setter: (v: boolean) => void, field: string) {
    lsSet(key, val);
    setter(val);
    const current = {
      preSesh: localStorage.getItem("notif_presession") === "true",
      missedSession: localStorage.getItem("notif_missed") === "true",
      weeklyRecap: localStorage.getItem("notif_weekly") === "true",
      forecastAlerts: localStorage.getItem("notif_forecast") === "true",
      recoveryWarnings: localStorage.getItem("notif_recovery") === "true",
      plateauDetection: localStorage.getItem("notif_plateau") === "true",
      [field]: val,
    };
    persistToServer(current);
  }

  return (
    <section>
      <SectionHeader icon={<Bell className="w-4 h-4" />} title="Notifications + Coaching Presence" subtitle="When and how Atlas reaches out" />
      <Card>
        <SwitchRow label="Pre-session brief" description="Atlas prepares a session summary before you train" checked={preSesh} onCheckedChange={v => t("notif_presession", v, setPreSesh, "preSesh")} />
        <SwitchRow label="Missed session check-in" description="Atlas checks in when you miss a scheduled session" checked={missed} onCheckedChange={v => t("notif_missed", v, setMissed, "missedSession")} />
        <SwitchRow label="Weekly coaching recap" description="Weekly summary of progress, patterns, and next-week focus" checked={weekly} onCheckedChange={v => t("notif_weekly", v, setWeekly, "weeklyRecap")} />
        <SwitchRow label="Forecast alerts" description="Alerts when Atlas detects upcoming performance windows or fatigue peaks" checked={forecast} onCheckedChange={v => t("notif_forecast", v, setForecast, "forecastAlerts")} />
        <SwitchRow label="Recovery warnings" description="Alerts when recovery signals suggest adjusting intensity" checked={recovery} onCheckedChange={v => t("notif_recovery", v, setRecovery, "recoveryWarnings")} />
        <SwitchRow label="Plateau detection" description="Atlas flags when progress has stalled and proposes a change" checked={plateau} onCheckedChange={v => t("notif_plateau", v, setPlateau, "plateauDetection")} />
      </Card>
      <div className="flex items-center gap-1.5 px-1 mt-2">
        <p className="text-[10px] text-muted-foreground/40">Preferences saved server-side. Delivery coming soon.</p>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/30" />}
      </div>
    </section>
  );
}

// ─── Section: Subscription ────────────────────────────────────────────────────

function SubscriptionSection({ sub, subLoading, isAnonymousUser, onUpgrade, onManage }: {
  sub: Record<string, any> | undefined; subLoading: boolean; isAnonymousUser: boolean;
  onUpgrade: () => void; onManage: () => void;
}) {
  if (subLoading) return <div className="h-40 rounded-2xl bg-card/50 border border-border animate-pulse" />;

  const plan = sub?.plan ?? "free";
  const planStatus = sub?.planStatus ?? "active";
  const billingInterval = sub?.billingInterval ?? null;
  const currentPeriodEnd = sub?.currentPeriodEnd ?? null;
  const cancelAtPeriodEnd = sub?.cancelAtPeriodEnd ?? false;
  const trialEnd = sub?.trialEnd ?? null;
  const hasActiveAccess = sub?.hasActiveAccess ?? false;
  const isPaid = plan !== "free";

  let displayStatus = planStatus;
  if (isPaid && cancelAtPeriodEnd) displayStatus = "canceled_within_period";
  if (!isPaid) displayStatus = "free";

  const PLAN_NAMES: Record<string, string> = { free: "Free", starter: "Starter", pro: "Pro", elite: "Elite" };

  const planFeatures: Record<string, string[]> = {
    free: ["5 messages / session", "Basic program building"],
    starter: ["Unlimited messages", "Full program building", "Check-in tracking"],
    pro: ["Everything in Starter", "Long-term memory", "Athlete DNA calibration", "Advanced forecasting"],
    elite: ["Everything in Pro", "Competition-mode coaching", "Priority intelligence", "Dedicated support"],
  };

  return (
    <section>
      <SectionHeader icon={<CreditCard className="w-4 h-4" />} title="Subscription + Usage" subtitle="Managed securely via Stripe" />

      <div className="rounded-2xl border border-border bg-card/50 p-5 mb-3">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              {plan === "elite" ? <Crown className="w-5 h-5 text-amber-400" /> : plan === "pro" ? <Star className="w-5 h-5 text-primary" /> : <Zap className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Current plan</p>
              <p className="text-lg font-bold text-foreground">{PLAN_NAMES[plan] ?? plan}</p>
            </div>
          </div>
          <StatusBadge status={displayStatus} />
        </div>

        {/* Plan features */}
        <div className="mb-4">
          <ul className="space-y-1">
            {(planFeatures[plan] ?? []).map(f => (
              <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-primary/50 flex-shrink-0" />{f}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2.5">
          {billingInterval && isPaid && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><BarChart2 className="w-3.5 h-3.5" />Billing cycle</div>
              <span className="font-medium text-foreground capitalize">{billingInterval}</span>
            </div>
          )}
          {currentPeriodEnd && isPaid && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="w-3.5 h-3.5" />{cancelAtPeriodEnd ? "Access ends" : "Renews on"}</div>
              <span className="font-medium text-foreground">{formatDate(currentPeriodEnd)}</span>
            </div>
          )}
          {trialEnd && (
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground"><Zap className="w-3.5 h-3.5" />Trial ends</div>
              <span className="font-medium text-foreground">{formatDate(trialEnd)}</span>
            </div>
          )}
        </div>

        {cancelAtPeriodEnd && currentPeriodEnd && (
          <div className="mt-4 p-3 rounded-xl bg-amber-400/10 border border-amber-400/20">
            <p className="text-xs text-amber-400 leading-relaxed">Subscription cancels on {formatDate(currentPeriodEnd)}. You'll retain access until then.</p>
          </div>
        )}
      </div>

      <Card>
        {isPaid && (
          <div className="px-4 py-3">
            <button onClick={onManage}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all">
              <CreditCard className="w-4 h-4" />Manage billing & payment
            </button>
            <p className="text-center text-[11px] text-muted-foreground/50 mt-2">Update card · View invoices · Cancel or resume</p>
          </div>
        )}
        {(!isPaid || !hasActiveAccess) && (
          <div className="px-4 py-3">
            <button onClick={onUpgrade}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all">
              <Zap className="w-4 h-4" />{isPaid ? "Reactivate subscription" : "Upgrade to Pro"}
            </button>
            <p className="text-center text-[11px] text-muted-foreground/50 mt-2">Unlock memory, Athlete DNA, and adaptive coaching</p>
          </div>
        )}
      </Card>
    </section>
  );
}

// ─── Section: Safety + Constraints ───────────────────────────────────────────

function SafetySection({ memories, profile, onMemoriesChanged }: {
  memories: MemoryEntry[]; profile: Record<string, any> | undefined; onMemoriesChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const painMemories = memories.filter(m => m.type === "pain_pattern");
  const profileInjuries = profile?.injuries;

  const patchMemory = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) =>
      fetch(`/api/memories/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["memories"] }); onMemoriesChanged(); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const statusConfig = {
    active: { label: "Active", className: "bg-red-400/15 text-red-400 border-red-400/30", icon: <Siren className="w-3 h-3" /> },
    monitor: { label: "Monitor", className: "bg-amber-400/15 text-amber-400 border-amber-400/30", icon: <AlertCircle className="w-3 h-3" /> },
    resolved: { label: "Resolved", className: "bg-green-400/15 text-green-400 border-green-400/30", icon: <CheckCircle2 className="w-3 h-3" /> },
  };

  return (
    <section>
      <SectionHeader icon={<Shield className="w-4 h-4" />} title="Safety + Constraints" subtitle="Injuries, pain patterns, and hard limits" />

      {profileInjuries && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 mb-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-400 mb-0.5">Profile limitations (always active)</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{profileInjuries}</p>
            </div>
          </div>
        </div>
      )}

      {painMemories.length === 0 && !profileInjuries ? (
        <div className="rounded-2xl border border-border bg-card/50 p-5 text-center">
          <Shield className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">No active constraints</p>
          <p className="text-xs text-muted-foreground">Injury and pain patterns appear here when Atlas detects them through check-ins and conversations.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {painMemories.map(entry => {
            const statusC = statusConfig[entry.status as keyof typeof statusConfig] ?? statusConfig.active;
            return (
              <div key={entry.id} className={`rounded-xl border p-4 ${entry.status === "resolved" ? "opacity-60 border-border bg-card/30" : entry.status === "monitor" ? "border-amber-400/20 bg-amber-400/5" : "border-red-400/20 bg-red-400/5"}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-xs text-foreground/85 leading-relaxed flex-1">{entry.detail}</p>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${statusC.className}`}>
                    {statusC.icon}{statusC.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground/50 mb-2">
                  <span>Source: {entry.source}</span>
                  <span>·</span>
                  <span>{formatRelativeDate(entry.updatedAt)}</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {entry.status === "active" && (
                    <button onClick={() => patchMemory.mutate({ id: entry.id, data: { status: "monitor" } })}
                      className="text-[10px] px-2 py-1 rounded-lg border border-amber-400/30 text-amber-400 hover:bg-amber-400/10 transition-colors">
                      Move to Monitor
                    </button>
                  )}
                  {entry.status !== "resolved" && (
                    <button onClick={() => patchMemory.mutate({ id: entry.id, data: { status: "resolved" } })}
                      className="text-[10px] px-2 py-1 rounded-lg border border-green-400/30 text-green-400 hover:bg-green-400/10 transition-colors">
                      Mark Healed
                    </button>
                  )}
                  {entry.status === "resolved" && (
                    <button onClick={() => patchMemory.mutate({ id: entry.id, data: { status: "active" } })}
                      className="text-[10px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:bg-accent/30 transition-colors">
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-border/50 bg-muted/10 px-4 py-3">
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          <strong className="text-foreground/60">Active</strong> — Full enforcement in all programming decisions.<br />
          <strong className="text-foreground/60">Monitor</strong> — Soft caution injected; not a hard block.<br />
          <strong className="text-foreground/60">Resolved</strong> — Retained historically but excluded from active coaching.
        </p>
      </div>
    </section>
  );
}

// ─── Section: Danger Zone ─────────────────────────────────────────────────────

function DangerZone({ isAnonymousUser }: { isAnonymousUser: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showClearMemoryConfirm, setShowClearMemoryConfirm] = useState(false);
  const [clearMemoryLoading, setClearMemoryLoading] = useState(false);

  async function handleClearMemory() {
    if (clearMemoryLoading) return;
    setClearMemoryLoading(true);
    try {
      const res = await fetch("/api/clear-memory", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to clear");
      await queryClient.invalidateQueries();
      setShowClearMemoryConfirm(false);
      toast({ title: "Coach memory cleared", description: "Your chats, programs, and training history have been wiped." });
    } catch (err: any) {
      toast({ title: "Failed to clear", description: err.message, variant: "destructive" });
    } finally { setClearMemoryLoading(false); }
  }

  async function handleDeleteAccount() {
    if (deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to delete account.");
      clearAuthState();
      queryClient.clear();
      window.location.replace("/login");
    } catch (err: any) {
      setDeleteError(err.message);
      setDeleteLoading(false);
    }
  }

  if (isAnonymousUser) return null;

  return (
    <section>
      <SectionHeader icon={<AlertTriangle className="w-4 h-4 text-red-400" />} title="Danger Zone" />
      <Card>
        <SettingsRow label="Clear all coach memory" description="Wipe your chats, programs, and training history. Preferences are preserved." onClick={() => setShowClearMemoryConfirm(true)} destructive rightElement={<RotateCcw className="w-4 h-4 text-red-400/60" />} />
        <SettingsRow label="Delete account" description="Permanently delete your account and all data. Cannot be undone." onClick={() => setShowDeleteConfirm(true)} destructive rightElement={<Trash2 className="w-4 h-4 text-red-400/60" />} />
      </Card>

      {showClearMemoryConfirm && (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-400">Clear all coach memory?</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">This wipes all chats, programs, memories, readiness history, and session logs. Your account, settings, and subscription are preserved.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowClearMemoryConfirm(false)} disabled={clearMemoryLoading}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent/30 transition-all disabled:opacity-50">Cancel</button>
            <button onClick={handleClearMemory} disabled={clearMemoryLoading}
              className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-sm font-semibold text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {clearMemoryLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Clearing…</> : "Clear memory"}
            </button>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-400">Permanently delete your account?</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">This immediately cancels your subscription and deletes all data. <strong className="text-foreground/70">This cannot be undone.</strong></p>
            </div>
          </div>
          {deleteError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/15 border border-red-500/25">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <p className="text-xs text-red-300">{deleteError}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }} disabled={deleteLoading}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent/30 transition-all disabled:opacity-50">Cancel</button>
            <button onClick={handleDeleteAccount} disabled={deleteLoading}
              className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-sm font-semibold text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {deleteLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Deleting…</> : "Delete account"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  useNoIndex();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPricing, setShowPricing] = useState(false);
  const [anonymousUpgradePlan, setAnonymousUpgradePlan] = useState<{ planId: string; billingInterval: "monthly" | "yearly" } | null>(null);

  const { data: me } = useGetMe();
  const isAnonymousUser = !!(me as any)?.isAnonymous;

  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
    staleTime: 30_000,
    enabled: !isAnonymousUser,
  });

  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: fetchProfile,
    staleTime: 60_000,
  });

  const { data: memories = [], refetch: refetchMemories } = useQuery({
    queryKey: ["memories"],
    queryFn: fetchMemories,
    staleTime: 60_000,
  });

  const portalMutation = useMutation({
    mutationFn: openPortal,
    onSuccess: (url) => { window.location.href = url; },
    onError: (err: Error) => toast({ title: "Billing portal failed", description: err.message, variant: "destructive" }),
  });

  async function handleSelectPlan(planId: string, billingInterval?: string) {
    setShowPricing(false);
    const interval = (billingInterval === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly";
    if (isAnonymousUser) { setAnonymousUpgradePlan({ planId, billingInterval: interval }); return; }
    try {
      const r = await fetch("/api/billing/create-checkout-session", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: planId, billingInterval: interval }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast({ title: data.error ?? "Failed to start checkout", variant: "destructive" }); return; }
      if (data.url) window.location.href = data.url;
    } catch (err: any) { toast({ title: err.message ?? "Failed to start checkout", variant: "destructive" }); }
  }

  const onMemoriesChanged = useCallback(() => { refetchMemories(); }, [refetchMemories]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate("/chat")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Your intelligence control center</p>
          </div>
        </div>

        <div className="space-y-10">

          {/* Overview card */}
          <AtlasOverviewCard profile={profile} memories={memories} />

          {/* 1. Athlete Identity */}
          <AthleteIdentitySection me={me} profile={profile} isAnonymousUser={isAnonymousUser} navigate={navigate} />

          {/* 2. Atlas Intelligence */}
          <AtlasIntelligenceSection profile={profile} memories={memories} />

          {/* 3. Coaching Behavior */}
          <CoachingBehaviorSection />

          {/* 4. Adaptation + Recovery */}
          <AdaptationSection />

          {/* 5. Memory + Privacy */}
          <MemoryPrivacySection memories={memories} onMemoriesChanged={onMemoriesChanged} />

          {/* 6. Notifications */}
          <NotificationsSection />

          {/* 7. Subscription */}
          {!isAnonymousUser && (
            <SubscriptionSection
              sub={sub} subLoading={subLoading} isAnonymousUser={isAnonymousUser}
              onUpgrade={() => setShowPricing(true)}
              onManage={() => portalMutation.mutate()}
            />
          )}

          {/* 8. Safety + Constraints */}
          <SafetySection memories={memories} profile={profile} onMemoriesChanged={onMemoriesChanged} />

          {/* 9. Danger Zone */}
          <DangerZone isAnonymousUser={isAnonymousUser} />

        </div>
      </div>

      {showPricing && (
        <PricingModal
          onClose={() => setShowPricing(false)}
          onSelectPlan={(planId, billingInterval) => handleSelectPlan(planId, billingInterval)}
        />
      )}
      {anonymousUpgradePlan && (
        <AnonymousUpgradeModal
          planId={anonymousUpgradePlan.planId}
          billingInterval={anonymousUpgradePlan.billingInterval}
          onClose={() => setAnonymousUpgradePlan(null)}
        />
      )}
    </div>
  );
}
