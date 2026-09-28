CREATE TABLE "bukti_pemesanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"link" text NOT NULL,
	"nomor_pemesanan" text NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"lokasi_nama" text NOT NULL,
	"unit" jsonb NOT NULL,
	"pemegang_hak" jsonb NOT NULL,
	"calon_penghuni" text,
	"masa_hak_pakai" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"header" jsonb NOT NULL,
	CONSTRAINT "bukti_pemesanan_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "bukti_pemesanan_link_unique" UNIQUE("link"),
	CONSTRAINT "bukti_pemesanan_nomor_pemesanan_unique" UNIQUE("nomor_pemesanan")
);
--> statement-breakpoint
CREATE TABLE "pemesanan_terencana_pembayaran" (
	"nomor_pemesanan" text PRIMARY KEY NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"dibayar_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_hak_pakai" ADD COLUMN "calon_penghuni" text;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "dikonfirmasi_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "dikonfirmasi_oleh" text;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "aktif_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana_unit" ADD COLUMN "hak_pakai_id" uuid;--> statement-breakpoint
ALTER TABLE "bukti_pemesanan" ADD CONSTRAINT "bukti_pemesanan_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bukti_pemesanan_tagihan_idx" ON "bukti_pemesanan" USING btree ("tagihan_id");--> statement-breakpoint
CREATE INDEX "pemesanan_terencana_status_lokasi_idx" ON "pemesanan_terencana" USING btree ("status","lokasi_id");--> statement-breakpoint
CREATE INDEX "pemesanan_terencana_tagihan_idx" ON "pemesanan_terencana" USING btree ("tagihan_id");--> statement-breakpoint
CREATE FUNCTION "bukti_pemesanan_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'bukti_pemesanan is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "bukti_pemesanan_no_update_or_delete" BEFORE UPDATE OR DELETE ON "bukti_pemesanan" FOR EACH ROW EXECUTE FUNCTION "bukti_pemesanan_append_only"();