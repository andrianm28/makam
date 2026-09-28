# Terencana confirmation, payment hold and Aktif

Status: ready-for-agent
Blocked by: 23, 32, 36
Spec: Domain modules > 6. Pemesanan (Terencana statuses); 10. Billing (Terencana pay-first); 11. Payouts (Terencana Hak Pakai); 14. Work Queues (Konfirmasi Terencana, Tier 3 terlambat); 15. Notifications (hold reminder); 16. Scheduler (expire holds, Masa Pembatalan ends); stories 46, 47, 49, 121

## What to build

The Admin Lokasi confirms or declines a Terencana order from a Konfirmasi Terencana row (Lainnya) due by the end of the Lokasi's next working day, with no automatic cancel; a Tier 3 "Konfirmasi Terencana terlambat" row appears for Admin Platform when it's late. Confirming starts the hold (Lokasi policy, default 24 h) and issues a pay-first Tagihan due at hold expiry, with a reminder about 4 h before it ends. Payment makes the order Aktif with one Hak Pakai per Petak / Kavling Keluarga (same Pemegang Hak, Syarat snapshot attached) and issues the Bukti Pemesanan. Lapse makes it Dibatalkan ("batas pembayaran lewat") and releases the plots; the Pemesan may withdraw free any time before paying; a decline returns the Pemesan to the Lokasi step. Register the Terencana Pencairan trigger.

## Acceptance criteria

- [ ] Konfirmasi Terencana row deadline = `nextWorkingDayEnd` from submission; the Tier 3 row appears after it; neither cancels the order.
- [ ] Confirm → Dikonfirmasi; Tagihan pay-first due at hold expiry; reminder ~4 h before expiry.
- [ ] Payment → Aktif; one Hak Pakai per Petak or Kavling Keluarga, all with the same Pemegang Hak and Calon Penghuni labels; Bukti Pemesanan issued; the Hak Pakai end date stays empty until the first Pemakaman (or perpetual).
- [ ] Hold expiry unpaid → Tagihan Dibatalkan, order Dibatalkan "batas pembayaran lewat", plots released (tick, idempotent).
- [ ] Withdrawal before payment → Dibatalkan, plots released, nothing charged.
- [ ] Decline (Tolak) → Ditolak, plots released, the Pemesan is sent back to the Lokasi step.
- [ ] Pencairan: the Terencana Hak Pakai item becomes due at the end of the Masa Pembatalan (tick) or at the first Pemakaman if sooner.
- [ ] Tests: each transition; hold and lapse timing with the fake Clock; release on decline / withdrawal / lapse; Pencairan due at Masa Pembatalan end vs first Pemakaman.

## Comments

### 2026-09-28 — three judgement calls, and what this ticket did not build

**1. The lapse tick: a new Pemesanan tick beside Billing's existing one, not an extension of it.**
`lapsePayFirstTagihanTick` (Billing, ticket 18) already lapses a pay-first Tagihan at its
due date, and that due date **is** the payment hold's end: the confirmation issues the
Tagihan with `moment.kind = "terencana"` and `holdExpiresAt`, and `tagihanDue` gives a
`terencana` moment exactly that instant as its due date. So Billing already owns the
"the hold expired" half. What it cannot do is follow the money into the order, so
`terencanaLapsedTick` (`src/domain/pemesanan/tick-terencana.ts`) reads every `dikonfirmasi`
order whose Tagihan is Dibatalkan for `batas_pembayaran_lewat` and cancels the order the
same way, releasing its plots in the same transaction.

**Why not extend the existing tick:** its return value is *the ids it lapsed in this run*,
which is not a durable handoff. A worker that died between the two updates — or a Billing
tick that ran before the order was confirmed — would leave the order `dikonfirmasi` forever
with a dead Tagihan. Reading the order's own state instead makes the halves independent and
order-free, which is also why the existing tick's shape does not fit and was left alone.
`tests/support/payouts.ts` and the new `trigger-terencana.test.ts` both run the two halves
in **both orders** and after a 48 h gap, so "whichever ran first" is tested, not assumed.

**Idempotence, stated as the tests check it:** the guard is the order's own
`dikonfirmasi → dibatalkan` move inside one transaction, so a second run matches no row
and releases nothing; two concurrent runs are asserted to release the plots **once**
between them (`plotsDirilis` sums to 2 across two `Promise.all` runs, then a third run
returns `{ dibatalkan: 0, plotsDirilis: 0 }`).

