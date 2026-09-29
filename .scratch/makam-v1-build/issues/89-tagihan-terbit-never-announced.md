# A Tagihan was never announced: `tagihanTerbit` had no caller

Status: resolved
Blocked by: —
Spec: spec.md, Notifications (the family's messages, keyed to the Tagihan) and Billing > Documents

## What to build

`notifications.tagihanTerbit` is the only writer of `notifications_tagihan_kontak`, the address a Tagihan's messages go to, and nothing outside Notifications and test support called it. In production no Tagihan was announced: the "Tagihan terbit" email and every Tagihan-keyed reminder, overdue and refund message (tickets 19, 20, 25, 29, 31) found no address and never went out; the Bukti Pembayaran receipt logged `tanpa_email` for a family that had given an email. Ticket 36's Comments claimed otherwise, wrongly.

Announce the Tagihan from every path that issues one to a family, **inside the issuing transaction** (a Tagihan is never issued without its address, and a refused announcement rolls the confirmation back), through Notifications only:

- Saat Duka confirmation by the Admin Lokasi (`src/domain/pemesanan/konfirmasi-saat-duka.ts`);
- Saat Duka TPU confirmation by the Admin Platform (`src/domain/pengurusan/konfirmasi-saat-duka-tpu.ts`).

An order with no email falls back exactly as `tagihanTerbit` already does (a Telepon Pemesan row). Announcing is idempotent.

## Acceptance criteria

- [x] A failing domain test through the real flow (Admin Lokasi's confirmation, Admin Platform's TPU confirmation) asserts the Pemesan's email receives the Tagihan message with its link, exactly once; it failed on `main`.
- [x] `Notifications.tagihanTerbit(input, within?)` takes the issuing module's open transaction; the Pemesanan and Pengurusan seams call it inside the transaction that issues the Tagihan.
- [x] No other issuer exists in `src`: `reissueTagihan` has no caller outside Billing yet (Harga Khusus, ticket 30), the Terencana order issues no Tagihan yet (ticket 37), Perpanjangan has no checkout yet, and `seed-tagihan` is a development tool. Each of those must announce through the same call when it lands.
- [x] The e2e path `e2e/bukti-pemesanan.spec.ts` is unchanged.

## Notes

- One email, not two (owner decision, 2026-09-29): for a Saat Duka order the confirmation email already carries the order page link and the Tagihan's number and link, so the two confirmation paths pass `bersamaKonfirmasi: true` to `tagihanTerbit`: the Tagihan's contact is recorded and the Telepon Pemesan fallback stays, but the separate "Tagihan terbit" email is not queued. Issuers with no confirmation email of their own keep it: a reissue (Harga Khusus, ticket 30), the Terencana Tagihan (ticket 37) and a Perpanjangan checkout, none of which is built yet.
- A failing confirmation email opens the Lokasi's own call rows (the order's two messages); the Tagihan has no message of its own to fail on these paths.
- `e2e/bukti-pemesanan.spec.ts` still reads the Tagihan link from the order page: a queued family message is sent by the worker, whose in-memory outbox the web container's dev endpoint does not see. The email now exists (the domain tests read it from the fake EmailSender), but the e2e cannot observe it, and that is left as is.

## Comments

- 2026-09-29 — Reproduced first: `src/domain/notifications/tagihan-terbit-alur.test.ts` (Saat Duka at a Lokasi Mitra, Saat Duka TPU) failed on `main` with no Tagihan email for the Pemesan; both pass with the fix. Correction to ticket 36's Spec 8 claim written in its Comments. Review pending.
- 2026-09-29 — **Two-axis review** (one reviewer, Standards and Spec sections): no hard finding. Two small fixes made. (1) A confirmation is never blocked by its Tagihan's announcement: when `tagihanTerbit`'s schema refuses the input (e.g. a malformed stored email), Notifications reports it through `reportError` (field names only, no values) and degrades to the address-less path, the same "Telepon Pemesan" row an email-less order gets, in the same transaction; it refuses (and the confirmation rolls back) only when the input is unusable even without the email. Test: an order whose stored email the schema rejects still confirms and opens the call row. (2) `antrean-lokasi.test.ts` now asserts the failed Tagihan message really appears as exactly one Tier 2 Telepon Pemesan row in Admin Platform's Antrean (its retries run over two days, so the test ticks 12 × 4 h). `tests/support/publish.ts` now records Notifications' reported errors in `reportedErrors`.
- 2026-09-29 — **Owner decision, in chat: one email on confirmation.** A Saat Duka family receives one email when the order is confirmed, carrying both the order page link and the Tagihan link (the confirmation templates already did). `tagihanTerbit` gained the optional `bersamaKonfirmasi` flag; both confirmation paths set it. Tests now assert exactly one email with both links, that the Tagihan's contact is still recorded (the receipt on payment reaches the same address), and the Antrean retry test is back to two failing messages. Two-axis review of this change: pending.
- 2026-09-29 — Merged to main after the review record above (one reviewer, Standards and Spec) and a haiku re-review of the one-email change. Left as a follow-up: Billing's `reissueTagihan` (a Harga Khusus, ticket 30) does not announce the reissued Tagihan; it must call `tagihanTerbit` (standalone email, not `bersamaKonfirmasi`).

- 2026-09-29 — **Follow-up fixed on branch `fix-harga-khusus-tagihan-terbit`:** the Harga Khusus reissue (`reissueTagihan` via `tetapkanHargaKhusus`) is now announced with the standalone `tagihanTerbit` path (not `bersamaKonfirmasi`, it has no confirmation email), in the same transaction, through Notifications' `tagihanTerbitPengganti` wired in the composition. See ticket 30.
