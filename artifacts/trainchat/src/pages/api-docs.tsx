import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Copy,
  Check,
  Key,
  Zap,
  Lock,
  LayoutList,
  Shield,
  Play,
  AlertCircle,
  Gauge,
  Code2,
  GitCommit,
  Activity,
  ChevronRight,
  ExternalLink,
  Terminal,
  RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.trainchat.ai";

const SECTIONS: Section[] = [
  { id: "quickstart", label: "Quick Start", icon: Zap },
  { id: "authentication", label: "Authentication", icon: Lock },
  { id: "endpoints", label: "Endpoint Catalog", icon: LayoutList },
  { id: "permissions", label: "Permissions", icon: Shield },
  { id: "interactive", label: "Endpoint Reference", icon: Code2 },
  { id: "playground", label: "API Playground", icon: Play },
  { id: "errors", label: "Error Reference", icon: AlertCircle },
  { id: "rate-limits", label: "Rate Limits", icon: Gauge },
  { id: "sdk", label: "SDK / Code", icon: Terminal },
  { id: "changelog", label: "Changelog", icon: GitCommit },
  { id: "health", label: "API Health", icon: Activity },
];

const ENDPOINTS = [
  {
    method: "POST",
    path: "/api/external/program/generate",
    permission: "generate_program",
    description: "Generate a full multi-week training program",
    body: `{
  "goal": "strength and speed for football",
  "sport": "football",
  "schedule": "4 days/week",
  "experienceLevel": "intermediate",
  "equipment": ["barbell", "rack", "dumbbells"],
  "durationWeeks": 8,
  "focusMode": "strength"
}`,
  },
  {
    method: "POST",
    path: "/api/external/program/generate/stream",
    permission: "generate_program",
    description: "SSE streaming variant — emits stage events then a complete event",
    body: `{
  "goal": "hypertrophy",
  "experienceLevel": "intermediate",
  "focusMode": "strength"
}`,
  },
  {
    method: "POST",
    path: "/api/external/program/session",
    permission: "generate_session",
    description: "Generate a single training session",
    body: `{
  "goal": "upper body hypertrophy",
  "sessionType": "lifting",
  "duration": 60,
  "equipment": ["dumbbells", "cables"],
  "experienceLevel": "intermediate"
}`,
  },
  {
    method: "POST",
    path: "/api/external/program/edit",
    permission: "edit_program",
    description: "Refine or modify an existing program",
    body: `{
  "programId": 42,
  "instruction": "reduce lower body volume and add more upper body accessory work",
  "scope": "all"
}`,
  },
  {
    method: "POST",
    path: "/api/external/program/exercise-swap",
    permission: "exercise_swap",
    description: "Get a safe replacement for an exercise",
    body: `{
  "exerciseName": "Back Squat",
  "reason": "knee pain",
  "equipment": "full_gym",
  "injuries": ["knee"]
}`,
  },
  {
    method: "POST",
    path: "/api/external/program/explain",
    permission: "explain_program",
    description: "Get AI rationale and coaching explanation for a program",
    body: `{
  "programId": 42,
  "question": "Why did you choose this rep range?"
}`,
  },
  {
    method: "GET",
    path: "/api/external/program/:id",
    permission: "retrieve_program",
    description: "Retrieve a stored program by ID",
    body: "",
  },
  {
    method: "GET",
    path: "/api/external/exercises",
    permission: "list_exercises",
    description: "Browse the exercise library with search and filters",
    body: "",
  },
];

const PERMISSIONS = [
  { key: "generate_program", label: "Generate Program", description: "Generate full multi-week training programs" },
  { key: "edit_program", label: "Edit Program", description: "Modify and refine existing stored programs" },
  { key: "generate_session", label: "Generate Session", description: "Generate a single training day or session" },
  { key: "exercise_swap", label: "Exercise Swap", description: "Get stimulus-preserving replacements for exercises" },
  { key: "explain_program", label: "Explain Program", description: "Get AI coaching rationale for any program" },
  { key: "retrieve_program", label: "Retrieve Program", description: "Fetch stored programs by ID" },
  { key: "list_exercises", label: "List Exercises", description: "Browse and search the TrainChat exercise library" },
  { key: "manage_keys", label: "Manage Keys", description: "Reserved — key management uses session auth" },
];

