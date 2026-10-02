CREATE TABLE "inventory_calon_penghuni" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hak_pakai_id" uuid NOT NULL,
	"petak_id" uuid NOT NULL,
	"label" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "inventory_pemegang_hak" ADD COLUMN "dokumen" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_calon_penghuni" ADD CONSTRAINT "inventory_calon_penghuni_hak_pakai_id_inventory_hak_pakai_id_fk" FOREIGN KEY ("hak_pakai_id") REFERENCES "public"."inventory_hak_pakai"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_calon_penghuni" ADD CONSTRAINT "inventory_calon_penghuni_petak_id_inventory_petak_id_fk" FOREIGN KEY ("petak_id") REFERENCES "public"."inventory_petak"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_calon_penghuni_hak_pakai_petak_idx" ON "inventory_calon_penghuni" USING btree ("hak_pakai_id","petak_id");--> statement-breakpoint
CREATE INDEX "pemesanan_permintaan_hak_pakai_lokasi_idx" ON "pemesanan_permintaan_hak_pakai" USING btree ("lokasi_id","status");--> statement-breakpoint
CREATE INDEX "pemesanan_permintaan_hak_pakai_hak_pakai_idx" ON "pemesanan_permintaan_hak_pakai" USING btree ("hak_pakai_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pemesanan_permintaan_hak_pakai_terbuka_idx" ON "pemesanan_permintaan_hak_pakai" USING btree ("hak_pakai_id","jenis") WHERE "pemesanan_permintaan_hak_pakai"."status" in ('diajukan', 'perlu_perbaikan');--> statement-breakpoint
INSERT INTO "inventory_calon_penghuni" ("hak_pakai_id", "petak_id", "label", "updated_at")
SELECT h."id", COALESCE(h."petak_id", (SELECT p."id" FROM "inventory_petak" p WHERE p."kavling_id" = h."kavling_id" AND p."nomor_makam" IS NOT NULL ORDER BY p."row", p."col" LIMIT 1)), h."calon_penghuni", h."created_at"
FROM "inventory_hak_pakai" h
WHERE h."calon_penghuni" IS NOT NULL AND h."calon_penghuni" <> ''
  AND COALESCE(h."petak_id", (SELECT p."id" FROM "inventory_petak" p WHERE p."kavling_id" = h."kavling_id" AND p."nomor_makam" IS NOT NULL ORDER BY p."row", p."col" LIMIT 1)) IS NOT NULL;
