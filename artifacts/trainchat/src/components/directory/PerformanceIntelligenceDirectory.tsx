import { useState } from "react";
import {
  ALL_PRODUCTS,
  CATEGORY_DEFINITIONS,
  DIRECTORY_STATS,
  FEATURED_PRODUCTS,
  type ProductCategory,
  type DirectoryProduct,
} from "@/data/directory/products";

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar() {
  const stats = [
    { value: DIRECTORY_STATS.exercises, label: "Exercises" },
    { value: DIRECTORY_STATS.products, label: "Products" },
    { value: DIRECTORY_STATS.methods, label: "Training Methods" },
    { value: DIRECTORY_STATS.sports, label: "Sports" },
  ];

  return (
    <div
      className="rounded-2xl px-6 py-5 mb-10"
      style={{
        background: "hsl(222 47% 8%)",
        border: "1px solid hsl(220 20% 14%)",
      }}
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
            <span
              className="text-2xl sm:text-3xl font-bold tabular-nums"
              style={{ color: "#f4f4f5" }}
            >
              {s.value}
            </span>
            <span className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>
      <p
        className="text-center text-[10px] mt-4 font-medium uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.22)" }}
      >
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
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl p-4 transition-all duration-200 group"
      style={{
        background: isActive
          ? "hsl(199 89% 48% / 0.10)"
          : "hsl(222 47% 8%)",
        border: isActive
          ? "1px solid hsl(199 89% 48% / 0.35)"
          : "1px solid hsl(220 20% 14%)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "hsl(222 47% 10%)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "hsl(220 20% 20%)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLButtonElement).style.background =
            "hsl(222 47% 8%)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "hsl(220 20% 14%)";
        }
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xl">{category.icon}</span>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            background: isActive
              ? "hsl(199 89% 48% / 0.15)"
              : "rgba(255,255,255,0.05)",
            color: isActive
              ? "hsl(199 89% 68%)"
              : "rgba(255,255,255,0.35)",
          }}
        >
          {count}
        </span>
      </div>
      <h3
        className="text-sm font-semibold mb-2.5"
        style={{ color: isActive ? "#f4f4f5" : "#d4d4d8" }}
      >
        {category.name}
      </h3>
      <ul className="space-y-1">
        {category.examples.map((ex) => (
          <li
            key={ex}
            className="text-[11px] flex items-center gap-1.5"
            style={{ color: "rgba(255,255,255,0.38)" }}
          >
            <span
              className="w-1 h-1 rounded-full flex-shrink-0"
              style={{
                background: isActive
                  ? "hsl(199 89% 48%)"
                  : "rgba(255,255,255,0.22)",
              }}
            />
            {ex}
          </li>
        ))}
      </ul>
    </button>
  );
}

// ─── Cost Tier Badge ──────────────────────────────────────────────────────────

function CostTierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    "$": "rgba(74, 222, 128, 0.15)",
    "$$": "rgba(251, 191, 36, 0.15)",
    "$$$": "rgba(251, 146, 60, 0.15)",
    "$$$$": "rgba(248, 113, 113, 0.15)",
  };
  const textColors: Record<string, string> = {
    "$": "rgb(74, 222, 128)",
    "$$": "rgb(251, 191, 36)",
    "$$$": "rgb(251, 146, 60)",
    "$$$$": "rgb(248, 113, 113)",
  };
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: colors[tier] ?? "rgba(255,255,255,0.08)",
        color: textColors[tier] ?? "rgba(255,255,255,0.5)",
      }}
    >
      {tier}
    </span>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: DirectoryProduct }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 transition-all duration-200 group"
      style={{
        background: "hsl(222 47% 8%)",
        border: "1px solid hsl(220 20% 14%)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background =
          "hsl(222 47% 10%)";
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "hsl(220 20% 20%)";
        (e.currentTarget as HTMLDivElement).style.transform =
          "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background =
          "hsl(222 47% 8%)";
        (e.currentTarget as HTMLDivElement).style.borderColor =
          "hsl(220 20% 14%)";
        (e.currentTarget as HTMLDivElement).style.transform = "none";
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
      <div>
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

      {/* TrainChat badge */}
      <div className="pt-1 border-t" style={{ borderColor: "hsl(220 20% 12%)" }}>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold"
          style={{ color: "hsl(199 89% 58%)" }}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Supported By TrainChat
        </span>
      </div>
    </div>
  );
}

