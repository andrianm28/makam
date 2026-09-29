CREATE TABLE "notifications_peringatan_antrean" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"tahap" text NOT NULL,
	"label" text NOT NULL,
	"subject_label" text NOT NULL,
	"href" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "notifications_peringatan_antrean_belum_dikirim_idx" ON "notifications_peringatan_antrean" USING btree ("created_at") WHERE "notifications_peringatan_antrean"."sent_at" is null;