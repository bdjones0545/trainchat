import { useLocation } from "wouter";
import { ChevronLeft, Zap } from "lucide-react";
import { useEffect } from "react";

interface AeoLayoutProps {
  title: string;
  description: string;
  children: React.ReactNode;
  schema?: object;
  canonical?: string;
}

export default function AeoLayout({ title, description, children, schema, canonical }: AeoLayoutProps) {
  const [, navigate] = useLocation();

  useEffect(() => {
    const prev = document.title;
    document.title = `${title} | TrainChat®`;

    let metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc?.getAttribute("content") ?? "";
    if (metaDesc) metaDesc.setAttribute("content", description);

    let canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    let addedCanonical = false;
    if (canonical && !canonicalEl) {
      canonicalEl = document.createElement("link");
      canonicalEl.rel = "canonical";
      canonicalEl.href = `https://www.trainchat.ai${canonical}`;
      document.head.appendChild(canonicalEl);
      addedCanonical = true;
    } else if (canonical && canonicalEl) {
      canonicalEl.href = `https://www.trainchat.ai${canonical}`;
    }

    let schemaEl: HTMLScriptElement | null = null;
    if (schema) {
      schemaEl = document.createElement("script");
      schemaEl.type = "application/ld+json";
      schemaEl.id = "aeo-page-schema";
      schemaEl.textContent = JSON.stringify(schema);
      document.head.appendChild(schemaEl);
    }

    return () => {
      document.title = prev;
      if (metaDesc) metaDesc.setAttribute("content", prevDesc);
      if (addedCanonical && canonicalEl) document.head.removeChild(canonicalEl);
      if (schemaEl) document.head.removeChild(schemaEl);
    };
  }, [title, description, schema, canonical]);

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
