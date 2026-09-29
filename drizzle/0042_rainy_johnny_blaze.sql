CREATE TABLE "pencairan_pengurangan_tertunda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor_pemesanan" text NOT NULL,
	"lokasi_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"catatan" text NOT NULL,
	"oleh" text NOT NULL,
	"dibuat_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permintaan_pembatalan_terencana" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pemesanan_id" uuid NOT NULL,
	"nomor_pemesanan" text NOT NULL,
	"hak_pakai_id" uuid NOT NULL,
	"unit_nomor" text NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"status" text NOT NULL,
	"pemohon_account_id" text NOT NULL,
	"pemohon_email" text NOT NULL,
	"catatan_pemohon" text,
	"dalam_masa_pembatalan" boolean NOT NULL,
	"persen_refund" integer NOT NULL,
	"jumlah_refund" bigint NOT NULL,
	"lines" jsonb NOT NULL,
	"putaran" integer NOT NULL,
	"diajukan_pada" timestamp with time zone NOT NULL,
	"tenggat_pada" timestamp with time zone,
	"diputuskan_pada" timestamp with time zone,
	"diputuskan_oleh" text,
	"alasan_keputusan" text,
	"dibatalkan_pada" timestamp with time zone,
	"permintaan_pengembalian_id" uuid,
	"persetujuan_refund_tenggat_pada" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "permintaan_pembatalan_terencana" ADD CONSTRAINT "permintaan_pembatalan_terencana_pemesanan_id_pemesanan_terencana_id_fk" FOREIGN KEY ("pemesanan_id") REFERENCES "public"."pemesanan_terencana"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pencairan_pengurangan_tertunda_pesanan_idx" ON "pencairan_pengurangan_tertunda" USING btree ("nomor_pemesanan","lokasi_id");--> statement-breakpoint
CREATE INDEX "permintaan_pembatalan_terencana_pemesanan_idx" ON "permintaan_pembatalan_terencana" USING btree ("pemesanan_id");--> statement-breakpoint
CREATE INDEX "permintaan_pembatalan_terencana_lokasi_idx" ON "permintaan_pembatalan_terencana" USING btree ("lokasi_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "permintaan_pembatalan_terencana_terbuka_idx" ON "permintaan_pembatalan_terencana" USING btree ("hak_pakai_id") WHERE "permintaan_pembatalan_terencana"."status" in ('diajukan', 'perlu_perbaikan');