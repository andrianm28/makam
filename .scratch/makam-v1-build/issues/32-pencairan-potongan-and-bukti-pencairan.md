# Pencairan, Potongan and Bukti Pencairan

Status: resolved
Blocked by: 25, 31
Spec: Domain modules > 11. Payouts; 14. Work Queues (Tier 3 Pencairan); 16. Scheduler (Potongan ageing); Testing Decisions > End-to-end 3; stories 135, 162, 181 (Bukti Pencairan view)

## What to build

The Payouts module. Pencairan items become due per order or job via registered triggers; this ticket implements the item model and the Saat Duka trigger (Petak tariff and Biaya Pemakaman due when Lunas **and** the Pemakaman is recorded); other triggers are added by tickets 35, 37, 40, 51. Potongan are negative lines per Lokasi Mitra with a reason and link, carried forward. A Pencairan run shows one row per recipient with due items minus Potongan; items can be held out with a reason; Admin Platform transfers by hand, uploads proof and enters the date, issuing one Bukti Pencairan. The Admin Lokasi sees Pencairan per order (Belum jatuh tempo / Jatuh tempo / Dicairkan) and every Bukti Pencairan with its Potongan lines.

## Acceptance criteria

- [ ] Amount = the partner's tariff (or the Mitra Jasa rate), unless Admin Platform overrides it after a Keluhan with a note; a Harga Khusus reduces the Operator's share, and a non-zero partner share recorded on the order (ticket 30) lowers that order's Pencairan by that amount.
- [ ] "Dibayar langsung" produces no tariff Pencairan and a platform-fee Potongan.
- [ ] A Tidak Tertagih Tagihan produces no Pencairan unless paid later.
- [ ] Potongan carry forward; after 60 days (tick) or on Berhenti they become an offline request that Admin Platform records when paid; Potongan are never applied to Mitra Jasa.
- [ ] Pencairan run: one row per recipient; hold-out with reason; transfer proof + date issues one Bukti Pencairan `BKP/YYYY/NNNNNN` covering every item and Potongan in it; the recipient gets its link by message.
- [ ] Tier 3 Pencairan row due 2 working days (Admin Platform calendar, ticket 11) after the items become due.
- [ ] The Mitra Jasa version of the Bukti Pencairan shows only job, Layanan, date and rate.
- [ ] Admin Lokasi view: per-order Pencairan state and its Bukti Pencairan list; nothing from other Lokasi.
- [ ] Tests: Saat Duka due trigger (Lunas and Pemakaman, in either order); netting and carry-forward; 60-day ageing; batching into one Bukti Pencairan; hold-out; Playwright: a Pencairan run producing a Bukti Pencairan.

## Comments

- 2026-09-28 — **A fourth merge-time defect, and the one that would have vanished silently: this renumbering deleted a snapshot that belongs to `main`.** Ticket 32's branch carried `0025_payouts.sql` and `0025_snapshot.json`, and by then `main` already held **0025** (ticket 44) and **0026** (ticket 34) — so the branch's own migration number had been taken twice over. The documented procedure is to resolve the journal and snapshot paths first, delete the branch's own `00NN.sql` and `00NN_snapshot.json`, then `db:generate`. That procedure assumes the two numbers differ. When they **collide**, the order inverts into a trap: `git checkout --ours -- drizzle/meta/0025_snapshot.json` puts **main's** snapshot at that path, and the following `rm` then removes **main's**, not the branch's. So the merge tree lost `0025_snapshot.json` outright, and `0026_snapshot.json`'s `prevId` pointed at an id that no longer existed in the tree.

  **It would never have been caught by anything.** Not by a test, not by `npm run build`, not by `db:generate` — drizzle diffs against the newest snapshot, so a missing intermediate one changes nothing it looks at. It was caught by an audit that reported a dangling `prevId` **and then explained it away** as one of three pre-existing ones. The count was right and the cause was wrong: those three are 0018, 0021 and 0024, gaps left by earlier renumberings, while the fourth was this merge's. So the dismissal was not a false claim, which is what made it dangerous — it was a true observation with a plausible reason attached, and only running the check separated them. That is the same shape as two other near-misses this session, where a symptom was real, the explanation was reasonable, and nothing required the check.

  **The fix** is one line and the check is now a program, not a reading: every `prevId` in `drizzle/meta/` is resolved against the set of snapshot `id`s in the tree, and the answer is that all of them resolve except the three that predate this work. `0025_snapshot.json` is restored from `origin/main`, and the chain reads 0024 → 0025 → 0026 → 0027. **`AGENTS.md`'s renumbering procedure now says to restore `main`'s snapshot by name after deleting the branch's**, because deleting by path is only safe when the two numbers differ.

