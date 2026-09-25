CREATE TABLE "identity_staff_role" (
	"account_id" text NOT NULL,
	"role" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "identity_staff_role_account_id_role_pk" PRIMARY KEY("account_id","role")
);
--> statement-breakpoint
ALTER TABLE "identity_user" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "identity_user" ADD COLUMN "deactivated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "identity_staff_role" ADD CONSTRAINT "identity_staff_role_account_id_identity_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identity_user"("id") ON DELETE cascade ON UPDATE no action;