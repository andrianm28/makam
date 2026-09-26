CREATE TABLE "identity_admin_lokasi" (
	"account_id" text NOT NULL,
	"lokasi_id" text NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "identity_admin_lokasi_account_id_lokasi_id_pk" PRIMARY KEY("account_id","lokasi_id")
);
--> statement-breakpoint
CREATE TABLE "lokasi_mitra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"pengelola_name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"pin_lat" double precision,
	"pin_lng" double precision,
	"status" text NOT NULL,
	"facilities" jsonb NOT NULL,
	"facilities_note" text NOT NULL,
	"bank_name" text,
	"bank_account_number" text,
	"bank_account_holder" text,
	"agreement_signed_on" date,
	"agreement_scan_file_key" text,
	"document_checklist" jsonb NOT NULL,
	"policies" jsonb NOT NULL,
	"flags" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_entry" ADD COLUMN "lokasi_id" text;--> statement-breakpoint
ALTER TABLE "identity_staff_invite" ADD COLUMN "lokasi_id" text;--> statement-breakpoint
ALTER TABLE "identity_admin_lokasi" ADD CONSTRAINT "identity_admin_lokasi_account_id_identity_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."identity_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "identity_admin_lokasi_lokasi_idx" ON "identity_admin_lokasi" USING btree ("lokasi_id");--> statement-breakpoint
CREATE INDEX "audit_entry_lokasi_idx" ON "audit_entry" USING btree ("lokasi_id","at","seq");