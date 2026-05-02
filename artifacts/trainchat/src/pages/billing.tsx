import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  CreditCard,
  Calendar,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
  Crown,
  Star,
  User,
  Mail,
  LogOut,
  Trash2,
  ChevronRight,
  Dumbbell,
  Target,
  Clock,
  Brain,
  Shield,
  LifeBuoy,
  Edit2,
  Save,
  X,
  ToggleLeft,
  MessageSquare,
  BarChart2,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Pencil,
} from "lucide-react";
import { useState, useEffect } from "react";
import PricingModal from "@/components/PricingModal";
import AnonymousUpgradeModal from "@/components/AnonymousUpgradeModal";
import { SupportModal, type SupportType } from "@/components/chat/SupportModal";
import { useGetMe, useLogout } from "@workspace/api-client-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

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

async function startCheckout(priceId: string) {
  const r = await fetch("/api/subscription/checkout", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to start checkout");
  }
  const { url } = await r.json();
  return url as string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    active: {
      label: "Active",
      icon: <CheckCircle className="w-3 h-3" />,
      className: "text-green-400 bg-green-400/10 border-green-400/20",
    },
    trialing: {
      label: "Trial",
      icon: <Zap className="w-3 h-3" />,
      className: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    },
    past_due: {
      label: "Payment due",
      icon: <AlertCircle className="w-3 h-3" />,
      className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    },
    canceled_within_period: {
      label: "Canceling",
      icon: <XCircle className="w-3 h-3" />,
      className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    },
    canceled: {
      label: "Canceled",
      icon: <XCircle className="w-3 h-3" />,
      className: "text-red-400 bg-red-400/10 border-red-400/20",
    },
    free: {
      label: "Free plan",
      icon: null,
      className: "text-muted-foreground bg-muted/30 border-border",
    },
  };

  const c = config[status] ?? config.free;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${c.className}`}>
      {c.icon}
      {c.label}
    </span>
  );
}

function PlanIcon({ plan }: { plan: string }) {
  if (plan === "elite") return <Crown className="w-5 h-5 text-amber-400" />;
  if (plan === "pro") return <Star className="w-5 h-5 text-primary" />;
  return <Zap className="w-5 h-5 text-muted-foreground" />;
}

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  elite: "Elite",
};

const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 19, yearly: 182 },
  pro: { monthly: 39, yearly: 374 },
  elite: { monthly: 79, yearly: 758 },
};

// ─── Section Header ───────────────────────────────────────────────────────────

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

// ─── Settings Row ─────────────────────────────────────────────────────────────

function SettingsRow({
  label,
  value,
  onClick,
  rightElement,
  destructive,
  disabled,
  badge,
}: {
  label: string;
  value?: string;
  onClick?: () => void;
  rightElement?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  badge?: string;
}) {
  const base =
    "flex items-center justify-between py-3.5 px-4 transition-all duration-150";
  const interactive = onClick && !disabled
    ? "cursor-pointer hover:bg-accent/30 active:bg-accent/50"
    : "";
  const textColor = destructive ? "text-red-400" : "text-foreground";

  return (
    <button
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`${base} ${interactive} w-full text-left ${disabled ? "opacity-40 cursor-default" : ""}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-sm font-medium ${textColor} truncate`}>{label}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold flex-shrink-0">
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        {value && <span className="text-sm text-muted-foreground truncate max-w-[140px]">{value}</span>}
        {rightElement}
        {onClick && !rightElement && !disabled && (
          <ChevronRight className={`w-4 h-4 ${destructive ? "text-red-400/50" : "text-muted-foreground/50"}`} />
        )}
      </div>
    </button>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border bg-card/50 overflow-hidden divide-y divide-border/60 ${className}`}>
      {children}
    </div>
  );
}

// ─── Training Preferences Editor ──────────────────────────────────────────────

