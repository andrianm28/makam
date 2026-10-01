CREATE TABLE "notifications_peringatan_staf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"email_subject" text NOT NULL,
	"email_text" text NOT NULL,
	"push_title" text NOT NULL,
	"push_body" text NOT NULL,
	"push_url" text NOT NULL,
	"subject_kind" text,
	"subject_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0,
	"next_attempt_at" timestamp with time zone,
	"email_done_at" timestamp with time zone,
	"push_done_at" timestamp with time zone,
	"gave_up_at" timestamp with time zone,
	"bell_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "notifications_peringatan_staf_belum_dikirim_idx" ON "notifications_peringatan_staf" USING btree ("created_at") WHERE "notifications_peringatan_staf"."sent_at" is null;