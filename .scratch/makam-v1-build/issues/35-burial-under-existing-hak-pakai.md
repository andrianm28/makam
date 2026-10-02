# Burial under an existing Hak Pakai, with consent

Status: ready-for-agent
Blocked by: 25, 34
Spec: Domain modules > 6. Pemesanan (burial under an existing Hak Pakai, consent resolution, tumpang checks); 5. Inventory (Pembongkaran and released plots); 10. Billing (due rules); 11. Payouts (later burial's Biaya Pemakaman); stories 52, 53, 54, 55, 56, 122, 123

## What to build

"Makamkan di sini" from the hub requests a tumpang, the next plot of a Kavling Keluarga, or the Calon Penghuni's burial, asking only for the Almarhum and the Pemesan (wizard: hub → Data & kirim). It runs the Saat Duka track (Diajukan → Dikonfirmasi → Dimakamkan → Selesai, plus Ditolak / Dibatalkan) without creating a Hak Pakai. Consent resolves in order: implicit when the logged-in Akun's Email Terverifikasi is the holder's recorded email; else an email "Setujui / Tolak" request to the Pemegang Hak after a code sent to that recorded email; else verbal consent logged by the Admin Lokasi; else heirship proof brought on the day, which raises a Ganti Pemegang Hak reminder. The Admin Lokasi sees the consent state, a warning banner for unpaid earlier Tagihan, and the tumpang policy checks. Billing is a pay-after Tagihan (Biaya Pemakaman at the day's rate + Biaya Layanan Platform) due 3×24 h after the recorded burial.

## Acceptance criteria

- [ ] Consent: implicit for the Akun whose Email Terverifikasi is the holder's recorded email; the Pemegang Hak's email link requires a code sent to that email, then Setujui / Tolak (with no recorded email, verbal consent or heirship proof); Tolak makes the order Ditolak with reason "Pemegang Hak tidak menyetujui"; verbal consent and heirship proof are logged by the Admin Lokasi with a note / file.
- [ ] The consent request appears in the Pemegang Hak's Perlu tindakan strip.
- [ ] Tumpang checks: the Lokasi allows tumpang, the minimum years since the last burial have passed, the maximum layers isn't reached; a failing check blocks confirmation with the reason shown.
- [ ] A released but not cleared (still Terisi) plot is offered only as tumpang, only if the Lokasi allows tumpang on released plots, after the minimum years; never as an empty plot.
- [ ] Confirming issues the pay-after Tagihan; recording the Pemakaman adds it to the Hak Pakai (tumpang doesn't reset the tenure clock) and starts the 3×24 h clock.
- [ ] Cancelling cancels only the order and its Tagihan; no new Bukti Pemesanan is issued on payment.
- [ ] Pencairan: the Biaya Pemakaman item is due when Lunas and the Pemakaman is recorded (trigger registered in Payouts).
- [ ] (Moved from ticket 90, owner 2026-09-29) A burial recorded in a Pemesanan Terencana's plot tells Payouts through `payouts.pemakamanTercatat(tx, …)` in the burial's own transaction, so the Terencana Pencairan becomes due at the first Pemakaman if that is sooner than the end of the Masa Pembatalan (ticket 37's `tickPencairanTerencana`). Test it.
- [ ] Tidak Tertagih on this Tagihan never allows ending the Hak Pakai.
- [ ] Tests: each consent path and its order; Tolak → Ditolak; tumpang policy checks; released-plot rule; Tagihan and Pencairan trigger; no Bukti Pemesanan.

## Added (2026-09-25)

- [ ] Optional email field on the order screen (copies of Tagihan / Bukti by email through SumoPod SMTP; SES dropped 2026-09-25), as in spec "Booking wizards".

## Comments

- 2026-09-26 — ADR 0004: consent is by the recorded email of the Pemegang Hak, not the WhatsApp number (What to build and criteria updated). Data & kirim follows ticket 22 (required email, Kode Masuk at Kirim).
- 2026-10-02 — **Settled through the `grilling` skill (round 5 Q14, owner "ya setuju semua"):** the Pemegang Hak's email consent uses **no new code**: Notifications sends an ordinary email with a link; the Pemegang Hak signs in with the usual Kode Masuk and answers Setujui / Tolak under Perlu tindakan in Akun Saya. No new secret and no exception to the AGENTS.md messaging rule. Spec line ~395 clarified accordingly. Branch `ticket-35` is 218 commits behind main: rebuild on current main, reusing its code.
