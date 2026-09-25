# Paket Layanan subscriptions and cycles

Status: ready-for-agent
Blocked by: 50
Spec: Domain modules > 9. Layanan (Recurring cycles); 10. Billing (Paket cycle due H-1); 15. Notifications (Paket H-7, H-1); 16. Scheduler (issue cycles, skip, pause); stories 87, 88, 89, 90

## What to build

A Pemesan orders a Paket Layanan for a grave (sekali, bulanan, 3-bulanan, tahunan), priced as the sum of its items. Each cycle's Tagihan is issued at H-7 (pay-first, due H-1) with a reminder at H-1; an unpaid cycle is skipped (no work done on credit). Two skips in a row pause the Paket, and the Pemesan can resume. The ordering account can Hentikan Paket from the next unissued cycle. The Paket stops when the Hak Pakai is Berakhir. A new tariff applies from the next cycle, and the H-7 message says so. Active Paket appear on the grave in the Makam tab.

## Acceptance criteria

- [ ] Cycle tick issues one Tagihan per cycle at H-7 (items + Biaya Layanan Platform at a Lokasi), idempotent.
- [ ] Payment schedules one Pekerjaan Layanan per item for that cycle.
- [ ] Unpaid at H-1 → the Tagihan lapses and the cycle is Skipped; two consecutive skips → Paket paused; resume restarts from the next cycle.
- [ ] Hentikan: no further cycles from the next unissued one; already-issued cycles stay.
- [ ] Hak Pakai Berakhir → Paket stopped.
- [ ] A tariff version effective before a cycle's issue applies to that cycle; the H-7 message mentions the change.
- [ ] Tests: cycle issue dates per frequency; skip → pause; resume; Hentikan; stop on Berakhir; tariff change on the next cycle.
