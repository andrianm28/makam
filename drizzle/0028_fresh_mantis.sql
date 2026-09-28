ALTER TABLE "tagihan" ADD COLUMN "pengembalian_diminta_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "pengembalian_jumlah" bigint;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "ditolak_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "alasan_tolak" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "dibatalkan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "alternatif_jenis_makam_id" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "alternatif_pemakaman_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "alternatif_ditawarkan_pada" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tagihan_pengembalian_idx" ON "tagihan" USING btree ("pengembalian_diminta_at");--> statement-breakpoint
-- contract: both columns are added by this same migration, nullable and with no default, so every row the running release already has carries NULL in each and the equality holds for all of them. Nothing running can violate a constraint over columns it does not know exist. This is not a deferred contract step: the expand and the constraint are the same release, which is sound here precisely because the constraint's columns do not predate it. The alternative — deferring to a later migration — would assert a two-release gap that buys nothing, since no release in between could write a row violating it.
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_pengembalian_check" CHECK (("tagihan"."pengembalian_diminta_at" is null) = ("tagihan"."pengembalian_jumlah" is null));