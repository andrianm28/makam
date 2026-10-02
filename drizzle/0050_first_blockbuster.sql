ALTER TABLE "lokasi_mitra" ADD COLUMN "berhenti_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "berhenti_berlaku_on" date;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "berhenti_diproses_at" timestamp with time zone;