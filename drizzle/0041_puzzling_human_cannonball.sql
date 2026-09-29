CREATE TABLE "perpanjangan_permohonan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hak_pakai_id" text NOT NULL,
	"lokasi_id" text NOT NULL,
	"lokasi_name" text NOT NULL,
	"petak_nomor" text NOT NULL,
	"jalur" text NOT NULL,
	"status" text NOT NULL,
	"pemohon_account_id" text NOT NULL,
	"email" text NOT NULL,
	"nama" text NOT NULL,
	"nomor_telepon" text NOT NULL,
	"catatan" text,
	"berkas" jsonb NOT NULL,
	"alasan" text,
	"diajukan_pada" timestamp with time zone NOT NULL,
	"tenggat_pada" timestamp with time zone,
	"keputusan_pada" timestamp with time zone,
	"keputusan_oleh_account_id" text,
	"berlaku_sampai" timestamp with time zone,
	"dibuat_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "perpanjangan" ADD COLUMN "permohonan_id" text;--> statement-breakpoint
CREATE INDEX "perpanjangan_permohonan_hak_pakai_idx" ON "perpanjangan_permohonan" USING btree ("hak_pakai_id","dibuat_pada");--> statement-breakpoint
CREATE INDEX "perpanjangan_permohonan_lokasi_idx" ON "perpanjangan_permohonan" USING btree ("lokasi_id","status");--> statement-breakpoint
CREATE INDEX "perpanjangan_permohonan_pemohon_idx" ON "perpanjangan_permohonan" USING btree ("pemohon_account_id");