- 2026-09-28 — **Two-axis review** (Standards and Spec, reported separately), run before the fix pass; both reports are in the entries above. **Standards: merge-worthy, no HARD.** **Spec: 6 of 9 AC strong, none implemented wrongly**, and the three that are not yet alive are recorded as such rather than tidied away — the "or when it stops" clause of AC 4 belongs to ticket 59, the partner-share and paid-directly facts belong to ticket 30, the Keluhan override to 51, and "Tidak Tertagih" to 29 which has no writer at all. AC 3 is marked deliberately weaker: the ageing tick never reads `tidak_tertagih`, so its test only proves "unpaid yields nothing".

  The fix pass changed documentation and honesty, not behaviour, and it also **removed a sentence that was false**: `pemakamanTercatat` had claimed "which ticket 25 calls" while having no caller in the release. It now says so, in `index.ts`, `trigger.ts`, `schema.ts` and `tests/support/payouts.ts` alike. The pass also found a real bug by writing a test: a push notification opened the Bukti Pencairan page, which Notifications rejects because it is not a staff page — so in production the message would **throw after the transfer was already recorded**. The link now travels by email and the push opens the recipient's area. The re-review confirmed the ordering, confirmed the bearer link is 256-bit, and checked it is not worse: no duplicate Bukti Pencairan (a unique index backs `transfer.ts:365`), no resend tick, and a failure only reaches `reportError`.

  **Merged as `0027_fresh_firebird.sql`, not `0025`**, because main already held 0025 (ticket 44) and 0026 (ticket 34). Both proofs were taken: the generated file is **byte-identical** to the branch's own `0025_payouts.sql`, and a second `db:generate` answers "No schema changes, nothing to migrate" — the second is what shows the snapshot chain is intact rather than that the SQL merely looks right.

  **Two integration breaks, neither visible to either branch, and the second one was mine.** The first: `src/server/runtime.ts` and `tests/support/queues.ts` both carried additive edits from 44 and 32, and the journal and snapshot collided on 0025 — resolved the documented way, journal and snapshot first, because `git checkout <ref> -- <path>` on an unmerged path does not restore the file and drizzle would then emit one migration carrying two tickets. The second: ticket 44 added `pengurusan` to `PemesananSetup`, and `PemesananModul` is an `Omit` of that setup, so **every fixture that composes the Pemesanan module itself** stopped satisfying it. There are two such fixtures, `tests/support/queues.ts` and `tests/support/payouts.ts`, and both now build the module. While resolving `queues.ts` I made a splice of my own: a "keep both sides, drop exact duplicates" strategy turned two different `return` statements into two returns, and the first shadowed the second — `payouts` was composed and then dropped from the returned setup. It would have compiled as unreachable code rather than failing loudly, and it was found only by counting `return` statements in the three conflicted files. Merging is not mechanical work, and the strategy that resolved one conflict correctly produced a silent defect in the next.

### 2026-09-28 — reviewStandards (axis Standards): boleh merge tanpa HARD

**Verdict: GREEN.** Tidak ada pelanggaran keras. Yang diperiksa satu per satu, dan
semuanya lulus di commit `d1b7073`:

- **Tidak ada jalur pembayaran kedua.** `dicairkan` hanya ditulis dari
  `jatuh_tempo`, di dalam satu transaksi yang memegang lock baris item
  (`transfer.ts`), dan `batalkanPencairanTagihan` /
  `kurangiPencairanPesanan` hanya menyentuh
  `inArray(status, ["belum_jatuh_tempo", "jatuh_tempo"])`. Item `dicairkan` tidak
  punya jalan keluar di kode mana pun.
- **AC 5 tiga lapis, semua di database**: lock `for("update")` dengan
  `orderBy(asc(id))` (jadi dua transfer yang berbagi item tidak bisa saling
  mengunci mati), status satu arah, dan unique index
  `bukti_pencairan_item_item_idx` pada `item_id`. Test konkurensinya
  benar-benar konkuren (`Promise.all` dua `terbitkanBuktiPencairan`).
