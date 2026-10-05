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

### Build (2026-10-05)

Built on branch `ticket-121-refund-pencairan-kasus-tepi` (money code: the review on the opus tier is still owed, and the merge is alone). Four code commits: `a2c8c66c` (Berhenti penuh), `97cdaa4b` (Ditolak rekening), `d8eb0b94` and `237be0c5` (rule C1); this comment is the commit after them.

**What changed**

1. **Ditolak asks for the rekening.** `STATUS_BERAKHIR_DENGAN_PENGEMBALIAN` (Pengurusan, `aturan.ts`: Dibatalkan and Ditolak) is the one rule for "this order ended and its refund waits for the family's account"; the order page reads it once (`pengembalianOf`, `page.tsx`) and hands the refund to all three views through one component, `PengembalianPemesan` (the form while the request is Diajukan, the locked note once approved). The filing-only page had the form at Dibatalkan only; the Perpanjangan TPU page never had it at all, though its final PTSP rejection raises the same full refund (Rp 1.000.000 in `perpanjangan-tpu.test.ts`), so it gets it too. The family's action already reached Refunds at any status (`isiRekeningPemesan` asks only who owns the order and for an open request); the test drives it at Ditolak and reads the account back from Refunds. The test web runtime (`tests/support/server-runtime.ts`) now wires Pengurusan into Refunds as `src/server/runtime.ts` does; without it the action could not see a Pengurusan order.
2. **`penuh` at Berhenti.** `tulisPengembalian` (`layanan/batal.ts`) asked Refunds for a job's line with neither flag, so a request that returned the whole Tagihan, the Biaya Layanan Platform included, was stored `penuh = false` (staging MKM-2026-000029). Where the fault is the Lokasi's (Berhenti, Terlambat) it now passes `penuhBilaLengkap`: a request that, with the earlier ones, returns every line is `penuh`; one that does not (a job Selesai keeps its price) stays an ordinary partial request, and Refunds never refuses for it. The Pemesan's own cancellation is untouched (fee kept, Dikembalikan Sebagian, as the existing test says). Amounts are unchanged.
3. **Rule C1.** `batalkanHariHTpu` (`layanan/batal-hari-h-tpu.ts`), when it cancels a redo, now in the same transaction (a) cancels the Pencairan item of the original and of every earlier redo of the line that is not yet transferred (Payouts `batalkanItem`, new reason `pesanan_dibatalkan`; `batal_alasan` is a text column, `npm run db:generate` says "No schema changes"), (b) returns the line for the family's refund, once, (c) makes the original that waited in Keluhan Dibatalkan (an earlier redo already approved stays Selesai). Nothing is asked of Refunds a second time for a line a Keluhan refund (`dana_kembali`) already returned. A redo already begun keeps going and its approval settles the original's item as before. It runs for an order whose Tagihan was never paid too (the item is cancelled, no refund is raised).

**What `penuh` drives** (read before changing it)

- At the transfer (`refunds/transfer.ts`): Billing's `tandaiPengembalian` (Dikembalikan Penuh or Sebagian) and Payouts: `batalkanPencairanTagihan` (every untransferred item of the Tagihan cancelled, reason `dikembalikan_penuh`, and everything already paid to a Lokasi becomes a Potongan in full) for `penuh`, `kurangiPencairanSebisanya` per Lokasi (only the refunded lines, a Potongan for the already paid part of them) otherwise.
- After it: Payouts' trigger skips a Tagihan Dikembalikan Penuh and nothing else (`trigger.ts`: "refunded in full owes nobody anything"), so a whole-Tagihan refund recorded as Sebagian is not shut out of it.
- In Refunds: a `penuh` request is never joined by more lines (`request.ts`), and approving with the fee lowered makes it not `penuh` (`approve.ts`).
- Not in a report and not in any screen: only `PermintaanPengembalian.penuh` carries it.

**Tests** (real Postgres, public functions, fake Clock; each new rule goes red on the old code, checked by running the old code, and two guards were checked by removing them)

