CREATE TABLE "layanan_mitra_jasa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"nama_lengkap" text NOT NULL,
	"nik" text NOT NULL,
	"ktp_file_key" text,
	"ktp_content_type" text,
	"foto_file_key" text,
	"foto_content_type" text,
	"area" text NOT NULL,
	"perjanjian_tanda_tangan_pada" text,
	"perjanjian_file_key" text,
	"perjanjian_content_type" text,
	"bank_name" text,
	"bank_account_number" text,
	"bank_account_holder" text,
	"catatan_override_rekening" text,
	"kontak_siaga_nama" text,
	"kontak_siaga_telepon" text,
	"status" text NOT NULL,
	"status_alasan" text,
	"status_diubah_pada" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "layanan_mitra_jasa_nik_check" CHECK ("layanan_mitra_jasa"."nik" ~ '^[0-9]{16}$'),
	CONSTRAINT "layanan_mitra_jasa_status_alasan_check" CHECK ("layanan_mitra_jasa"."status" = 'aktif' or length(coalesce("layanan_mitra_jasa"."status_alasan", '')) > 0)
);
--> statement-breakpoint
CREATE TABLE "layanan_mitra_jasa_layanan" (
	"mitra_jasa_id" uuid NOT NULL,
	"layanan_variant_id" uuid NOT NULL,
	CONSTRAINT "layanan_mitra_jasa_layanan_mitra_jasa_id_layanan_variant_id_pk" PRIMARY KEY("mitra_jasa_id","layanan_variant_id")
);
--> statement-breakpoint
CREATE TABLE "layanan_mitra_jasa_tidak_tersedia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mitra_jasa_id" uuid NOT NULL,
	"dari" text NOT NULL,
	"sampai" text NOT NULL,
	"alasan" text,
	"dibuat_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "layanan_mitra_jasa_tidak_tersedia_rentang_check" CHECK ("layanan_mitra_jasa_tidak_tersedia"."dari" <= "layanan_mitra_jasa_tidak_tersedia"."sampai")
);
--> statement-breakpoint
CREATE TABLE "layanan_mitra_jasa_tinjauan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mitra_jasa_id" uuid NOT NULL,
	"bulan" text NOT NULL,
	"selesai" integer NOT NULL,
	"terlambat" integer NOT NULL,
	"keluhan_upheld" integer NOT NULL,
	"declines" integer NOT NULL,
	"rata_penilaian" real,
	"dibuka_pada" timestamp with time zone NOT NULL,
	"ditinjau_pada" timestamp with time zone,
	"ditinjau_oleh_account_id" text,
	"catatan" text
);
--> statement-breakpoint
CREATE TABLE "layanan_mitra_jasa_tpu" (
	"mitra_jasa_id" uuid NOT NULL,
	"tpu_dki_id" uuid NOT NULL,
	CONSTRAINT "layanan_mitra_jasa_tpu_mitra_jasa_id_tpu_dki_id_pk" PRIMARY KEY("mitra_jasa_id","tpu_dki_id")
);
--> statement-breakpoint
ALTER TABLE "layanan_mitra_jasa_layanan" ADD CONSTRAINT "layanan_mitra_jasa_layanan_mitra_jasa_id_layanan_mitra_jasa_id_fk" FOREIGN KEY ("mitra_jasa_id") REFERENCES "public"."layanan_mitra_jasa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layanan_mitra_jasa_layanan" ADD CONSTRAINT "layanan_mitra_jasa_layanan_layanan_variant_id_layanan_varian_id_fk" FOREIGN KEY ("layanan_variant_id") REFERENCES "public"."layanan_varian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layanan_mitra_jasa_tidak_tersedia" ADD CONSTRAINT "layanan_mitra_jasa_tidak_tersedia_mitra_jasa_id_layanan_mitra_jasa_id_fk" FOREIGN KEY ("mitra_jasa_id") REFERENCES "public"."layanan_mitra_jasa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layanan_mitra_jasa_tinjauan" ADD CONSTRAINT "layanan_mitra_jasa_tinjauan_mitra_jasa_id_layanan_mitra_jasa_id_fk" FOREIGN KEY ("mitra_jasa_id") REFERENCES "public"."layanan_mitra_jasa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layanan_mitra_jasa_tpu" ADD CONSTRAINT "layanan_mitra_jasa_tpu_mitra_jasa_id_layanan_mitra_jasa_id_fk" FOREIGN KEY ("mitra_jasa_id") REFERENCES "public"."layanan_mitra_jasa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "layanan_mitra_jasa_email_idx" ON "layanan_mitra_jasa" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "layanan_mitra_jasa_nik_idx" ON "layanan_mitra_jasa" USING btree ("nik");--> statement-breakpoint
CREATE INDEX "layanan_mitra_jasa_layanan_varian_idx" ON "layanan_mitra_jasa_layanan" USING btree ("layanan_variant_id");--> statement-breakpoint
CREATE INDEX "layanan_mitra_jasa_tidak_tersedia_mitra_idx" ON "layanan_mitra_jasa_tidak_tersedia" USING btree ("mitra_jasa_id","dari");--> statement-breakpoint
CREATE UNIQUE INDEX "layanan_mitra_jasa_tinjauan_bulan_idx" ON "layanan_mitra_jasa_tinjauan" USING btree ("mitra_jasa_id","bulan");--> statement-breakpoint
CREATE INDEX "layanan_mitra_jasa_tinjauan_bulan_idx_bulan" ON "layanan_mitra_jasa_tinjauan" USING btree ("bulan");--> statement-breakpoint
CREATE INDEX "layanan_mitra_jasa_tpu_tpu_idx" ON "layanan_mitra_jasa_tpu" USING btree ("tpu_dki_id");