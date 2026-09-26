# Catat Pemakaman, Bukti Pemesanan and Saat Duka Selesai

Status: ready-for-agent
Blocked by: 19, 23
Spec: Domain modules > 5. Inventory (Pemakaman); 6. Pemesanan (Saat Duka statuses, Selesai); 10. Billing (pay-after clock, Documents); 16. Scheduler ("Catat Pemakaman" prompts); Testing Decisions > End-to-end 1; stories 36, 37, 119

## What to build

The Admin Lokasi records the Pemakaman (date, Petak, layer), prompted by a Catat Pemakaman row the day after the planned date. Recording sets the order Dimakamkan, starts the Hak Pakai tenure clock (first Pemakaman), and starts the pay-after Tagihan clock from the recorded date. When the Tagihan is Lunas a Bukti Pemesanan is issued in the Lokasi Mitra's name (right only, no amounts) and the order becomes Selesai. The Pemesan's order page shows the order status and the Tagihan status as a separate badge. Add the first Playwright critical path end to end.

## Acceptance criteria

- [ ] Catat Pemakaman row (Antrean Lokasi, Lainnya) appears the day after the planned burial date via a tick, and closes when the Pemakaman is recorded.
- [ ] Recording a Pemakaman sets the order Dimakamkan and, for a fixed-term Jenis Makam, sets the Hak Pakai end date = first Pemakaman + tenure.
- [ ] The pay-after Tagihan becomes Lewat Jatuh Tempo 3×24 h (Lokasi policy) after the **recorded** burial date; the Tagihan is not reissued if the recorded date differs from the planned one (its printed due date stays).
- [ ] On Lunas: Bukti Pemesanan `BPM/YYYY/NNNNNN` (Lokasi, Petak Makam, Pemegang Hak, masa Hak Pakai; PT JKP header; proves the right in the Lokasi Mitra's name) is issued, its link sent by email (for an order with no email, CS shares it by hand); the order becomes Selesai (= Lunas + Bukti Pemesanan issued).
- [ ] Order status and Tagihan status are shown separately (e.g. Dimakamkan + Belum Dibayar).
- [ ] Tests: "Saat Duka Tagihan becomes Lewat Jatuh Tempo 3×24 h after the recorded Pemakaman"; payment before burial (Lunas, then Dimakamkan → Selesai) and after; Catat Pemakaman prompt timing; Playwright: Pilih makam list → email Kode Masuk → Admin Lokasi confirmation → payment (signed fake webhook) → Bukti Pemesanan.

## Comments

- 2026-09-26 — ADR 0004: the Bukti Pemesanan link goes by email; the Playwright path uses the email Kode Masuk (criteria updated).
- 2026-09-26 — The Bukti Pemesanan carries the Lokasi's "Petunjuk arah" Google Maps link (spec, "Maps on public pages").
