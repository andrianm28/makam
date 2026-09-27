CREATE TABLE "notifications_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template" text NOT NULL,
	"channel" text NOT NULL,
	"tagihan_id" text,
	"nomor_tagihan" text,
	"nomor_pemesanan" text,
	"email" text,
	"akun_staf_id" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications_tagihan_kontak" (
	"tagihan_id" text PRIMARY KEY NOT NULL,
	"email" text,
	"nomor_tagihan" text NOT NULL,
	"nomor_pemesanan" text,
	"total" integer NOT NULL,
	"tagihan_link" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications_telepon_pemesan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"nomor_tagihan" text,
	"sebab" text NOT NULL,
	"pesan_id" uuid,
	"dibuka_pada" timestamp with time zone NOT NULL,
	"ditutup_pada" timestamp with time zone,
	"hasil" text,
	"catatan" text,
	"dicatat_oleh" text
);
--> statement-breakpoint
CREATE INDEX "notifications_message_due_idx" ON "notifications_message" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "notifications_message_tagihan_idx" ON "notifications_message" USING btree ("tagihan_id");--> statement-breakpoint
CREATE INDEX "notifications_telepon_pemesan_subject_idx" ON "notifications_telepon_pemesan" USING btree ("subject_kind","subject_id");