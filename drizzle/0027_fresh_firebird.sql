CREATE TABLE "bukti_pencairan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"link" text NOT NULL,
	"penerima_kind" text NOT NULL,
	"lokasi_id" text,
	"penerima_nama" text NOT NULL,
	"penerima_akun_id" text,
	"amount" bigint NOT NULL,
	"item_count" integer NOT NULL,
	"potongan_count" integer NOT NULL,
	"ditransfer_pada" date NOT NULL,
	"bukti_transfer_key" text NOT NULL,
	"header" jsonb NOT NULL,
	"dibuat_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "bukti_pencairan_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "bukti_pencairan_link_unique" UNIQUE("link"),
	CONSTRAINT "bukti_pencairan_amount_check" CHECK ("bukti_pencairan"."amount" between 1 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "bukti_pencairan_item" (
	"bukti_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	"nomor_pemesanan" text,
	CONSTRAINT "bukti_pencairan_item_amount_check" CHECK ("bukti_pencairan_item"."amount" between 1 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "bukti_pencairan_potongan" (
	"bukti_id" uuid NOT NULL,
	"potongan_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"alasan" text NOT NULL,
	CONSTRAINT "bukti_pencairan_potongan_amount_check" CHECK ("bukti_pencairan_potongan"."amount" between 1 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "pencairan_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"penerima_kind" text NOT NULL,
	"lokasi_id" text,
	"penerima_nama" text NOT NULL,
	"penerima_akun_id" text,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	"tagihan_id" text,
	"tagihan_posisi" integer,
	"nomor_pemesanan" text,
	"tanggal_layanan" date,
	"pekerjaan_label" text,
	"layanan_nama" text,
	"due_at" timestamp with time zone,
	"jatuh_tempo_at" timestamp with time zone,
	"status" text NOT NULL,
	"batal_alasan" text,
	"batal_pada" timestamp with time zone,
	"jumlah_disesuaikan" bigint,
	"alasan_penyesuaian" text,
	"catatan_penyesuaian" text,
	"disesuaikan_oleh" text,
	"disesuaikan_pada" timestamp with time zone,
	"tahan_alasan" text,
	"tahan_pada" timestamp with time zone,
	"tahan_oleh" text,
	"dicairkan_pada" timestamp with time zone,
	"dibuat_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "pencairan_item_amount_check" CHECK ("pencairan_item"."amount" between 0 and 100000000000),
	CONSTRAINT "pencairan_item_jumlah_disesuaikan_check" CHECK ("pencairan_item"."jumlah_disesuaikan" between 0 and 100000000000),
	CONSTRAINT "pencairan_item_penerima_check" CHECK ("pencairan_item"."penerima_kind" <> 'mitra_jasa' or "pencairan_item"."penerima_akun_id" is not null),
	CONSTRAINT "pencairan_item_lokasi_check" CHECK ("pencairan_item"."penerima_kind" <> 'lokasi_mitra' or "pencairan_item"."lokasi_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "pencairan_pemakaman" (
	"nomor_pemesanan" text PRIMARY KEY NOT NULL,
	"pemakaman_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pencairan_pembayaran" (
	"tagihan_id" text PRIMARY KEY NOT NULL,
	"nomor_pemesanan" text,
	"dibayar_pada" timestamp with time zone NOT NULL,
	"metode" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "potongan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"alasan_kode" text NOT NULL,
	"alasan" text NOT NULL,
	"tautan" text,
	"sumber_tagihan_id" text,
	"sumber_nomor_pemesanan" text,
	"status" text NOT NULL,
	"terpotong_sebesar" bigint DEFAULT '0'::bigint NOT NULL,
	"perlu_offline_pada" timestamp with time zone,
	"tercatat_pada" timestamp with time zone,
	"dicatat_oleh" text,
	"dibuat_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "potongan_amount_check" CHECK ("potongan"."amount" between 1 and 100000000000),
	CONSTRAINT "potongan_terpotong_check" CHECK ("potongan"."terpotong_sebesar" between 0 and "potongan"."amount")
);
--> statement-breakpoint
ALTER TABLE "bukti_pencairan_item" ADD CONSTRAINT "bukti_pencairan_item_bukti_id_bukti_pencairan_id_fk" FOREIGN KEY ("bukti_id") REFERENCES "public"."bukti_pencairan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bukti_pencairan_item" ADD CONSTRAINT "bukti_pencairan_item_item_id_pencairan_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."pencairan_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bukti_pencairan_potongan" ADD CONSTRAINT "bukti_pencairan_potongan_bukti_id_bukti_pencairan_id_fk" FOREIGN KEY ("bukti_id") REFERENCES "public"."bukti_pencairan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bukti_pencairan_potongan" ADD CONSTRAINT "bukti_pencairan_potongan_potongan_id_potongan_id_fk" FOREIGN KEY ("potongan_id") REFERENCES "public"."potongan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bukti_pencairan_lokasi_idx" ON "bukti_pencairan" USING btree ("lokasi_id","ditransfer_pada");--> statement-breakpoint
CREATE INDEX "bukti_pencairan_akun_idx" ON "bukti_pencairan" USING btree ("penerima_akun_id","ditransfer_pada");--> statement-breakpoint
CREATE UNIQUE INDEX "bukti_pencairan_item_item_idx" ON "bukti_pencairan_item" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bukti_pencairan_potongan_potongan_idx" ON "bukti_pencairan_potongan" USING btree ("potongan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pencairan_item_tagihan_posisi_idx" ON "pencairan_item" USING btree ("tagihan_id","tagihan_posisi");--> statement-breakpoint
CREATE INDEX "pencairan_item_jatuh_tempo_idx" ON "pencairan_item" USING btree ("status","jatuh_tempo_at");--> statement-breakpoint
CREATE INDEX "pencairan_item_lokasi_idx" ON "pencairan_item" USING btree ("lokasi_id","status");--> statement-breakpoint
CREATE INDEX "pencairan_item_akun_idx" ON "pencairan_item" USING btree ("penerima_akun_id","status");--> statement-breakpoint
CREATE INDEX "potongan_lokasi_status_idx" ON "potongan" USING btree ("lokasi_id","status","dibuat_pada");--> statement-breakpoint
CREATE UNIQUE INDEX "potongan_sumber_kode_idx" ON "potongan" USING btree ("sumber_tagihan_id","alasan_kode");