**`inventory_plot_hold` was not given an expiry column.** It carries only `placed_at`, and
nothing here adds one: the hold's end is the Tagihan's `due_at`, so there is one fact about
it rather than two that can disagree, and any query that wants lapsed holds reads
`tagihan.due_at` (through Billing's public `tagihan()` read, never its tables).

**2. The confirmation window: `nextWorkingDayEnd`, not `daytimeHoursDeadline`.**
`daytimeHoursDeadline(start, hours)` is `deadline(TPU_SCHEDULE, …)` — hours counted only
inside 06:00–18:00 WIB with the clock pausing overnight — and it exists for the Keluhan
first response, whose SLA is "4 daytime hours". A Terencairan confirmation is not that: the
spec says "the end of the Lokasi's next working day", which is counted on the **Lokasi
Mitra's own** calendar (an open day of its Jam Operasional, minus its Tanggal Tutup). So the
deadline is `nextWorkingDayEnd(calendar, now)`, which is `addWorkingDays(calendar, start, 1)`
— a pure function on the Lokasi's `Jam Operasional`, and the fixture's own test
("is promised a confirmation by the end of the Lokasi's next working day") asserts the
exact instant (Friday 15:00 WIB for a Thursday 09:00 submission with 07:00–15:00 hours).

**3. The Bukti Pemesanan: this ticket adds the table, and ticket 25 must reuse it.**
The brief said ticket 25 was merged and `bukti_pemesanan` existed. **It is not merged** —
`00-index.md` lists 25 as `ready-for-agent`, and `src/domain/billing/schema.ts` had no
`bukti_pemesanan` and `drizzle/` no such migration. AC 3 requires the document, so this
ticket builds it: `bukti_pemesanan` in Billing (numbered `BPM/YYYY/NNNNNN`, one per order,
in the Lokasi Mitra's name, carrying **no amounts**), with the append-only trigger. Because
the trigger rejects UPDATE and DELETE, a corrected document is a **new row** and never an
edit — which is also why `nomor_pemesanan` is unique: a retried payment effect or a second
settle of the same Tagihan leaves the family with the one document they already have.
**Ticket 25 must call `billing.terbitkanBuktiPemesanan` / `billing.buktiPemesanan` rather
than creating a second table.**

**4. New Audit Log actions (three), and the `denah.pakai_unit` entry.**
`pemesanan.konfirmasi_terencana`, `pemesanan.tolak_terencana` and `denah.pakai_unit`, with
labels in `src/lib/lokasi-labels.ts`. The last one is recorded **under the Admin Lokasi whose
confirmation asked for it** (`dikonfirmasi_oleh` on the order), because that decision is the
Lokasi's and the payment only made it effective — which is why `pemesanan_terencana` gained
`dikonfirmasi_oleh`.

**Not built, with the owner named:**

- **The Terencairan's UI.** No Server Action, no staff page and no order-page change for
  the confirm / decline / withdraw buttons. Every AC is about the domain transition, the
  rows and the timing, and no AC names a screen; the Antrean Lokasi row's `href` already
  points at the staff order page that exists. The **staff page for a Terencairan order** and
  its Konfirmasi / Tolak forms are **not** built, so the row links to a page that will show
  nothing found until that screen lands. Owning ticket: **37 is the owner of the domain
  half; the staff page and the Server Actions are ticket 78** (Admin Lokasi area redesign)
  or, if 78 is already merged by then, a follow-up ticket on the Terencairan staff page.
  **This is the one gap in this ticket and it is a real one**: the domain is complete and
  reachable, but no one can yet press the buttons.
- **The family-facing "kembali ke langkah Lokasi" link** (story 49) on the Terencairan order
  page. The decline **message** carries it (`terencanaDitolakEmail` names the wizard's
  Lokasi step and `Notifications` is given `terencanaWizardUrl`), so the family is told where
  to go; the link on the order page itself belongs to that page, not to this transition.
- **The 48 h-lapse Tier 3 row and the `Telepon Pemesan` escalation for a lapsed Terencairan.**
  Not in any AC; the order is `dibatalkan` with the reason, which is what the spec names.
- **Playwright.** AC 8 asks for domain tests with the fake Clock and names no UI smoke test,
  so none was added; the e2e suite is ticket 71's.

**The `firstPemakamanDate` read was added and then removed.** The Terencairan Pencairan
trigger needs the first Pemakaman, and it was first read through Inventory (the tenure
clock's start). It is now read from `pencairan_pemakaman` — the Payouts module's **own**
table, written by ticket 32's `pemakamanTercatat` and read by the Saat Duka trigger for the
same fact. One burial, one table, two triggers: asking the Pemesanan module to re-derive it
would make it two facts that could disagree.
