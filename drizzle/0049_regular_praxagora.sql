CREATE TABLE "pesanan_paket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"petak_id" uuid NOT NULL,
	"hak_pakai_id" uuid NOT NULL,
	"paket_id" uuid NOT NULL,
	"lokasi_name" text NOT NULL,
	"petak_nomor" text NOT NULL,
	"pemesan_name" text NOT NULL,
	"pemesan_phone" text NOT NULL,
	"pemesan_email" text NOT NULL,
	"pemesan_account_id" uuid NOT NULL,
	"frekuensi" text NOT NULL,
	"status" text DEFAULT 'aktif' NOT NULL,
	"next_cycle_date" date,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pesanan_paket_nomor_unique" UNIQUE("nomor")
);
--> statement-breakpoint
CREATE TABLE "pesanan_paket_item" (
	"pesanan_paket_id" uuid NOT NULL,
	"posisi" integer NOT NULL,
	"layanan_id" uuid NOT NULL,
	"layanan_variant_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pesanan_layanan" ADD COLUMN "pesanan_paket_id" uuid;--> statement-breakpoint
ALTER TABLE "pesanan_layanan" ADD COLUMN "siklus" date;--> statement-breakpoint
ALTER TABLE "pesanan_paket" ADD CONSTRAINT "pesanan_paket_paket_id_layanan_paket_id_fk" FOREIGN KEY ("paket_id") REFERENCES "public"."layanan_paket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan_paket_item" ADD CONSTRAINT "pesanan_paket_item_pesanan_paket_id_pesanan_paket_id_fk" FOREIGN KEY ("pesanan_paket_id") REFERENCES "public"."pesanan_paket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan_paket_item" ADD CONSTRAINT "pesanan_paket_item_layanan_id_layanan_layanan_id_fk" FOREIGN KEY ("layanan_id") REFERENCES "public"."layanan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan_paket_item" ADD CONSTRAINT "pesanan_paket_item_layanan_variant_id_layanan_varian_id_fk" FOREIGN KEY ("layanan_variant_id") REFERENCES "public"."layanan_varian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pesanan_paket_pemesan_idx" ON "pesanan_paket" USING btree ("pemesan_account_id","created_at");--> statement-breakpoint
CREATE INDEX "pesanan_paket_lokasi_idx" ON "pesanan_paket" USING btree ("lokasi_id");--> statement-breakpoint
CREATE INDEX "pesanan_paket_item_pesanan_idx" ON "pesanan_paket_item" USING btree ("pesanan_paket_id","posisi");--> statement-breakpoint
-- contract: pesanan_layanan.pesanan_paket_id is a new, nullable column; every row the running release holds has NULL there, so the FK cannot fail for it, and the running release never reads or writes the column.
ALTER TABLE "pesanan_layanan" ADD CONSTRAINT "pesanan_layanan_pesanan_paket_id_pesanan_paket_id_fk" FOREIGN KEY ("pesanan_paket_id") REFERENCES "public"."pesanan_paket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- contract: pesanan_layanan.pesanan_paket_id and siklus are new, nullable columns; existing rows are NULL for both, and a unique index treats NULLs as distinct, so no existing row can violate it and the running release never writes these columns.
CREATE UNIQUE INDEX "pesanan_layanan_siklus_idx" ON "pesanan_layanan" USING btree ("pesanan_paket_id","siklus");