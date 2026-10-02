CREATE TABLE "wakaf_catatan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pengajuan_id" uuid NOT NULL,
	"jenis" text NOT NULL,
	"isi" text NOT NULL,
	"penulis_account_id" text NOT NULL,
	"pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wakaf_nazhir" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nama" text NOT NULL,
	"jenis" text NOT NULL,
	"kab_kota" text NOT NULL,
	"kontak" text NOT NULL,
	"nomor_bwi" text NOT NULL,
	"dibuat_pada" timestamp with time zone NOT NULL,
	"diubah_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wakaf_pengajuan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"wakif_account_id" text NOT NULL,
	"wakif_email" text NOT NULL,
	"tujuan" text NOT NULL,
	"nama_keluarga" text,
	"wakif_nama" text NOT NULL,
	"wakif_telepon" text NOT NULL,
	"hubungan_dengan_tanah" text NOT NULL,
	"kab_kota" text NOT NULL,
	"alamat" text NOT NULL,
	"pin_lat" double precision,
	"pin_lng" double precision,
	"luas_m2" integer NOT NULL,
	"jenis_bukti" text NOT NULL,
	"nazhir_id" text,
	"nazhir_nama" text,
	"status" text NOT NULL,
	"alasan" text,
	"tanggal_survei" date,
	"tanggal_ikrar" date,
	"tugas_survei_id" text,
	"berkas" jsonb NOT NULL,
	"diajukan_pada" timestamp with time zone NOT NULL,
	"tenggat_pada" timestamp with time zone,
	"diubah_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "wakaf_pengajuan_nomor_unique" UNIQUE("nomor")
);
--> statement-breakpoint
CREATE TABLE "wakaf_riwayat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pengajuan_id" uuid NOT NULL,
	"status" text NOT NULL,
	"pada" timestamp with time zone NOT NULL,
	"tanggal" date
);
--> statement-breakpoint
CREATE INDEX "wakaf_catatan_pengajuan_idx" ON "wakaf_catatan" USING btree ("pengajuan_id","pada");--> statement-breakpoint
CREATE INDEX "wakaf_pengajuan_wakif_idx" ON "wakaf_pengajuan" USING btree ("wakif_account_id");--> statement-breakpoint
CREATE INDEX "wakaf_pengajuan_status_idx" ON "wakaf_pengajuan" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wakaf_riwayat_pengajuan_idx" ON "wakaf_riwayat" USING btree ("pengajuan_id","pada");