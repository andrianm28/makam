-- Ticket 92: a second Pembatalan may be approved while an earlier refund is approved and awaiting its transfer,
-- so the earlier refund becomes free to sit alongside a new one. The old index allowed only one non-transferred
-- request per Tagihan; the new one still allows only one *Diajukan* request, which is all the join logic needs.
--
-- contract: the running release refused every raise while any other request was not yet transferred
-- (`menunggu_transfer`), so it never inserted a second non-transferred row and needs no index to stop it; it only
-- loses a backstop its own code already enforced.
DROP INDEX "permintaan_pengembalian_tagihan_open_idx";--> statement-breakpoint
-- contract: the new index is narrower than the one above (status = 'diajukan' instead of status <> 'ditransfer'),
-- so every row the running release writes still satisfies it and no write it makes can now fail.
CREATE UNIQUE INDEX "permintaan_pengembalian_tagihan_diajukan_idx" ON "permintaan_pengembalian" USING btree ("tagihan_id") WHERE "permintaan_pengembalian"."status" = 'diajukan';
