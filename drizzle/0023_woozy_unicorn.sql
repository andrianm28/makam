CREATE TABLE "pemesanan_berkas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pemesanan_id" uuid NOT NULL,
	"nama" text NOT NULL,
	"file_key" text,
	"diunggah_pada" timestamp with time zone,
	"diunggah_oleh" text,
	"dicentang_pada" timestamp with time zone,
	"dicentang_oleh" text,
	"dibuat_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications_message" ADD COLUMN "pemesanan_id" text;--> statement-breakpoint
ALTER TABLE "notifications_message" ADD COLUMN "lokasi_id" text;--> statement-breakpoint
ALTER TABLE "notifications_telepon_pemesan" ADD COLUMN "nomor_pemesanan" text;--> statement-breakpoint
ALTER TABLE "notifications_telepon_pemesan" ADD COLUMN "lokasi_id" text;--> statement-breakpoint
ALTER TABLE "notifications_telepon_pemesan" ADD COLUMN "perihal" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "realert_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "petak_id" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "petak_nomor" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "hak_pakai_id" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "pemakaman_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "dikonfirmasi_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_berkas" ADD CONSTRAINT "pemesanan_berkas_pemesanan_id_pemesanan_makam_id_fk" FOREIGN KEY ("pemesanan_id") REFERENCES "public"."pemesanan_makam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pemesanan_berkas_item_idx" ON "pemesanan_berkas" USING btree ("pemesanan_id","nama");--> statement-breakpoint
CREATE INDEX "notifications_message_pemesanan_idx" ON "notifications_message" USING btree ("pemesanan_id");--> statement-breakpoint
-- contract: the column above was added in this same migration, nullable, so every row the running release wrote has NULL there, and this index is partial (`WHERE pemesan_id is not null`) — it matches none of them and cannot fail on a database still being written. It is here because it is what makes a repeated family message idempotent: `queueFamilyEmail` inserts with `.onConflictDoNothing()` and names no conflict target (src/domain/notifications/pesan-keluarga.ts:327), so that call needs this index to have something to conflict on. Before 0023 the only such guard was the Tagihan one (0018), and it is a family message, not a money message.
CREATE UNIQUE INDEX "notifications_message_pemesanan_template_idx" ON "notifications_message" USING btree ("pemesanan_id","template") WHERE "notifications_message"."pemesanan_id" is not null;--> statement-breakpoint
CREATE INDEX "pemesanan_makam_status_lokasi_idx" ON "pemesanan_makam" USING btree ("status","lokasi_id");