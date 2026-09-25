CREATE TABLE "notifications_push_device" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"session_id" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"enabled_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_push_device_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE INDEX "notifications_push_device_account_idx" ON "notifications_push_device" USING btree ("account_id");