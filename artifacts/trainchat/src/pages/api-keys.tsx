import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  ArrowLeft,
  AlertTriangle,
  Shield,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  orgId: string | null;
  permissions: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const ALL_PERMISSIONS = [
  { value: "generate_program", label: "Generate Program" },
  { value: "edit_program", label: "Edit Program" },
  { value: "generate_session", label: "Generate Session" },
  { value: "exercise_swap", label: "Exercise Swap" },
  { value: "explain_program", label: "Explain Program" },
  { value: "retrieve_program", label: "Retrieve Program" },
  { value: "list_exercises", label: "List Exercises" },
];

async function fetchKeys(): Promise<ApiKey[]> {
  const r = await fetch("/api/external/keys", { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load API keys");
  const json = await r.json();
  return json.data;
}

async function createKey(body: {
  name: string;
  permissions: string[];
  orgId?: string;
}): Promise<{ key: ApiKey & { key: string }; warning: string }> {
  const r = await fetch("/api/external/keys", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok || !json.success)
    throw new Error(json.error?.message ?? "Failed to create key");
  return { key: json.data, warning: json.meta?.warning ?? "" };
}

async function revokeKey(id: number): Promise<void> {
  const r = await fetch(`/api/external/keys/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!r.ok) {
    const json = await r.json().catch(() => ({}));
    throw new Error(json.error?.message ?? "Failed to revoke key");
  }
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return "Never";
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function PermissionBadge({ perm }: { perm: string }) {
  const label = ALL_PERMISSIONS.find((p) => p.value === perm)?.label ?? perm;
  return (
    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
      {label}
    </span>
  );
}

// ─── New Key Banner (shown once after creation) ───────────────────────────────

function NewKeyBanner({ rawKey, onDismiss }: { rawKey: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(rawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-400">Copy your key now</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            This is the only time the full key will be shown. It cannot be recovered.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-background/60 rounded-lg border border-border px-3 py-2.5">
        <code className="flex-1 text-xs font-mono text-foreground break-all select-all">
          {rawKey}
        </code>
        <button
          onClick={copy}
          className="flex-shrink-0 p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
      </div>
      <button
        onClick={onDismiss}
        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        I've saved my key — dismiss
      </button>
    </div>
  );
}

// ─── Create Key Form ──────────────────────────────────────────────────────────

function CreateKeyForm({ onSuccess, onCancel }: {
  onSuccess: (rawKey: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>(
    ALL_PERMISSIONS.map((p) => p.value),
  );
  const { toast } = useToast();

  const create = useMutation({
    mutationFn: createKey,
    onSuccess: ({ key }) => {
      onSuccess(key.key);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create key", description: err.message, variant: "destructive" });
    },
  });

  function togglePerm(perm: string) {
    setSelectedPerms((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (selectedPerms.length === 0) {
      toast({ title: "Select at least one permission", variant: "destructive" });
      return;
    }
    create.mutate({
      name: name.trim(),
      permissions: selectedPerms,
      orgId: orgId.trim() || undefined,
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-card p-4 space-y-4"
    >
      <p className="text-sm font-semibold text-foreground">New API Key</p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Key name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. TrainEfficiency Production"
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Org / team label <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <input
            type="text"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            placeholder="e.g. acme-corp"
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground/40"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-2">
            Permissions
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {ALL_PERMISSIONS.map((p) => (
              <label
                key={p.value}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border cursor-pointer hover:bg-accent/30 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedPerms.includes(p.value)}
                  onChange={() => togglePerm(p.value)}
                  className="rounded accent-primary"
                />
                <span className="text-xs text-foreground">{p.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={create.isPending || !name.trim()}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {create.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Key className="w-3.5 h-3.5" />
          )}
          {create.isPending ? "Creating…" : "Create key"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-accent/30 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Key Row ──────────────────────────────────────────────────────────────────

function KeyRow({ apiKey }: { apiKey: ApiKey }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const revoke = useMutation({
    mutationFn: () => revokeKey(apiKey.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-api-keys"] });
      toast({ title: "API key revoked" });
      setConfirmRevoke(false);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to revoke key", description: err.message, variant: "destructive" });
    },
  });

  const isExpired =
    apiKey.expiresAt != null && new Date(apiKey.expiresAt) < new Date();
  const effectivelyActive = apiKey.isActive && !isExpired;

  return (
    <div
      className={`rounded-xl border transition-colors ${
        effectivelyActive ? "border-border" : "border-border/40 opacity-60"
      } bg-card`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            effectivelyActive ? "bg-green-400" : "bg-muted-foreground/40"
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="text-sm font-medium text-foreground truncate">{apiKey.name}</p>
            {apiKey.orgId && (
              <span className="text-[10px] text-muted-foreground/60 truncate">{apiKey.orgId}</span>
            )}
          </div>
          <p className="text-xs font-mono text-muted-foreground mt-0.5">
            {apiKey.prefix}…
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {formatDate(apiKey.lastUsedAt)}
          </div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-md hover:bg-accent/40 text-muted-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Permissions
            </p>
            <div className="flex flex-wrap gap-1">
              {apiKey.permissions.map((p) => (
                <PermissionBadge key={p} perm={p} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
            <div>
              <p className="font-medium text-[10px] uppercase tracking-wider mb-0.5">Created</p>
              <p>{formatDate(apiKey.createdAt)}</p>
            </div>
            <div>
              <p className="font-medium text-[10px] uppercase tracking-wider mb-0.5">Last used</p>
              <p>{formatDate(apiKey.lastUsedAt)}</p>
            </div>
            {apiKey.expiresAt && (
              <div>
                <p className="font-medium text-[10px] uppercase tracking-wider mb-0.5">Expires</p>
                <p className={isExpired ? "text-red-400" : ""}>{formatDate(apiKey.expiresAt)}</p>
              </div>
            )}
          </div>

          {effectivelyActive && (
            <div className="pt-1">
              {!confirmRevoke ? (
                <button
                  onClick={() => setConfirmRevoke(true)}
                  className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Revoke key
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">Revoke this key permanently?</p>
                  <button
                    onClick={() => revoke.mutate()}
                    disabled={revoke.isPending}
                    className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                  >
                    {revoke.isPending ? "Revoking…" : "Yes, revoke"}
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(false)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {!effectivelyActive && (
            <p className="text-xs text-muted-foreground/60 italic">
              {isExpired ? "Expired" : "Revoked"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const [, navigate] = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: keys, isLoading, isError } = useQuery({
    queryKey: ["external-api-keys"],
    queryFn: fetchKeys,
  });

  function handleKeyCreated(rawKey: string) {
    setShowForm(false);
    setNewRawKey(rawKey);
    queryClient.invalidateQueries({ queryKey: ["external-api-keys"] });
  }

  const activeKeys = keys?.filter((k) => k.isActive) ?? [];
  const revokedKeys = keys?.filter((k) => !k.isActive) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/chat")}
            className="p-2 rounded-lg hover:bg-accent/40 text-muted-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Key className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">API Keys</h1>
              <p className="text-xs text-muted-foreground">
                Manage keys for the TrainChat external API
              </p>
            </div>
          </div>
        </div>

        {/* Docs callout */}
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border">
          <Shield className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>
              Keys authenticate against{" "}
              <code className="font-mono text-foreground/80">/api/external/*</code>. Pass them as{" "}
              <code className="font-mono text-foreground/80">Authorization: Bearer &lt;key&gt;</code>.
            </p>
            <p>
              Rate limit: 60 req/min per key.{" "}
              <a
                href="/api/external/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                View full API reference →
              </a>
            </p>
          </div>
        </div>

        {/* New key banner */}
        {newRawKey && (
          <NewKeyBanner rawKey={newRawKey} onDismiss={() => setNewRawKey(null)} />
        )}

        {/* Create form or button */}
        {showForm ? (
          <CreateKeyForm
            onSuccess={handleKeyCreated}
            onCancel={() => setShowForm(false)}
          />
        ) : (
          <button
            onClick={() => {
              setNewRawKey(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 text-sm text-muted-foreground hover:text-foreground transition-all duration-150 w-full justify-center"
          >
            <Plus className="w-3.5 h-3.5" />
            Create new API key
          </button>
        )}

        {/* Keys list */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Failed to load API keys. Try refreshing.
          </div>
        )}

        {!isLoading && !isError && keys && (
          <div className="space-y-5">
            {/* Active keys */}
            {activeKeys.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Active — {activeKeys.length}
                </p>
                {activeKeys.map((k) => (
                  <KeyRow key={k.id} apiKey={k} />
                ))}
              </div>
            )}

            {/* Revoked keys */}
            {revokedKeys.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Revoked — {revokedKeys.length}
                </p>
                {revokedKeys.map((k) => (
                  <KeyRow key={k.id} apiKey={k} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {keys.length === 0 && !showForm && (
              <div className="text-center py-10 space-y-2">
                <Key className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                <p className="text-sm text-muted-foreground">No API keys yet</p>
                <p className="text-xs text-muted-foreground/60">
                  Create a key to start integrating with the TrainChat API.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
