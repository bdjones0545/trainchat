import { useState, useEffect } from "react";
import { X, ChevronDown, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getDefaultHeaders } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupportType = "contact" | "bug" | "feature";

interface SupportModalProps {
  type: SupportType;
  onClose: () => void;
  prefill?: { name?: string; email?: string; userId?: number; plan?: string };
}

// ─── Field configs ────────────────────────────────────────────────────────────

const CONTACT_TOPICS = [
  "Account",
  "Billing",
  "Subscription",
  "Program question",
  "Technical issue",
  "Other",
];

const BUG_CATEGORIES = [
  "Program generation",
  "Settings",
  "Billing",
  "UI / design",
  "Login / account",
  "Other",
];

const FEATURE_PRIORITIES = [
  "Nice to have",
  "Important",
  "Very important",
];

const TYPE_META: Record<SupportType, { title: string; subtitle: string; color: string }> = {
  contact: {
    title: "Contact Support",
    subtitle: "We'll get back to you by email as soon as possible.",
    color: "#38bdf8",
  },
  bug: {
    title: "Report a Bug",
    subtitle: "Tell us what went wrong — we'll investigate right away.",
    color: "#f97316",
  },
  feature: {
    title: "Request a Feature",
    subtitle: "Share what you'd love to see. Every request is reviewed.",
    color: "#a78bfa",
  },
};

// ─── Validation helpers ───────────────────────────────────────────────────────

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const required = (v: string) => v.trim().length > 0;

// ─── Select component ─────────────────────────────────────────────────────────

