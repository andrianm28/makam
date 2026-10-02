ALTER TABLE "pengurusan_tpu" ADD COLUMN "iptm_berakhir_pada" date;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "lewat_masa_tenggang" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "cek_tpu_selesai_pada" timestamp with time zone;