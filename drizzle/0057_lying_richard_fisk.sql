ALTER TABLE "pengurusan_tpu" ADD COLUMN "berkas_lengkap_diunggah_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "lunas_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "surat_pengantar_tugas_id" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "perbaikan" jsonb;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "ditolak_pada" timestamp with time zone;