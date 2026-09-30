# A new Pemesanan Terencana raises a Peringatan Staf to the Admin Lokasi

Status: ready-for-agent
Blocked by: —
Spec: CONTEXT.md, Peringatan Staf; spec.md, Work Queues (Konfirmasi Terencana stays Lainnya)

## What to build

Today `terencanaDiajukan` (`src/composition/pemesanan.ts`) is a no-op, so an Admin Lokasi is not alerted when a family submits a Pemesanan Terencana; the only signal is the Antrean Lokasi row "Konfirmasi Terencana". Mirror what Saat Duka does: a new Peringatan Staf kind `staf_terencana_baru`, sent directly (one shot, as Saat Duka's is; queueing and retrying direct alerts is ticket 96) to every Admin Lokasi of the Lokasi Mitra plus its Kontak Siaga, deduplicated, by bell + email + web push, at any hour. The words name the Lokasi Mitra, the Nomor Pemesanan and how many Petak/Kavling were picked, set no deadline, and the push links to `/staf/admin-lokasi/[lokasiId]/pesanan/[nomor]`. A failed send never fails the order. Only the one alert: no re-alert, no escalation, and the Antrean row stays Lainnya (not Mendesak).

## Acceptance criteria

- [x] A new Terencana order alerts each Admin Lokasi and the Kontak Siaga of its Lokasi Mitra once (bell + email + push), and no other Lokasi's Admin Lokasi.
- [x] The alert names the Lokasi, the Nomor Pemesanan and the number of Petak/Kavling, has no deadline wording, and links to the order's staff page.
- [x] It is sent at any hour.
- [x] Confirming or declining the order sends no second alert.
- [x] An order whose alert email fails is still placed.
- [ ] Konfirmasi Terencana stays in the Lainnya tier; no re-alert, no escalation.
- [ ] Domain tests run green on a real Postgres (not run by the builder: no database in the sandbox; typecheck and lint pass).

## Comments

- 2026-09-30 — Owner decision (UAT-demo planning session): the Admin Lokasi must receive the Peringatan Staf on every new order, including Terencana. The spec keeps "Konfirmasi Terencana" in Lainnya, so this is the one alert only.
- 2026-09-30 — Builder: added kind `staf_terencana_baru`, wording `stafTerencanaBaruAlert` in `src/lib/pemesanan-labels.ts`, wired `terencanaDiajukan` in `src/composition/pemesanan.ts`; `terencana.ts` now uses Saat Duka's `penerimaOf` (Admin Lokasi plus Kontak Siaga, deduplicated; the announcement's shape is unchanged, so the `worker.smoke.test.ts` stub needs no edit). Tests: `src/domain/pemesanan/terencana-peringatan-staf.test.ts`. Typecheck and lint pass; the tests were not run here (no Postgres access), so the orchestrator runs them.
- 2026-09-30 — Builder, review fixes: test 1 retitled to what it proves; added a test with a Kontak Siaga who is a different Admin Lokasi (both alerted once, a non-staff account none); the any-hour test now sends on a Sunday 03:00 WIB, outside Jam Operasional. Tests still unrun by the builder.
- 2026-09-30 — Builder: fixed two test-fixture faults found in the orchestrator's run (the Kontak Siaga has no Perangkat Push so its alert is one email; the second Lokasi's login waits out the Kode Masuk resend cooldown). No Docker/Postgres access here, so unrun by me.
