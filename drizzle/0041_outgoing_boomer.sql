CREATE TABLE "keluhan_layanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"alasan" text NOT NULL,
	"diajukan_at" timestamp with time zone NOT NULL,
	"respon_pertama_due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'terbuka' NOT NULL,
	"diputuskan_at" timestamp with time zone,
	"diputuskan_oleh" text,
	"catatan_keputusan" text,
	"permintaan_pengembalian_id" text,
	"redo_selesai_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "penilaian_layanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"pemesan_account_id" uuid NOT NULL,
	"bintang" integer NOT NULL,
	"komentar" text,
	"dibuat_at" timestamp with time zone NOT NULL,
	CONSTRAINT "penilaian_layanan_bintang_check" CHECK ("penilaian_layanan"."bintang" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan" ADD COLUMN "bukti_ditunjukkan_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan" ADD COLUMN "jendela_ditutup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan" ADD COLUMN "pencairan_jatuh_tempo_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_bukti" ADD COLUMN "diperbarui_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "keluhan_layanan" ADD CONSTRAINT "keluhan_layanan_pekerjaan_id_pekerjaan_layanan_id_fk" FOREIGN KEY ("pekerjaan_id") REFERENCES "public"."pekerjaan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penilaian_layanan" ADD CONSTRAINT "penilaian_layanan_pekerjaan_id_pekerjaan_layanan_id_fk" FOREIGN KEY ("pekerjaan_id") REFERENCES "public"."pekerjaan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "keluhan_layanan_pekerjaan_idx" ON "keluhan_layanan" USING btree ("pekerjaan_id");--> statement-breakpoint
CREATE INDEX "keluhan_layanan_status_idx" ON "keluhan_layanan" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "penilaian_layanan_pekerjaan_idx" ON "penilaian_layanan" USING btree ("pekerjaan_id");