- **Potongan**: carry-forward (`terpotongSebesar` terpisah dari `amount`, jadi
  utangnya tidak pernah ditulis ulang), ageing 60 hari idempoten
  (status satu arah + `where` pada tick), dan **tidak pernah ke Mitra Jasa**:
  `catatPotongan` hanya menerima `lokasiId` dan menolak id yang bukan Lokasi
  Mitra, sementara `terbitkanBuktiPencairan` menolak Potongan apa pun bila
  penerima adalah Mitra Jasa.
- **Nominal diwarisi, bukan di-quote ulang**: nominal item disalin dari
  `tagihan_line` (append-only, trigger Billing menolak UPDATE/DELETE) saat item
  dibuat; tidak ada satu pun pembacaan tarif di dalam trigger.
- **Kalender dipakai, bukan ditulis ulang**: `lokasi.adminPlatformCalendar()` +
  `addWorkingDays`, nol kode kalender baru.
- **Scoping AC 8 skeptis**: `pencairanLokasi` difilter dengan
  `lokasiId` **dan** `penerimaKind = "lokasi_mitra"`, jadi pekerjaan Mitra Jasa
  di Lokasi Mitra yang sama tidak bocor ke Admin Lokasi; diuji dengan dua Lokasi
  Mitra dan dua Admin Lokasi yang saling membaca.
- **Ukuran uang**: setiap kolom rupiah adalah `Rupiah` dengan CHECK per kolom;
  tidak ada `number` mentah untuk uang.
- **Batas-batas yang dijaga**: tidak ada tabel/modul untuk refund, partner share,
  Mitra Jasa atau Pekerjaan Layanan; tidak ada `page.tsx` baru (hanya satu
  percabangan pada route `/dokumen/[link]` yang sudah ada); migrasi expand-only
  dan lolos `check-destructive-ddl`.

### 2026-09-28 — reviewSpec (axis Spec): 6 dari 9 AC kuat, tidak ada yang salah

**Verdict: implementasi benar, pencatatan belum jujur.** Tidak ada AC yang
dikerjakan salah: setiap AC yang terimplementasi melakukan apa yang ditulis spec
(judul, jumlah, net, daftar Potongan, BKP, tenggat 2 Hari Kerja). Yang tersisa
adalah apa yang **belum** terbukti dan belum tercatat apa adanya. Rinciannya
di entri "spec fixes" 2026-09-28 di bawah; ringkasannya:

- **AC 1, 2, 3**: behaviour is right as Payouts' own behaviour, but each one is
  entered from outside — a partner share, a direct payment, an override after a
  Keluhan, a declared Tidak Tertagih — and none of those callers exists yet
  (tickets 30, 51 and 29). The tests write the inputs themselves, so they prove the
  rule, not that anything can reach it.
- **AC 4**: ageing 60 hari dan carry-forward terbukti; klausa **"atau saat
  Berhenti"** tidak ada sama sekali dan tidak tercatat di mana pun. Ia milik
  tiket 59 (blocked by 32, 38, 54), jadi memang belum bisa ada di sini.
- **AC 5**: terbukti penuh, termasuk tidak ada pembayaran kedua.
- **AC 6**: terbukti penuh (tenggat 2 Hari Kerja dari kalender Admin Platform).
- **AC 7**: terbukti penuh untuk Bukti Pencairan Mitra Jasa; **pengirimnya**
  (`kirimBuktiPencairanKe`) tidak punya test.
- **AC 8**: terbukti untuk "Jatuh tempo" dan "Dicairkan"; status **"Belum jatuh
  tempo"** per-pesanan tidak dapat terjadi di tiket ini.
- **AC 9**: kedua urutan trigger terbukti; e2e nol, dan alasannya dapat
  diterima.

**What the fix pass (2026-09-28) did about this report:** nothing above is a
defect, and no behaviour changed. The sender's missing test was the one thing
here that was worth writing rather than recording — `src/composition/payouts.test.ts`
now proves who a Bukti Pencairan reaches, and writing it found a real defect
(the push opened a document page, which Notifications refuses, so the message
would have failed in production). Everything else is now written down in the
"spec fixes" entry below: AC 4's Berhenti clause and its owner (ticket 59),
`pemakamanTercatat` having no caller yet, `jadikanJatuhTempo`'s indirect coverage,
and which ticket makes each of AC 1, 2 and 3 reachable — with the note that AC 3's
test proves "unpaid owes nobody", not "Tidak Tertagih owes nobody".


### 2026-09-27 — the two decisions the owner took, and where they live in the code

