ALTER TABLE "identity_staff_invite" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_staff_invite" ADD COLUMN "cancelled_by_account_id" text;