import { useState } from "react";
import {
  ALL_PRODUCTS,
  CATEGORY_DEFINITIONS,
  DIRECTORY_STATS,
  FEATURED_PRODUCTS,
  type ProductCategory,
  type DirectoryProduct,
} from "@/data/directory/products";
import {
  CATEGORY_METHOD_MAP,
  CATEGORY_TOP_QUALITIES,
  KNOWLEDGE_GRAPH,
  type GoalNode,
} from "@/data/directory/knowledge-graph";
import { EXTENDED_PRODUCT_DATA } from "@/data/directory/product-extended";
import { ProductDetailDrawer } from "./ProductDetailDrawer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: bg[tier] ?? "rgba(255,255,255,0.08)", color: tx[tier] ?? "#fff" }}
    >
      {tier}
    </span>
  );
}

function EvidenceDot({ rating }: { rating?: string }) {
  const colors: Record<string, string> = {
    High: "rgb(74,222,128)", Moderate: "rgb(251,191,36)",
    Emerging: "rgb(251,146,60)", Anecdotal: "rgb(161,161,170)",
  };
  if (!rating) return null;
  return (
    <span
      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ background: colors[rating] ?? colors.Anecdotal }}
      title={`${rating} evidence`}
    />
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  const stats = [
    { value: DIRECTORY_STATS.exercises, label: "Exercises" },
    { value: DIRECTORY_STATS.products,  label: "Products" },
    { value: DIRECTORY_STATS.methods,   label: "Training Methods" },
    { value: DIRECTORY_STATS.sports,    label: "Sports" },
  ];
  return (
    <div
      className="rounded-2xl px-6 py-5 mb-10"
      style={{ background: "hsl(222 47% 8%)", border: "1px solid hsl(220 20% 14%)" }}
    >
      <p
        className="text-center text-xs font-semibold uppercase tracking-widest mb-5"
        style={{ color: "hsl(199 89% 48%)" }}
      >
        Performance Intelligence Network
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col items-center text-center">
            <span className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: "#f4f4f5" }}>
              {s.value}
            </span>
            <span className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
      <p className="text-center text-[10px] mt-4 font-medium uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.22)" }}>
        Growing Daily
      </p>
    </div>
  );
}

// ─── Category Card ────────────────────────────────────────────────────────────

function CategoryCard({
  category,
  isActive,
  onClick,
  count,
}: {
  category: (typeof CATEGORY_DEFINITIONS)[number];
  isActive: boolean;
  onClick: () => void;
  count: number;
}) {
  const methodCount =
    CATEGORY_METHOD_MAP[category.name as ProductCategory]?.length ?? 0;
  const topQualities =
    CATEGORY_TOP_QUALITIES[category.name as ProductCategory] ?? [];

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-4 transition-all duration-200"
      style={{
        background: isActive ? "hsl(199 89% 48% / 0.10)" : "hsl(222 47% 8%)",
        border: isActive
          ? "1px solid hsl(199 89% 48% / 0.35)"
          : "1px solid hsl(220 20% 14%)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = "hsl(222 47% 10%)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(220 20% 20%)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background = "hsl(222 47% 8%)";
          (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(220 20% 14%)";
        }
      }}
    >
      {/* top row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{category.icon}</span>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
            style={{
              background: isActive ? "hsl(199 89% 48% / 0.15)" : "rgba(255,255,255,0.05)",
              color: isActive ? "hsl(199 89% 68%)" : "rgba(255,255,255,0.30)",
            }}
          >
            {count} products
          </span>
          {methodCount > 0 && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.25)",
              }}
            >
              {methodCount} methods
            </span>
          )}
        </div>
      </div>

      {/* name */}
      <h3 className="text-sm font-semibold mb-2" style={{ color: isActive ? "#f4f4f5" : "#d4d4d8" }}>
        {category.name}
      </h3>

      {/* top qualities */}
      {topQualities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {topQualities.map((q) => (
            <span
              key={q}
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: isActive ? "hsl(199 89% 48% / 0.08)" : "rgba(255,255,255,0.04)",
                color: isActive ? "hsl(199 89% 60%)" : "rgba(255,255,255,0.28)",
              }}
            >
              {q}
            </span>
          ))}
        </div>
      )}

      {/* examples */}
      <ul className="space-y-1">
        {category.examples.map((ex) => (
          <li key={ex} className="text-[11px] flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.38)" }}>
            <span
              className="w-1 h-1 rounded-full flex-shrink-0"
              style={{ background: isActive ? "hsl(199 89% 48%)" : "rgba(255,255,255,0.22)" }}
            />
            {ex}
          </li>
        ))}
      </ul>
    </button>
  );
}