function Select({
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  error?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none bg-[#0f172a] border ${error ? "border-red-500/60" : "border-white/10"} rounded-xl px-4 py-3 pr-10 text-sm text-foreground focus:outline-none focus:border-white/25 transition-colors`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label,
  required: req,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label} {req && <span className="text-red-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/60">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  error,
  readOnly,
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  error?: string;
  readOnly?: boolean;
}) {
  return (
    <div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full bg-[#0f172a] border ${error ? "border-red-500/60" : "border-white/10"} rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/25 transition-colors ${readOnly ? "opacity-60 cursor-default" : ""}`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  error?: string;
}) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full bg-[#0f172a] border ${error ? "border-red-500/60" : "border-white/10"} rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-white/25 transition-colors resize-none`}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function SupportModal({ type, onClose, prefill }: SupportModalProps) {
  const meta = TYPE_META[type];

  // Shared fields
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");

  // Contact
  const [contactTopic, setContactTopic] = useState("");
  const [contactMessage, setContactMessage] = useState("");

  // Bug
  const [bugCategory, setBugCategory] = useState("");
  const [bugWhat, setBugWhat] = useState("");
  const [bugExpected, setBugExpected] = useState("");
  const [bugSteps, setBugSteps] = useState("");

  // Feature
  const [featureTitle, setFeatureTitle] = useState("");
  const [featureWhat, setFeatureWhat] = useState("");
  const [featureWhy, setFeatureWhy] = useState("");
  const [featurePriority, setFeaturePriority] = useState("");

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  // Auto-capture device info
  const deviceInfo = navigator.userAgent;
  const currentRoute = window.location.pathname;

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!required(name)) errs.name = "Your name is required";
    if (!required(email)) errs.email = "Your email is required";
    else if (!isValidEmail(email)) errs.email = "Please enter a valid email address";

    if (type === "contact") {
      if (!required(contactTopic)) errs.contactTopic = "Please select a topic";
      if (!required(contactMessage)) errs.contactMessage = "Please describe how we can help";
    }

    if (type === "bug") {
      if (!required(bugCategory)) errs.bugCategory = "Please select a category";
      if (!required(bugWhat)) errs.bugWhat = "Please describe what happened";
      if (!required(bugExpected)) errs.bugExpected = "Please describe what you expected";
    }

    if (type === "feature") {
      if (!required(featureTitle)) errs.featureTitle = "Please give your feature a title";
      if (!required(featureWhat)) errs.featureWhat = "Please describe what you want added";
      if (!required(featureWhy)) errs.featureWhy = "Please describe why this would help";
      if (!required(featurePriority)) errs.featurePriority = "Please select a priority";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitted || submitting) return;

    if (!validate()) return;

    setSubmitting(true);

    // Build the message payload (structured for bug type)
    let message = "";
    let category: string | undefined;
    let subject: string | undefined;

    if (type === "contact") {
      message = contactMessage.trim();
      category = contactTopic;
    } else if (type === "bug") {
      message = JSON.stringify({
        whatHappened: bugWhat.trim(),
        expectedBehavior: bugExpected.trim(),
        stepsToReproduce: bugSteps.trim() || null,
      });
      category = bugCategory;
    } else {
      message = `${featureWhat.trim()}\n\nWhy this would help:\n${featureWhy.trim()}`;
      subject = featureTitle.trim();
      category = featurePriority;
    }

    const payload = {
      type,
      name: name.trim(),
      email: email.trim(),
      category,
      subject,
      message,
      metadata: {
        userId: prefill?.userId ?? null,
        plan: prefill?.plan ?? null,
        deviceInfo,
        currentRoute,
        environment: import.meta.env.MODE ?? "unknown",
        timestamp: new Date().toISOString(),
      },
    };

    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getDefaultHeaders() },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { success?: boolean; message?: string; error?: string };

      if (res.ok && data.success) {
        setSubmitted(true);
        setSubmitResult({ success: true, message: data.message ?? "Your message has been sent to TrainChat support." });
      } else {
        setSubmitResult({ success: false, message: data.error ?? "Something went wrong. Please try again." });
      }
    } catch {
      setSubmitResult({ success: false, message: "Network error. Please check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (submitted && submitResult?.success) {
    return (
      <ModalShell onClose={onClose} color={meta.color}>
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground mb-1">Message sent</p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {submitResult.message}
            </p>
          </div>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-sm font-medium text-foreground transition-colors"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} color={meta.color}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/8 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{meta.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{meta.subtitle}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 overflow-y-auto max-h-[65vh]">
        {/* Global error */}
        {submitResult && !submitResult.success && (
          <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{submitResult.message}</p>
          </div>
        )}

        {/* Name + Email */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" required>
            <TextInput value={name} onChange={setName} placeholder="Your name" error={errors.name} />
          </Field>
          <Field label="Email" required>
            <TextInput value={email} onChange={setEmail} placeholder="you@email.com" type="email" error={errors.email} />
          </Field>
        </div>

        {/* ── CONTACT fields ─────────────────────────────── */}
        {type === "contact" && (
          <>
            <Field label="Topic" required>
              <Select
                value={contactTopic}
                onChange={setContactTopic}
                options={CONTACT_TOPICS}
                placeholder="Select a topic"
                error={errors.contactTopic}
              />
            </Field>
            <Field label="Message" required>
              <TextArea
                value={contactMessage}
                onChange={setContactMessage}
                placeholder="How can we help you?"
                rows={5}
                error={errors.contactMessage}
              />
            </Field>
          </>
        )}

        {/* ── BUG REPORT fields ──────────────────────────── */}
        {type === "bug" && (
          <>
            <Field label="Bug category" required>
              <Select
                value={bugCategory}
                onChange={setBugCategory}
                options={BUG_CATEGORIES}
                placeholder="Select a category"
                error={errors.bugCategory}
              />
            </Field>
            <Field label="What happened?" required>
              <TextArea
                value={bugWhat}
                onChange={setBugWhat}
                placeholder="Describe what went wrong..."
                rows={3}
                error={errors.bugWhat}
              />
            </Field>
            <Field label="What did you expect to happen?" required>
              <TextArea
                value={bugExpected}
                onChange={setBugExpected}
                placeholder="Describe the expected behavior..."
                rows={3}
                error={errors.bugExpected}
              />
            </Field>
            <Field label="Steps to reproduce" hint="Optional — helps us fix it faster">
              <TextArea
                value={bugSteps}
                onChange={setBugSteps}
                placeholder="1. Go to...\n2. Click...\n3. See error"
                rows={3}
              />
            </Field>
            <Field label="Device / browser" hint="Auto-captured">
              <TextInput value={deviceInfo} readOnly />
            </Field>
          </>
        )}

        {/* ── FEATURE REQUEST fields ─────────────────────── */}
        {type === "feature" && (
          <>
            <Field label="Feature title" required>
              <TextInput
                value={featureTitle}
                onChange={setFeatureTitle}
                placeholder="Short name for your idea"
                error={errors.featureTitle}
              />
            </Field>
            <Field label="What do you want added?" required>
              <TextArea
                value={featureWhat}
                onChange={setFeatureWhat}
                placeholder="Describe the feature in detail..."
                rows={4}
                error={errors.featureWhat}
              />
            </Field>
            <Field label="Why would this help you?" required>
              <TextArea
                value={featureWhy}
                onChange={setFeatureWhy}
                placeholder="How would this improve your training or experience?"
                rows={3}
                error={errors.featureWhy}
              />
            </Field>
            <Field label="Priority" required>
              <Select
                value={featurePriority}
                onChange={setFeaturePriority}
                options={FEATURE_PRIORITIES}
                placeholder="How important is this?"
                error={errors.featurePriority}
              />
            </Field>
          </>
        )}

        {/* Submit */}
        <div className="pt-2 pb-1">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending…
              </>
            ) : (
              `Send ${type === "contact" ? "Message" : type === "bug" ? "Bug Report" : "Feature Request"}`
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function ModalShell({ children, onClose, color }: { children: React.ReactNode; onClose: () => void; color: string }) {
  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className="relative w-full sm:max-w-lg bg-[#0f1929] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        style={{ borderTop: `2px solid ${color}22` }}
      >
        {/* Drag handle on mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/15" />
        </div>
        {children}
      </div>
    </div>
  );
}
