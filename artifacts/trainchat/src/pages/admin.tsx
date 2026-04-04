import { useState, useEffect } from "react";
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

type DateRange = "7d" | "30d" | "all";

// ─── Helper fetch ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
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
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(value, 100)}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono w-12 text-right" style={{ color }}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { data: me, isLoading: meLoading } = useGetMe();

  const [range, setRange] = useState<DateRange>("30d");
  const [funnel, setFunnel] = useState<FunnelResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [events, setEvents] = useState<RecentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!meLoading && !me) navigate("/login");
  }, [me, meLoading, navigate]);

  // Fetch data on range change
  useEffect(() => {
    if (!me) return;

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
  }, [me, range]);

  if (meLoading || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(222 47% 7%)" }}>
        <div className="text-zinc-500 text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white" style={{ background: "hsl(222 47% 7%)" }}>
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(222 47% 14%)" }}>
        <div>
          <h1 className="text-xl font-bold">TrainChat Analytics</h1>
          <p className="text-zinc-500 text-xs mt-0.5">Funnel performance & conversion</p>
        </div>
        {/* Date range toggle */}
        <div className="flex gap-1 rounded-lg p-1" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
          {(["7d", "30d", "all"] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: range === r ? "hsl(199 89% 48%)" : "transparent",
                color: range === r ? "#fff" : "hsl(0 0% 60%)",
              }}
            >
              {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "All time"}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto space-y-8">
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
            {/* ── Platform Summary ──────────────────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Platform Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Users" value={analytics.users.total} sub={`+${analytics.users.newThisWeek} this week`} />
                <StatCard label="Paid Users" value={analytics.users.paid} sub={`${analytics.users.conversionRate}% conversion`} />
                <StatCard label="Total Messages" value={analytics.messages.total.toLocaleString()} sub={`${analytics.messages.thisWeek} this week`} />
                <StatCard label="Programs Generated" value={analytics.programs.total} />
              </div>

              {/* Plan breakdown */}
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
                {/* ── Key Conversion Stats ─────────────────────── */}
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

                {/* ── Funnel Table ─────────────────────────────── */}
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
                          <tr
                            key={row.event}
                            style={{
                              background: i % 2 === 0 ? "hsl(222 47% 8%)" : "hsl(222 47% 9%)",
                              borderBottom: "1px solid hsl(222 47% 14%)",
                            }}
                          >
                            <td className="px-4 py-3 text-zinc-200">{row.step}</td>
                            <td className="px-4 py-3 text-right font-mono text-white font-semibold">{row.count.toLocaleString()}</td>
                            <td className="px-4 py-3">
                              {row.conversionPct !== null ? (
                                <PctBar value={row.conversionPct} />
                              ) : (
                                <span className="text-zinc-600 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* ── Drop-off Analysis ────────────────────────── */}
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
                          <tr
                            key={row.stage}
                            style={{
                              background: i % 2 === 0 ? "hsl(222 47% 8%)" : "hsl(222 47% 9%)",
                              borderBottom: "1px solid hsl(222 47% 14%)",
                            }}
                          >
                            <td className="px-4 py-3 text-zinc-300">{row.stage}</td>
                            <td className="px-4 py-3 text-right font-mono text-zinc-200">{row.count.toLocaleString()}</td>
                            <td className="px-4 py-3">
                              {row.count > 0 ? <PctBar value={row.pct} /> : <span className="text-zinc-600 text-xs">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {/* ── Recent Events ────────────────────────────────── */}
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
                          <tr
                            key={ev.id}
                            style={{
                              background: i % 2 === 0 ? "hsl(222 47% 8%)" : "hsl(222 47% 9%)",
                              borderBottom: "1px solid hsl(222 47% 13%)",
                            }}
                          >
                            <td className="px-4 py-2.5">
                              <span
                                className="inline-block px-2 py-0.5 rounded text-xs font-mono"
                                style={{ background: "hsl(199 89% 15%)", color: "hsl(199 89% 65%)" }}
                              >
                                {ev.event}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">
                              {ev.deviceId ? ev.deviceId.substring(0, 12) + "…" : ev.userId ? `user:${ev.userId}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-zinc-500 whitespace-nowrap">
                              {new Date(ev.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-zinc-600 max-w-xs truncate">
                              {ev.properties ? JSON.stringify(ev.properties) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ── A/B Testing Info ─────────────────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">A/B Testing</h2>
              <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
                <p className="text-zinc-300 text-sm mb-2">
                  A/B variant assignment is active. New guest sessions are randomly assigned <code className="text-blue-400">control</code> or <code className="text-blue-400">variant_a</code> (50/50).
                </p>
                <p className="text-zinc-500 text-xs">
                  To run a test: update the <code className="text-zinc-400">ab_variant</code> assignment logic in <code className="text-zinc-400">guestService.ts</code> and filter funnel events by <code className="text-zinc-400">properties.abVariant</code> for comparison.
                </p>
              </div>
            </section>

            {/* ── Conversion Config ────────────────────────────── */}
            <section>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">Conversion Settings</h2>
              <div className="rounded-xl p-4" style={{ background: "hsl(222 47% 11%)", border: "1px solid hsl(222 47% 18%)" }}>
                <p className="text-zinc-300 text-sm mb-3">
                  All conversion controls are in a single config file:
                </p>
                <ul className="space-y-2 text-sm">
                  {[
                    ["Teaser limits, paywall copy, CTA text, feature bullets", "artifacts/trainchat/src/lib/guestConfig.ts"],
                    ["Backend teaser enforcement limits", "artifacts/api-server/src/lib/guestMerge.ts (TEASER_GENERATE_LIMIT, TEASER_TOTAL_LIMIT)"],
                    ["Plan tier definitions & message limits", "artifacts/api-server/src/lib/planGating.ts"],
                    ["Event names", "artifacts/trainchat/src/lib/guestConfig.ts → EVENTS"],
                  ].map(([desc, path]) => (
                    <li key={path} className="flex flex-col gap-0.5">
                      <span className="text-zinc-400">{desc}</span>
                      <code className="text-xs text-blue-400">{path}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <p className="text-zinc-700 text-xs text-center pb-4">
              Data refreshed at {funnel ? new Date(funnel.generatedAt).toLocaleString() : new Date(analytics.generatedAt).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
