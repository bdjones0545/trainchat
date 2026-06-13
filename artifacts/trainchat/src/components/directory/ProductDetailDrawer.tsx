import { useEffect, useRef } from "react";
import { type DirectoryProduct } from "@/data/directory/products";
import { EXTENDED_PRODUCT_DATA, type ExtendedProductOverride } from "@/data/directory/product-extended";
import { getMethodsForProduct } from "@/data/directory/training-methods";

// ─── Badge helpers ─────────────────────────────────────────────────────────────

function EvidenceBadge({ rating }: { rating: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    High:      { bg: "rgba(74,222,128,0.12)",  text: "rgb(74,222,128)" },
    Moderate:  { bg: "rgba(251,191,36,0.12)",  text: "rgb(251,191,36)" },
    Emerging:  { bg: "rgba(251,146,60,0.12)",  text: "rgb(251,146,60)" },
    Anecdotal: { bg: "rgba(161,161,170,0.12)", text: "rgb(161,161,170)" },
  };
  const c = cfg[rating] ?? cfg.Anecdotal;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: c.bg, color: c.text }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: c.text }}
      />
      {rating} Evidence
    </span>
  );
}

function BudgetBadge({ level }: { level: string }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    Entry:        { bg: "rgba(74,222,128,0.10)",  text: "rgb(74,222,128)" },
    "Mid-Range":  { bg: "rgba(251,191,36,0.10)",  text: "rgb(251,191,36)" },
    Professional: { bg: "rgba(251,146,60,0.10)",  text: "rgb(251,146,60)" },
    Elite:        { bg: "rgba(248,113,113,0.10)", text: "rgb(248,113,113)" },
  };
  const c = cfg[level] ?? cfg["Mid-Range"];
  return (
    <span
      className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
      style={{ background: c.bg, color: c.text }}
    >
      {level}
    </span>
  );
}

