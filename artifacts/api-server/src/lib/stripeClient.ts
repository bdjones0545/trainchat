import { StripeSync } from "stripe-replit-sync";
import Stripe from "stripe";

let _stripeSync: StripeSync | null = null;

async function getStripeSecretKey(): Promise<string> {
  const connectorHost = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const replIdentity = process.env.REPL_IDENTITY;
  const connectionId = process.env.STRIPE_CONNECTION_ID;

  if (connectorHost && replIdentity && connectionId) {
    try {
      const response = await fetch(
        `https://${connectorHost}/v2/connections/${connectionId}/credentials`,
        {
          headers: {
            "X-Replit-Identity": replIdentity,
            "Content-Type": "application/json",
          },
        }
      );
      if (response.ok) {
        const data = (await response.json()) as any;
        const key = data?.secretKey ?? data?.secret_key ?? data?.apiKey ?? data?.api_key;
        if (key) return key;
      }
    } catch {
      // fall through to env var
    }
  }

  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey) return envKey;

  throw new Error(
    "Stripe API key not found. Connect the Stripe integration or set STRIPE_SECRET_KEY env var."
  );
}

export async function getStripeSync(): Promise<StripeSync> {
  if (_stripeSync) return _stripeSync;

  const secretKey = await getStripeSecretKey();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  _stripeSync = new StripeSync({
    stripeSecretKey: secretKey,
    poolConfig: { connectionString: databaseUrl, max: 5 },
    backfillRelatedEntities: true,
  });

  return _stripeSync;
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const secretKey = await getStripeSecretKey();
  return new Stripe(secretKey);
}
