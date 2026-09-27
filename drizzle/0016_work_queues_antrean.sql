CREATE TABLE "antrean_ambil" (
	"row_key" text PRIMARY KEY NOT NULL,
	"claimed_by_account_id" text NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catatan_internal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"author_account_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_hak_pakai" ALTER COLUMN "perlu_verifikasi" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "inventory_pemakaman" ALTER COLUMN "layer" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "publish_gate_rechecked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "catatan_internal_subject_idx" ON "catatan_internal" USING btree ("subject_kind","subject_id");