// ─── Filtered Product List ────────────────────────────────────────────────────

function FilteredProductList({
  category,
  onClose,
}: {
  category: ProductCategory;
  onClose: () => void;
}) {
  const products = ALL_PRODUCTS.filter((p) => p.category === category);

  return (
    <div
      className="rounded-2xl overflow-hidden mt-4"
      style={{ border: "1px solid hsl(199 89% 48% / 0.2)" }}
    >
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{
          background: "hsl(199 89% 48% / 0.07)",
          borderBottom: "1px solid hsl(199 89% 48% / 0.15)",
        }}
      >
        <div>
          <h4 className="text-sm font-semibold" style={{ color: "#f4f4f5" }}>
            {category}
          </h4>
          <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>
            {products.length} products in directory
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{
            color: "rgba(255,255,255,0.42)",
            background: "rgba(255,255,255,0.05)",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.75)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.color =
              "rgba(255,255,255,0.42)")
          }
        >
          Close
        </button>
      </div>
      <div
        className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        style={{ background: "hsl(222 47% 7%)" }}
      >
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

export function PerformanceIntelligenceDirectory() {
  const [activeCategory, setActiveCategory] =
    useState<ProductCategory | null>(null);

  const handleCategoryClick = (cat: ProductCategory) => {
    setActiveCategory((prev) => (prev === cat ? null : cat));
  };

  const categoryCounts = CATEGORY_DEFINITIONS.reduce(
    (acc, cat) => {
      acc[cat.name] = ALL_PRODUCTS.filter(
        (p) => p.category === cat.name
      ).length;
      return acc;
    },
    {} as Record<ProductCategory, number>
  );

  return (
    <section
      className="w-full px-4 sm:px-6 py-16 sm:py-20"
      style={{ background: "hsl(222 47% 6%)" }}
      aria-label="Performance Intelligence Directory"
    >
      <div className="max-w-6xl mx-auto">

        {/* ── Section header ─────────────────────────────────────────────── */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-widest mb-5"
            style={{
              background: "hsl(199 89% 48% / 0.10)",
              border: "1px solid hsl(199 89% 48% / 0.25)",
              color: "hsl(199 89% 58%)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "hsl(199 89% 58%)" }}
            />
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
            throughout the performance industry. Explore a growing directory of
            products commonly used by coaches, athletes, rehabilitation
            specialists, and performance facilities.
          </p>
        </div>

        {/* ── Stats bar ──────────────────────────────────────────────────── */}
        <StatsBar />

        {/* ── Category grid ──────────────────────────────────────────────── */}
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

        {/* ── Filtered list (shows on category click) ─────────────────────── */}
        {activeCategory && (
          <FilteredProductList
            category={activeCategory}
            onClose={() => setActiveCategory(null)}
          />
        )}

        {/* ── Featured product cards ──────────────────────────────────────── */}
        <div className="mt-12">
          <h3
            className="text-xs font-semibold uppercase tracking-widest mb-4"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            Featured in Directory
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {FEATURED_PRODUCTS.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>

        {/* ── CTA ────────────────────────────────────────────────────────── */}
        <div
          className="mt-12 rounded-2xl p-6 sm:p-8 text-center"
          style={{
            background: "hsl(199 89% 48% / 0.06)",
            border: "1px solid hsl(199 89% 48% / 0.18)",
          }}
        >
          <h3
            className="text-lg font-bold mb-2"
            style={{ color: "#f4f4f5" }}
          >
            Ask TrainChat about any of these tools.
          </h3>
          <p
            className="text-sm mb-5 max-w-md mx-auto"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            Our AI understands how each piece of equipment fits into a
            periodized program. Ask for a sled protocol, a flywheel progression,
            or a recovery stack — it knows the context.
          </p>
          <a
            href="/chat"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
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
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Build your training system — free
          </a>
        </div>
      </div>
    </section>
  );
}
