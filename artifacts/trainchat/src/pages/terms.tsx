import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

export default function TermsPage() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/billing")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-sm font-semibold text-foreground">Terms of Service</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
        <div className="space-y-1 mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Terms of Service</h2>
          <p className="text-xs text-muted-foreground">Last updated: April 17, 2026</p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          By accessing or using TrainChat, you agree to these Terms of Service.
        </p>

        <PolicySection title="1. Nature of Service">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat provides AI-generated fitness and training guidance.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">This service is:</p>
          <PolicyList items={[
            "Informational and educational",
            "Not a licensed coaching, medical, or healthcare service",
          ]} />
        </PolicySection>

        <PolicySection title="2. No Medical Advice">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat does not provide medical advice.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">You acknowledge:</p>
          <PolicyList items={[
            "Exercise carries inherent risk",
            "You should consult a qualified professional before beginning any program",
            "You are responsible for your own health decisions",
          ]} />
        </PolicySection>

        <PolicySection title="3. Assumption of Risk">
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">By using TrainChat, you agree:</p>
          <PolicyList items={[
            "You assume all risks related to training and physical activity",
            "TrainChat is not liable for injury, harm, or damages resulting from use",
          ]} />
        </PolicySection>

        <PolicySection title="4. User Responsibilities">
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">You agree to:</p>
          <PolicyList items={[
            "Use the service responsibly",
            "Provide accurate information where relevant",
            "Stop activity if experiencing pain or adverse effects",
          ]} />
        </PolicySection>

        <PolicySection title="5. AI Limitations">
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">You acknowledge that:</p>
          <PolicyList items={[
            "AI-generated responses may be imperfect",
            "Recommendations may not account for all individual conditions",
            "Final decisions remain your responsibility",
          ]} />
        </PolicySection>

        <PolicySection title="6. Subscriptions & Billing">
          <PolicyList items={[
            "Subscriptions are processed via Stripe",
            "Payments renew automatically unless canceled",
            "Billing management is handled through Stripe's customer portal",
          ]} />
        </PolicySection>

        <PolicySection title="7. Cancellation & Refunds">
          <PolicyList items={[
            "You may cancel at any time via Stripe",
            "No refunds unless required by applicable law",
          ]} />
        </PolicySection>

        <PolicySection title="8. Account Suspension">
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            We reserve the right to suspend or terminate accounts that:
          </p>
          <PolicyList items={[
            "Violate these terms",
            "Abuse the platform",
            "Interfere with system integrity",
          ]} />
        </PolicySection>

        <PolicySection title="9. Intellectual Property">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            All TrainChat content, systems, and technology are owned by TrainChat.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">You may not:</p>
          <PolicyList items={[
            "Copy",
            "Resell",
            "Reverse engineer",
            "Redistribute the platform",
          ]} />
        </PolicySection>

        <PolicySection title="10. Limitation of Liability">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            To the fullest extent permitted by law, TrainChat is not liable for:
          </p>
          <PolicyList items={[
            "Injuries",
            "Training outcomes",
            "Indirect or consequential damages",
          ]} />
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            Use is at your own risk.
          </p>
        </PolicySection>

        <PolicySection title="11. Indemnification">
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            You agree to indemnify TrainChat from claims resulting from:
          </p>
          <PolicyList items={[
            "Misuse of the service",
            "Violation of these terms",
          ]} />
        </PolicySection>

        <PolicySection title="12. Modifications">
          <p className="text-sm text-muted-foreground leading-relaxed mb-1">
            We may update these Terms at any time.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Continued use constitutes acceptance.
          </p>
        </PolicySection>

        <PolicySection title="13. Governing Law">
          <p className="text-sm text-muted-foreground leading-relaxed">
            These Terms are governed by applicable law.
          </p>
        </PolicySection>

        <PolicySection title="14. Contact" last>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For questions about these Terms, please reach out via the support link in Settings.
          </p>
        </PolicySection>
      </div>
    </div>
  );
}

function PolicySection({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`${last ? "" : "mb-8 pb-8 border-b border-border/50"}`}>
      <h3 className="text-base font-semibold text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PolicyList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
          <span className="mt-2 w-1 h-1 rounded-full bg-muted-foreground/50 flex-shrink-0" />
          {item}
        </li>
      ))}
    </ul>
  );
}
