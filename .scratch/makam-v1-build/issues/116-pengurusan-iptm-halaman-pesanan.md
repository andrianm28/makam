# Pengurusan IPTM order page crashes and hides the Tagihan for a filing-only order

Status: ready-for-agent
Blocked by: none (found by the selector audit of the UAT runner, 2026-10-05; blocks the Rilis 3 [BAYAR] journeys R3-47.1, R3-47.2 and R3-48.1, which must run in the SumoPod sandbox before the switch)
Spec: tickets 46 (filing at a TPU) and 47 (Pengurusan IPTM, filing only); `.scratch/makam-v1-build/uat-rilis-2-3-checklist.md`, Tiket 47

## What to build

The family's order page `/pengurusan/<nomor>` (`src/app/pengurusan/[nomor]/page.tsx`) treats every status in `SUDAH_DIKONFIRMASI` as "the burial is agreed" (line 23: Dikonfirmasi, Dimakamkan, Dokumen Lengkap, IPTM Diajukan, IPTM Terbit). For those statuses it renders the confirmation block, whose first row is `formatTanggalJam(order.pemakamanAt!)` (line 98).

A filing-only order (ticket 47) has no burial arranged by us. `placePengurusanIptm` (`src/domain/pengurusan/saat-duka-tpu.ts`, about lines 122-134) places it directly in Dimakamkan, with no `pemakamanAt`. Two things go wrong:

1. **The page throws** for a filing-only order in Dimakamkan, Dokumen Lengkap, IPTM Diajukan or IPTM Terbit. The family sees an error page straight after placing the order, and again at every later step.
2. **The Tagihan cannot be reached from the order page.** In Menunggu Pembayaran the page says "Bayar Tagihan agar kami bisa mengajukan IPTM…" (`pengajuan-pemesan.tsx:82-83`) but gives no link. The "Buka Tagihan" paragraph (page.tsx:120-129) lives only in the confirmation block, and `SUDAH_DIKONFIRMASI` leaves out Menunggu Pembayaran. The family can find the Tagihan only through the Akun Saya strip "Perlu tindakan Anda". The Perpanjangan TPU section already does this right (`perpanjangan-tpu-pemesan.tsx`, test id `tagihan-perpanjangan`).

## Acceptance criteria

- [ ] **A filing-only order's page renders in every status**: Dimakamkan, Dokumen Lengkap, Menunggu Pembayaran, Diproses, IPTM Diajukan, IPTM Terbit, Ditolak and Dibatalkan. No row shows a burial time for an order that has none.
- [ ] **While its bayar-dulu Tagihan is open** (Menunggu Pembayaran), the page shows the Tagihan's number, amount and due time with a "Buka Tagihan" link to `/dokumen/<link>`, as the Saat Duka TPU order page does after confirmation.
- [ ] **Saat Duka TPU orders**, which have a burial, render exactly as today.
- [ ] **Tests** drive the module's public reads on real Postgres, with fixtures built the way the neighbouring tests build them:
  - a filing-only order in Dimakamkan and in Menunggu Pembayaran renders, through the page's view or the component it renders;
  - the Tagihan link appears in Menunggu Pembayaran;
  - a Saat Duka TPU order still shows its burial time.
  The repo has no jsdom: follow the static-render tests (`renderToStaticMarkup`, e.g. `src/app/pesan-makam/saat-duka/data/data-kirim.test.ts`), or test a pure view helper the page uses, fed with the real read model.
- [ ] **Not money code**: no price or Tagihan rule changes.

## Comments

- 2026-10-05: Filed by the orchestrator from the selector audit of the UAT runner (two independent agents read `page.tsx:23, 98, 120-129` and `saat-duka-tpu.ts`; `formatTanggalJam(null)` throws, reproduced in node). It is a defect fix, not a design decision. It is needed before the switch so that R3-47.1, R3-47.2 and R3-48.1 can be paid in the sandbox; the owner is told in the session summary.
