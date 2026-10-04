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