// ─── Product Card (clickable) ─────────────────────────────────────────────────

function ProductCard({
  product,
  onClick,
}: {
  product: DirectoryProduct;
  onClick: () => void;
}) {
  const extended = EXTENDED_PRODUCT_DATA[product.name];

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-4 flex flex-col gap-3 transition-all duration-200 group"
      style={{
        background: "hsl(222 47% 8%)",
        border: "1px solid hsl(220 20% 14%)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "hsl(222 47% 10%)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(220 20% 20%)";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "hsl(222 47% 8%)";
        (e.currentTarget as HTMLButtonElement).style.borderColor = "hsl(220 20% 14%)";
        (e.currentTarget as HTMLButtonElement).style.transform = "none";
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold leading-snug" style={{ color: "#f4f4f5" }}>
            {product.name}
          </h4>
          {product.brand && (
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.32)" }}>
              {product.brand}
            </p>
          )}
        </div>
        <CostTierBadge tier={product.costTier} />
      </div>

      {/* Category chip */}
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{
            background: "hsl(199 89% 48% / 0.08)",
            color: "hsl(199 89% 58%)",
            border: "1px solid hsl(199 89% 48% / 0.18)",
          }}
        >
          {product.category}
        </span>
        {extended?.evidenceRating && (
          <EvidenceDot rating={extended.evidenceRating} />
        )}
      </div>

      {/* Details */}
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <span className="text-[10px] w-20 flex-shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
            Primary Use
          </span>
          <span className="text-[11px] font-medium" style={{ color: "#d4d4d8" }}>
            {product.primaryUse}
          </span>
        </div>
        {extended?.primaryQualities && extended.primaryQualities.length > 0 && (
          <div className="flex gap-2">
            <span className="text-[10px] w-20 flex-shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
              Qualities
            </span>
            <span className="text-[11px]" style={{ color: "#a1a1aa" }}>
              {extended.primaryQualities.slice(0, 2).join(", ")}
            </span>
          </div>
        )}
        {product.sports && product.sports.length > 0 && (
          <div className="flex gap-2">
            <span className="text-[10px] w-20 flex-shrink-0" style={{ color: "rgba(255,255,255,0.28)" }}>
              Best For
            </span>
            <span className="text-[11px]" style={{ color: "#a1a1aa" }}>
              {product.sports.slice(0, 3).join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-1 flex items-center justify-between border-t" style={{ borderColor: "hsl(220 20% 12%)" }}>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "hsl(199 89% 58%)" }}>
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Supported By TrainChat
        </span>
        <span className="text-[9px] opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "rgba(255,255,255,0.5)" }}>
          View details →
        </span>
      </div>
    </button>
  );
}

// ─── Filtered Product List ────────────────────────────────────────────────────

function FilteredProductList({
  category,
  onClose,
  onProductClick,
}: {
  category: ProductCategory;
  onClose: () => void;
  onProductClick: (product: DirectoryProduct) => void;
}) {
  const products = ALL_PRODUCTS.filter((p) => p.category === category);
  const methodCount = CATEGORY_METHOD_MAP[category]?.length ?? 0;
  const topQualities = CATEGORY_TOP_QUALITIES[category] ?? [];

  return (
    <div
      className="rounded-2xl overflow-hidden mt-4"
      style={{ border: "1px solid hsl(199 89% 48% / 0.2)" }}
    >
      <div
        className="px-5 py-3"
        style={{
          background: "hsl(199 89% 48% / 0.07)",
          borderBottom: "1px solid hsl(199 89% 48% / 0.15)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold" style={{ color: "#f4f4f5" }}>
              {category}
            </h4>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>
                {products.length} products
              </span>
              {methodCount > 0 && (
                <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                  {methodCount} training methods
                </span>
              )}
            </div>
            {topQualities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {topQualities.map((q) => (
                  <span
                    key={q}
                    className="text-[9px] px-2 py-0.5 rounded-full"
                    style={{
                      background: "hsl(199 89% 48% / 0.10)",
                      color: "hsl(199 89% 60%)",
                    }}
                  >
                    {q}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ color: "rgba(255,255,255,0.42)", background: "rgba(255,255,255,0.05)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.75)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.42)")
            }
          >
            Close
          </button>
        </div>
      </div>
      <div
        className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        style={{ background: "hsl(222 47% 7%)" }}
      >
        {products.map((p) => (
          <ProductCard key={p.id} product={p} onClick={() => onProductClick(p)} />
        ))}
      </div>
    </div>
  );
}

// ─── Knowledge Graph Section ──────────────────────────────────────────────────

function KnowledgeChainRow({ node }: { node: GoalNode }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200"
      style={{ border: "1px solid hsl(220 20% 13%)" }}
    >
      {/* Goal header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors"
        style={{
          background: expanded ? "hsl(199 89% 48% / 0.07)" : "hsl(222 47% 8%)",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (!expanded)
            (e.currentTarget as HTMLButtonElement).style.background = "hsl(222 47% 10%)";
        }}
        onMouseLeave={(e) => {
          if (!expanded)
            (e.currentTarget as HTMLButtonElement).style.background = "hsl(222 47% 8%)";
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-base">{node.icon}</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#f4f4f5" }}>
              {node.goal}
            </p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              {node.description}
            </p>
          </div>
        </div>
        <svg
          className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
          style={{
            color: "rgba(255,255,255,0.35)",
            transform: expanded ? "rotate(180deg)" : "none",
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Chains */}
      {expanded && (
        <div
          className="p-4 space-y-3"
          style={{
            background: "hsl(222 47% 7%)",
            borderTop: "1px solid hsl(220 20% 11%)",
          }}
        >
          {node.chains.map((chain, i) => (
            <div
              key={i}
              className="rounded-lg p-3"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Chain flow */}
              <div className="flex items-center flex-wrap gap-2 mb-2.5">
                {[
                  { label: chain.physicalQuality, icon: "🎯" },
                  { label: chain.trainingMethod,   icon: "⚙️" },
                  { label: chain.product,           icon: "🔧" },
                ].map((step, si) => (
                  <div key={si} className="flex items-center gap-1.5">
                    {si > 0 && (
                      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} style={{ color: "rgba(255,255,255,0.20)" }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                      style={{
                        background: si === 2
                          ? "hsl(199 89% 48% / 0.10)"
                          : "rgba(255,255,255,0.05)",
                        color: si === 2
                          ? "hsl(199 89% 60%)"
                          : "rgba(255,255,255,0.50)",
                        border: si === 2
                          ? "1px solid hsl(199 89% 48% / 0.20)"
                          : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Expected adaptation */}
              <div className="flex items-start gap-2">
                <svg className="w-3 h-3 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" style={{ color: "rgb(74,222,128)" }}>
                  <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.48)" }}>
                  {chain.expectedAdaptation}
                </p>
              </div>

              {/* Sports */}
              {chain.sports && chain.sports.length > 0 && chain.sports[0] !== "All Sports" && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {chain.sports.slice(0, 4).map((s) => (
                    <span
                      key={s}
                      className="text-[9px] px-1.5 py-0.5 rounded"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        color: "rgba(255,255,255,0.28)",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KnowledgeGraphSection() {
  return (
    <div className="mt-14">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3
            className="text-xs font-semibold uppercase tracking-widest mb-1.5"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            Knowledge Graph
          </h3>
          <p className="text-sm font-semibold" style={{ color: "#d4d4d8" }}>
            Goal → Quality → Method → Product → Adaptation
          </p>
          <p className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.38)" }}>
            TrainChat understands why tools exist and what they develop. Click any goal to explore the chain.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {KNOWLEDGE_GRAPH.map((node) => (
          <KnowledgeChainRow key={node.goal} node={node} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export function PerformanceIntelligenceDirectory() {
  const [activeCategory, setActiveCategory] = useState<ProductCategory | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<DirectoryProduct | null>(null);

  const handleCategoryClick = (cat: ProductCategory) => {
    setActiveCategory((prev) => (prev === cat ? null : cat));
  };

  const categoryCounts = CATEGORY_DEFINITIONS.reduce(
    (acc, cat) => {
      acc[cat.name] = ALL_PRODUCTS.filter((p) => p.category === cat.name).length;
      return acc;
    },
    {} as Record<ProductCategory, number>
  );

  return (
    <>
      {/* Product detail drawer (portal-style, fixed) */}
      {selectedProduct && (
        <ProductDetailDrawer
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <section
        className="w-full px-4 sm:px-6 py-16 sm:py-20"
        style={{ background: "hsl(222 47% 6%)" }}
        aria-label="Performance Intelligence Directory"
      >
        <div className="max-w-6xl mx-auto">

          {/* ── Section header ──────────────────────────────────────────── */}
          <div className="text-center mb-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-widest mb-5"
              style={{
                background: "hsl(199 89% 48% / 0.10)",
                border: "1px solid hsl(199 89% 48% / 0.25)",
                color: "hsl(199 89% 58%)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "hsl(199 89% 58%)" }} />
              Performance Intelligence Directory
            </div>
            <h2
              className="text-2xl sm:text-3xl font-bold mb-4 leading-tight"
              style={{ color: "#f4f4f5" }}
            >
              TrainChat doesn't just generate workouts.
            </h2>
            <p
              className="text-sm sm:text-base leading-relaxed max-w-2xl mx-auto"
              style={{ color: "rgba(255,255,255,0.50)" }}
            >
              It understands the equipment, tools, technologies, and systems used
              throughout the performance industry — and <em>why</em> each one exists.
              Explore a structured knowledge layer of products, methods, and relationships.
            </p>
          </div>

          {/* ── Stats bar ───────────────────────────────────────────────── */}
          <StatsBar />

          {/* ── Category grid ───────────────────────────────────────────── */}
          <div className="mb-3">
            <h3
              className="text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: "rgba(255,255,255,0.28)" }}
            >
              Browse by Category
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CATEGORY_DEFINITIONS.map((cat) => (
                <CategoryCard
                  key={cat.name}
                  category={cat}
                  isActive={activeCategory === cat.name}
                  onClick={() => handleCategoryClick(cat.name)}
                  count={categoryCounts[cat.name]}
                />
              ))}
            </div>
          </div>

          {/* ── Filtered list ────────────────────────────────────────────── */}
          {activeCategory && (
            <FilteredProductList
              category={activeCategory}
              onClose={() => setActiveCategory(null)}
              onProductClick={setSelectedProduct}
            />
          )}

          {/* ── Featured product cards ───────────────────────────────────── */}
          <div className="mt-12">
            <h3
              className="text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: "rgba(255,255,255,0.28)" }}
            >
              Featured in Directory
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {FEATURED_PRODUCTS.map((p) => (
                <ProductCard key={p.id} product={p} onClick={() => setSelectedProduct(p)} />
              ))}
            </div>
          </div>

          {/* ── Knowledge Graph ──────────────────────────────────────────── */}
          <KnowledgeGraphSection />

          {/* ── CTA ─────────────────────────────────────────────────────── */}
          <div
            className="mt-12 rounded-2xl p-6 sm:p-8 text-center"
            style={{
              background: "hsl(199 89% 48% / 0.06)",
              border: "1px solid hsl(199 89% 48% / 0.18)",
            }}
          >
            <h3 className="text-lg font-bold mb-2" style={{ color: "#f4f4f5" }}>
              Ask TrainChat about any of these tools.
            </h3>
            <p
              className="text-sm mb-5 max-w-md mx-auto"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              Our AI understands how each piece of equipment fits into a periodized
              program — and the relationships between goals, qualities, methods, and products.
            </p>
            <a
              href="/chat"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "hsl(199 89% 48%)", color: "hsl(222 47% 6%)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.background = "hsl(199 89% 56%)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.background = "hsl(199 89% 48%)")
              }
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Build your training system — free
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
