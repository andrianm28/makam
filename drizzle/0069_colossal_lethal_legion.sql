CREATE TABLE "kedukaan_permintaan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nomor" text NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"jenis" text NOT NULL,
	"nama" text NOT NULL,
	"telepon" text NOT NULL,
	"kab_kota" text NOT NULL,
	"rincian" jsonb NOT NULL,
	"catatan" text NOT NULL,
	"status" text NOT NULL,
	"alasan" text,
	"diajukan_pada" timestamp with time zone NOT NULL,
	"tenggat_pada" timestamp with time zone,
	"diubah_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "kedukaan_permintaan_nomor_unique" UNIQUE("nomor")
);
--> statement-breakpoint
CREATE TABLE "kedukaan_riwayat" (
	"id" uuid PRIMARY KEY NOT NULL,
	"permintaan_id" uuid NOT NULL,
	"status" text NOT NULL,
	"pada" timestamp with time zone NOT NULL,
	"oleh_account_id" uuid,
	"catatan" text
);
--> statement-breakpoint
ALTER TABLE "kedukaan_riwayat" ADD CONSTRAINT "kedukaan_riwayat_permintaan_id_kedukaan_permintaan_id_fk" FOREIGN KEY ("permintaan_id") REFERENCES "public"."kedukaan_permintaan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kedukaan_permintaan_account_idx" ON "kedukaan_permintaan" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "kedukaan_permintaan_status_idx" ON "kedukaan_permintaan" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kedukaan_riwayat_permintaan_idx" ON "kedukaan_riwayat" USING btree ("permintaan_id","pada");