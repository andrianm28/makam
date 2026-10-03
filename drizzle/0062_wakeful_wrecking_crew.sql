ALTER TABLE "pengurusan_tpu" ALTER COLUMN "almarhum_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ALTER COLUMN "tanggal_wafat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ALTER COLUMN "jenis_penguburan" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ALTER COLUMN "kelayakan" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications_telepon_pemesan" ADD COLUMN "kunci" text;