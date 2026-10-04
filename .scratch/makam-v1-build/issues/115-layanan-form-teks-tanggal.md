# Layanan order forms drop the extra text and the chosen target date

Status: ready-for-agent
Blocked by: none (found in the Rilis 1 UAT on staging, 2026-10-05; blocks the G2 sign-off and the switch, owner approved "ya 115")
Spec: tickets 50 (Layanan order at a Lokasi Mitra) and 56 (TPU Layanan); `.scratch/makam-v1-build/uat-rilis-1-checklist.md` §11

## What to build

Both family-side Layanan order forms build their payload with the **variant id** as the key, while their state is keyed by the **Layanan id**:

- `src/app/layanan/form-pesanan.tsx:73` (Lokasi Mitra);
- `src/app/layanan/tpu/form-tpu.tsx:106` (TPU).

Each builds `item` with `tanggal[id] ?? grup.targetPalingDini` and `teks[id]`, where `id` is the variant id, but `onTanggal` and `onTeks` store `[layanan.id]` (`form-pesanan.tsx:99-100`, `form-tpu.tsx:177-178`). So:

1. **A Layanan with an extra text field can never be ordered.** For example Batu Nisan's "Tulisan pada nisan": the text is always sent as `null`, and the domain refuses with `teks_kosong`, shown to the family as "Layanan ini minta isian tambahan. Isi dulu kolomnya." although the field is filled.
2. **The target date the family picks is silently ignored.** The earliest allowed date is sent instead.

UAT evidence: Pemesan at Pemakaman Wakaf Al-Ikhlas, Petak A-03, Batu Nisan (Granit Abu-abu 80×100), tulisan filled, refused (screenshot `/home/ubuntu/uat-runs/2026-10-04-rilis1/bukti/11-layanan-dari-sisi-keluarga-11-pemesan-memesan-layanan-lew/03-pesan-layanan-nomor-pesanan-dan-tagihan.png`).

## Acceptance criteria

- [ ] **Lokasi Mitra form:** sends, for every chosen variant, the text and the target date the family entered for its Layanan; with no date entered, the earliest allowed date as today.
- [ ] **TPU form:** the same.
- [ ] **The Layanan pickers in the checkout steps** (Saat Duka, Terencana, Perpanjangan; ticket 53) and any other client form that keys state by Layanan and reads it by variant are checked for the same mistake and fixed where found, each fix with a test. The ticket's Comments name what was checked.
- [ ] **Tests**, through the form's real payload, not a private helper:
  - a chosen Batu Nisan with its tulisan is accepted;
  - a chosen date reaches the order;
  - a missing tulisan is still refused.
  - Follow the existing form or action tests for these pages (`src/app/layanan/**.test.ts*`); a component test of the payload, or the server action with the payload the form builds, as the neighbours do.
- [ ] **Not money code** (no price rule changes); the prices shown and charged are unchanged.

## Comments

- 2026-10-05: Filed by the orchestrator from the UAT finding; owner approved ("ya 115"). Root cause confirmed by reading `form-pesanan.tsx:66-75, 92-101` and `tpu/form-tpu.tsx:106, 177-178`.
