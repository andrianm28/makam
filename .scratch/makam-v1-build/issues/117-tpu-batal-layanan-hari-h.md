# Cancelling a paid Saat Duka TPU order leaves its hari-H Layanan scheduled

Status: ready-for-agent
Blocked by: none (found by the UAT run on staging, 2026-10-05, R3-46.1 and R3-53.1; blocks that [BAYAR] journey before the switch, and level 3)
Spec: tickets 46 (cancel before IPTM Diajukan), 53 (Layanan at checkout, hari-H at a TPU) and 56 (TPU Layanan jobs and Mitra Jasa); `.scratch/makam-v1-build/uat-rilis-2-3-checklist.md` R3-46.1 and R3-53.1. Money: Refunds and Pencairan.

## What to build

`batalkanPengurusan` (`src/domain/pengurusan/pengajuan-iptm.ts:529`) cancels a Saat Duka TPU order before IPTM Diajukan:

- When the order's Tagihan is paid, it asks Refunds for the lines. The refund is full when nothing was done; a hari-H Layanan already done is not refunded (owner decision 2026-10-02).
- When the Tagihan is not paid, it cancels the Tagihan.

It never cancels the order's hari-H TPU Layanan jobs (the Layanan module's TPU jobs).

**Staging evidence.** MKM-2026-000018 (TPU Bambu Apus, Karangan Bunga Papan Standar) was paid, then cancelled by the family at 02:53 WIB on 2026-10-05. The refund request is full: Rp 650.000, including the Karangan Bunga line of Rp 150.000. Yet the job is still Dijadwalkan, with no cancellation time.

**Why it matters.** A Mitra Jasa can still be assigned, do the work and be paid in a Pencairan, while the family gets that line back.

**A pattern to follow.** The Lokasi Mitra counterpart exists: `batalkanLayananPetakDibatalkan` (`src/domain/layanan/batal.ts:266`). It cancels every job of the order not yet done and returns the lines to refund, inside the cancellation's own transaction.

## Acceptance criteria

- [ ] **Every hari-H job not yet done is cancelled in the same transaction** whenever a Saat Duka TPU order ends: the family's Batalkan before IPTM Diajukan, and every staff path that cancels or finally rejects the order.
  - A job not yet done is Dijadwalkan or assigned but not started.
  - A job Sedang Dikerjakan or Selesai keeps its price and is not refunded (owner decision 2026-10-02, already applied to done jobs).
- [ ] **The refund request is unchanged in amount.** Its lines are the order's own lines plus exactly the cancelled jobs; nothing is refunded twice.
- [ ] **A cancelled job no longer reaches a Mitra Jasa.** It is not offered and not assignable, and it never enters a Pencairan. If it was already assigned, the assignment ends; tell the Mitra Jasa if the module already sends a message when a job is cancelled.
- [ ] **The family's Layanan page shows the job as Dibatalkan.**
- [ ] **Tests** on real Postgres, through public functions:
  - a paid order with a scheduled hari-H job, cancelled: the job is Dibatalkan and the refund is full;
  - one job done and one scheduled: only the scheduled one is cancelled and refunded;
  - an unpaid order (its Tagihan cancelled): the job is cancelled, with no refund request;
  - running the cancellation twice changes nothing.
- [ ] **Money code**: reviewed on the opus tier.

## Comments

- 2026-10-05: Filed by the orchestrator from the UAT run on staging. The runner's R3-53.1 check failed. Confirmed by reading the job row (still dijadwalkan, no dibatalkan_at), the refund request (penuh, Rp 650.000) and `batalkanPengurusan`, which calls Refunds and Billing but no Layanan cancellation. A defect fix; the owner is told in the session summary.

### Build (2026-10-05)

Built on branch `ticket-117-tpu-batal-layanan-hari-h` (money code: reviewed on the opus tier is still owed, see the last point).

**What changed**

