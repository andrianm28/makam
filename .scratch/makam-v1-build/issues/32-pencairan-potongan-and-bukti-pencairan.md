# Pencairan, Potongan and Bukti Pencairan

Status: ready-for-agent
Blocked by: 25, 31
Spec: Domain modules > 11. Payouts; 14. Work Queues (Tier 3 Pencairan); 16. Scheduler (Potongan ageing); Testing Decisions > End-to-end 3; stories 135, 162, 181 (Bukti Pencairan view)

## What to build

The Payouts module. Pencairan items become due per order or job via registered triggers; this ticket implements the item model and the Saat Duka trigger (Petak tariff and Biaya Pemakaman due when Lunas **and** the Pemakaman is recorded); other triggers are added by tickets 35, 37, 40, 51. Potongan are negative lines per Lokasi Mitra with a reason and link, carried forward. A Pencairan run shows one row per recipient with due items minus Potongan; items can be held out with a reason; Admin Platform transfers by hand, uploads proof and enters the date, issuing one Bukti Pencairan. The Admin Lokasi sees Pencairan per order (Belum jatuh tempo / Jatuh tempo / Dicairkan) and every Bukti Pencairan with its Potongan lines.

## Acceptance criteria

- [ ] Amount = the partner's tariff (or the Mitra Jasa rate), unless Admin Platform overrides it after a Keluhan with a note; a Harga Khusus reduces the Operator's share unless a partner share is recorded.
- [ ] "Dibayar langsung" produces no tariff Pencairan and a platform-fee Potongan.
- [ ] A Tidak Tertagih Tagihan produces no Pencairan unless paid later.
- [ ] Potongan carry forward; after 60 days (tick) or on Berhenti they become an offline request that Admin Platform records when paid; Potongan are never applied to Mitra Jasa.
- [ ] Pencairan run: one row per recipient; hold-out with reason; transfer proof + date issues one Bukti Pencairan `BKP/YYYY/NNNNNN` covering every item and Potongan in it; the recipient gets its link by message.
- [ ] Tier 3 Pencairan row due 2 working days after the items become due.
- [ ] The Mitra Jasa version of the Bukti Pencairan shows only job, Layanan, date and rate.
- [ ] Admin Lokasi view: per-order Pencairan state and its Bukti Pencairan list; nothing from other Lokasi.
- [ ] Tests: Saat Duka due trigger (Lunas and Pemakaman, in either order); netting and carry-forward; 60-day ageing; batching into one Bukti Pencairan; hold-out; Playwright: a Pencairan run producing a Bukti Pencairan.
