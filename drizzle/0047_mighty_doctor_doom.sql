CREATE TABLE "pemesanan_permintaan_hak_pakai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jenis" text NOT NULL,
	"status" text NOT NULL,
	"lokasi_id" text NOT NULL,
	"hak_pakai_id" uuid NOT NULL,
	"unit_nomor" text NOT NULL,
	"pemohon_account_id" text NOT NULL,
	"pemohon_email" text NOT NULL,
	"catatan_pemohon" text,
	"pemegang_baru_name" text,
	"pemegang_baru_phone" text,
	"pemegang_baru_email" text,
	"sebab" text,
	"dokumen" jsonb NOT NULL,
	"biaya_ganti_offline" integer,
	"putaran" integer NOT NULL,
	"diajukan_pada" timestamp with time zone NOT NULL,
	"tenggat_pada" timestamp with time zone,
	"diputuskan_pada" timestamp with time zone,
	"diputuskan_oleh" text,
	"alasan_keputusan" text,
	"dibatalkan_pada" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "pemesanan_permintaan_hak_pakai_lokasi_idx" ON "pemesanan_permintaan_hak_pakai" USING btree ("lokasi_id","status");--> statement-breakpoint
CREATE INDEX "pemesanan_permintaan_hak_pakai_hak_pakai_idx" ON "pemesanan_permintaan_hak_pakai" USING btree ("hak_pakai_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pemesanan_permintaan_hak_pakai_terbuka_idx" ON "pemesanan_permintaan_hak_pakai" USING btree ("hak_pakai_id","jenis") WHERE "pemesanan_permintaan_hak_pakai"."status" in ('diajukan', 'perlu_perbaikan');