- **A Pelanggan who falls due and is then refunded in full has their items
  cancelled, not paid and clawed back.** Two places, because the refund can land
  before or after the items exist: the trigger never makes an item for a Tagihan
  whose status is `dikembalikan_penuh` (`trigger.ts`), and
  `payouts.batalkanPencairanTagihan(tx, { tagihanId })` cancels whatever is
  already due — which the Refunds module (ticket 31) calls inside the same
  transaction that records the refund. An item that was already transferred is
  left alone: that money is gone, and clawing it back is a Potongan, a decision of
  its own.
- **A net below Rp 0 inside one Bukti is refused, and Admin Platform settles it on
  the offline path.** `terbitkanBuktiPencairan` returns `netto_negatif` when the
  named Potongan owe more than the items come to, and the run shows `neto: null`
  before anyone tries, so the UI can say so. A debt is never half-netted to make
  a transfer possible: it stays `berjalan` and carries forward.

### 2026-09-28 — what the trigger waits for, and why it is a tick

The Saat Duka trigger's two halves are written by the two modules that own them
and neither reads the other back: `efekPencairanSaatLunas()` inside the
transaction that settles the Tagihan — that half runs today — and
`payouts.pemakamanTercatat(tx, …)`, whose caller is the Pemakaman module (ticket
25, **not merged**, so nothing outside the tests calls it yet). A tick turns the
pair into items, which is what makes "Lunas **and** Pemakaman recorded, in either
order" true by construction. The tick takes no dependencies at all, which is why
Billing can compose it and Payouts compose after it without a cycle.

### 2026-09-28 — spec fixes: what is proven, and what is only recorded

Rerun after the two-axis review. No behaviour changed; the corrections are in
what this ticket claims. Read the two lists as a whole: **nothing below is
implemented wrongly, and nothing below is a defect — it is what is *not* proven
yet, said plainly.**

#### Proven by a test

- **Both orders of the Saat Duka trigger** (`trigger.test.ts`): money first then
  burial, and burial first then money, each producing the same Rp 9.500.000 two
  working days later. The tick is idempotent, and a second payment of the same
  Tagihan is one fact.
- **Amounts (AC 1)**: the partner's tariff as issued, a Harga specialising borne
  by the Operator (the Lokasi Mitra is paid its full tariff), an override after a
  Keluhan with its note in the Audit Log, and a partner share lowering the order's
  Pencairan oldest-line-first. A share larger than the order is refused, so an item
  is never left at Rp 0.
- **"Dibayar langsung" (AC 2)**: no tariff Pencairan and a platform-fee Potongan
  of the issued Biaya Layanan Platform, recorded once however often the tick runs.
- **Tidak Tertagih (AC 3)**: a Tagihan that was never paid produces nothing, and
  pays out when the money finally arrives.
- **The run and the transfer (AC 5)**: one row per recipient, the bank account, a
  hold-out with its reason (out of the run, out of the Antrean, refused by the
  transfer, back on release), one BKP covering every item and Potongan, a negative
  net refused with nothing written, two recipients never mixed, and **two
  concurrent transfers over the same items paying exactly once**.
- **Potongan (AC 4, first half)**: netted once and settled, a debt bigger than the
  whole run never half-paid and carried forward, 60-day ageing idempotent, and the
  offline payment recorded with both Entri Audit.
- **The 2 Hari Kerja deadline (AC 6)** from the Admin Platform calendar, the Tier 3
  row (one per recipient), and the counter strip.
- **The Mitra Jasa view (AC 7)**: the Bukti Pencairan carries job, Layanan, date and
  rate and has no other field, and their own list is nobody else's.
- **The Admin Lokasi view (AC 8)**: per order, with the Bukti that settled it, and
  nothing from another Lokasi Mitra.
- **Who the Bukti is sent to**: a Lokasi Mitra's Admin Lokasi (not another Lokasi's,
  not the family), a Mitra Jasa's own account, and nobody at all when the Lokasi has
  no Admin Lokasi (`src/composition/payouts.test.ts`).

#### Recorded, not proven

- **AC 4's second trigger — "or when the partnership Berhenti" — is absent and
  waits for ticket 59.** The spec makes a Potongan an offline request either at 60
  days **or** when the Lokasi Mitra goes Berhenti. Only the first is here; the
  second belongs to the Lokasi module's status change (ticket 59, "Lokasi Mitra
  Ditangguhkan dan Berhenti", blocked by 32, 38 and 54), so it cannot exist before
  this ticket merges and is deliberately not faked here. Nothing in Payouts reads a
  Lokasi Mitra's status; a Berhenti Lokasi's `berjalan` Potongan keeps ageing on the
  60-day tick, which is the safe direction. Noted in `potongan.ts` at the tick.
