-- Ticket 67 (email login). Generated with drizzle-kit, then edited by hand:
-- identity_otp_request.phone_number becomes "target" (a WhatsApp number or an
-- email), and existing rows get their channel, purpose and lock key before the
-- NOT NULL constraints apply. Regenerate (and re-apply these edits) if main
-- gains another migration first. The verified-email index is on lower(email),
-- so the database refuses the same email in another case too.
CREATE TABLE "identity_ip_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "identity_otp_request_phone_sent_idx";--> statement-breakpoint
ALTER TABLE "identity_otp_request" RENAME COLUMN "phone_number" TO "target";--> statement-breakpoint
ALTER TABLE "identity_otp_request" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "identity_otp_request" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "identity_otp_request" ADD COLUMN "lock_key" text;--> statement-breakpoint
UPDATE "identity_otp_request" AS r SET
	"channel" = 'whatsapp',
	"purpose" = 'masuk',
	"lock_key" = coalesce('akun:' || (SELECT u."id" FROM "identity_user" AS u WHERE u."phone_number" = r."target"), 'wa:' || r."target");--> statement-breakpoint
ALTER TABLE "identity_otp_request" ALTER COLUMN "channel" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_otp_request" ALTER COLUMN "purpose" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_otp_request" ALTER COLUMN "lock_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_user" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "identity_ip_request_ip_idx" ON "identity_ip_request" USING btree ("ip","requested_at");--> statement-breakpoint
CREATE INDEX "identity_otp_request_target_sent_idx" ON "identity_otp_request" USING btree ("channel","target","sent_at");--> statement-breakpoint
CREATE INDEX "identity_otp_request_lock_sent_idx" ON "identity_otp_request" USING btree ("lock_key","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_user_verified_email_idx" ON "identity_user" USING btree (lower("email")) WHERE email_verified_at is not null;