- **Layanan** gains `batalkanHariHTpu(nomor, within)` (`src/domain/layanan/batal-hari-h-tpu.ts`), the TPU counterpart of `batalkanLayananPetakDibatalkan`. In the caller's transaction it locks the order's hari-H jobs, makes every one not yet done Dibatalkan, ends its open assignment (`dilepas`), and returns the lines to refund for exactly the original jobs it cancelled (what was paid for each, after any Harga Khusus) plus `tidakDikembalikan`, the count of original jobs it left out. Asked twice, the second call cancels nothing and returns no line. A paid Tagihan with no line for a job is refused (`baris_tidak_ditemukan`) before anything is written, never a silent under-refund.
- **Pengurusan**: `batalkanPengurusan` (the family's Batalkan) calls it for a Saat Duka TPU order, paid or not, in the same transaction. The refund lines are the order's own lines plus the returned lines; a hari-H Layanan line comes back only through its job. The unpaid branch is as before (Tagihan voided, no refund request) and now cancels the jobs too. `penuh` stays strict, and only when nothing was kept or refunded earlier; `penuhBilaLengkap` is added before Dimakamkan so a request that completes the Tagihan after an earlier line was refunded is marked penuh.
- `pekerjaanTpuSelesaiUntukTagihan` is removed from the Layanan interface (the new function answers both halves). `barisTagihanPekerjaanTpu` is extracted from `mintaPengembalianTpu`: a refunded Keluhan, a cancelled Terlambat job and a cancelled order use one job-to-line rule.
- Family's Layanan page: a Dibatalkan job says "Pekerjaan ini dibatalkan dan tidak akan dikerjakan." instead of "Mitra Jasa akan ditugaskan...". The status label already read Dibatalkan.

**Tests** (real Postgres, public functions, fake Clock): `src/domain/layanan/batal-hari-h-tpu.test.ts`, 12 tests: the first 9 were written before the change and all 9 failed, 3 more came with it (Harga Khusus, no hari-H job, a standalone TPU order); now green: a paid order with a Dijadwalkan job (job Dibatalkan, refund = whole Tagihan, penuh); not offered, not assignable, Antrean rows gone; an assigned and accepted job (assignment ends, no job to answer or photograph, no Pencairan, no decline on the scorecard); a Terlambat job; one Selesai and one Dijadwalkan (only the second cancelled and refunded, the Pencairan of the first intact); one Sedang Dikerjakan (kept, finishes, paid); a Terlambat job the Pemesan had already cancelled (refunded once, the order can still be cancelled); after a Harga Khusus (the share, not the tariff); unpaid (Tagihan cancelled, jobs cancelled, no refund request); twice (nothing changes); no hari-H job; a standalone TPU order untouched. Runs of `src/domain/layanan`, `src/domain/pengurusan` and `src/server/rilis-aksi.test.ts`: 32 files, 362 tests, all passed; `npm run typecheck` and `npm run lint` exit 0 (6 old warnings, none in these files).

**Spec gaps and decisions for the owner**

1. **Which jobs are "not yet done".** The AC names Dijadwalkan or assigned-not-started (cancelled) and Sedang Dikerjakan or Selesai (kept). It is silent on two states, so I followed the Lokasi counterpart and the spec line "refunded unless already Sedang Dikerjakan": **Terlambat is cancelled and refunded** (the tick flags a started job too, as at a Lokasi Mitra); **Menunggu Verifikasi keeps its price** (the work is done, only the approval waits). Please confirm both. Note this changes today's money for a job Sedang Dikerjakan or Menunggu Verifikasi: its line used to be refunded while the job went on and the Mitra Jasa was paid, which is the same defect in another state.
2. **No staff path exists for a Saat Duka TPU order.** The only writers of Dibatalkan or Ditolak are the family's Batalkan; `jawabTpuLain` declining, which only happens at Diajukan, before any job exists; and the final PTSP rejection, which refuses a Saat Duka TPU order (`bukan_pengurusan_berkas`, spec: final rejection is for filing-only work). The lapse tick skips Saat Duka orders. So the family's Batalkan is the one path wired.
3. **No message to the Mitra Jasa.** The Layanan module sends none when a job is cancelled (neither the Terlambat cancel nor a release does), so none was added. The job leaves their active list and sits in their history as released, which is not a decline.
4. **Orders cancelled before this fix are not repaired.** Staging MKM-2026-000018 keeps its Dijadwalkan job and is already refunded; `batalkanHariHTpu` would hand back that job's line again, so it is no repair tool. A one-row data fix on staging is the owner's call.
5. **Found, not changed (same on the old code).** (a) A paid Saat Duka TPU order whose Tagihan carries a Harga Khusus can refuse the family's Batalkan before Dimakamkan (`pengembalian_tidak_terbit`) when the floor-apportioned line shares add up to a rupiah less than the paid total (checked on the old code with the fixture's odd prices). (b) A Tagihan already Dikembalikan Sebagian cannot be cancelled with its order (read from `batalkanPengurusan`, not run). (c) After a Pemesan cancels a Terlambat job the job is Dibatalkan but its assignment stays open, so the Mitra Jasa's active list still carries it (run: one active entry, none in history); ending it would change the scorecard's lateness count. Each wants its own ticket.
6. **Not verified here:** the `baris_tidak_ditemukan` refusal (defensive, not reachable through public functions), staging, e2e and `npm run build`. The money-code review on the opus tier is the orchestrator's.
