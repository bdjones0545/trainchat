CREATE TABLE "boosty_entitlements" (
	"player_id" text PRIMARY KEY NOT NULL,
	"skus" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bundle" boolean DEFAULT false NOT NULL,
	"sparks_purchased" integer DEFAULT 0 NOT NULL,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "boosty_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"sku" text NOT NULL,
	"stripe_session_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_event_id" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"sparks_granted" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "boosty_entitlements_user_idx" ON "boosty_entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boosty_purchases_session_idx" ON "boosty_purchases" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "boosty_purchases_player_idx" ON "boosty_purchases" USING btree ("player_id");