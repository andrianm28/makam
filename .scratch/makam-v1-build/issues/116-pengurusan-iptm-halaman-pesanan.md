# Pengurusan IPTM order page crashes and hides the Tagihan for a filing-only order

Status: resolved
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


### Build (2026-10-05)

Branch `ticket-116-pengurusan-iptm-halaman`, from origin/main 4713592b. The tests were written first: on the unchanged page 11 of the first 14 failed (the filing-only page threw `Cannot read properties of null (reading 'getTime')` at Dimakamkan and IPTM Diajukan; at Menunggu Pembayaran it showed no Tagihan), and the 3 that passed were the Saat Duka TPU and paid-state cases that pin what must not change.

**What changed**
- `src/app/pengurusan/[nomor]/pengurusan-iptm-pemesan.tsx` (new): the order page of a filing-only Pengurusan IPTM, shaped like `perpanjangan-tpu-pemesan.tsx`. Header with no burial, the pay-first Tagihan while Menunggu Pembayaran (number, amount, due time, "Buka Tagihan" to `/dokumen/<link>`, test id `tagihan-pengurusan-iptm`), the shared `PengajuanPemesan`, the refund-rekening block, the filing document list and "Yang dipesan".
- `src/app/pengurusan/[nomor]/page.tsx`: nine lines added, none removed or changed: the import, an early return for `kind === "pengurusan_iptm"` (beside the Perpanjangan TPU one) and a `pengembalianOf` helper. A Saat Duka TPU order takes the same code path as before, so it renders exactly as today.
- `src/app/pengurusan/[nomor]/halaman-pesanan.test.ts` (new, 16 tests): the real page (default export) is called for the signed-in Pemesan through the `web` runtime and rendered with `renderToStaticMarkup`; the orders are made through the module's public functions on real Postgres, as `pengurusan-iptm.test.ts` makes them.

**Decisions**
- A page of its own for the filing-only kind, not a guard on `pemakamanAt`. A guard alone would have left other Saat Duka TPU statements on a filing-only order. The first test run showed four of them on the statuses that did not throw: "Waktu konfirmasi untuk TPU ... belum bisa dihitung", the night-submission notice "di luar jam layanan TPU", "Belum ada yang dibayar. Tagihan terbit setelah pemakaman dikonfirmasi" and the "Dibawa saat pemakaman" list. At the statuses in `SUDAH_DIKONFIRMASI` (which threw) the header would also have read "Pemakaman sudah dikonfirmasi", from the code. The new view says none of it, and the tests assert that at every status.
- The Tagihan link shows only while the Tagihan is open (Menunggu Pembayaran), as the AC says and as `tagihan-perpanjangan` does; after payment there is nothing to open and pay.
- The rekening form for a refund stays on the filing-only page (the old page showed it at Dibatalkan). It matters in one narrow case, a family that cancels in the minute between paying and the worker's tick making the order Diproses; a test covers it (checked by removing the prop: the test fails).
- `Baris` now exists in three files (the page, Perpanjangan TPU, the new view). I left it that way so nothing in the Saat Duka TPU path moves; sharing it is a cleanup for later.
- No domain, price or Tagihan rule changed. Neither `npm run build` nor the full suite was run.

**Spec gaps and decisions for the owner**
- No conflict with an AC. One reading to confirm: the AC lists Dokumen Lengkap among the statuses a filing-only page must render, but the module never leaves a filing-only order there (`periksaDokumen` issues the Tagihan and goes straight to Menunggu Pembayaran; Dokumen Lengkap appears only as a step in the Linimasa). The status is tested by handing the view a read model with that status.
- For the UAT runner: R3-47.2, "Diajukan ulang: tidak ada Tagihan baru", compares the "Buka Tagihan" links at IPTM Diajukan before and after the refiling. With the link only in Menunggu Pembayaran both lists are empty, so the check passes without proving anything. A real check would compare the Tagihan number on Admin Platform's page for the order.
- Seen, not changed: the order page asks for the refund rekening only at Dibatalkan. A final PTSP rejection (Ditolak) also raises a full refund, and the page shows no rekening form at that status (the same for a Saat Duka TPU order). If Admin Platform has no other way to learn the rekening, that is a ticket of its own.

**Verification** (read off whole logs): `npx vitest run halaman-pesanan`: exit 0, 1 file, 16 tests passed. With `tests/support/copy-scan.test.ts`, `tests/tooling/use-server-exports.test.ts`, `tests/tooling/duplicate-routes.test.ts`, `tests/support/page-exists.test.ts`: exit 0, 5 files, 33 tests passed. `npm run lint`: exit 0, 0 errors, 6 warnings, none in a touched file. `npm run typecheck`: exit 0.

### Review and merge (2026-10-05, orchestrator; fixed point 4713592b, head f96784f1)

- **Two-axis review:** the Standards and Spec reviewers (sonnet) ran in parallel. Standards Hard: 0, soft: 3; Spec Hard: 0, soft: 2.
- **Acceptance criteria:** all four are met.
  - A filing-only order has its own view (`PengurusanIptmPemesan`), which reads no burial time.
  - The Tagihan shows only while Menunggu Pembayaran.
  - The Saat Duka TPU path is untouched (page.tsx +9/-0).
- **Tests:** 16 tests render the real page on Postgres; 11 of them were red on the old page.
- **Merged** in batch MB9. The browser check is the UAT rerun of R3-47.1, 47.2 and 48.1 in the sandbox.

Follow-ups, for owner triage:
- The shared notice in `pengajuan-pemesan.tsx` still says "sejak pemakaman diatur dengan TPU" on a filing-only order. The refund rule behind it is money code, so the wording is the owner's call.
- R3-47.2's "no new Tagihan" runner check now compares two empty link lists. It should compare the Tagihan number on Admin Platform's page; this is a runner follow-up.
- At Ditolak the page asks for no rekening, although a final PTSP rejection raises a full refund. This is unchanged from before and may need its own ticket.
- Duplicated blocks between the new view and `page.tsx`.
