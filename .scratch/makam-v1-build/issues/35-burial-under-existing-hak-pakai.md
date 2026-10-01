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

- 2026-10-01 — **Builder, domain slice.** What is built and tested through the module's public functions (`src/domain/pemesanan/tumpang.test.ts`, 5 tests green): consent resolution in order — implicit when the Akun's Email Terverifikasi is the holder's recorded email; else `menunggu_email` with a one-time code (salted scrypt, 10 min, 5 wrong tries) so the boundary can email Setujui/Tolak; else `menunggu_lokasi` for the Admin Lokasi to log verbal consent or heirship proof; `tolakTumpang` ends the order Ditolak with the new fixed reason "Pemegang Hak tidak menyetujui". `konfirmasiTumpang` runs the tumpang checks (`periksaBolehTumpang`, shared with the picker) and issues the pay-after Tagihan (Biaya Pemakaman tumpang + Biaya Layanan Platform); an unoccupied plot is not a tumpang and skips the policy. `catatPemakaman` records the burial on the existing Hak Pakai (the tenure clock is untouched), tells Payouts for both the tumpang order and, when the plot is a Terencana's, the Terencana order (`pemesanan_induk_nomor`), so AC 20 is tested. A tumpang reaches Selesai with **no** Bukti Pemesanan on either order of Lunas/Pemakaman. Migration `0047_clammy_night_nurse.sql` is pure expand.
- **Not built in this slice (next agent):** the hub → Data & kirim wizard UI and the action wiring; the Pemegang Hak's "Perlu tindakan" strip (AC 2); the Ganti Pemegang Hak reminder that heirship proof should raise; the released-plot confirmation test (AC 4's rule already lives in the picker, no confirmation test yet); and the optional copies-by-email field. `ajukanTumpang` refuses a Kavling Keluarga target with `kavling_belum_didukung` because `inventory.catatPemakaman` records on the Hak Pakai's own `petakId`, which is null for a Kavling: the next agent should widen that input to take a member Petak. Verified: 5/5 own tests, `alasan-tolak` + `catat-pemakaman` + `picker` + `payouts/pemakaman-tercatat` green, lint/typecheck/build clean.

**HANDOFF** — Files: `src/domain/pemesanan/tumpang.ts` (+test), `tumpang.ts` in inventory, schema/index/deps, `catat-pemakaman.ts`, `efek-bukti-pemesanan.ts`, `alasan-tolak.ts` (+test), migration `0047`. Decisions: consent states `implisit`/`menunggu_email`/`menunggu_lokasi`/`disetujui`/`ditolak`; code returned to the boundary once for emailing; `periksaBolehTumpang` shared with the picker; a tumpang never earns a Bukti. Next: build the wizard + "Perlu tindakan" strip, widen `catatPemakaman` for Kavling targets, add the released-plot confirmation test and the heirship reminder. Unverified: the wizard, the strip, the reminder. No full suite run (orchestrator's).
