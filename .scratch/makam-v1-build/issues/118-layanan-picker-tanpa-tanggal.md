# Layanan pickers: an undated Terencana Layanan is dropped while still priced, and an emptied choice still submits

Status: ready-for-agent
Blocked by: none (found by the reviews of ticket 115; group A, Rilis 1 live on production; owner approved "ya keduanya", 2026-10-05)
Spec: tickets 50 and 53 (Layanan at checkout and at a Lokasi Mitra); `.scratch/makam-v1-build/uat-rilis-1-checklist.md` §11

## What to build

Two defects in the family's Layanan pickers, found while ticket 115 was reviewed.

1. **The Terencana checkout drops a Layanan picked without a date, while the price still counts it.** In `src/app/pesan-makam/terencana/data-kirim.tsx` (about line 88) the payload leaves out a chosen Layanan whose date is empty. The line (about line 235) and the bottom bar (about line 320) still add its price, so the family is shown a total higher than the Tagihan they get. Perpanjangan refuses an undated pick instead.
2. **The two Layanan order forms keep "" in the chosen variants after "Tidak dipesan".** This is in `src/app/layanan/form-pesanan.tsx` (about line 49) and `src/app/layanan/tpu/form-tpu.tsx` (about line 62):
   - at a Lokasi Mitra the price breakdown disappears while another Layanan is still chosen (`src/app/layanan/actions.ts`, about line 41);
   - on both forms "Pesan layanan" stays enabled with nothing chosen.

## Acceptance criteria

- [ ] **Terencana:** a chosen Layanan either reaches the order with a date, or is refused with a clear message before sending, the way Perpanjangan refuses it. The total shown always equals what the Tagihan will hold.
- [ ] **Layanan order forms (Lokasi Mitra and TPU):** putting a Layanan back to "Tidak dipesan" removes it from the choice. The breakdown stays right for the remaining choices. "Pesan layanan" is disabled when nothing is chosen.
- [ ] **Tests**, through the real payload or Server Action on real Postgres:
  - an undated Terencana pick is never silently dropped, and the shown total matches the Tagihan;
  - an emptied choice sends no item.
  The repo has no jsdom: use the patterns of ticket 115 (`src/app/layanan/item-pesanan.ts` and its tests) or `renderToStaticMarkup`.
- [ ] **No price rule change.**

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Rilis 1 is live, so this goes first.
