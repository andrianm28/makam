CREATE TABLE "bukti_perpanjangan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"link" text NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"perpanjangan_id" text NOT NULL,
	"lokasi_name" text NOT NULL,
	"petak_nomor" text NOT NULL,
	"pemegang_hak_name" text NOT NULL,
	"end_date_lama" date NOT NULL,
	"end_date_baru" date NOT NULL,
	"terms" integer NOT NULL,
	"header" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bukti_perpanjangan_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "bukti_perpanjangan_link_unique" UNIQUE("link")
);
--> statement-breakpoint
CREATE TABLE "perpanjangan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hak_pakai_id" text NOT NULL,
	"lokasi_id" text NOT NULL,
	"lokasi_name" text NOT NULL,
	"petak_nomor" text NOT NULL,
	"pemegang_hak_name" text NOT NULL,
	"terms" integer NOT NULL,
	"tagihan_id" text NOT NULL,
	"nomor_tagihan" text NOT NULL,
	"pemohon_account_id" text NOT NULL,
	"email" text,
	"dibuat_pada" timestamp with time zone NOT NULL,
	"dibayar_pada" timestamp with time zone,
	"end_date_lama" date,
	"end_date_baru" date,
	"bukti_id" text,
	CONSTRAINT "perpanjangan_tagihan_id_unique" UNIQUE("tagihan_id")
);
--> statement-breakpoint
-- contract: the reason check is only widened by one value (tidak_dapat_diterapkan), re-added below in this same migration; every row the running release writes still satisfies it, so the two statements only add a case
ALTER TABLE "pembayaran_perlu_ditinjau" DROP CONSTRAINT "pembayaran_perlu_ditinjau_reason_check";--> statement-breakpoint
ALTER TABLE "bukti_perpanjangan" ADD CONSTRAINT "bukti_perpanjangan_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bukti_perpanjangan_perpanjangan_idx" ON "bukti_perpanjangan" USING btree ("perpanjangan_id");--> statement-breakpoint
CREATE INDEX "perpanjangan_hak_pakai_idx" ON "perpanjangan" USING btree ("hak_pakai_id","dibuat_pada");--> statement-breakpoint
ALTER TABLE "pembayaran_perlu_ditinjau" ADD CONSTRAINT "pembayaran_perlu_ditinjau_reason_check" CHECK ("pembayaran_perlu_ditinjau"."reason" in ('pembayaran_tidak_dikenal', 'jumlah_tidak_cocok', 'tagihan_dibatalkan', 'batas_pembayaran_lewat', 'sudah_lunas_dibayar_lagi', 'tidak_dapat_diterapkan'));--> statement-breakpoint
-- Append-only, like bukti_pemesanan (AGENTS.md, ticket 40): a family's proof that its
-- Hak Pakai was extended must never be quietly rewritten or removed.
CREATE FUNCTION "bukti_perpanjangan_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'bukti_perpanjangan is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "bukti_perpanjangan_no_update_or_delete" BEFORE UPDATE OR DELETE ON "bukti_perpanjangan" FOR EACH ROW EXECUTE FUNCTION "bukti_perpanjangan_append_only"();
