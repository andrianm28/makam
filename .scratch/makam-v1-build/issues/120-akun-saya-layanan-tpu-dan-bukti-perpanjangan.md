# Akun Saya: cancelled TPU Layanan are reachable, and the Bukti Perpanjangan is shown

Status: ready-for-agent
Blocked by: none (found by the reviews of ticket 117 and the UAT runner audit; group A, plus owner rule C4; owner approved "ya keduanya", 2026-10-05)
Spec: tickets 41 and 42 (Perpanjangan documents) and 53 and 56 (TPU Layanan); checklist R2-41.1, R3-53.1

## What to build

1. **A Saat Duka TPU order's hari-H Layanan are invisible to the family once the order is cancelled.** The family's order list links such an order to `/pengurusan/<nomor>` (`src/app/(site)/akun/pesanan/page.tsx`, about line 82). That page loads hari-H jobs only while the order is Dikonfirmasi (`src/app/pengurusan/[nomor]/page.tsx`, about line 52). So a Dibatalkan job shows only on `/layanan/<nomor>`, and nothing links there.
2. **The Bukti Perpanjangan reaches the Pemegang Hak only by email** (`src/domain/notifications/pesan-perpanjangan.ts`). The Makam tab lists the Bukti Pemesanan only (`src/app/(site)/akun/makam/page.tsx`, about lines 60-64). Owner rule C4 (2026-10-05): show it in Akun Saya as well.

## Acceptance criteria

- [ ] **The order:** from Akun Saya the family reaches every Layanan of a Saat Duka TPU order, in every status of the order, including Dibatalkan jobs with their refund state.
- [ ] **Makam Saya:** the card of a Hak Pakai that was extended links its latest Bukti Perpanjangan, the way it links the Bukti Pemesanan. The document is served as the other Bukti are.
- [ ] **Tests:** public reads on real Postgres, and a static render of the two pages.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Owner rule C4 chose 'Tampilkan juga di Akun Saya'.
