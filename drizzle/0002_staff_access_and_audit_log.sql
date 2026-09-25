CREATE TABLE "audit_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_account_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text
);
--> statement-breakpoint
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
CREATE TABLE "identity_staff_role" (
	"account_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "identity_staff_role_account_id_role_pk" PRIMARY KEY("account_id","role")
);
--> statement-breakpoint
CREATE TABLE "identity_totp" (
	"account_id" text PRIMARY KEY NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"last_used_step" bigint
);
--> statement-breakpoint
ALTER TABLE "identity_session" ADD COLUMN "totp_passed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_session" ADD COLUMN "totp_wrong_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_user" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "identity_user" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_staff_role" ADD CONSTRAINT "identity_staff_role_account_id_identity_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identity_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_totp" ADD CONSTRAINT "identity_totp_account_id_identity_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identity_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entry_entity_idx" ON "audit_entry" USING btree ("entity_kind","entity_id","at","seq");--> statement-breakpoint
CREATE INDEX "identity_staff_invite_phone_idx" ON "identity_staff_invite" USING btree ("phone_number","expires_at");