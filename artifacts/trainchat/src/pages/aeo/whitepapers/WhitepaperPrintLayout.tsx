import { useEffect, useState } from "react";

export interface WhitepaperPrintSection {
  number: string;
  heading: string | null;
  content: string[];
  pullQuote?: string;
}

export interface WhitepaperPrintMeta {
  docTitle: string;
  brand: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  tagline: string;
  author: string;
  affiliation: string;
  year: string;
  canonical: string;
  printBarLabel: string;
}

export interface WhitepaperPrintAbstract {
  paragraphs: string[];
  keywords: string[];
}

export interface WhitepaperPrintCitation {
  formatted: string;
  related: string[];
  framework?: string[];
  canonicalUrl: string;
}

export interface WhitepaperPrintLayoutProps {
  meta: WhitepaperPrintMeta;
  abstract: WhitepaperPrintAbstract;
  sections: WhitepaperPrintSection[];
  figure?: React.ReactNode;
  citation: WhitepaperPrintCitation;
}

const PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&display=swap');

  .pub-root {
    background: #f5f4f0;
    min-height: 100vh;
    padding: 2rem 1rem;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .pub-document {
    max-width: 720px;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 4px 32px rgba(0,0,0,0.12);
  }
  .pub-print-bar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #1a1a1a;
    color: #fff;
    padding: 0.75rem 1.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.75rem;
  }
  .pub-print-bar-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.7;
  }
  .pub-print-btn {
    background: #2563eb;
    color: #fff;
    border: none;
    padding: 0.5rem 1.25rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    flex-shrink: 0;
    transition: background 0.15s;
  }
  .pub-print-btn:hover { background: #1d4ed8; }
  .pub-print-btn:disabled {
    background: #374151;
    cursor: not-allowed;
    opacity: 0.7;
  }

  /* Cover page */
  .pub-cover {
    padding: 5rem 4rem 4rem;
    min-height: 960px;
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #e5e5e5;
    page-break-after: always;
  }
  .pub-cover-brand {
    font-family: 'Inter', sans-serif;
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 3rem;
  }
  .pub-cover-eyebrow {
    font-family: 'Inter', sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #2563eb;
    margin-bottom: 1.25rem;
  }
  .pub-cover-title {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 2.75rem;
    font-weight: 500;
    line-height: 1.15;
    color: #0f0f0f;
    margin-bottom: 1rem;
    letter-spacing: -0.01em;
  }
  .pub-cover-rule {
    width: 3rem;
    height: 2px;
    background: #2563eb;
    margin: 1.5rem 0;
  }
  .pub-cover-subtitle {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.2rem;
    font-style: italic;
    color: #374151;
    line-height: 1.5;
    margin-bottom: 0;
  }
  .pub-cover-spacer { flex: 1; }
  .pub-cover-meta {
    border-top: 1px solid #e5e5e5;
    padding-top: 2rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }
  .pub-cover-meta-label {
    font-size: 0.6rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 0.25rem;
  }
  .pub-cover-meta-value {
    font-size: 0.85rem;
    color: #1f2937;
    font-weight: 500;
  }
  .pub-cover-meta-value.mono {
    font-family: 'Courier New', monospace;
    font-size: 0.72rem;
    color: #6b7280;
  }
  .pub-cover-tagline {
    margin-top: 2.5rem;
    padding: 1.25rem 1.5rem;
    background: #f9fafb;
    border-left: 3px solid #2563eb;
    font-family: 'EB Garamond', serif;
    font-style: italic;
    font-size: 1.05rem;
    color: #374151;
    line-height: 1.6;
  }

  /* Body pages */
  .pub-page {
    padding: 3.5rem 4rem;
    border-bottom: 1px solid #f0f0f0;
    page-break-after: always;
  }
  .pub-page:last-child {
    border-bottom: none;
    page-break-after: avoid;
  }

  /* Abstract */
  .pub-abstract-label {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #2563eb;
    margin-bottom: 1.25rem;
  }
  .pub-keywords {
    margin-top: 1.5rem;
    padding-top: 1.25rem;
    border-top: 1px solid #e5e5e5;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .pub-kw-label {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
    margin-right: 0.5rem;
  }
  .pub-kw {
    font-size: 0.65rem;
    background: #f3f4f6;
    border: 1px solid #e5e5e5;
    border-radius: 2px;
    padding: 0.2rem 0.5rem;
    color: #374151;
    font-family: 'Courier New', monospace;
  }

  /* Section headings */
  .pub-section-number {
    font-family: 'Inter', sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #2563eb;
    margin-bottom: 0.5rem;
  }
  .pub-section-heading {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.5rem;
    font-weight: 600;
    color: #0f0f0f;
    margin-bottom: 1.5rem;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }
  .pub-body-text {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.05rem;
    line-height: 1.8;
    color: #1f2937;
    margin-bottom: 1rem;
  }
  .pub-body-text:last-child { margin-bottom: 0; }

  /* Pull quotes */
  .pub-pull-quote {
    margin: 2rem 0;
    padding: 1.5rem 2rem;
    border-left: 3px solid #2563eb;
    background: #f8faff;
  }
  .pub-pull-quote p {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.15rem;
    font-style: italic;
    line-height: 1.65;
    color: #1e3a8a;
    margin: 0;
  }

  /* Figure section */
  .pub-figure-section {
    padding: 3.5rem 4rem;
    background: #f9fafb;
    border-top: 1px solid #e5e5e5;
    border-bottom: 1px solid #e5e5e5;
    page-break-before: always;
  }
  .pub-figure-label {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #2563eb;
    margin-bottom: 0.5rem;
  }
  .pub-figure-title {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.35rem;
    font-weight: 600;
    color: #0f0f0f;
    margin-bottom: 0.5rem;
  }
  .pub-figure-caption {
    font-size: 0.8rem;
    color: #6b7280;
    margin-bottom: 2rem;
    font-style: italic;
  }
  .pub-figure-note {
    margin-top: 1.5rem;
    padding: 0.75rem 1rem;
    background: #fff;
    border: 1px solid #e5e5e5;
    font-size: 0.72rem;
    color: #6b7280;
    font-style: italic;
    text-align: center;
  }

  /* ACA stack figure */
  .pub-stack { display: flex; flex-direction: column; gap: 0; max-width: 520px; margin: 0 auto; }
  .pub-layer {
    padding: 1.25rem 1.5rem;
    border: 1px solid #d1d5db;
    background: #fff;
  }
  .pub-layer + .pub-layer { border-top: none; }
  .pub-layer.primary { border-color: #2563eb; background: #eff6ff; }
  .pub-layer-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }
  .pub-layer-num {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #2563eb;
  }
  .pub-layer-role {
    font-size: 0.6rem;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .pub-layer-name {
    font-family: 'Inter', sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    color: #0f0f0f;
    margin-bottom: 0.25rem;
  }
  .pub-layer-desc {
    font-size: 0.75rem;
    color: #6b7280;
    margin-bottom: 0.5rem;
  }
  .pub-layer-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .pub-layer-tag {
    font-size: 0.6rem;
    font-family: 'Courier New', monospace;
    background: #f3f4f6;
    border: 1px solid #e5e5e5;
    border-radius: 2px;
    padding: 0.15rem 0.4rem;
    color: #374151;
  }
  .pub-layer.primary .pub-layer-tag { background: #dbeafe; border-color: #bfdbfe; }
  .pub-arrow {
    text-align: center;
    font-size: 1rem;
    color: #9ca3af;
    padding: 0.25rem 0;
    background: #fff;
    border-left: 1px solid #d1d5db;
    border-right: 1px solid #d1d5db;
  }

  /* MFP hierarchy figure */
  .pub-hierarchy { display: flex; flex-direction: column; gap: 0.5rem; max-width: 560px; margin: 0 auto; }
  .pub-level {
    display: flex;
    align-items: stretch;
    gap: 0;
  }
  .pub-level-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 3.5rem;
    padding: 0.75rem 0.5rem;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-right: none;
    font-size: 0.65rem;
    font-weight: 700;
    font-family: 'Courier New', monospace;
    color: #374151;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .pub-level.default-level .pub-level-badge {
    background: #eff6ff;
    border-color: #2563eb;
    color: #1d4ed8;
  }
  .pub-level-body {
    flex: 1;
    padding: 0.75rem 1rem;
    border: 1px solid #d1d5db;
    background: #fff;
  }
  .pub-level.default-level .pub-level-body {
    border-color: #2563eb;
    background: #f8faff;
  }
  .pub-level-name {
    font-size: 0.8rem;
    font-weight: 600;
    font-family: 'Inter', sans-serif;
    color: #0f0f0f;
    margin-bottom: 0.2rem;
  }
  .pub-level-desc {
    font-size: 0.72rem;
    color: #6b7280;
    line-height: 1.45;
  }
  .pub-level-freq {
    font-size: 0.6rem;
    font-family: 'Courier New', monospace;
    color: #9ca3af;
    margin-top: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .pub-level.default-level .pub-level-freq { color: #2563eb; }

  /* LSM properties figure */
  .pub-properties { display: flex; flex-direction: column; gap: 0.75rem; max-width: 560px; margin: 0 auto; }
  .pub-property {
    display: flex;
    gap: 1rem;
    padding: 1.25rem 1.25rem;
    border: 1px solid #d1d5db;
    background: #fff;
  }
  .pub-property-num {
    font-size: 2rem;
    font-weight: 700;
    font-family: 'EB Garamond', Georgia, serif;
    color: #e5e7eb;
    line-height: 1;
    flex-shrink: 0;
    width: 2rem;
    text-align: center;
  }
  .pub-property-content { flex: 1; }
  .pub-property-name {
    font-size: 0.85rem;
    font-weight: 700;
    font-family: 'Inter', sans-serif;
    color: #0f0f0f;
    margin-bottom: 0.2rem;
    letter-spacing: 0.02em;
  }
  .pub-property-tag {
    font-size: 0.6rem;
    font-family: 'Courier New', monospace;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 2px;
    padding: 0.1rem 0.4rem;
    color: #1d4ed8;
    margin-bottom: 0.4rem;
    display: inline-block;
  }
  .pub-property-desc {
    font-size: 0.75rem;
    color: #6b7280;
    line-height: 1.5;
  }
  .pub-property-addresses {
    margin-top: 0.4rem;
    font-size: 0.65rem;
    color: #9ca3af;
    font-family: 'Courier New', monospace;
    letter-spacing: 0.04em;
  }

  /* Citation page */
  .pub-citation-page {
    padding: 3.5rem 4rem;
    background: #fff;
  }
  .pub-citation-block {
    background: #f9fafb;
    border: 1px solid #e5e5e5;
    padding: 1.5rem;
    font-family: 'Courier New', monospace;
    font-size: 0.75rem;
    color: #374151;
    line-height: 1.7;
    margin-bottom: 2rem;
  }
  .pub-related-title {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6b7280;
    margin-bottom: 0.75rem;
  }
  .pub-related-item {
    font-size: 0.8rem;
    color: #374151;
    margin-bottom: 0.4rem;
    padding-left: 1rem;
    position: relative;
  }
  .pub-related-item::before {
    content: '→';
    position: absolute;
    left: 0;
    color: #2563eb;
    font-size: 0.7rem;
  }
  .pub-footer {
    margin-top: 3rem;
    padding-top: 1.5rem;
    border-top: 1px solid #e5e5e5;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pub-footer-brand {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9ca3af;
  }
  .pub-footer-url {
    font-family: 'Courier New', monospace;
    font-size: 0.65rem;
    color: #9ca3af;
  }

  @media (max-width: 600px) {
    .pub-cover { padding: 3rem 1.75rem 2.5rem; min-height: auto; }
    .pub-page { padding: 2.5rem 1.75rem; }
    .pub-figure-section { padding: 2.5rem 1.75rem; }
    .pub-citation-page { padding: 2.5rem 1.75rem; }
    .pub-cover-title { font-size: 2rem; }
  }

  @media print {
    .pub-print-bar { display: none !important; }
    .pub-root { background: #fff; padding: 0; }
    .pub-document { box-shadow: none; max-width: 100%; }
    .pub-cover { min-height: auto; }
    body { margin: 0; }
  }
`;

export default function WhitepaperPrintLayout({
  meta,
  abstract,
  sections,
  figure,
  citation,
}: WhitepaperPrintLayoutProps) {
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const prev = document.title;
    document.title = meta.docTitle;
    return () => { document.title = prev; };
  }, [meta.docTitle]);

  function handlePrint() {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 80);
  }

  return (
    <>
      <style>{PRINT_STYLES}</style>

      <div className="pub-root">
        {/* Print bar */}
        <div className="pub-print-bar">
          <span className="pub-print-bar-label">{meta.printBarLabel}</span>
          <button
            className="pub-print-btn"
            onClick={handlePrint}
            disabled={printing}
          >
            {printing ? "Preparing…" : "Save as PDF"}
          </button>
        </div>

        <div className="pub-document">
          {/* ── Cover Page ── */}
          <div className="pub-cover">
            <div className="pub-cover-brand">{meta.brand}</div>
            <div className="pub-cover-eyebrow">{meta.eyebrow}</div>
            <h1 className="pub-cover-title">{meta.title}</h1>
            <div className="pub-cover-rule" />
            <p className="pub-cover-subtitle">{meta.subtitle}</p>
            <div className="pub-cover-spacer" />
            <div className="pub-cover-tagline">{meta.tagline}</div>
            <div className="pub-cover-meta">
              <div>
                <div className="pub-cover-meta-label">Author</div>
                <div className="pub-cover-meta-value">{meta.author}</div>
              </div>
              <div>
                <div className="pub-cover-meta-label">Affiliation</div>
                <div className="pub-cover-meta-value">{meta.affiliation}</div>
              </div>
              <div>
                <div className="pub-cover-meta-label">Published</div>
                <div className="pub-cover-meta-value">{meta.year}</div>
              </div>
              <div>
                <div className="pub-cover-meta-label">Canonical URL</div>
                <div className="pub-cover-meta-value mono">{meta.canonical}</div>
              </div>
            </div>
          </div>

          {/* ── Abstract ── */}
          <div className="pub-page">
            <div className="pub-abstract-label">Abstract</div>
            {abstract.paragraphs.map((para, i) => (
              <p key={i} className="pub-body-text">{para}</p>
            ))}
            <div className="pub-keywords">
              <span className="pub-kw-label">Keywords</span>
              {abstract.keywords.map((kw) => (
                <span key={kw} className="pub-kw">{kw}</span>
              ))}
            </div>
          </div>

          {/* ── Main Sections ── */}
          {sections.map((section) => (
            <div key={section.number} className="pub-page">
              <div className="pub-section-number">{section.number}</div>
              {section.heading && (
                <h2 className="pub-section-heading">{section.heading}</h2>
              )}
              {section.content.map((para, i) => (
                <p key={i} className="pub-body-text">{para}</p>
              ))}
              {section.pullQuote && (
                <div className="pub-pull-quote">
                  <p>"{section.pullQuote}"</p>
                </div>
              )}
            </div>
          ))}

          {/* ── Figure (optional) ── */}
          {figure && (
            <div className="pub-figure-section">
              {figure}
            </div>
          )}

          {/* ── Citation ── */}
          <div className="pub-citation-page">
            <div className="pub-section-number">Citation</div>
            <h2 className="pub-section-heading">How to Cite This Publication</h2>
            <div className="pub-citation-block">{citation.formatted}</div>

            <div className="pub-related-title">Related Publications</div>
            {citation.related.map((item, i) => (
              <div key={i} className="pub-related-item">{item}</div>
            ))}

            {citation.framework && citation.framework.length > 0 && (
              <>
                <div className="pub-related-title" style={{ marginTop: "1.5rem" }}>
                  Framework Documentation
                </div>
                {citation.framework.map((item, i) => (
                  <div key={i} className="pub-related-item">{item}</div>
                ))}
              </>
            )}

            <div className="pub-footer">
              <span className="pub-footer-brand">TrainChat® Publications · {meta.year}</span>
              <span className="pub-footer-url">{citation.canonicalUrl}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