function TrainingPreferencesSection({ profile }: { profile: Record<string, any> | undefined }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

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
    mutationFn: (raw: Record<string, string>) =>
      saveProfile({
        ...raw,
        daysPerWeek: raw.daysPerWeek ? Number(raw.daysPerWeek) : undefined,
        sessionDuration: raw.sessionDuration ? Number(raw.sessionDuration) : undefined,
        injuries: raw.injuries || null,
        sportFocus: raw.sportFocus || null,
      }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      setIsEditing(false);
      console.info("[SettingsAudit:Save] Training preferences saved", {
        goal: saved?.trainingGoal,
        experience: saved?.experienceLevel,
        style: saved?.trainingStyle,
        daysPerWeek: saved?.daysPerWeek,
        sessionDuration: saved?.sessionDuration,
        equipmentAccess: saved?.equipmentAccess ? "set" : "empty",
        sportFocus: !!saved?.sportFocus,
        injuries: !!saved?.injuries,
      });
      toast({ title: "Preferences saved", description: "Your training preferences have been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const GOALS = ["muscle_gain", "fat_loss", "strength", "endurance", "general_fitness", "sport_performance"];
  const LEVELS = ["beginner", "intermediate", "advanced", "elite"];
  const STYLES = ["bodybuilding", "powerlifting", "crossfit", "calisthenics", "general_strength", "cardio", "hybrid"];

  function label(val: string) {
    return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (isEditing) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-primary/30 bg-primary/5 overflow-hidden p-4 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-foreground">Edit Training Preferences</p>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Goal */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Primary Goal</label>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <button
                  key={g}
                  onClick={() => setForm((f) => ({ ...f, trainingGoal: g }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.trainingGoal === g
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {label(g)}
                </button>
              ))}
            </div>
          </div>

          {/* Experience */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Experience Level</label>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  onClick={() => setForm((f) => ({ ...f, experienceLevel: l }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.experienceLevel === l
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {label(l)}
                </button>
              ))}
            </div>
          </div>

          {/* Training style */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Training Style</label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setForm((f) => ({ ...f, trainingStyle: s }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.trainingStyle === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {label(s)}
                </button>
              ))}
            </div>
          </div>

          {/* Days & Duration row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Days/Week</label>
              <div className="flex gap-1.5 flex-wrap">
                {[2, 3, 4, 5, 6].map((d) => (
                  <button
                    key={d}
                    onClick={() => setForm((f) => ({ ...f, daysPerWeek: String(d) }))}
                    className={`w-9 h-9 rounded-lg text-sm font-bold border transition-all ${
                      form.daysPerWeek === String(d)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Session (min)</label>
              <div className="flex gap-1.5 flex-wrap">
                {[30, 45, 60, 75, 90].map((m) => (
                  <button
                    key={m}
                    onClick={() => setForm((f) => ({ ...f, sessionDuration: String(m) }))}
                    className={`px-2 h-9 rounded-lg text-xs font-bold border transition-all ${
                      form.sessionDuration === String(m)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Equipment */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Equipment Access</label>
            <textarea
              value={form.equipmentAccess}
              onChange={(e) => setForm((f) => ({ ...f, equipmentAccess: e.target.value }))}
              placeholder="e.g. Full gym with barbells, cables, machines..."
              rows={2}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          {/* Sport */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Sport Focus <span className="text-muted-foreground/40 normal-case font-normal">(optional)</span></label>
            <input
              value={form.sportFocus}
              onChange={(e) => setForm((f) => ({ ...f, sportFocus: e.target.value }))}
              placeholder="e.g. BJJ, soccer, marathon running..."
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Injuries */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Injuries / Limitations <span className="text-muted-foreground/40 normal-case font-normal">(optional)</span></label>
            <textarea
              value={form.injuries}
              onChange={(e) => setForm((f) => ({ ...f, injuries: e.target.value }))}
              placeholder="e.g. Left knee pain, avoid heavy squats..."
              rows={2}
              className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </div>
    );
  }

  const rows = [
    { label: "Primary goal", value: profile?.trainingGoal ? label(profile.trainingGoal) : undefined },
    { label: "Experience", value: profile?.experienceLevel ? label(profile.experienceLevel) : undefined },
    { label: "Training style", value: profile?.trainingStyle ? label(profile.trainingStyle) : undefined },
    { label: "Days per week", value: profile?.daysPerWeek ? `${profile.daysPerWeek} days` : undefined },
    { label: "Session length", value: profile?.sessionDuration ? `${profile.sessionDuration} min` : undefined },
    { label: "Equipment", value: profile?.equipmentAccess || undefined },
    { label: "Sport focus", value: profile?.sportFocus || undefined },
    { label: "Limitations", value: profile?.injuries || undefined },
  ];

  return (
    <Card>
      {rows.map(({ label: l, value }) => (
        <div key={l} className="flex items-center justify-between py-3.5 px-4">
          <span className="text-sm font-medium text-foreground">{l}</span>
          <span className="text-sm text-muted-foreground max-w-[160px] text-right truncate">
            {value ?? <span className="text-muted-foreground/40 italic">Not set</span>}
          </span>
        </div>
      ))}
      <div className="px-4 py-3">
        <button
          onClick={startEdit}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 active:scale-[0.98] transition-all"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Edit training preferences
        </button>
      </div>
    </Card>
  );
}

// ─── AI Coach Settings ────────────────────────────────────────────────────────

function CoachSettingsSection() {
  const [concise, setConcise] = useState(() => localStorage.getItem("coach_concise") === "true");
  const [proactiveInsights, setProactiveInsights] = useState(() => localStorage.getItem("coach_proactive") !== "false");
  const [autoAdjust, setAutoAdjust] = useState(() => localStorage.getItem("coach_autoadjust") !== "false");
  const [memory, setMemory] = useState(() => localStorage.getItem("coach_memory") !== "false");

  function toggle(key: string, val: boolean, setter: (v: boolean) => void, label: string) {
    localStorage.setItem(key, String(val));
    setter(val);
    console.info(`[SettingsAudit:CoachToggle] ${label} → ${val}`);
  }

  return (
    <Card>
      <div className="flex items-center justify-between py-3.5 px-4">
        <div className="min-w-0 pr-4">
          <p className="text-sm font-medium text-foreground">Concise responses</p>
          <p className="text-xs text-muted-foreground mt-0.5">Short, direct answers instead of detailed explanations</p>
        </div>
        <Switch
          checked={concise}
          onCheckedChange={(v) => toggle("coach_concise", v, setConcise, "conciseResponses")}
        />
      </div>
      <div className="flex items-center justify-between py-3.5 px-4">
        <div className="min-w-0 pr-4">
          <p className="text-sm font-medium text-foreground">Proactive insights</p>
          <p className="text-xs text-muted-foreground mt-0.5">Coach surfaces trends and suggestions unprompted</p>
        </div>
        <Switch
          checked={proactiveInsights}
          onCheckedChange={(v) => toggle("coach_proactive", v, setProactiveInsights, "proactiveInsights")}
        />
      </div>
      <div className="flex items-center justify-between py-3.5 px-4">
        <div className="min-w-0 pr-4">
          <p className="text-sm font-medium text-foreground">Adjustment suggestions</p>
          <p className="text-xs text-muted-foreground mt-0.5">Suggest changes from readiness and feedback. You approve before anything changes.</p>
        </div>
        <Switch
          checked={autoAdjust}
          onCheckedChange={(v) => toggle("coach_autoadjust", v, setAutoAdjust, "autoAdjustRecommendations")}
        />
      </div>
      <div className="flex items-center justify-between py-3.5 px-4">
        <div className="min-w-0 pr-4">
          <p className="text-sm font-medium text-foreground">Memory personalization</p>
          <p className="text-xs text-muted-foreground mt-0.5">Use saved preferences, history, and constraints to personalize coaching. Injury and safety constraints remain active regardless.</p>
        </div>
        <Switch
          checked={memory}
          onCheckedChange={(v) => toggle("coach_memory", v, setMemory, "memoryPersonalization")}
        />
      </div>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showPricing, setShowPricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anonymousUpgradePlan, setAnonymousUpgradePlan] = useState<{ planId: string; priceId: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showClearMemoryConfirm, setShowClearMemoryConfirm] = useState(false);
  const [clearMemoryLoading, setClearMemoryLoading] = useState(false);
  const [clearMemoryError, setClearMemoryError] = useState<string | null>(null);
  const [supportModalType, setSupportModalType] = useState<SupportType | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const { data: me, refetch: refetchMe } = useGetMe();
  const isAnonymousUser = !!(me as any)?.isAnonymous;
  const logout = useLogout();

  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ["subscription"],
    queryFn: fetchSubscription,
    staleTime: 30_000,
  });

  const { data: profile } = useQuery({
    queryKey: ["user-profile"],
    queryFn: fetchProfile,
    staleTime: 60_000,
  });

  // ── Audit log on settings load ───────────────────────────────────────────────
  useEffect(() => {
    if (!me && !sub && !profile) return;
    console.info("[SettingsAudit:Load] Settings page loaded", {
      userId: (me as any)?.id ?? null,
      isAnonymous: (me as any)?.isAnonymous ?? true,
      plan: sub?.plan ?? "free",
      planStatus: sub?.planStatus ?? "unknown",
      profileLoaded: !!profile,
      trainingGoal: profile?.trainingGoal ?? null,
      experienceLevel: profile?.experienceLevel ?? null,
      coachConcise: localStorage.getItem("coach_concise") ?? "false",
      coachProactive: localStorage.getItem("coach_proactive") ?? "true",
      coachAutoAdjust: localStorage.getItem("coach_autoadjust") ?? "true",
      coachMemory: localStorage.getItem("coach_memory") ?? "true",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!(me || sub || profile)]);

  // ── Name editing ─────────────────────────────────────────────────────────────
  async function saveName() {
    if (!nameInput.trim() || nameSaving) return;
    setNameSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update name");
      }
      await refetchMe();
      setIsEditingName(false);
      console.info("[SettingsAudit:Save] Account name updated");
      toast({ title: "Name updated", description: "Your display name has been saved." });
    } catch (err: any) {
      toast({ title: "Failed to save name", description: err.message, variant: "destructive" });
    } finally {
      setNameSaving(false);
    }
  }

  // ── Account deletion ──────────────────────────────────────────────────────────
  async function handleDeleteAccount() {
    if (deleteLoading) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete account. Please try again.");
      }
      // Clear all cached data and redirect to login
      queryClient.clear();
      navigate("/login");
    } catch (err: any) {
      setDeleteError(err.message);
      setDeleteLoading(false);
    }
  }

  // ── Clear coach memory ────────────────────────────────────────────────────────
  async function handleClearMemory() {
    if (clearMemoryLoading) return;
    setClearMemoryLoading(true);
    setClearMemoryError(null);
    try {
      const res = await fetch("/api/clear-memory", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to clear coach memory. Please try again.");
      }

      // Invalidate all user-specific queries so the UI reflects the clean slate
      await queryClient.invalidateQueries();

      // Clear any persisted local state tied to programs/history
      // (coach settings toggles in localStorage are intentionally preserved —
      //  they are preferences, not history)

      setShowClearMemoryConfirm(false);
      console.info("[ClearCoachMemory] Reset complete", data.cleared);
      toast({
        title: "Coach memory cleared",
        description: "Your chats, programs, and training history have been wiped. You're starting fresh.",
      });
    } catch (err: any) {
      setClearMemoryError(err.message);
    } finally {
      setClearMemoryLoading(false);
    }
  }

  const portalMutation = useMutation({
    mutationFn: openPortal,
    onSuccess: (url) => {
      console.info("[SettingsAudit:Billing] Stripe portal opened");
      window.location.href = url;
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  async function handleSelectPlan(planId: string, priceId?: string) {
    setShowPricing(false);
    if (!priceId) {
      setError("Price ID not available. Please try again.");
      return;
    }
    if (isAnonymousUser) {
      setAnonymousUpgradePlan({ planId, priceId });
      return;
    }
    try {
      const url = await startCheckout(priceId);
      if (url) window.location.href = url;
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        navigate("/login");
      },
    });
  }

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

  const userName = (me as any)?.name ?? "";
  const userEmail = (me as any)?.email ?? "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/chat")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">Account, billing & preferences</p>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-2.5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="space-y-8">

          {/* ── 1. ACCOUNT ── */}
          <section>
            <SectionHeader icon={<User className="w-4 h-4" />} title="Account" />
            <Card>
              {/* Avatar / name row */}
              <div className="flex items-center gap-4 px-4 py-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-base font-bold text-primary flex-shrink-0">
                  {isAnonymousUser
                    ? "TC"
                    : userName
                        .split(" ")
                        .map((n: string) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase() || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  {isEditingName && !isAnonymousUser ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveName();
                          if (e.key === "Escape") setIsEditingName(false);
                        }}
                        maxLength={100}
                        className="flex-1 min-w-0 bg-background border border-primary/40 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary/70"
                        placeholder="Your name"
                      />
                      <button
                        onClick={saveName}
                        disabled={nameSaving || !nameInput.trim()}
                        className="flex-shrink-0 p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors disabled:opacity-40"
                      >
                        {nameSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setIsEditingName(false)}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-accent/40 text-muted-foreground transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <p className="text-base font-bold text-foreground truncate">
                        {isAnonymousUser ? "Guest User" : userName || "Your Account"}
                      </p>
                      {!isAnonymousUser && (
                        <button
                          onClick={() => {
                            setNameInput(userName);
                            setIsEditingName(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-all flex-shrink-0"
                          title="Edit name"
                        >
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

              {!isAnonymousUser && userEmail && (
                <div className="flex items-center justify-between py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Email</span>
                  </div>
                  <span className="text-sm text-muted-foreground truncate max-w-[180px]">{userEmail}</span>
                </div>
              )}

              <SettingsRow
                label="Sign-in method"
                value={isAnonymousUser ? "Guest session" : "Email & password"}
                disabled
              />

              {isAnonymousUser ? (
                <div className="px-4 py-3">
                  <button
                    onClick={() => navigate("/register")}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
                  >
                    Create account to save progress
                  </button>
                </div>
              ) : (
                <>
                  <SettingsRow
                    label="Sign out"
                    onClick={handleLogout}
                    rightElement={<LogOut className="w-4 h-4 text-muted-foreground/60" />}
                  />
                  <SettingsRow
                    label="Delete account"
                    destructive
                    onClick={() => setShowDeleteConfirm(true)}
                    rightElement={<Trash2 className="w-4 h-4 text-red-400/60" />}
                  />
                </>
              )}
            </Card>

            {/* Delete confirmation */}
            {showDeleteConfirm && (
              <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-400">Permanently delete your account?</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      This will immediately cancel your subscription, delete all your training programs, conversation history, and coach memory. <strong className="text-foreground/70">This cannot be undone.</strong>
                    </p>
                  </div>
                </div>

                {deleteError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/15 border border-red-500/25">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-300">{deleteError}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteError(null);
                    }}
                    disabled={deleteLoading}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent/30 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleteLoading}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-sm font-semibold text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {deleteLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Deleting…
                      </>
                    ) : (
                      "Delete account"
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── 2. SUBSCRIPTION & BILLING ── */}
          <section>
            <SectionHeader icon={<CreditCard className="w-4 h-4" />} title="Subscription & Billing" subtitle="Managed securely via Stripe" />

            {subLoading ? (
              <div className="h-40 rounded-2xl bg-card/50 border border-border animate-pulse" />
            ) : (
              <div className="space-y-3">
                {/* Plan card */}
                <div className="rounded-2xl border border-border bg-card/50 p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <PlanIcon plan={plan} />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Current plan</p>
                        <p className="text-lg font-bold text-foreground">{PLAN_NAMES[plan] ?? plan}</p>
                      </div>
                    </div>
                    <StatusBadge status={displayStatus} />
                  </div>

                  <div className="space-y-2.5">
                    {billingInterval && isPaid && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <BarChart2 className="w-3.5 h-3.5" />
                          Billing cycle
                        </div>
                        <span className="font-medium text-foreground capitalize">{billingInterval}</span>
                      </div>
                    )}

                    {currentPeriodEnd && isPaid && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5" />
                          {cancelAtPeriodEnd ? "Access ends" : "Renews on"}
                        </div>
                        <span className="font-medium text-foreground">{formatDate(currentPeriodEnd)}</span>
                      </div>
                    )}

                    {trialEnd && (
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Zap className="w-3.5 h-3.5" />
                          Trial ends
                        </div>
                        <span className="font-medium text-foreground">{formatDate(trialEnd)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <CreditCard className="w-3.5 h-3.5" />
                        Payment method
                      </div>
                      <span className="font-medium text-foreground">Managed in Stripe</span>
                    </div>
                  </div>

                  {cancelAtPeriodEnd && currentPeriodEnd && (
                    <div className="mt-4 p-3 rounded-xl bg-amber-400/10 border border-amber-400/20">
                      <p className="text-xs text-amber-400 leading-relaxed">
                        Your subscription cancels on {formatDate(currentPeriodEnd)}. You'll retain full access until then. Reactivate anytime in the billing portal.
                      </p>
                    </div>
                  )}

                  {planStatus === "past_due" && (
                    <div className="mt-4 p-3 rounded-xl bg-red-400/10 border border-red-400/20">
                      <p className="text-xs text-red-400 leading-relaxed">
                        Your last payment failed. Open the billing portal to update your payment method and restore access.
                      </p>
                    </div>
                  )}
                </div>

                {/* Billing actions */}
                <Card>
                  {isPaid && (
                    <div className="px-4 py-3">
                      <button
                        onClick={() => portalMutation.mutate()}
                        disabled={portalMutation.isPending}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        <CreditCard className="w-4 h-4" />
                        {portalMutation.isPending ? "Opening portal…" : "Manage billing & payment"}
                      </button>
                      <p className="text-center text-[11px] text-muted-foreground/50 mt-2">
                        Update card · View invoices · Cancel or resume subscription
                      </p>
                    </div>
                  )}

                  {(!isPaid || !hasActiveAccess) && (
                    <div className="px-4 py-3">
                      <button
                        onClick={() => setShowPricing(true)}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all"
                      >
                        <Zap className="w-4 h-4" />
                        {isPaid ? "Reactivate subscription" : "Upgrade to Pro"}
                      </button>
                    </div>
                  )}

                  {isPaid && (
                    <SettingsRow
                      label="Billing history & invoices"
                      onClick={() => portalMutation.mutate()}
                      rightElement={<ExternalLink className="w-3.5 h-3.5 text-muted-foreground/50" />}
                    />
                  )}
                </Card>
              </div>
            )}
          </section>

          {/* ── 3. TRAINING PREFERENCES ── */}
          <section>
            <SectionHeader
              icon={<Dumbbell className="w-4 h-4" />}
              title="Training Preferences"
              subtitle="Used by your AI coach to build and adapt your program"
            />
            <TrainingPreferencesSection profile={profile} />
          </section>

          {/* ── 4. AI / COACH SETTINGS ── */}
          <section>
            <SectionHeader
              icon={<Brain className="w-4 h-4" />}
              title="AI Coach Settings"
              subtitle="Control how your coach communicates and behaves"
            />
            <CoachSettingsSection />
          </section>

          {/* ── 5. PRIVACY & DATA ── */}
          <section>
            <SectionHeader icon={<Shield className="w-4 h-4" />} title="Privacy & Data" />
            <Card>
              <SettingsRow
                label="Export my data"
                badge="Coming soon"
                disabled
              />
              <SettingsRow
                label="Clear coach memory"
                destructive
                onClick={() => {
                  console.info("[SettingsAudit:Privacy] Clear coach memory tapped");
                  setShowClearMemoryConfirm(true);
                  setClearMemoryError(null);
                }}
                rightElement={<AlertTriangle className="w-3.5 h-3.5 text-red-400/60" />}
              />
              <SettingsRow
                label="Privacy policy"
                onClick={() => navigate("/privacy")}
                rightElement={<ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
              />
              <SettingsRow
                label="Terms of service"
                onClick={() => navigate("/terms")}
                rightElement={<ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
              />
            </Card>

            {/* Clear memory confirmation */}
            {showClearMemoryConfirm && (
              <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-400">Clear coach memory?</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      This will remove your chats, training history, saved programs, session logs, and personalization so you can start fresh.{" "}
                      <strong className="text-foreground/70">Your account and membership will remain active.</strong>
                    </p>
                  </div>
                </div>

                {clearMemoryError && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/15 border border-red-500/25">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    <p className="text-xs text-red-300">{clearMemoryError}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowClearMemoryConfirm(false);
                      setClearMemoryError(null);
                    }}
                    disabled={clearMemoryLoading}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-accent/30 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleClearMemory}
                    disabled={clearMemoryLoading}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-sm font-semibold text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {clearMemoryLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Clearing…
                      </>
                    ) : (
                      "Clear memory"
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* ── 6. SUPPORT ── */}
          <section>
            <SectionHeader icon={<LifeBuoy className="w-4 h-4" />} title="Support" />
            <Card>
              <SettingsRow
                label="Contact support"
                onClick={() => {
                  console.info("[SettingsAudit:Support] Contact support modal opened");
                  setSupportModalType("contact");
                }}
                rightElement={<ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
              />
              <SettingsRow
                label="Report a bug"
                onClick={() => {
                  console.info("[SettingsAudit:Support] Bug report modal opened");
                  setSupportModalType("bug");
                }}
                rightElement={<ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
              />
              <SettingsRow
                label="Request a feature"
                onClick={() => {
                  console.info("[SettingsAudit:Support] Feature request modal opened");
                  setSupportModalType("feature");
                }}
                rightElement={<ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />}
              />
            </Card>
          </section>

          {/* App version */}
          <p className="text-center text-[11px] text-muted-foreground/30 pt-2">
            TrainChat · Settings
          </p>
        </div>
      </div>

      {showPricing && (
        <PricingModal
          onClose={() => setShowPricing(false)}
          onSelectPlan={handleSelectPlan}
          currentPlan={plan}
        />
      )}
      {anonymousUpgradePlan && (
        <AnonymousUpgradeModal
          planId={anonymousUpgradePlan.planId}
          priceId={anonymousUpgradePlan.priceId}
          onClose={() => setAnonymousUpgradePlan(null)}
        />
      )}
      {supportModalType && (
        <SupportModal
          type={supportModalType}
          onClose={() => setSupportModalType(null)}
          prefill={{
            name: (me as any)?.name ?? (me as any)?.displayName ?? "",
            email: (me as any)?.email ?? "",
            userId: (me as any)?.id ?? undefined,
            plan: plan ?? undefined,
          }}
        />
      )}
    </div>
  );
}
