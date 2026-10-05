# Refund and payout edge cases: no rekening at Ditolak, Berhenti's refund recorded as not full, and a redo's Pencairan left open

Status: ready-for-agent
Blocked by: none (found by the UAT on staging and the reviews of tickets 116 and 117; group A, plus owner rule C1; owner approved "ya keduanya", 2026-10-05)
Spec: tickets 31 (refunds), 47 (PTSP rejection), 56 and 57 (TPU jobs and Pencairan), 59 (Berhenti); checklist R3-47.2, R2-59.2

## What to build (MONEY CODE)

1. **A final PTSP rejection raises a full refund, but the family's page asks for no rekening.** The page asks for the bank account only at Dibatalkan, not at Ditolak (`src/app/pengurusan/[nomor]/page.tsx` and `pengurusan-iptm-pemesan.tsx`, `pengembalianOf`). So the transfer cannot be made without a staff call.
2. **Berhenti's refund is recorded as not full.** When a Lokasi's Berhenti takes effect, `batalkanSisaBerhenti` (`src/domain/layanan/batal.ts`, about line 310) asks Refunds for the whole Tagihan. On staging (MKM-2026-000029) the request reads jumlah Rp 1.250.000, with the Biaya Layanan Platform refunded, which is the whole Tagihan, yet `penuh` is false. Find what `penuh` drives (the Tagihan's Dikembalikan state, reports, the transfer), and make it true when the whole Tagihan is returned, or explain why not.
3. **Cancelling a Saat Duka TPU order during a redo leaves the original job's Pencairan item open forever.** A Keluhan that leads to a redo keeps the original job in Keluhan, with a Pencairan item that the redo's approval later releases or cancels (`src/domain/layanan/kerja-ulang-tpu.ts`, about lines 20-21 and 69). `tutupJendelaTpu` handles only Selesai jobs (`bukti-tpu.ts`, about line 399). `batalkanHariHTpu` (ticket 117) cancels the redo, so the item stays `belum_jatuh_tempo`. Owner rule C1 (2026-10-05): **cancel that Pencairan item** (the family is refunded for the Layanan).

## Acceptance criteria

- [ ] **At Ditolak with a refund owed**, the family's page asks for the rekening as it does at Dibatalkan, and Refunds receives it.
- [ ] **Berhenti:** a refund of the whole Tagihan is recorded as full, everywhere `penuh` matters. Amounts are unchanged.
- [ ] **A redo cancelled with its order** cancels the original job's Pencairan item in the same transaction. Nothing is paid out for it, and nothing is refunded twice.
- [ ] **Tests** on real Postgres through public functions, with the fake Clock. Each new rule has a test that fails on the old code.
- [ ] **Money code:** reviewed on the opus tier.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Money code: build with sonnet, review with opus, merge alone.
