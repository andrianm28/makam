# Monthly Laporan and weekly outgoing transfer list

Status: ready-for-agent
Blocked by: 29, 32
Spec: Domain modules > 14. Work Queues (the Laporan); stories 165

## What to build

For Admin Platform: a monthly Laporan (orders, Rp collected, platform fees, Pencairan, refunds, Tidak Tertagih) exportable as CSV, and a weekly list of every outgoing transfer (Pencairan and refunds) with its proof link, so the books can be reviewed without a second approver.

## Acceptance criteria

- [ ] The Laporan for a chosen month shows counts of orders by kind, Rp collected (by method), Biaya Layanan Platform / Biaya Pengurusan earned, Pencairan paid, refunds paid, and Tidak Tertagih totals, all in Asia/Jakarta month boundaries.
- [ ] CSV export matches the on-screen numbers.
- [ ] The weekly transfer list shows each outgoing transfer: date, recipient, amount, Bukti Pencairan / Bukti Pengembalian Dana number, approver, proof link.
- [ ] Only Admin Platform can open either.
- [ ] Tests: the Laporan's totals for a seeded month; CSV content; week boundaries.