- `berhenti.test.ts`: a single job's Berhenti refund is `penuh` and its transfer makes the Tagihan Dikembalikan Penuh; two jobs make one request, `penuh`, the fee once; a job Selesai keeps its price (not `penuh`, Dikembalikan Sebagian; passes on the old code, coverage).
- `batal.test.ts`: the same for a lateness cancel, one job and two jobs (the first is partial, the second completes it).
- `halaman-pesanan.test.ts` and the new `halaman-perpanjangan.test.ts`: the page asks for the rekening at Ditolak, the family's action stores it, and an approved request shows the locked note.
- `batal-hari-h-tpu.test.ts`: a redo by the same and by another Mitra Jasa (the original's item cancelled, the Layanan refunded once, the whole Tagihan `penuh`, the run holds nothing, the transfer makes the Tagihan Dikembalikan Penuh, asking again changes nothing); an unpaid order; a redo already begun (passes on the old code, coverage); a line a Keluhan refund already returned is not asked twice; a redo of a redo (every item of the line cancelled).
- Runs read from whole logs: `src/domain/layanan` 21 files, 274 tests; `src/domain/pengurusan`, `refunds`, `payouts`, `src/app/pengurusan`, `src/app/layanan` and `tests/tooling/use-server-exports.test.ts` 26 files, 208 tests; Berhenti composition, scheduler, queues laporan and Pembatalan Terencana 6 files, 61 tests; the page, copy and route guards 4 files, 17 tests (run before the last two commits, which touch no page); all passed. `npm run typecheck` and `npm run lint` exit 0 (6 old warnings, none in these files).

**Spec gaps and decisions for the owner**

1. **Rule C1 says "the family is refunded for the Layanan"; on the old code it was not.** With the redo cancelled, the original stayed in Keluhan and "kept its price" (ticket 117), so the order's refund left the Layanan line out (the new test read Rp 1.750.000 refunded of Rp 2.000.001). I made the redo's cancellation return the line (once) so the sentence is true, and I made the original Dibatalkan, because its page kept saying "Pekerjaan akan dikerjakan ulang". If the owner meant only the Pencairan item (the family gets nothing back for a job that was done), the line return and the status change are two small deletions in `batalkanTerkunci`, and the Mitra Jasa would then have to be paid, not cancelled. Please confirm.
2. **Terlambat is included in the `penuh` fix.** The AC names Berhenti, but it is the same function and the same defect (the whole Tagihan returned, the fee too, recorded not full). Reverting it is one expression (`penuhBilaLengkap: sebab === "berhenti"`).
3. **Found, not changed (money, each wants its own ticket).**
   - A job of a Layanan order cancelled after an earlier request of the same Tagihan was transferred (the Tagihan is Dikembalikan Sebagian) is cancelled with **no refund request at all**: `tulisPengembalian` accepts a Lunas Tagihan only (run, not only read: `pengembalian: null`, no open request). The family loses that job's money. `ajukanBaris` itself accepts Dikembalikan Sebagian.
   - The family's late cancel of a redo that is Terlambat (`batalkanPekerjaanTerlambatTpuOlehPemesan`, and Admin Platform's) refunds the original's line (run: Rp 250.001) and leaves the original's Pencairan item Belum Jatuh Tempo for good, the same defect as C1 by another trigger. Extend C1 to it?
   - A TPU job cancelled for lateness and a Keluhan refund (`mintaPengembalianTpu`) and the Lokasi's Keluhan refund also ask Refunds without a flag. A Keluhan refund must stay not `penuh` (the fulfiller stays paid unless Admin Platform lowers it), so I left all three.
   - The Harga Khusus rounding of ticket 117 (point 5a: floor-apportioned shares one rupiah short refuse the family's Batalkan) now also applies to an order cancelled during a redo, where before the request fell back to partial (read from the code, not run).
4. **Not repaired.** A request raised before this fix stays as it was: MKM-2026-000029 on staging is `penuh = false` and will transfer as Dikembalikan Sebagian (a one-row data fix, the owner's call), and an order cancelled during a redo before this fix keeps its open item.
5. **Not verified here:** `npm run build`, e2e, the UAT runner and staging. UAT R3-47.2 could now also check the form (`data-testid="rekening-pengembalian"`) at Ditolak. The money-code review on the opus tier is the orchestrator's.
6. The commits end with the Sonnet 5.5 attribution line the session gave me, not the Opus 5.5 line of the brief.
