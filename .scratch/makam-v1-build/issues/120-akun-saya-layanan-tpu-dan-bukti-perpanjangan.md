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

### Build (2026-10-05)

Built on branch `ticket-120-akun-saya-layanan-tpu-bukti`, from origin/main 9da0fb3b. No migration, no change to money code (the two new Refunds and Perpanjangan functions only read).

**What changed**

- **The order (AC 1).** `/pengurusan/<nomor>`, where Akun Saya's Pesanan tab links a Saat Duka TPU order, now lists the order's hari-H Layanan in every status: the `order.status === "dikonfirmasi"` gate is gone (`layanan.pesananTpuOf` answers null for an order with no job, so an order not yet confirmed shows none). The section says the Layanan are billed on the Tagihan "di atas" only when the page shows one (a cancelled order shows none) and links `/layanan/<nomor>` ("Buka halaman Layanan"), which nothing linked before.
- **The refund state.** Refunds gains `riwayatPengembalianPesanan(nomorPemesanan)`: every refund on an order, oldest first, with Diajukan, Disetujui or Ditransfer, the amount and, once the money is sent, the Bukti Pengembalian Dana number and link. A new block under the job list (`pengembalian-layanan-tpu.tsx`, shown once a job is Dibatalkan and a refund exists) reads each as "Rp X · menunggu persetujuan Admin Platform", "· sudah disetujui, menunggu transfer" or "· sudah ditransfer" plus "Bukti Pengembalian Dana RFD/...". The existing bank-account block for an open refund is unchanged.
- **Makam Saya (AC 2).** Perpanjangan gains `buktiPerpanjanganTerbaru(hakPakaiId)`: the Bukti Perpanjangan of the latest Perpanjangan that was paid and applied, or null (no actor, the same contract as `Pemesanan.buktiUntukHakPakai`; the Makam tab reads the Hak Pakai back from the Akun's own email first). `PerpanjanganDeps.billing` gained `buktiPerpanjanganById` in its Pick. The Makam card lists it in Dokumen next to the Bukti Pemesanan, linking `/dokumen/<link>`, the page that serves every Bukti. Each document now carries its kind (`DokumenMakamSaya.jenis`) as a caption after the link; the link text is unchanged.

**Tests** (real Postgres, public functions, static render; red first, then green): `src/domain/perpanjangan/bukti-terbaru.test.ts` (4: none before an extension and while the order is unpaid, the issued Bukti with its new end date, the latest of two), `src/domain/refunds/refunds.test.ts` (+3: empty, Diajukan then Disetujui then Ditransfer with the Bukti, two refunds oldest first and never another order's), `src/app/pengurusan/[nomor]/layanan-hari-h.test.ts` (5: the Pesanan tab link plus the order page for Dikonfirmasi, Dimakamkan, a cancelled unpaid order, and a cancelled paid order through its three refund states), `src/app/(site)/akun/makam/halaman-makam.test.ts` (3: never extended, extended, extended twice shows only the latest). First run before any change: 13 failed, 31 passed in those files; the Makam page test was also run against the old page (2 failed, then restored). Final: `npx vitest run domain/refunds domain/perpanjangan app/pengurusan akun/ app/layanan makam-keluarga-content` plus the source guards (dependency-direction, no-ticket-numbers, no-retired-company-name, brand-tokens, form-pattern, rilis-aksi-guard): 28 files, 274 tests, all passed. `npm run typecheck` and `npm run lint` exit 0 (0 errors, the 6 old warnings, none in these files). Not run: `npm run build`, e2e, staging.

**Spec gaps and decisions for the owner**

1. **"Refund state" is the order's, not each job's.** A refund line is a snapshot of `{ label, amount, lokasiId, kind }`; no job is named in it, and a job holds no link to its request. Two Bunga Tabur jobs have the same label, so a per-job state would be a guess from label and order. The block therefore lists the refunds of the order (a cancelled order's refund carries its cancelled Layanan with its other lines) and does not claim which refund holds which job. A per-job state needs a job-to-request link written where the request is raised (money code, a migration): say if you want it.
2. **"Every status" means every status that has Layanan.** Pekerjaan Layanan exist from the confirmation on, so an order that is Diajukan, or was Ditolak or cancelled before it, has none to show. The hari-H items the family chose at submission are stored on the order but not on its read model, and are not shown before the confirmation; I did not widen the read model for it.
3. **Only the latest Bukti Perpanjangan** is linked per card, as the AC says; earlier ones stay reachable by their emailed link only.
4. **Found, not changed.** (a) A cancelled Saat Duka TPU order's page still reads "Pengurusan terkirim" and "Kami mengonfirmasi pemakaman ... paling lambat ...", as for any order not yet confirmed; for an order that was confirmed and then cancelled this is misleading and wants its own ticket. (b) The test web runtime (`tests/support/server-runtime.ts`) composes Refunds without the Pengurusan reference production passes (`pemilikPesananDari`), so `isiRekeningPemesan` on a TPU order answers `tidak_ditemukan` there; the page test records the bank account as Admin Platform instead. (c) `/layanan/<nomor>` shows a Dibatalkan job without the refund state; it is an async page whose job list renders a threaded async component, so a static render cannot reach it, and the refund block stays on the order page. (d) A Hak Pakai whose Lokasi Berhenti is read-only still lists its Bukti Perpanjangan, as it lists its Bukti Pemesanan.
