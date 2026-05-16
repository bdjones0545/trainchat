import { useLocation } from "wouter";
import { ChevronLeft, Zap } from "lucide-react";
import { useEffect } from "react";

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface AeoLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
  schema?: object;
  canonical?: string;
  breadcrumbs?: BreadcrumbItem[];
  ogTitle?: string;
  ogDescription?: string;
  articleDatePublished?: string;
  articleDateModified?: string;
}

export default function AeoLayout({
  title,
  description,
  children,
  schema,
  canonical,
  breadcrumbs,
  ogTitle,
  ogDescription,
  articleDatePublished,
  articleDateModified,
}: AeoLayoutProps) {
  const [, navigate] = useLocation();

  useEffect(() => {
    const resolvedTitle = `${title} | TrainChat®`;
    const resolvedOgTitle = ogTitle ?? resolvedTitle;
    const resolvedOgDesc = ogDescription ?? description;

    // --- Document title ---
    const prevTitle = document.title;
    document.title = resolvedTitle;

    // --- Meta description ---
    const metaDescEl = document.querySelector('meta[name="description"]');
    const prevDesc = metaDescEl?.getAttribute("content") ?? "";
    if (metaDescEl) metaDescEl.setAttribute("content", description);

    // --- Open Graph: title ---
    const ogTitleEl = document.querySelector('meta[property="og:title"]');
    const prevOgTitle = ogTitleEl?.getAttribute("content") ?? "";
    if (ogTitleEl) ogTitleEl.setAttribute("content", resolvedOgTitle);

    // --- Open Graph: description ---
    const ogDescEl = document.querySelector('meta[property="og:description"]');
    const prevOgDesc = ogDescEl?.getAttribute("content") ?? "";
    if (ogDescEl) ogDescEl.setAttribute("content", resolvedOgDesc);

    // --- Open Graph: url ---
    const ogUrlEl = document.querySelector('meta[property="og:url"]');
    const prevOgUrl = ogUrlEl?.getAttribute("content") ?? "";
    if (ogUrlEl && canonical) {
      ogUrlEl.setAttribute("content", `https://www.trainchat.ai${canonical}`);
    }

    // --- Twitter: title ---
    const twTitleEl = document.querySelector('meta[name="twitter:title"]');
    const prevTwTitle = twTitleEl?.getAttribute("content") ?? "";
    if (twTitleEl) twTitleEl.setAttribute("content", resolvedOgTitle);

    // --- Twitter: description ---
    const twDescEl = document.querySelector('meta[name="twitter:description"]');
    const prevTwDesc = twDescEl?.getAttribute("content") ?? "";
    if (twDescEl) twDescEl.setAttribute("content", resolvedOgDesc);

    // --- Canonical link ---
    let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    let addedCanonical = false;
    const prevCanonicalHref = canonicalEl?.getAttribute("href") ?? "";
    if (canonical && !canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.rel = "canonical";
      canonicalEl.href = `https://www.trainchat.ai${canonical}`;
      document.head.appendChild(canonicalEl);
      addedCanonical = true;
    } else if (canonical && canonicalEl) {
      canonicalEl.href = `https://www.trainchat.ai${canonical}`;
    }

    // --- Page-specific JSON-LD schema ---
    let schemaEl: HTMLScriptElement | null = null;
    if (schema) {
      schemaEl = document.createElement("script");
      schemaEl.type = "application/ld+json";
      schemaEl.id = "aeo-page-schema";
      schemaEl.textContent = JSON.stringify(schema);
      document.head.appendChild(schemaEl);
    }

    // --- BreadcrumbList JSON-LD ---
    let breadcrumbEl: HTMLScriptElement | null = null;
    if (breadcrumbs && breadcrumbs.length > 0) {
      const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "TrainChat®",
            "item": "https://www.trainchat.ai",
          },
          ...breadcrumbs.map((b, i) => ({
            "@type": "ListItem",
            "position": i + 2,
            "name": b.name,
            "item": `https://www.trainchat.ai${b.url}`,
          })),
        ],
      };
      breadcrumbEl = document.createElement("script");
      breadcrumbEl.type = "application/ld+json";
      breadcrumbEl.id = "aeo-breadcrumb-schema";
      breadcrumbEl.textContent = JSON.stringify(breadcrumbSchema);
      document.head.appendChild(breadcrumbEl);
    }

    // --- Article date meta tags ---
    let articlePublishedEl: HTMLMetaElement | null = null;
    let articleModifiedEl: HTMLMetaElement | null = null;
    if (articleDatePublished) {
      articlePublishedEl = document.createElement("meta");
      articlePublishedEl.setAttribute("property", "article:published_time");
      articlePublishedEl.content = articleDatePublished;
      document.head.appendChild(articlePublishedEl);
    }
    if (articleDateModified) {
      articleModifiedEl = document.createElement("meta");
      articleModifiedEl.setAttribute("property", "article:modified_time");
      articleModifiedEl.content = articleDateModified;
      document.head.appendChild(articleModifiedEl);
    }

    return () => {
      document.title = prevTitle;
      if (metaDescEl) metaDescEl.setAttribute("content", prevDesc);
      if (ogTitleEl) ogTitleEl.setAttribute("content", prevOgTitle);
      if (ogDescEl) ogDescEl.setAttribute("content", prevOgDesc);
      if (ogUrlEl) ogUrlEl.setAttribute("content", prevOgUrl);
      if (twTitleEl) twTitleEl.setAttribute("content", prevTwTitle);
      if (twDescEl) twDescEl.setAttribute("content", prevTwDesc);
      if (addedCanonical && canonicalEl) {
        document.head.removeChild(canonicalEl);
      } else if (!addedCanonical && canonicalEl && prevCanonicalHref) {
        canonicalEl.href = prevCanonicalHref;
      }
      if (schemaEl) document.head.removeChild(schemaEl);
      if (breadcrumbEl) document.head.removeChild(breadcrumbEl);
      if (articlePublishedEl) document.head.removeChild(articlePublishedEl);
      if (articleModifiedEl) document.head.removeChild(articleModifiedEl);
    };
  }, [title, description, schema, canonical, breadcrumbs, ogTitle, ogDescription, articleDatePublished, articleDateModified]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate("/chat")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            TrainChat
          </button>
          <span className="text-sm font-semibold text-foreground tracking-tight">TrainChat®</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 pb-20">
        {children}
      </main>

      <section className="border-t border-border bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 py-12 flex flex-col items-center text-center gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Zap className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-widest">Start Training</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            Build your training system — free.
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Tell TrainChat what you want to train. It builds a complete adaptive program with you, in real time.
          </p>
          <button
            onClick={() => navigate("/chat")}
            className="mt-2 px-6 py-3 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:bg-primary/90 transition-colors"
          >
            Open TrainChat — it's free
          </button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 py-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} TrainChat®</span>
          <button onClick={() => navigate("/privacy")} className="hover:text-foreground transition-colors">Privacy</button>
          <button onClick={() => navigate("/terms")} className="hover:text-foreground transition-colors">Terms</button>
          <button onClick={() => navigate("/faq")} className="hover:text-foreground transition-colors">FAQ</button>
          <button onClick={() => navigate("/about")} className="hover:text-foreground transition-colors">About</button>
        </div>
      </footer>
    </div>
  );
}
