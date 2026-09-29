CREATE TABLE "pekerjaan_layanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pesanan_id" uuid NOT NULL,
	"pesanan_item_id" uuid NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"petak_id" uuid NOT NULL,
	"status" text DEFAULT 'menunggu_pembayaran' NOT NULL,
	"target_date" date NOT NULL,
	"dijadwalkan_at" timestamp with time zone,
	"mulai_at" timestamp with time zone,
	"selesai_at" timestamp with time zone,
	"terlambat_at" timestamp with time zone,
	"dibatalkan_at" timestamp with time zone,
	"alasan_pembatalan" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pekerjaan_layanan_bukti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"diunggah_oleh" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pengembalian_layanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"pesanan_id" uuid NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"alasan" text NOT NULL,
	"baris" jsonb NOT NULL,
	"total" bigint NOT NULL,
	"platform_dikembalikan" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pengembalian_layanan_total_check" CHECK ("pengembalian_layanan"."total" between 0 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "pesanan_layanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"petak_id" uuid NOT NULL,
	"hak_pakai_id" uuid NOT NULL,
	"lokasi_name" text NOT NULL,
	"petak_nomor" text NOT NULL,
	"pemesan_name" text NOT NULL,
	"pemesan_phone" text NOT NULL,
	"pemesan_email" text NOT NULL,
	"pemesan_account_id" uuid NOT NULL,
	"status" text DEFAULT 'menunggu_pembayaran' NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"total" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pesanan_layanan_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "pesanan_layanan_total_check" CHECK ("pesanan_layanan"."total" between 0 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "pesanan_layanan_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pesanan_id" uuid NOT NULL,
	"posisi" integer NOT NULL,
	"layanan_id" uuid NOT NULL,
	"layanan_variant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	"lead_time_days" integer NOT NULL,
	"target_date" date NOT NULL,
	"teks" text,
	CONSTRAINT "pesanan_layanan_item_amount_check" CHECK ("pesanan_layanan_item"."amount" between 0 and 100000000000),
	CONSTRAINT "pesanan_layanan_item_lead_time_check" CHECK ("pesanan_layanan_item"."lead_time_days" between 0 and 365)
);
--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan" ADD CONSTRAINT "pekerjaan_layanan_pesanan_id_pesanan_layanan_id_fk" FOREIGN KEY ("pesanan_id") REFERENCES "public"."pesanan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan" ADD CONSTRAINT "pekerjaan_layanan_pesanan_item_id_pesanan_layanan_item_id_fk" FOREIGN KEY ("pesanan_item_id") REFERENCES "public"."pesanan_layanan_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_bukti" ADD CONSTRAINT "pekerjaan_layanan_bukti_pekerjaan_id_pekerjaan_layanan_id_fk" FOREIGN KEY ("pekerjaan_id") REFERENCES "public"."pekerjaan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengembalian_layanan" ADD CONSTRAINT "pengembalian_layanan_pekerjaan_id_pekerjaan_layanan_id_fk" FOREIGN KEY ("pekerjaan_id") REFERENCES "public"."pekerjaan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengembalian_layanan" ADD CONSTRAINT "pengembalian_layanan_pesanan_id_pesanan_layanan_id_fk" FOREIGN KEY ("pesanan_id") REFERENCES "public"."pesanan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan_layanan_item" ADD CONSTRAINT "pesanan_layanan_item_pesanan_id_pesanan_layanan_id_fk" FOREIGN KEY ("pesanan_id") REFERENCES "public"."pesanan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan_layanan_item" ADD CONSTRAINT "pesanan_layanan_item_layanan_id_layanan_layanan_id_fk" FOREIGN KEY ("layanan_id") REFERENCES "public"."layanan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan_layanan_item" ADD CONSTRAINT "pesanan_layanan_item_layanan_variant_id_layanan_varian_id_fk" FOREIGN KEY ("layanan_variant_id") REFERENCES "public"."layanan_varian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pekerjaan_layanan_item_idx" ON "pekerjaan_layanan" USING btree ("pesanan_item_id");--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_lokasi_idx" ON "pekerjaan_layanan" USING btree ("lokasi_id","status","target_date");--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_terlambat_idx" ON "pekerjaan_layanan" USING btree ("status","target_date");--> statement-breakpoint
CREATE UNIQUE INDEX "pekerjaan_layanan_bukti_idx" ON "pekerjaan_layanan_bukti" USING btree ("pekerjaan_id","kind");--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_bukti_pekerjaan_idx" ON "pekerjaan_layanan_bukti" USING btree ("pekerjaan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pengembalian_layanan_pekerjaan_idx" ON "pengembalian_layanan" USING btree ("pekerjaan_id");--> statement-breakpoint
CREATE INDEX "pesanan_layanan_pemesan_idx" ON "pesanan_layanan" USING btree ("pemesan_account_id","created_at");--> statement-breakpoint
CREATE INDEX "pesanan_layanan_lokasi_idx" ON "pesanan_layanan" USING btree ("lokasi_id");--> statement-breakpoint
CREATE INDEX "pesanan_layanan_item_pesanan_idx" ON "pesanan_layanan_item" USING btree ("pesanan_id","posisi");