- **`pemakamanTercatat` has no caller.** It is the burial half of the trigger and it
  is tested directly, but in this release **only the tests write that fact**: the
  Pemakaman module (ticket 25, not merged) is the caller in production, and the test
  helper stands in for it. So the two orders above are proven about *the Payouts
  half*; the call from a real burial transaction is not, because there is none yet.
- **`jadikanJatuhTempo` is exercised only indirectly** (through the Mitra Jasa
  view tests). Its one-way behaviour — calling it twice, or after the item was
  cancelled or transferred — is not proven.
- **"Belum jatuh tempo" as an order's per-order state (AC 8) cannot occur yet.** The
  derivation is in `reads.ts`; every order's items are made due by the Saat Duka
  trigger, so the test proves "Jatuh tempo" and "Dicairkan" only. It becomes
  reachable when tickets 37, 40 and 51 create not-due items.
- **Nothing enters AC 1, 2 and 3 from the outside yet, and the tests stand in for
  the callers.** Each test writes its own input, and no test can be green today
  unless this module is wrong:
  | AC | what the test does | who will make it real |
  |---|---|---|
  | AC 1 partner share | calls `kurangiPencairanPesanan` itself | **ticket 30** (built, not merged) — the field on the order and its note |
  | AC 2 "dibayar langsung" | records the payment with `langsung_ke_lokasi` itself | **ticket 30** — the manual-payments screen and the direct-payment reversal |
  | AC 1 override after a Keluhan | calls `turunkanJumlahPencairan` itself | **ticket 51** — the Keluhan decision that offers the override |
  | AC 3 Tidak Tertagih | `setTagihanStatusForTest`, a stand-in | **ticket 29**, which has no writer at all yet |
- **AC 3 is weaker than it looks.** Nothing in the trigger ever reads the
  `tidak_tertagih` status, so that test proves "an unpaid Tagihan owes nobody" and
  "a paid one owes what it owes" — it does **not** prove the spec's rule that a
  declared Tidak Tertagih owes nobody until the family pays later. That rule only
  becomes testable when ticket 29 can actually declare it; the behaviour is correct
  today only because no code path can set the status.
- **The Mitra Jasa trigger end to end.** `catatItemLayananMitraJasa` and
  `jadikanJatuhTempo` are tested directly, but no Pekerjaan Layanan (ticket 51/55's
  table) exists to reach them, so "the Keluhan window closed" is not proven.
- **No Playwright e2e (AC 9).** Two reasons, both recorded: `docs/design-system.md`
  (:183 and :306) settles the Admin Platform menu as Kerja harian · Lokasi dan harga
  · Orang · Operator with **no Pencairan item**, so there is no run screen to drive
  and the run is reached from the Antrean, which is where the Tier 3 row points;
  and reaching a due item through a browser needs ticket 25's burial recording,
  which has no screen. The document itself is real today: `/dokumen/<link>` renders
  both versions of a Bukti Pencairan and prints it to PDF.

### 2026-09-27 — a finding for the orchestrator, from the CI upgrade seed

`scripts/migrations/seed-representative.ts` was run against this branch's schema:
every Payouts table fills (3 rows each), and **five tables from earlier tickets
still cannot be filled and fail the seed** — `inventory_pemakaman`,
`inventory_petak`, `inventory_petak_alias` (Inventory), `payment_webhook_event`
and `pembayaran_perlu_ditinjau` (Billing). That is pre-existing: the same five
fail on `origin/main`'s schema without this migration, because the seed invents
text values for `text` columns that carry a CHECK, and those CHECKs are written
against a closed list of words. The `migrations` CI job runs that script, so it
is red on `main` independently of this ticket.

### 2026-09-27 — an environment note for whoever runs the tests here

Vitest in this worktree intermittently served a **stale transform** of a test file
edited in the same second as the run, which showed up as impossible assertion
failures (an object with a property that `Object.getOwnPropertyDescriptor` said
did not exist). Waiting a few seconds between writing a test file and running it,
or clearing `node_modules/.vite`, makes it go away. Every number in this ticket's
report was read off a run whose file contents had not changed for seconds.
