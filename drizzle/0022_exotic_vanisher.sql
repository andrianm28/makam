CREATE TABLE "pengurusan_tpu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"tpu_id" text NOT NULL,
	"tpu_name" text NOT NULL,
	"tpu_address" text NOT NULL,
	"pemesan_account_id" text,
	"pemesan_name" text NOT NULL,
	"email" text,
	"phone_number" text,
	"almarhum_name" text NOT NULL,
	"tanggal_wafat" date NOT NULL,
	"jenis_penguburan" text NOT NULL,
	"kelayakan" jsonb NOT NULL,
	"kuburan" jsonb,
	"foto_iptm_key" text,
	"pemegang_hak" jsonb NOT NULL,
	"dokumen_pemakaman" jsonb NOT NULL,
	"dokumen_pengajuan" jsonb NOT NULL,
	"konfirmasi_due_at" timestamp with time zone,
	"tagihan_id" text,
	"alasan" text,
	"diajukan_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pengurusan_tpu_nomor_idx" ON "pengurusan_tpu" USING btree ("nomor");--> statement-breakpoint
CREATE INDEX "pengurusan_tpu_pemesan_idx" ON "pengurusan_tpu" USING btree ("pemesan_account_id");--> statement-breakpoint
CREATE INDEX "pengurusan_tpu_tpu_idx" ON "pengurusan_tpu" USING btree ("tpu_id");