function CostTierBadge({ tier }: { tier: string }) {
  const bg: Record<string, string> = {
    "$": "rgba(74,222,128,0.12)", "$$": "rgba(251,191,36,0.12)",
    "$$$": "rgba(251,146,60,0.12)", "$$$$": "rgba(248,113,113,0.12)",
  };
  const tx: Record<string, string> = {
    "$": "rgb(74,222,128)", "$$": "rgb(251,191,36)",
    "$$$": "rgb(251,146,60)", "$$$$": "rgb(248,113,113)",
  };
  return (
    <span
      className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full"
      style={{ background: bg[tier] ?? "rgba(255,255,255,0.08)", color: tx[tier] ?? "#fff" }}
    >
      {tier} Cost
    </span>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4" style={{ borderBottom: "1px solid hsl(220 20% 12%)" }}>
      <p
        className="text-[9px] font-bold uppercase tracking-widest mb-3"
        style={{ color: "rgba(255,255,255,0.25)" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// ─── Pill chip ────────────────────────────────────────────────────────────────

function Chip({ label, accent = false }: { label: string; accent?: boolean }) {
  return (
    <span
      className="inline-flex text-[10px] font-medium px-2.5 py-1 rounded-full"
      style={{
        background: accent
          ? "hsl(199 89% 48% / 0.10)"
          : "rgba(255,255,255,0.06)",
        color: accent ? "hsl(199 89% 62%)" : "rgba(255,255,255,0.55)",
        border: accent
          ? "1px solid hsl(199 89% 48% / 0.20)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {label}
    </span>
  );
}

// ─── Use-case prompt card ──────────────────────────────────────────────────────

function PromptCard({ prompt }: { prompt: string }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(prompt).catch(() => {});
  };

  return (
    <button
      onClick={handleCopy}
      className="w-full text-left rounded-lg px-3 py-2.5 flex items-start gap-2.5 transition-all duration-150 group"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "hsl(199 89% 48% / 0.07)";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "hsl(199 89% 48% / 0.20)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(255,255,255,0.04)";
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "rgba(255,255,255,0.07)";
      }}
      title="Click to copy"
    >
      <svg
        className="w-3 h-3 mt-0.5 flex-shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        style={{ color: "hsl(199 89% 50%)" }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 10.5h8m-8 4h5M12 2a10 10 0 110 20A10 10 0 0112 2z"
        />
      </svg>
      <span
        className="text-[11px] leading-relaxed flex-1"
        style={{ color: "rgba(255,255,255,0.60)" }}
      >
        {prompt}
      </span>
      <svg
        className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
        />
      </svg>
    </button>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export function ProductDetailDrawer({
  product,
  onClose,
}: {
  product: DirectoryProduct;
  onClose: () => void;
}) {
  const extended = EXTENDED_PRODUCT_DATA[product.name];
  const relatedMethods = getMethodsForProduct(product.name);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40"
        style={{ background: "rgba(5, 9, 18, 0.72)", backdropFilter: "blur(4px)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* ── Drawer panel ──────────────────────────────────────────────────── */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{
          width: "min(520px, 100vw)",
          background: "hsl(222 47% 7%)",
          borderLeft: "1px solid hsl(220 20% 14%)",
          overflowY: "auto",
        }}
        role="dialog"
        aria-label={`${product.name} product details`}
      >
        {/* ── Sticky header ─────────────────────────────────────────────── */}
        <div
          className="sticky top-0 z-10 px-5 pt-5 pb-4"
          style={{
            background: "hsl(222 47% 7%)",
            borderBottom: "1px solid hsl(220 20% 12%)",
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <h2
                className="text-base font-bold leading-snug"
                style={{ color: "#f4f4f5" }}
              >
                {product.name}
              </h2>
              {product.brand && (
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {product.brand}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.45)",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.12)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  "rgba(255,255,255,0.06)")
              }
              aria-label="Close"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* badges row */}
          <div className="flex flex-wrap gap-2">
            <span
              className="text-[10px] font-medium px-2.5 py-1 rounded-full"
              style={{
                background: "hsl(199 89% 48% / 0.10)",
                color: "hsl(199 89% 60%)",
                border: "1px solid hsl(199 89% 48% / 0.20)",
              }}
            >
              {product.category}
            </span>
            {product.subcategory && (
              <span
                className="text-[10px] font-medium px-2.5 py-1 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "rgba(255,255,255,0.40)",
                }}
              >
                {product.subcategory}
              </span>
            )}
            <CostTierBadge tier={product.costTier} />
            {extended?.evidenceRating && (
              <EvidenceBadge rating={extended.evidenceRating} />
            )}
            {extended?.recommendedBudget && (
              <BudgetBadge level={extended.recommendedBudget} />
            )}
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────── */}
        <div className="flex-1 px-5">

          {/* Description */}
          {extended?.description && (
            <DrawerSection title="Description">
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "rgba(255,255,255,0.58)" }}
              >
                {extended.description}
              </p>
            </DrawerSection>
          )}

          {/* Primary Use */}
          <DrawerSection title="Primary Use">
            <p className="text-[12px] font-semibold" style={{ color: "#d4d4d8" }}>
              {product.primaryUse}
            </p>
          </DrawerSection>

          {/* Training Adaptations */}
          {extended?.trainingAdaptations && extended.trainingAdaptations.length > 0 && (
            <DrawerSection title="Training Adaptations">
              <div className="flex flex-wrap gap-1.5">
                {extended.trainingAdaptations.map((a) => (
                  <Chip key={a} label={a} accent />
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Physical Qualities */}
          {(extended?.primaryQualities?.length || extended?.secondaryQualities?.length) && (
            <DrawerSection title="Physical Qualities">
              {extended.primaryQualities?.length > 0 && (
                <div className="mb-2">
                  <p
                    className="text-[9px] font-semibold uppercase tracking-widest mb-1.5"
                    style={{ color: "rgba(255,255,255,0.30)" }}
                  >
                    Primary
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {extended.primaryQualities.map((q) => (
                      <Chip key={q} label={q} accent />
                    ))}
                  </div>
                </div>
              )}
              {extended.secondaryQualities?.length > 0 && (
                <div>
                  <p
                    className="text-[9px] font-semibold uppercase tracking-widest mb-1.5"
                    style={{ color: "rgba(255,255,255,0.30)" }}
                  >
                    Secondary
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {extended.secondaryQualities.map((q) => (
                      <Chip key={q} label={q} />
                    ))}
                  </div>
                </div>
              )}
            </DrawerSection>
          )}

          {/* Movement Patterns */}
          {extended?.movementPatterns && extended.movementPatterns.length > 0 && (
            <DrawerSection title="Movement Patterns">
              <div className="flex flex-wrap gap-1.5">
                {extended.movementPatterns.map((m) => (
                  <Chip key={m} label={m} />
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Energy Systems */}
          {extended?.energySystems && extended.energySystems.length > 0 && extended.energySystems[0] !== "N/A" && (
            <DrawerSection title="Energy Systems">
              <div className="flex flex-wrap gap-1.5">
                {extended.energySystems.map((e) => (
                  <Chip key={e} label={e} />
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Sports Transfer */}
          {product.sports && product.sports.length > 0 && (
            <DrawerSection title="Sports Transfer">
              <div className="flex flex-wrap gap-1.5">
                {product.sports.map((s) => (
                  <Chip key={s} label={s} />
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Supported Training Methods */}
          {(relatedMethods.length > 0 || extended?.relatedMethods?.length > 0) && (
            <DrawerSection title="Supported Training Methods">
              <div className="space-y-2">
                {relatedMethods.length > 0
                  ? relatedMethods.map((m) => (
                      <div
                        key={m.name}
                        className="rounded-lg px-3 py-2.5"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        <p className="text-[11px] font-semibold" style={{ color: "#d4d4d8" }}>
                          {m.name}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.40)" }}>
                          {m.primaryGoal}
                        </p>
                      </div>
                    ))
                  : extended.relatedMethods?.map((name) => (
                      <div
                        key={name}
                        className="rounded-lg px-3 py-2"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        <p className="text-[11px] font-semibold" style={{ color: "#d4d4d8" }}>
                          {name}
                        </p>
                      </div>
                    ))}
              </div>
            </DrawerSection>
          )}

          {/* Alternative Products */}
          {extended?.alternatives && extended.alternatives.length > 0 && (
            <DrawerSection title="Alternative Products">
              <div className="flex flex-wrap gap-1.5">
                {extended.alternatives.map((a) => (
                  <Chip key={a} label={a} />
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Contraindications */}
          {extended?.contraindications && extended.contraindications.length > 0 && (
            <DrawerSection title="Contraindications / Cautions">
              <ul className="space-y-1">
                {extended.contraindications.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-[11px]" style={{ color: "rgba(248,113,113,0.75)" }}>
                    <svg className="w-3 h-3 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    {c}
                  </li>
                ))}
              </ul>
            </DrawerSection>
          )}

          {/* TrainChat Use Cases */}
          {extended?.useCasePrompts && extended.useCasePrompts.length > 0 && (
            <DrawerSection title="Ask TrainChat">
              <p
                className="text-[10px] mb-3"
                style={{ color: "rgba(255,255,255,0.32)" }}
              >
                Click any prompt to copy it, then paste it into TrainChat.
              </p>
              <div className="space-y-2">
                {extended.useCasePrompts.map((prompt) => (
                  <PromptCard key={prompt} prompt={prompt} />
                ))}
              </div>
            </DrawerSection>
          )}

          {/* Fallback for products without extended data */}
          {!extended && (
            <DrawerSection title="Ask TrainChat">
              <PromptCard prompt={`Tell me how to use ${product.name} in a training program.`} />
              <div className="mt-2">
                <PromptCard prompt={`What sports benefit most from ${product.name}?`} />
              </div>
            </DrawerSection>
          )}

          {/* CTA */}
          <div className="py-5">
            <a
              href="/chat"
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: "hsl(199 89% 48%)",
                color: "hsl(222 47% 6%)",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.background =
                  "hsl(199 89% 56%)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.background =
                  "hsl(199 89% 48%)")
              }
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Build a program using this tool
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
