CREATE TABLE "identity_otp_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"code_hash" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"wrong_attempts" integer DEFAULT 0 NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "identity_otp_request_phone_sent_idx" ON "identity_otp_request" USING btree ("phone_number","sent_at");