const ERRORS = [
  { code: "MISSING_API_KEY", status: 401, description: "No Authorization header was sent" },
  { code: "INVALID_API_KEY_FORMAT", status: 401, description: "Token doesn't start with tc_" },
  { code: "INVALID_API_KEY", status: 401, description: "Key hash not found in database" },
  { code: "KEY_REVOKED", status: 401, description: "Key has been manually revoked" },
  { code: "KEY_EXPIRED", status: 401, description: "Key's expiry date has passed" },
  { code: "INSUFFICIENT_PERMISSIONS", status: 403, description: "Key lacks the required permission scope" },
  { code: "RATE_LIMIT_EXCEEDED", status: 429, description: "60 req/min window exhausted" },
  { code: "VALIDATION_ERROR", status: 400, description: "Request body or query params failed schema validation" },
  { code: "NOT_FOUND", status: 404, description: "Requested resource does not exist" },
  { code: "GENERATION_FAILED", status: 422, description: "AI did not produce structured output — add more detail" },
  { code: "INTERNAL_ERROR", status: 500, description: "Unexpected server-side failure" },
];

const PLAYGROUND_ENDPOINTS = [
  { label: "Generate Program", method: "POST", path: "/api/external/program/generate", defaultBody: `{\n  "goal": "build strength",\n  "experienceLevel": "intermediate",\n  "schedule": "4 days/week",\n  "focusMode": "strength"\n}` },
  { label: "Generate Session", method: "POST", path: "/api/external/program/session", defaultBody: `{\n  "goal": "upper body",\n  "sessionType": "lifting",\n  "duration": 60\n}` },
  { label: "Exercise Swap", method: "POST", path: "/api/external/program/exercise-swap", defaultBody: `{\n  "exerciseName": "Back Squat",\n  "reason": "no barbell",\n  "equipment": "dumbbells_only"\n}` },
  { label: "List Exercises", method: "GET", path: "/api/external/exercises?limit=5", defaultBody: "" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="p-1.5 rounded-md hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ code, language = "bash" }: { code: string; language?: string }) {
  return (
    <div className="relative rounded-lg bg-zinc-950 border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
        <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">{language}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
        {code}
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    POST: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    DELETE: "bg-red-500/10 text-red-400 border-red-500/20",
    PUT: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border font-mono ${colors[method] ?? "bg-muted/10 text-muted-foreground border-border"}`}>
      {method}
    </span>
  );
}

function SectionHeader({ id, label, icon: Icon, children }: { id: string; label: string; icon: React.ComponentType<{className?: string}>; children?: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20 pt-2">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="text-base font-bold text-foreground">{label}</h2>
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/50 my-8" />;
}

// ─── Section: Quick Start ─────────────────────────────────────────────────────

function QuickStart() {
  return (
    <SectionHeader id="quickstart" label="Quick Start" icon={Zap}>
      <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
        Get your first program generated in under 2 minutes.
      </p>

      <div className="space-y-5">
        {/* Step 1 */}
        <div className="flex gap-4">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 mt-0.5">1</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Create an API key</p>
            <p className="text-xs text-muted-foreground mb-2">Go to <a href="/settings/api-keys" className="text-primary underline underline-offset-2">Settings → API Keys</a> and create a key. Copy it immediately — it's shown only once.</p>
            <CodeBlock code={`tc_a1b2c3d4e5f6...  # Your key — store securely`} language="text" />
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-4">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 mt-0.5">2</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Generate your first program</p>
            <p className="text-xs text-muted-foreground mb-2">Send a POST request with your key in the Authorization header.</p>
            <CodeBlock code={`curl -X POST ${BASE_URL}/api/external/program/generate \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "goal": "build strength",
    "experienceLevel": "intermediate",
    "schedule": "4 days/week",
    "focusMode": "strength"
  }'`} language="bash" />
          </div>
        </div>

        {/* Step 3 */}
        <div className="flex gap-4">
          <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 mt-0.5">3</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Parse the response</p>
            <p className="text-xs text-muted-foreground mb-2">All responses wrap in a standard envelope. Store <code className="font-mono text-foreground/80 text-[11px]">programId</code> to edit or explain the program later.</p>
            <CodeBlock code={`{
  "success": true,
  "data": {
    "programId": 42,
    "programName": "4-Day Strength Block",
    "summary": "...",
    "sessions": [ /* ProgramDay[] */ ],
    "coachRationale": "...",
    "generatedAt": "2026-06-14T12:00:00.000Z"
  },
  "meta": null,
  "error": null
}`} language="json" />
          </div>
        </div>
      </div>
    </SectionHeader>
  );
}

// ─── Section: Authentication ──────────────────────────────────────────────────

function Authentication() {
  return (
    <SectionHeader id="authentication" label="Authentication" icon={Lock}>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
        All <code className="font-mono text-foreground/80 text-[11px]">/api/external/*</code> endpoints (except <code className="font-mono text-foreground/80 text-[11px]">/api/external/docs</code>) require a Bearer token.
      </p>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Token format</p>
          <CodeBlock code={`Authorization: Bearer tc_<64-character-hex-string>`} language="http" />

          <p className="text-xs font-semibold text-foreground mt-3">Key properties</p>
          <div className="space-y-2 text-xs text-muted-foreground">
            {[
              ["Format", "tc_ followed by 64 hex characters"],
              ["Storage", "SHA-256 hash only — raw key never stored"],
              ["Visibility", "Shown once at creation — cannot be recovered"],
              ["Revocation", "Immediate via Settings → API Keys or DELETE /api/external/keys/:id"],
              ["Expiry", "Optional — set at creation time"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="font-medium text-foreground/60 w-20 flex-shrink-0">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400/80">
          Key management endpoints (<code className="font-mono">POST /api/external/keys</code> etc.) use session cookie auth, not Bearer tokens. You must be logged into TrainChat to create or revoke keys.
        </div>
      </div>
    </SectionHeader>
  );
}

// ─── Section: Endpoint Catalog ────────────────────────────────────────────────

function EndpointCatalog() {
  return (
    <SectionHeader id="endpoints" label="Endpoint Catalog" icon={LayoutList}>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[80px_1fr_130px] bg-muted/30 border-b border-border px-4 py-2.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Method</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Path</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Permission</span>
        </div>
        {ENDPOINTS.map((ep, i) => (
          <div
            key={i}
            className={`grid grid-cols-[80px_1fr_130px] px-4 py-3 text-xs items-start gap-2 ${i < ENDPOINTS.length - 1 ? "border-b border-border/50" : ""}`}
          >
            <div><MethodBadge method={ep.method} /></div>
            <div>
              <code className="font-mono text-foreground/80 text-[11px] break-all">{ep.path}</code>
              <p className="text-muted-foreground mt-0.5 text-[11px]">{ep.description}</p>
            </div>
            <div>
              <span className="inline-block px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-mono border border-primary/20 break-all">
                {ep.permission}
              </span>
            </div>
          </div>
        ))}
        {/* Key management */}
        {[
          { method: "POST", path: "/api/external/keys", auth: "Session", desc: "Create a new API key" },
          { method: "GET", path: "/api/external/keys", auth: "Session", desc: "List your API keys" },
          { method: "DELETE", path: "/api/external/keys/:id", auth: "Session", desc: "Revoke an API key" },
          { method: "GET", path: "/api/external/keys/:id/logs", auth: "Session", desc: "View key request logs" },
          { method: "GET", path: "/api/external/docs", auth: "None", desc: "API reference (JSON)" },
        ].map((ep, i) => (
          <div
            key={`km-${i}`}
            className="grid grid-cols-[80px_1fr_130px] px-4 py-3 text-xs items-start gap-2 border-t border-border/50 opacity-70"
          >
            <div><MethodBadge method={ep.method} /></div>
            <div>
              <code className="font-mono text-foreground/80 text-[11px] break-all">{ep.path}</code>
              <p className="text-muted-foreground mt-0.5 text-[11px]">{ep.desc}</p>
            </div>
            <div>
              <span className="inline-block px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground text-[10px] font-mono border border-border">
                {ep.auth}
              </span>
            </div>
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}

// ─── Section: Permissions Reference ──────────────────────────────────────────

function PermissionsReference() {
  return (
    <SectionHeader id="permissions" label="Permissions Reference" icon={Shield}>
      <p className="text-sm text-muted-foreground mb-4">
        Each key carries a scoped permission set. A request returns <code className="font-mono text-foreground/80 text-[11px]">INSUFFICIENT_PERMISSIONS</code> if the key lacks the required scope.
      </p>
      <div className="space-y-2">
        {PERMISSIONS.map((p) => (
          <div
            key={p.key}
            className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <code className="font-mono text-[11px] text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded flex-shrink-0">{p.key}</code>
            <div>
              <p className="text-xs font-semibold text-foreground">{p.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}

// ─── Section: Interactive Endpoint Reference ──────────────────────────────────

function EndpointReference() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SectionHeader id="interactive" label="Endpoint Reference" icon={Code2}>
      <p className="text-sm text-muted-foreground mb-4">
        Full schema for each endpoint. Click to expand.
      </p>
      <div className="space-y-2">
        {ENDPOINTS.map((ep, i) => (
          <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
              onClick={() => setOpen(open === i ? null : i)}
            >
              <MethodBadge method={ep.method} />
              <code className="flex-1 font-mono text-[11px] text-foreground/80 break-all">{ep.path}</code>
              <ChevronRight
                className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform ${open === i ? "rotate-90" : ""}`}
              />
            </button>
            {open === i && (
              <div className="border-t border-border/50 px-4 py-4 space-y-3">
                <p className="text-xs text-muted-foreground">{ep.description}</p>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Required permission
                </div>
                <span className="inline-block px-2 py-1 rounded bg-primary/10 text-primary text-[11px] font-mono border border-primary/20">
                  {ep.permission}
                </span>
                {ep.body && (
                  <>
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3">
                      Request body
                    </div>
                    <CodeBlock code={ep.body} language="json" />
                  </>
                )}
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3">
                  curl example
                </div>
                <CodeBlock
                  code={ep.method === "GET"
                    ? `curl -X GET "${BASE_URL}${ep.path.replace(":id", "42")}" \\\n  -H "Authorization: Bearer YOUR_KEY"`
                    : `curl -X POST "${BASE_URL}${ep.path}" \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${ep.body}'`
                  }
                  language="bash"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}

// ─── Section: API Playground ──────────────────────────────────────────────────

function ApiPlayground() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [token, setToken] = useState("");
  const [body, setBody] = useState(PLAYGROUND_ENDPOINTS[0].defaultBody);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: number; data: string } | null>(null);

  const ep = PLAYGROUND_ENDPOINTS[selectedIdx];

  function handleSelect(idx: number) {
    setSelectedIdx(idx);
    setBody(PLAYGROUND_ENDPOINTS[idx].defaultBody);
    setResult(null);
  }

  async function run() {
    if (!token.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const opts: RequestInit = {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          ...(ep.method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(ep.method === "POST" && body ? { body } : {}),
      };
      const res = await fetch(ep.path, opts);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setResult({ status: res.status, data: pretty });
    } catch (err) {
      setResult({ status: 0, data: `Network error: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setLoading(false);
    }
  }

  const curlSnippet = ep.method === "GET"
    ? `curl -X GET "${BASE_URL}${ep.path}" \\\n  -H "Authorization: Bearer YOUR_KEY"`
    : `curl -X POST "${BASE_URL}${ep.path}" \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;

  const statusColor = !result ? "" : result.status >= 200 && result.status < 300 ? "text-green-400" : "text-red-400";

  return (
    <SectionHeader id="playground" label="API Playground" icon={Play}>
      <p className="text-sm text-muted-foreground mb-4">
        Test endpoints live. Your API key stays in the browser — nothing is logged.
      </p>

      <div className="space-y-4">
        {/* Token input */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Your API key <span className="text-red-400">*</span>
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="tc_..."
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono placeholder:text-muted-foreground/40"
          />
        </div>

        {/* Endpoint selector */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Endpoint</label>
          <div className="grid grid-cols-2 gap-1.5">
            {PLAYGROUND_ENDPOINTS.map((e, i) => (
              <button
                key={i}
                onClick={() => handleSelect(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-colors ${selectedIdx === i ? "border-primary/40 bg-primary/8 text-foreground" : "border-border text-muted-foreground hover:border-border/80 hover:bg-muted/20"}`}
              >
                <MethodBadge method={e.method} />
                <span className="truncate">{e.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Body editor */}
        {ep.method === "POST" && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Request body (JSON)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              className="w-full px-3 py-2 text-xs bg-zinc-950 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono text-zinc-300 resize-y"
            />
          </div>
        )}

        {/* Send button */}
        <button
          onClick={run}
          disabled={loading || !token.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {loading ? "Sending…" : "Send Request"}
        </button>

        {/* curl equivalent */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">curl equivalent</p>
          <CodeBlock code={curlSnippet} language="bash" />
        </div>

        {/* Response */}
        {result && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Response</p>
              {result.status > 0 && (
                <span className={`text-[10px] font-bold font-mono ${statusColor}`}>
                  {result.status}
                </span>
              )}
            </div>
            <div className="relative rounded-lg bg-zinc-950 border border-border overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
                <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">json</span>
                <CopyButton text={result.data} />
              </div>
              <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all max-h-96">
                {result.data}
              </pre>
            </div>
          </div>
        )}
      </div>
    </SectionHeader>
  );
}

// ─── Section: Error Reference ─────────────────────────────────────────────────

function ErrorReference() {
  return (
    <SectionHeader id="errors" label="Error Reference" icon={AlertCircle}>
      <p className="text-sm text-muted-foreground mb-4">
        All errors return the same envelope with a machine-readable <code className="font-mono text-foreground/80 text-[11px]">code</code> field.
      </p>
      <CodeBlock code={`{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable explanation"
  }
}`} language="json" />
      <div className="mt-4 rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-[180px_60px_1fr] bg-muted/30 border-b border-border px-4 py-2.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Code</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">HTTP</span>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Meaning</span>
        </div>
        {ERRORS.map((e, i) => (
          <div key={i} className={`grid grid-cols-[180px_60px_1fr] px-4 py-3 text-xs items-start gap-2 ${i < ERRORS.length - 1 ? "border-b border-border/40" : ""}`}>
            <code className="font-mono text-[10px] text-foreground/80 break-all">{e.code}</code>
            <span className={`font-mono font-bold text-[11px] ${e.status < 500 ? "text-amber-400" : "text-red-400"}`}>{e.status}</span>
            <span className="text-muted-foreground">{e.description}</span>
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}

// ─── Section: Rate Limits ─────────────────────────────────────────────────────

function RateLimits() {
  return (
    <SectionHeader id="rate-limits" label="Rate Limits" icon={Gauge}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Limit", value: "60 req/min", sub: "per API key" },
            { label: "Window", value: "60 seconds", sub: "sliding window" },
            { label: "Reset header", value: "X-RateLimit-Reset", sub: "Unix timestamp" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              <p className="text-lg font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
              <p className="text-[9px] text-muted-foreground/60 mt-1 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground">Response headers on every call</p>
          <div className="space-y-1.5 text-xs font-mono">
            {[
              ["X-RateLimit-Limit", "60 (total allowed in window)"],
              ["X-RateLimit-Remaining", "Requests remaining this window"],
              ["X-RateLimit-Reset", "Unix timestamp when window resets"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="text-primary/80 flex-shrink-0">{k}</span>
                <span className="text-muted-foreground">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-semibold text-foreground mb-2">Recommended retry strategy</p>
          <CodeBlock code={`// When you receive 429, wait until X-RateLimit-Reset
if (response.status === 429) {
  const resetAt = Number(response.headers.get("X-RateLimit-Reset")) * 1000;
  const delay = Math.max(0, resetAt - Date.now()) + 100; // +100ms buffer
  await sleep(delay);
  return retry(request);
}`} language="typescript" />
        </div>
      </div>
    </SectionHeader>
  );
}

// ─── Section: SDK / Code ──────────────────────────────────────────────────────

function SdkDocs() {
  const [lang, setLang] = useState<"ts" | "python" | "curl">("ts");

  const tsSnippet = `// TrainChat API Client — TypeScript
// No official SDK yet. Copy this wrapper into your project.

const TRAINCHAT_API = "https://www.trainchat.ai/api/external";

interface TCOptions {
  apiKey: string;
}

async function trainChatRequest<T>(
  opts: TCOptions,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(\`\${TRAINCHAT_API}\${path}\`, {
    method,
    headers: {
      Authorization: \`Bearer \${opts.apiKey}\`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const remaining = res.headers.get("X-RateLimit-Remaining");
  if (remaining && Number(remaining) < 5) {
    console.warn(\`[trainchat] Rate limit low: \${remaining} remaining\`);
  }

  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? "API error");
  return json.data as T;
}

// Usage
const program = await trainChatRequest(
  { apiKey: process.env.TRAINCHAT_API_KEY! },
  "POST",
  "/program/generate",
  { goal: "build strength", experienceLevel: "intermediate" },
);
console.log(program.programId, program.programName);`;

  const pythonSnippet = `# TrainChat API Client — Python
# No official SDK yet. Copy this wrapper into your project.

import os, requests, time

TRAINCHAT_API = "https://www.trainchat.ai/api/external"

def trainchat_request(method, path, body=None, api_key=None):
    key = api_key or os.environ["TRAINCHAT_API_KEY"]
    headers = {"Authorization": f"Bearer {key}"}
    if body:
        headers["Content-Type"] = "application/json"

    res = requests.request(
        method,
        f"{TRAINCHAT_API}{path}",
        headers=headers,
        json=body,
    )

    remaining = int(res.headers.get("X-RateLimit-Remaining", 999))
    if remaining < 5:
        print(f"[trainchat] Rate limit low: {remaining} remaining")

    data = res.json()
    if not data.get("success"):
        raise Exception(data.get("error", {}).get("message", "API error"))
    return data["data"]

# Usage
program = trainchat_request(
    "POST", "/program/generate",
    body={"goal": "build strength", "experienceLevel": "intermediate"}
)
print(program["programId"], program["programName"])`;

  const curlSnippet = `# Set your key once
export TC_KEY="tc_your_key_here"

# Generate a program
curl -s -X POST https://www.trainchat.ai/api/external/program/generate \\
  -H "Authorization: Bearer $TC_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"goal":"build strength","experienceLevel":"intermediate"}' | jq .

# List exercises
curl -s "https://www.trainchat.ai/api/external/exercises?limit=10&movementPattern=knee_dominant" \\
  -H "Authorization: Bearer $TC_KEY" | jq .data[].name`;

  return (
    <SectionHeader id="sdk" label="SDK / Code" icon={Terminal}>
      <p className="text-sm text-muted-foreground mb-4">
        No official SDK yet — use these copy-paste wrappers to get started. SDKs for TypeScript and Python are planned.
      </p>

      <div className="flex gap-1.5 mb-3">
        {(["ts", "python", "curl"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
          >
            {l === "ts" ? "TypeScript" : l === "python" ? "Python" : "curl / bash"}
          </button>
        ))}
      </div>

      <CodeBlock
        code={lang === "ts" ? tsSnippet : lang === "python" ? pythonSnippet : curlSnippet}
        language={lang === "ts" ? "typescript" : lang === "python" ? "python" : "bash"}
      />
    </SectionHeader>
  );
}

// ─── Section: Changelog ───────────────────────────────────────────────────────

function Changelog() {
  const entries = [
    {
      date: "June 2026",
      version: "v1.2",
      changes: [
        "Added research intelligence integration — method confidence scores are now multi-dimensional",
        "Performance profile version bumped to v2 (research-backed)",
        "Evidence summaries and contradiction flags added to program intelligence responses",
      ],
    },
    {
      date: "May 2026",
      version: "v1.1",
      changes: [
        "Added POST /api/external/program/explain endpoint",
        "Exercise library expanded — movementPattern and intentTags filters added",
        "Rate limit headers now included on all responses including 429s",
      ],
    },
    {
      date: "April 2026",
      version: "v1.0",
      changes: [
        "Initial External API release",
        "Program generate, session, edit, and exercise-swap endpoints",
        "API key management via Settings UI",
        "Per-key request logging and usage metrics",
      ],
    },
  ];

  return (
    <SectionHeader id="changelog" label="Changelog" icon={GitCommit}>
      <div className="space-y-5">
        {entries.map((e) => (
          <div key={e.version} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-primary/50 flex-shrink-0 mt-1.5" />
              <div className="w-px flex-1 bg-border/50 mt-1.5" />
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-bold text-foreground">{e.version}</span>
                <span className="text-[10px] text-muted-foreground">{e.date}</span>
              </div>
              <ul className="space-y-1">
                {e.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary/50 mt-0.5">›</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </SectionHeader>
  );
}

// ─── Section: API Health ──────────────────────────────────────────────────────

function ApiHealth() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [latency, setLatency] = useState<number | null>(null);
  const [detail, setDetail] = useState<string>("");

  async function check() {
    setStatus("loading");
    setLatency(null);
    setDetail("");
    const start = Date.now();
    try {
      const res = await fetch("/api/healthz");
      const ms = Date.now() - start;
      const json = await res.json().catch(() => ({}));
      setLatency(ms);
      if (res.ok) {
        setStatus("ok");
        setDetail(JSON.stringify(json, null, 2));
      } else {
        setStatus("error");
        setDetail(`HTTP ${res.status}`);
      }
    } catch (err) {
      setLatency(Date.now() - start);
      setStatus("error");
      setDetail(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <SectionHeader id="health" label="API Health" icon={Activity}>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-5">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
              status === "ok" ? "bg-green-500/10 border border-green-500/20"
              : status === "error" ? "bg-red-500/10 border border-red-500/20"
              : "bg-muted/30 border border-border"
            }`}
          >
            <Activity className={`w-5 h-5 ${status === "ok" ? "text-green-400" : status === "error" ? "text-red-400" : "text-muted-foreground"}`} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {status === "idle" && "Not checked"}
              {status === "loading" && "Checking…"}
              {status === "ok" && "API Operational"}
              {status === "error" && "API Unreachable"}
            </p>
            {latency !== null && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Response time: <span className={`font-mono font-bold ${latency < 300 ? "text-green-400" : latency < 1000 ? "text-amber-400" : "text-red-400"}`}>{latency}ms</span>
              </p>
            )}
            {status === "idle" && <p className="text-xs text-muted-foreground mt-0.5">Click to ping the TrainChat API.</p>}
          </div>
          <button
            onClick={check}
            disabled={status === "loading"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
            {status === "loading" ? "Checking…" : "Check now"}
          </button>
        </div>

        {detail && (
          <CodeBlock code={detail} language="json" />
        )}

        <div className="text-xs text-muted-foreground">
          Endpoint checked: <code className="font-mono text-foreground/70 text-[11px]">{BASE_URL}/api/healthz</code> →{" "}
          <a href={`${BASE_URL}/api/external/docs`} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 inline-flex items-center gap-0.5">
            View full API docs JSON <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </SectionHeader>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ active }: { active: string }) {
  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className="space-y-0.5">
      {SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition-colors ${
              isActive
                ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20"
            }`}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApiDocsPage() {
  const [, navigate] = useLocation();
  const [activeSection, setActiveSection] = useState("quickstart");
  const contentRef = useRef<HTMLDivElement>(null);

  // Track active section on scroll
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });

    return () => obs.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Page header */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/settings/api-keys")}
            className="p-2 rounded-lg hover:bg-accent/40 text-muted-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Code2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-bold text-foreground">Developer Documentation</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href="/settings/api-keys"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              API Keys
            </a>
            <a
              href={`${BASE_URL}/api/external/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Raw JSON <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="border-b border-border bg-gradient-to-b from-primary/4 to-transparent">
        <div className="max-w-6xl mx-auto px-4 py-10">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">TrainChat API</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono">v1.2</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Developer Documentation</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Integrate TrainChat's programming intelligence into your platform. Generate research-backed training programs, sessions, and exercise recommendations via a simple REST API.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                API Operational
              </span>
              <span className="text-xs text-muted-foreground">60 req/min</span>
              <span className="text-xs text-muted-foreground">Bearer token auth</span>
            </div>
          </div>
        </div>
      </div>

      {/* Body — sidebar + content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Sticky sidebar — desktop only */}
          <aside className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-20">
              <Sidebar active={activeSection} />
            </div>
          </aside>

          {/* Mobile nav — horizontal scroll */}
          <div className="lg:hidden w-full mb-6 -mx-4 px-4 overflow-x-auto">
            <div className="flex gap-1.5 pb-2 min-w-max">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      const el = document.getElementById(s.id);
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors whitespace-nowrap"
                  >
                    <Icon className="w-3 h-3" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Main content */}
          <main ref={contentRef} className="flex-1 min-w-0 space-y-2">
            <QuickStart />
            <Divider />
            <Authentication />
            <Divider />
            <EndpointCatalog />
            <Divider />
            <PermissionsReference />
            <Divider />
            <EndpointReference />
            <Divider />
            <ApiPlayground />
            <Divider />
            <ErrorReference />
            <Divider />
            <RateLimits />
            <Divider />
            <SdkDocs />
            <Divider />
            <Changelog />
            <Divider />
            <ApiHealth />
            <div className="h-16" />
          </main>
        </div>
      </div>
    </div>
  );
}
