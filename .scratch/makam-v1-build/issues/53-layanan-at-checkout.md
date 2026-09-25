# Layanan at checkout: hari-H on Saat Duka, empty-plot on Terencana

Status: ready-for-agent
Blocked by: 37, 50
Spec: Domain modules > 9. Layanan (Order: Saat Duka hari-H, Terencana empty-plot); 6. Pemesanan (cancellation effects); 10. Billing (earliest-due rule, Tidak Tertagih loss); stories 23, 48

## What to build

Add Layanan to the booking checkouts. Saat Duka checkout offers only "bisa hari-H" items for the burial day, billed pay-after on the same Tagihan (taking its due date so it stays pay-after); their Pekerjaan Layanan are Dijadwalkan at the order's confirmation. Cancelling the Saat Duka order refunds the hari-H Layanan unless already Sedang Dikerjakan. A Terencana checkout for a single plot offers only empty-plot items (cleaning, grass care, photo report), pay-first on the Terencana Tagihan (one due date, the earliest line). Both show in the sticky total bar.

## Acceptance criteria

- [ ] Saat Duka: only hari-H items; lines on the Saat Duka Tagihan; Tagihan remains pay-after; jobs Dijadwalkan on confirmation, target = burial day.
- [ ] Saat Duka cancellation: hari-H jobs Dibatalkan and refunded unless Sedang Dikerjakan.
- [ ] Tidak Tertagih: hari-H Layanan at a Lokasi are lost by their fulfiller like the Petak tariff (no Pencairan).
- [ ] Terencana: empty-plot items only, offered only when a single plot is picked; the Tagihan's due date is the earliest of hold expiry and the Layanan due rule.
- [ ] One Biaya Layanan Platform per Tagihan (shared with the order).
- [ ] Tests: offered items per checkout; Tagihan kind and due date; scheduling at confirmation; cancellation refunds; Tidak Tertagih loss.

## Notes

Whether a TPU Saat Duka checkout also offers hari-H Layanan, and whether a Perpanjangan checkout offers Layanan, is unclear (see 00-index).
