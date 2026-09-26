ALTER TABLE "lokasi_mitra" ADD COLUMN "visit_photos" jsonb;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "dikunjungi_on" date;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "cek_denah_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "cek_denah_note" text;--> statement-breakpoint
CREATE TABLE "fieldwork_tugas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"lokasi_id" text,
	"address" text NOT NULL,
	"pin_lat" double precision,
	"pin_lng" double precision,
	"planned_date" date NOT NULL,
	"assignee_account_id" text NOT NULL,
	"status" text NOT NULL,
	"form" jsonb NOT NULL,
	"uploads" jsonb NOT NULL,
	"created_by_account_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "fieldwork_tugas_assignee_idx" ON "fieldwork_tugas" USING btree ("assignee_account_id");--> statement-breakpoint
CREATE INDEX "fieldwork_tugas_lokasi_idx" ON "fieldwork_tugas" USING btree ("lokasi_id");
