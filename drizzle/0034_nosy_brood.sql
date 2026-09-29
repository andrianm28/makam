CREATE TABLE "notifications_catatan_tagihan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tagihan_id" text NOT NULL,
	"lokasi_id" text,
	"catatan" text NOT NULL,
	"ditulis_oleh" text NOT NULL,
	"dibuat_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notifications_catatan_tagihan_idx" ON "notifications_catatan_tagihan" USING btree ("tagihan_id","dibuat_pada");