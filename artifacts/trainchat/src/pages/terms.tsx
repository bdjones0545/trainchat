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
          By using TrainChat, you agree to these Terms of Service. Please read them carefully. If you do not agree, do not use the service.
        </p>

        <PolicySection title="1. Acceptance of Terms">
          <p className="text-sm text-muted-foreground leading-relaxed">
            By accessing or using TrainChat, you agree to be bound by these Terms and our Privacy Policy. These Terms apply to all users, including free, registered, and subscribed users.
          </p>
        </PolicySection>

        <PolicySection title="2. Description of Service">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat is an AI-powered coaching platform that provides:
          </p>
          <PolicyList items={[
            "Personalized training program generation",
            "AI coaching conversations and guidance",
            "Program tracking and adaptation",
            "Subscription-based access to advanced features",
          ]} />
        </PolicySection>

        <PolicySection title="3. User Accounts">
          <PolicyList items={[
            "You must provide accurate information when creating an account",
            "You are responsible for maintaining the security of your account",
            "You may not share, sell, or transfer access to your account",
            "You must be 13 years or older to use TrainChat",
          ]} />
        </PolicySection>

        <PolicySection title="4. Acceptable Use">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">You agree not to:</p>
          <PolicyList items={[
            "Use the service for any unlawful purpose",
            "Attempt to reverse-engineer, copy, or exploit the AI systems",
            "Transmit harmful, abusive, or deceptive content",
            "Circumvent subscription limits or access controls",
            "Use automated scripts to interact with the service",
          ]} />
        </PolicySection>

        <PolicySection title="5. Subscriptions & Billing">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat offers free and paid subscription tiers.
          </p>
          <PolicyList items={[
            "Paid subscriptions are billed via Stripe on a recurring basis",
            "Cancellations take effect at the end of the current billing period",
            "Refunds are not provided for partial billing periods unless required by law",
            "We reserve the right to change pricing with advance notice",
          ]} />
        </PolicySection>

        <PolicySection title="6. AI-Generated Content">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat's AI generates training programs and coaching responses based on your inputs.
          </p>
          <PolicyList items={[
            "AI output is for informational purposes only — not medical advice",
            "Always consult a healthcare professional before beginning a new training program",
            "TrainChat is not liable for injuries arising from following AI-generated programs",
            "Results may vary — AI recommendations are not guaranteed",
          ]} />
        </PolicySection>

        <PolicySection title="7. Intellectual Property">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            All TrainChat software, design, and AI systems are owned by TrainChat.
          </p>
          <PolicyList items={[
            "You retain ownership of data you submit (messages, training logs, etc.)",
            "You grant TrainChat a license to use your data to operate and improve the service",
            "You may not copy, reproduce, or distribute TrainChat's proprietary systems",
          ]} />
        </PolicySection>

        <PolicySection title="8. Termination">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat may terminate or suspend your account if you:
          </p>
          <PolicyList items={[
            "Violate these Terms",
            "Engage in abusive or fraudulent behavior",
            "Use the service in a way that harms other users or the platform",
          ]} />
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            You may delete your account at any time via Settings.
          </p>
        </PolicySection>

        <PolicySection title="9. Limitation of Liability">
          <p className="text-sm text-muted-foreground leading-relaxed">
            To the fullest extent permitted by law, TrainChat is not liable for indirect, incidental, or consequential damages arising from use of the service. Our total liability is limited to the amount you paid in the 12 months prior to the claim.
          </p>
        </PolicySection>

        <PolicySection title="10. Disclaimer of Warranties">
          <p className="text-sm text-muted-foreground leading-relaxed">
            TrainChat is provided "as is" without warranties of any kind. We do not guarantee uninterrupted access, error-free operation, or specific fitness outcomes.
          </p>
        </PolicySection>

        <PolicySection title="11. Changes to Terms">
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may update these Terms at any time. Continued use of TrainChat after changes constitutes acceptance of the updated Terms. We will notify you of material changes where required by law.
          </p>
        </PolicySection>

        <PolicySection title="12. Governing Law">
          <p className="text-sm text-muted-foreground leading-relaxed">
            These Terms are governed by applicable law. Disputes will be resolved through binding arbitration unless prohibited by law.
          </p>
        </PolicySection>

        <PolicySection title="13. Contact" last>
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
