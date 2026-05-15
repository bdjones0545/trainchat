import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";

export default function PrivacyPage() {
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
          <h1 className="text-sm font-semibold text-foreground">Privacy Policy</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
        <div className="space-y-1 mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Privacy Policy</h2>
          <p className="text-xs text-muted-foreground">Last updated: April 17, 2026</p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          TrainChat® ("TrainChat", "we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our application.
        </p>

        <PolicySection title="1. Information We Collect">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            We collect only the information necessary to operate and improve TrainChat®.
          </p>
          <PolicySubsection title="Account Information">
            <PolicyList items={["Name (if provided)", "Email address", "Authentication credentials"]} />
          </PolicySubsection>
          <PolicySubsection title="Usage & Interaction Data">
            <PolicyList items={[
              "Messages and interactions with the AI coach",
              "Program creation and modification activity",
              "Feature usage and engagement metrics",
            ]} />
          </PolicySubsection>
          <PolicySubsection title="Training & Personalization Data">
            <PolicyList items={[
              "Goals, sport, experience level",
              "Equipment access and preferences",
              "Session feedback, readiness inputs, and performance logs",
            ]} />
          </PolicySubsection>
          <PolicySubsection title="Billing Information">
            <PolicyList items={[
              "Payments are processed securely via Stripe",
              "We do not store full payment details (e.g., card numbers)",
            ]} />
          </PolicySubsection>
        </PolicySection>

        <PolicySection title="2. How We Use Your Information">
          <PolicyList items={[
            "Deliver AI-powered coaching and program generation",
            "Personalize training recommendations and system behavior",
            "Improve performance, accuracy, and reliability of the platform",
            "Manage subscriptions and billing",
            "Provide customer support and troubleshooting",
            "Ensure platform security and prevent abuse",
          ]} />
        </PolicySection>

        <PolicySection title="3. AI Personalization & Memory">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            TrainChat® may use your data to personalize your experience, including:
          </p>
          <PolicyList items={[
            "Learning training preferences",
            "Adapting programs over time",
            "Improving coaching responses",
          ]} />
          <p className="text-sm text-muted-foreground leading-relaxed mt-3 mb-2">
            This behavior is controlled via Memory Personalization in Settings.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-1">If disabled:</p>
          <PolicyList items={[
            "Long-term memory is not used",
            "New personalization data is not stored",
          ]} />
        </PolicySection>

        <PolicySection title="4. Data Sharing">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            We do not sell your data.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">We may share limited data with:</p>
          <PolicyList items={[
            "Stripe (billing and subscription management)",
            "Infrastructure providers (hosting, analytics, logging)",
            "Legal authorities if required by law",
          ]} />
        </PolicySection>

        <PolicySection title="5. Data Security">
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            We implement industry-standard safeguards to protect your data, including:
          </p>
          <PolicyList items={[
            "Secure authentication",
            "Encrypted data transmission",
            "Controlled system access",
          ]} />
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            However, no system is completely secure.
          </p>
        </PolicySection>

        <PolicySection title="6. Your Rights">
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">Depending on your location, you may:</p>
          <PolicyList items={[
            "Request access to your data",
            "Request deletion of your account",
            "Disable personalization features",
            "Request data export (coming soon)",
          ]} />
        </PolicySection>

        <PolicySection title="7. Data Retention">
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">We retain data only as long as necessary to:</p>
          <PolicyList items={[
            "Provide services",
            "Maintain system functionality",
            "Meet legal obligations",
          ]} />
        </PolicySection>

        <PolicySection title="8. Third-Party Services">
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            TrainChat® integrates with third-party services including:
          </p>
          <PolicyList items={["Stripe"]} />
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            These services operate under their own policies.
          </p>
        </PolicySection>

        <PolicySection title="9. Children's Privacy">
          <p className="text-sm text-muted-foreground leading-relaxed">
            TrainChat® is not intended for users under 13. We do not knowingly collect data from children.
          </p>
        </PolicySection>

        <PolicySection title="10. Changes to This Policy">
          <p className="text-sm text-muted-foreground leading-relaxed">
            We may update this policy at any time. Continued use of TrainChat® constitutes acceptance of changes.
          </p>
        </PolicySection>

        <PolicySection title="11. Contact" last>
          <p className="text-sm text-muted-foreground leading-relaxed">
            For privacy-related inquiries, please reach out via the support link in Settings.
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

function PolicySubsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-sm font-medium text-foreground/80 mb-1.5">{title}</p>
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
