import Stripe from "stripe";

// Replit Stripe connector — blueprint pattern
// Never cache the client; tokens expire.

async function getCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (hostname && xReplitToken) {
    try {
      const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
      const targetEnvironment = isProduction ? "production" : "development";

      const url = new URL(`https://${hostname}/api/v2/connection`);
      url.searchParams.set("include_secrets", "true");
      url.searchParams.set("connector_names", "stripe");
      url.searchParams.set("environment", targetEnvironment);

      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const settings = data.items?.[0]?.settings;
        if (settings?.secret) {
          return {
            publishableKey: settings.publishable ?? "",
            secretKey: settings.secret,
          };
        }
      }
    } catch {
      // fall through to env var
    }
  }

  const envKey = process.env.STRIPE_SECRET_KEY;
  if (envKey) {
    return { publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "", secretKey: envKey };
  }

  throw new Error(
    "Stripe API key not found. Connect the Stripe integration or set STRIPE_SECRET_KEY env var."
  );
}

// WARNING: Never cache this client — tokens expire.
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const { secretKey } = await getCredentials();
  return secretKey;
}

// StripeSync singleton — reset on initialization failure
let _stripeSync: any = null;

export async function getStripeSync(): Promise<any> {
  if (_stripeSync) return _stripeSync;

  const { StripeSync } = await import("stripe-replit-sync");
  const secretKey = await getStripeSecretKey();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  _stripeSync = new StripeSync({
    stripeSecretKey: secretKey,
    poolConfig: { connectionString: databaseUrl, max: 2 },
  });

  return _stripeSync;
}
