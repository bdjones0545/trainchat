import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

interface FaqBlockProps {
  items: FaqItem[];
  heading?: string;
}

export default function FaqBlock({ items, heading = "Frequently Asked Questions" }: FaqBlockProps) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="mt-16" aria-label="FAQ">
      <h2 className="text-xl font-bold tracking-tight mb-6">{heading}</h2>
      <div className="divide-y divide-border">
        {items.map((item, i) => (
          <div key={i}>
            <button
              className="w-full text-left py-4 flex items-start justify-between gap-4 group"
              onClick={() => setOpen(open === i ? null : i)}
              aria-expanded={open === i}
            >
              <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                {item.q}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5 transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}
              />
            </button>
            {open === i && (
              <div className="pb-4 pr-8 faq-answer">
                <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
