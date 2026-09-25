CREATE TABLE "identity_staff_invite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"invited_by_account_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_account_id" text
);
--> statement-breakpoint
CREATE INDEX "identity_staff_invite_phone_idx" ON "identity_staff_invite" USING btree ("phone_number","expires_at");