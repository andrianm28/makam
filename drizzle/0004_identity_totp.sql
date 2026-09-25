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
ALTER TABLE "identity_totp" ADD CONSTRAINT "identity_totp_account_id_identity_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identity_user"("id") ON DELETE cascade ON UPDATE no action;