import { useLocation } from "wouter";
import { XCircle } from "lucide-react";
import { useNoIndex } from "@/hooks/useNoIndex";

export default function BillingCancelled() {
  useNoIndex();
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[#080e18] flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-muted/20 border border-border flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-8 h-8 text-muted-foreground" />
        </div>

        <h1 className="text-2xl font-bold text-foreground mb-2">
          Checkout cancelled
        </h1>
        <p className="text-muted-foreground mb-8">
          No payment was made. You can upgrade anytime from the chat.
        </p>

        <button
          onClick={() => navigate("/chat")}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all"
        >
          Back to TrainChat
        </button>
      </div>
    </div>
  );
}
