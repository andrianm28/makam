ALTER TABLE "notifications_peringatan_antrean" ADD COLUMN "attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "notifications_peringatan_antrean" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications_peringatan_antrean" ADD COLUMN "email_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications_peringatan_antrean" ADD COLUMN "push_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notifications_peringatan_antrean" ADD COLUMN "gave_up_at" timestamp with time zone;