CREATE TABLE "bukti_pengembalian_dana" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"link" text NOT NULL,
	"pengembalian_id" uuid NOT NULL,
	"jumlah" bigint NOT NULL,
	"ditransfer_pada" date NOT NULL,
	"bukti_transfer_key" text NOT NULL,
	"header" jsonb NOT NULL,
	"dibuat_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "bukti_pengembalian_dana_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "bukti_pengembalian_dana_link_unique" UNIQUE("link"),
	CONSTRAINT "bukti_pengembalian_dana_jumlah_check" CHECK ("bukti_pengembalian_dana"."jumlah" between 1 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "pengembalian" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tagihan_id" text NOT NULL,
	"nomor_tagihan" text NOT NULL,
	"nomor_pemesanan" text,
	"pemesan_nama" text NOT NULL,
	"pemesan_telepon" text NOT NULL,
	"pemesan_akun_id" text,
	"fault" text NOT NULL,
	"sebab" text NOT NULL,
	"jumlah" bigint NOT NULL,
	"biaya_layanan_platform" bigint DEFAULT '0'::bigint NOT NULL,
	"biaya_layanan_platform_dikembalikan" boolean NOT NULL,
	"penanggung" text NOT NULL,
	"catatan" text,
	"rekening" jsonb,
	"status" text NOT NULL,
	"diminta_pada" timestamp with time zone NOT NULL,
	"diminta_oleh" text,
	"disetujui_pada" timestamp with time zone,
	"disetujui_oleh" text,
	"jatuh_tempo_at" timestamp with time zone,
	"ditransfer_pada" date,
	"dibuat_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "pengembalian_jumlah_check" CHECK ("pengembalian"."jumlah" between 1 and 100000000000),
	CONSTRAINT "pengembalian_biaya_layanan_platform_check" CHECK ("pengembalian"."biaya_layanan_platform" between 0 and 100000000000),
	CONSTRAINT "pengembalian_biaya_layanan_platform_dikembalikan_check" CHECK ("pengembalian"."biaya_layanan_platform" = 0 or "pengembalian"."biaya_layanan_platform" <= "pengembalian"."jumlah")
);
--> statement-breakpoint
CREATE TABLE "pengembalian_baris" (
	"pengembalian_id" uuid NOT NULL,
	"posisi" integer NOT NULL,
	"label" text NOT NULL,
	"jumlah" bigint NOT NULL,
	"provider" jsonb NOT NULL,
	CONSTRAINT "pengembalian_baris_pengembalian_id_posisi_pk" PRIMARY KEY("pengembalian_id","posisi"),
	CONSTRAINT "pengembalian_baris_jumlah_check" CHECK ("pengembalian_baris"."jumlah" between 1 and 100000000000)
);
--> statement-breakpoint
ALTER TABLE "bukti_pengembalian_dana" ADD CONSTRAINT "bukti_pengembalian_dana_pengembalian_id_pengembalian_id_fk" FOREIGN KEY ("pengembalian_id") REFERENCES "public"."pengembalian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pengembalian_baris" ADD CONSTRAINT "pengembalian_baris_pengembalian_id_pengembalian_id_fk" FOREIGN KEY ("pengembalian_id") REFERENCES "public"."pengembalian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bukti_pengembalian_dana_pengembalian_idx" ON "bukti_pengembalian_dana" USING btree ("pengembalian_id");--> statement-breakpoint
CREATE INDEX "pengembalian_status_idx" ON "pengembalian" USING btree ("status","jatuh_tempo_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pengembalian_tagihan_sebab_idx" ON "pengembalian" USING btree ("tagihan_id","sebab") WHERE "pengembalian"."status" <> 'ditransfer';