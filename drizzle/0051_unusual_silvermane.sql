CREATE TABLE "keluhan_layanan_tpu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"alasan" text NOT NULL,
	"diajukan_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'terbuka' NOT NULL,
	"diputuskan_at" timestamp with time zone,
	"diputuskan_oleh" text,
	"catatan_keputusan" text
);
--> statement-breakpoint
ALTER TABLE "keluhan_layanan_tpu" ADD CONSTRAINT "keluhan_layanan_tpu_pekerjaan_id_pekerjaan_layanan_tpu_id_fk" FOREIGN KEY ("pekerjaan_id") REFERENCES "public"."pekerjaan_layanan_tpu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keluhan_layanan_tpu_pekerjaan_idx" ON "keluhan_layanan_tpu" USING btree ("pekerjaan_id");--> statement-breakpoint
CREATE INDEX "keluhan_layanan_tpu_status_idx" ON "keluhan_layanan_tpu" USING btree ("status");