-- Ticket 92: a second Pembatalan may be approved while an earlier pengembalian dana is approved and awaiting its
-- transfer, so the earlier request becomes free to sit alongside a new one. The old index allowed only one
-- non-transferred request per Tagihan; the new one still allows only one *Diajukan* request, which is what the join
-- logic needs. The two paths of the running release that relied on the old index alone — ajukanGoodwill and
-- materialisasiDariPembatalan, both inserting status='diajukan' through raiseRequest + onConflictDoNothing — keep
-- their contract through the compatibility trigger below, installed before the index is dropped so the guarantee
-- never has a gap. A `manual`, non-goodwill raise (ajukanBaris, the one path that must now coexist, ticket 92) is
-- untouched, so the migration is safe under expand/contract. The advisory lock makes the trigger's check race-safe
-- the way the unique index was.
CREATE FUNCTION "permintaan_pengembalian_satu_terbuka"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sumber = 'pembatalan' OR NEW.goodwill THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tagihan_id, 0));
    IF EXISTS (
      SELECT 1 FROM "permintaan_pengembalian"
      WHERE "tagihan_id" = NEW.tagihan_id AND "status" <> 'ditransfer'
    ) THEN
      -- Skip the row, exactly as the dropped index's ON CONFLICT DO NOTHING did, so the caller reads it as no-op.
      RETURN NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "permintaan_pengembalian_satu_terbuka" BEFORE INSERT ON "permintaan_pengembalian" FOR EACH ROW EXECUTE FUNCTION "permintaan_pengembalian_satu_terbuka"();--> statement-breakpoint
-- contract: the running release's ajukanBaris already refuses while any request is not transferred, and its two
-- paths that relied on this index alone (ajukanGoodwill and materialisasiDariPembatalan) are matched by the trigger
-- above, which skips their insert exactly as this index used to; no write the running release makes can create a
-- second non-transferred row.
DROP INDEX "permintaan_pengembalian_tagihan_open_idx";--> statement-breakpoint
-- contract: every row the running release writes is status='diajukan', and it allowed at most one non-transferred
-- request per Tagihan, so its rows satisfy this narrower index; nothing it writes can fail it.
CREATE UNIQUE INDEX "permintaan_pengembalian_tagihan_diajukan_idx" ON "permintaan_pengembalian" USING btree ("tagihan_id") WHERE "permintaan_pengembalian"."status" = 'diajukan';
