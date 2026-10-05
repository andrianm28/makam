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

### Review (2026-10-05, round 1; fixed point 9da0fb3b, head 1fe9db90)

Both axis reports as the reviewers wrote them (the two report titles are two heading levels deeper than the reviewers' (`##` became `####`, `###` became `#####`), because `ticketComments` ends a Comments section at the next `## ` heading; the text is otherwise verbatim).

#### Standards

Paths are relative to /home/ubuntu/makam-t121. The fixed point `9da0fb3b` resolves and the diff is non-empty (18 files, +605/−62). Checked against `AGENTS.md` (Architecture, Tests), against `CONTEXT.md` through the test-naming rule, and against the `code-review` smell baseline.

**Hard**

1. `src/domain/layanan/batal-hari-h-tpu.test.ts:427,448,494,512,538`: all five new describe/it names say "redo"/"redone".
   - `AGENTS.md` (Tests) says "Name tests in `CONTEXT.md` terms", and `CONTEXT.md:311-313` defines **Kerjakan ulang** with "_Avoid_: Redo".
   - The fix is renaming five strings.
   - Nine older names in `bukti-tpu.test.ts` have the same problem; they are not reopened here.
   - I did not flag "job" (`CONTEXT.md:297`), because the glossary's own Pencairan entry uses it.

**Soft (judgement)**

1. **Duplicated Code** in `src/app/pengurusan/[nomor]/halaman-perpanjangan.test.ts:44-81`.
   - `halaman`, `berkas` and `QRIS` repeat `halaman-pesanan.test.ts:49-62`, which tests the same page.
   - `perpanjanganDiajukan` repeats `src/domain/pengurusan/perpanjangan-tpu.test.ts:256-264`.
   - Fix: add a `describe` to the neighbour file with `halaman(nomor, email)`, or move the setup into `tests/support/`.
2. `batal-hari-h-tpu.test.ts:554`: `expect(pekerjaanId).toBeTruthy()` checks no outcome. It only exists so the variable destructured at `:542` counts as used. Drop the variable from the destructuring.
3. `src/domain/layanan/berhenti.test.ts:40`: a missing job quietly becomes `""` (cast at `:135`), while `:39` throws "no job". A broken setup then fails later with an unrelated error. Also, `siap(true, 2)` (`:121`, `:134`) is a positional flag plus a count; the TPU neighbour takes an options object.
4. **Possible duplicated knowledge** in `src/app/pengurusan/[nomor]/page.tsx:258` with `src/domain/pengurusan/aturan.ts:23`.
   - The page only reads the refund request for the statuses in a fixed list.
   - `src/app/(site)/pesanan/[nomor]/page.tsx:64` and `terencana-pesanan.tsx:35` read the request unconditionally and let Refunds decide.
   - On this page, a request raised at any other status shows no form.

**Checked and clean**

- The new assertions read only public queries or the rendered page.
- `batalkanHariHTpu` is public (`layanan/index.ts:712`) and the file already calls it this way at `:342`.
- `batalkanItem` runs in the same transaction, after the check that the job row really changed (`batal-hari-h-tpu.ts:130,141`), as `bukti-tpu.ts:290` does.
- `batal_alasan` is a `text` column (`payouts/schema.ts:138`), so the new reason needs no migration.
- The added lines contain no `new Date`, `console`, `.only` or `ts-ignore`.
- The client/server boundary is unchanged.
- The user-facing copy moved word for word and is in Bahasa Indonesia (`pengembalian-pemesan.tsx:23`).
- The test runtime's wiring matches `src/server/runtime.ts:238`.
- No ops scripts, workflows, images, bash or logging are touched.

**Tests not run here.** My reviewer instructions limit me to git and grep and forbid running tests, so I did not follow the brief's request to run them. The orchestrator should run this and read the exit code:

`npx vitest run 'src/app/pengurusan/[nomor]/halaman-perpanjangan.test.ts' 'src/app/pengurusan/[nomor]/halaman-pesanan.test.ts' src/domain/layanan/batal-hari-h-tpu.test.ts src/domain/layanan/batal.test.ts src/domain/layanan/berhenti.test.ts`

Standards: 5 findings. Worst: "redo" in five new test names, against `CONTEXT.md:313`. Hard violations: yes.

Hard: 1, soft: 4

#### Spec

**Setup:** the fixed point `9da0fb3b` resolves (= `origin/main`). `git diff 9da0fb3b...1fe9db90` is non-empty: 18 files, +605/-62, 5 commits, and each rule's commit carries its tests. I read the tests but did not run them (this review is read-only).

##### Acceptance criteria

1. **At Ditolak the page asks for the rekening and Refunds receives it: MET.**
   - `STATUS_BERAKHIR_DENGAN_PENGEMBALIAN` = dibatalkan, ditolak (/home/ubuntu/makam-t121/src/domain/pengurusan/aturan.ts:23).
   - `pengembalianOf` reads it once (/home/ubuntu/makam-t121/src/app/pengurusan/[nomor]/page.tsx:48,256-258).
   - `PengembalianPemesan` renders it in all three views (page.tsx:192, pengurusan-iptm-pemesan.tsx:56, perpanjangan-tpu-pemesan.tsx:64).
   - The only Ditolak that owes money is the final `tolakPtsp`, for filing-only and Perpanjangan TPU orders (/home/ubuntu/makam-t121/src/domain/pengurusan/pengurusan-berkas.ts:237-257). A Saat Duka TPU Ditolak happens before its Tagihan exists (tawarkan-tpu-lain.ts:139; Tagihan issued at konfirmasi-saat-duka-tpu.ts:195). A cek TPU Ditolak issues no Tagihan (perpanjangan-tpu.ts:265).
   - `isiRekeningPemesan` has no status gate (/home/ubuntu/makam-t121/src/domain/refunds/rekening.ts:83-93), and production wires Pengurusan into Refunds (/home/ubuntu/makam-t121/src/server/runtime.ts:238).
   - Tests: halaman-pesanan.test.ts:266 and :289, halaman-perpanjangan.test.ts:86 (form shown, account stored and read back from Refunds, locked note once approved).
2. **Berhenti is recorded penuh, amounts unchanged: MET.**
   - The fix is `penuhBilaLengkap` in `tulisPengembalian` (/home/ubuntu/makam-t121/src/domain/layanan/batal.ts:211), reached from `batalkanSisaBerhenti` (batal.ts:347).
   - Refunds marks a request penuh only when the requests together cover the whole Tagihan (/home/ubuntu/makam-t121/src/domain/refunds/request.ts:347-349). So a job already Selesai keeps the request partial.
   - Every reader uses this one stored flag:
     - at transfer: the Billing state and the Payouts branch (/home/ubuntu/makam-t121/src/domain/refunds/transfer.ts:173-194);
     - the Potongan (transfer.ts:216-231);
     - Payouts' trigger skip (payouts/trigger.ts:216);
     - joining and approving (request.ts:357, approve.ts:114).
     - No report reads it.
   - Only a flag was added: Rp 900.000 with the same lines as before (berhenti.test.ts:64-73).
   - Tests: berhenti.test.ts:103, :120, :133 and batal.test.ts:282, :301. The Payouts side is covered only through the same `row.penuh` branch as the Tagihan state the tests check.
3. **A redo cancelled with its order: MET for the ticket's case (one redo after an upheld Keluhan).**
   - Same transaction: the call is a savepoint inside `refusable` (/home/ubuntu/makam-t121/src/domain/layanan/batal-hari-h-tpu.ts:75; /home/ubuntu/makam-t121/src/domain/pengurusan/pengajuan-iptm.ts:549-559), which rolls everything back on a refusal (/home/ubuntu/makam-t121/src/db/unit-of-work.ts:37-43). The item is cancelled with `batalkanItem(tx, ... "pesanan_dibatalkan")` (batal-hari-h-tpu.ts:141).
   - `batal_alasan` is a plain text column (drizzle/0027_fresh_firebird.sql:56), so no migration is needed.
   - Nothing paid out: the item ends dibatalkan and the payout run is empty after the Keluhan window closes (batal-hari-h-tpu.test.ts:448).
   - Nothing refunded twice:
     - The line is keyed by the root job and pushed once (batal-hari-h-tpu.ts:111, :153-158).
     - A line a Keluhan refund already returned (`dana_kembali`) is skipped (:187-192). Requests cannot be rejected (refunds/schema.ts:35), so `dana_kembali` always means the money went back.
     - A second call returns no line (test :448), and the Keluhan-refund case is covered (test :512).
4. **Tests: MET (by reading).** They run on real Postgres, through public functions (including Payouts' `pencairanMitraJasa`), with the fake Clock. Each new assertion contradicts the old behaviour: no form at Ditolak, `penuh: false`, the item left `belum_jatuh_tempo`, the original left `keluhan`. Two tests pass on the old code and are coverage only, as the builder says: test :494 (redo already begun) and berhenti.test.ts:133 (Selesai job keeps its price).
5. **Opus-tier review: PENDING.** It is satisfied by this review plus the Standards review.

**Narrowing:** none found (AGENTS.md:68). There are two widenings, both disclosed as owner decisions (S1, S2).

##### Findings
- **S1 SOFT** (/home/ubuntu/makam-t121/src/domain/layanan/batal.ts:211): the penuh fix also covers Terlambat, so lateness refunds become penuh, including the family's own late cancel (:164). AC2 names Berhenti only. This is owner decision 2 (Comments line 53) and needs a yes before merge.
- **S2 SOFT** (/home/ubuntu/makam-t121/src/domain/layanan/batal-hari-h-tpu.ts:111-115,144-153): rule C1 also refunds the root's Layanan line and makes the waiting original Dibatalkan. This is new money to the family, pending owner decision 1 (line 52).
- **S3 SOFT** (batal-hari-h-tpu.ts:162 -> /home/ubuntu/makam-t121/src/domain/pengurusan/pengajuan-iptm.ts:586): cancelling a redo now brings `tidakDikembalikan` to 0, which switches on the strict `penuh: true`.
  - With a Harga Khusus, a one-rupiah floor shortfall makes Refunds refuse (request.ts:348) and the family's Batalkan rolls back. Before, it was a partial request.
  - Disclosed (line 58), but not run and not tested.
- **S4 SOFT** (batal-hari-h-tpu.ts:64,140-141): in a redo of a redo, the root's item is already jatuh_tempo once a first redo by the same Mitra Jasa is approved (bukti-tpu.ts:283-288).
  - C1 cancels the item only if it has not been transferred yet, but refunds the line either way.
  - Payout-run timing therefore decides whether the Mitra Jasa keeps approved pay and whether the Operator pays twice.
  - The transferred case is untested and is not listed under the owner's decisions.
- **S5 SOFT** (ticket line 59): staging MKM-2026-000029 stays `penuh = false`, and orders cancelled during a redo before this fix keep their open item. This must be decided before that request is transferred.

The builder's out-of-scope defects 3a and 3b (lines 55-56) need their own tickets. 3b is the same C1 defect, reached through the Terlambat redo cancel.

Findings: 5. Worst: S4 (whether approved pay survives and whether the Operator pays twice depends on payout-run timing). hard violations: no

Hard: 0, soft: 5
