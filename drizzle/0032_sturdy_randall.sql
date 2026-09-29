CREATE TABLE "bukti_pengembalian_dana" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"link" text NOT NULL,
	"permintaan_id" uuid NOT NULL,
	"tagihan_id" text NOT NULL,
	"nomor_tagihan" text NOT NULL,
	"nomor_pemesanan" text,
	"amount" bigint NOT NULL,
	"biaya_layanan_platform_dikembalikan" boolean NOT NULL,
	"lines" jsonb NOT NULL,
	"rekening_bank" text NOT NULL,
	"rekening_nomor" text NOT NULL,
	"rekening_nama" text NOT NULL,
	"bukti_transfer_key" text NOT NULL,
	"ditransfer_pada" date NOT NULL,
	"header" jsonb NOT NULL,
	"dibuat_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "bukti_pengembalian_dana_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "bukti_pengembalian_dana_link_unique" UNIQUE("link"),
	CONSTRAINT "bukti_pengembalian_dana_permintaan_id_unique" UNIQUE("permintaan_id")
);
--> statement-breakpoint
CREATE TABLE "permintaan_pengembalian" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tagihan_id" text NOT NULL,
	"nomor_tagihan" text NOT NULL,
	"nomor_pemesanan" text,
	"sumber" text NOT NULL,
	"pihak_bersalah" text NOT NULL,
	"biaya_layanan_platform_dikembalikan" boolean NOT NULL,
	"goodwill" boolean NOT NULL,
	"penuh" boolean NOT NULL,
	"lines" jsonb NOT NULL,
	"jumlah" bigint NOT NULL,
	"catatan" text,
	"diajukan_pada" timestamp with time zone NOT NULL,
	"diajukan_oleh" text,
	"status" text NOT NULL,
	"disetujui_pada" timestamp with time zone,
	"disetujui_oleh" text,
	"tenggat_transfer_pada" timestamp with time zone,
	"rekening_bank" text,
	"rekening_nomor" text,
	"rekening_nama" text,
	"rekening_diisi_oleh" text,
	"rekening_diisi_pada" timestamp with time zone,
	"bukti_id" uuid,
	CONSTRAINT "permintaan_pengembalian_jumlah_check" CHECK ("permintaan_pengembalian"."jumlah" between 1 and 100000000000),
	CONSTRAINT "permintaan_pengembalian_rekening_check" CHECK (("permintaan_pengembalian"."rekening_bank" is null) = ("permintaan_pengembalian"."rekening_nomor" is null) and ("permintaan_pengembalian"."rekening_bank" is null) = ("permintaan_pengembalian"."rekening_nama" is null))
);
--> statement-breakpoint
CREATE INDEX "permintaan_pengembalian_tagihan_idx" ON "permintaan_pengembalian" USING btree ("tagihan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permintaan_pengembalian_tagihan_open_idx" ON "permintaan_pengembalian" USING btree ("tagihan_id") WHERE "permintaan_pengembalian"."status" <> 'ditransfer';--> statement-breakpoint
CREATE UNIQUE INDEX "permintaan_pengembalian_tagihan_sumber_idx" ON "permintaan_pengembalian" USING btree ("tagihan_id","sumber") WHERE "permintaan_pengembalian"."sumber" = 'pembatalan';--> statement-breakpoint
-- Append-only, like bukti_pembayaran and bukti_pemesanan (AGENTS.md, ticket 31):
-- a family's proof that its money came back must never be quietly rewritten or removed.
CREATE FUNCTION "bukti_pengembalian_dana_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'bukti_pengembalian_dana is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "bukti_pengembalian_dana_no_update_or_delete" BEFORE UPDATE OR DELETE ON "bukti_pengembalian_dana" FOR EACH ROW EXECUTE FUNCTION "bukti_pengembalian_dana_append_only"();