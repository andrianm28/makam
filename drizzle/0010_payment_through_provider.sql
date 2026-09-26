CREATE TABLE "payment_effect_failure" (
	"tagihan_id" uuid NOT NULL,
	"effect" text NOT NULL,
	"failed_at" timestamp with time zone NOT NULL,
	"attempts" integer NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "payment_effect_failure_tagihan_id_effect_pk" PRIMARY KEY("tagihan_id","effect")
);
--> statement-breakpoint
CREATE TABLE "payment_webhook_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"outcome" text NOT NULL,
	CONSTRAINT "payment_webhook_event_kind_check" CHECK ("payment_webhook_event"."kind" in ('paid', 'expired', 'failed')),
	CONSTRAINT "payment_webhook_event_outcome_check" CHECK ("payment_webhook_event"."outcome" in ('lunas', 'sudah_lunas', 'diabaikan', 'perlu_ditinjau'))
);
--> statement-breakpoint
CREATE TABLE "pembayaran_perlu_ditinjau" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"event_id" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"tagihan_id" uuid,
	"amount" bigint NOT NULL,
	"channel" text,
	"paid_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pembayaran_perlu_ditinjau_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "pembayaran_perlu_ditinjau_reason_check" CHECK ("pembayaran_perlu_ditinjau"."reason" in ('pembayaran_tidak_dikenal', 'jumlah_tidak_cocok', 'tagihan_dibatalkan', 'batas_pembayaran_lewat', 'sudah_lunas_dibayar_lagi')),
	CONSTRAINT "pembayaran_perlu_ditinjau_amount_check" CHECK ("pembayaran_perlu_ditinjau"."amount" between 0 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "provider_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"provider_payment_id" text NOT NULL,
	"payment_url" text NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_payment_provider_payment_id_unique" UNIQUE("provider_payment_id"),
	CONSTRAINT "provider_payment_amount_check" CHECK ("provider_payment"."amount" between 0 and 100000000000)
);
--> statement-breakpoint
ALTER TABLE "payment_effect_failure" ADD CONSTRAINT "payment_effect_failure_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembayaran_perlu_ditinjau" ADD CONSTRAINT "pembayaran_perlu_ditinjau_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_payment" ADD CONSTRAINT "provider_payment_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pembayaran_perlu_ditinjau_received_idx" ON "pembayaran_perlu_ditinjau" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "provider_payment_tagihan_idx" ON "provider_payment" USING btree ("tagihan_id","expires_at");