# Pencairan Saat Duka tidak pernah diberi tahu bahwa Pemakaman sudah dicatat

Status: in-progress
Blocked by: 25, 32
Spec: spec.md, Billing > Payouts — "Saat Duka Petak and a later burial's Biaya Pemakaman | Lunas **and** Pemakaman recorded"

## What to build

A bug confirmed by review on 2026-09-29: `payouts.pemakamanTercatat` had **no production caller**. `git grep pemakamanTercatat origin/main -- src` found it only inside `src/domain/payouts` and in tests, and ticket 25's Comments say it "has no caller". Ticket 32's trigger for a Saat Duka order needs both facts (the Tagihan Lunas **and** the Pemakaman recorded), so in production a Lokasi Mitra's Pencairan for a Saat Duka order was never made due. The same missing fact would have left the Terencana "first Pemakaman if sooner" trigger unreachable.

Make recording a Pemakaman tell Payouts, in the same transaction as the burial record:

- `PemesananDeps` gains a required `payouts: Pick<Payouts, "pemakamanTercatat">`, and `catatPemakaman` (`src/domain/pemesanan/catat-pemakaman.ts`) calls it inside its own `staffWrite` transaction right after the order becomes Dimakamkan. Pemesanan reaches Payouts only through its public interface.
- Payouts is composed after Billing, which is after Pemesanan, so `src/server/runtime.ts` (and its twin `tests/support/server-runtime.ts`) hand Pemesanan a lazy reference filled once Payouts exists, the same box that already carries `kurangiPencairanPesanan`. The worker composes no Pemesanan (it runs ticks only), so `src/worker/main.ts` needs no change.
- Idempotent: the fact is an upsert keyed on the Nomor Pemesanan, and a second Catat Pemakaman is refused (`pemakaman_sudah_dicatat`) before it reaches Payouts.

## Acceptance criteria

- [x] A domain test through public functions, red on `main`: a Saat Duka order confirmed, paid (Lunas) and recorded through the real Catat Pemakaman becomes due at the Payouts tick (`src/domain/payouts/pemakaman-tercatat.test.ts`).
- [x] The other order works too (burial first, money after), and a refused recording writes no fact.
- [x] Recording twice, or ticking twice, creates no second item.
- [x] Every fixture that composes the Pemesanan module hands it a real Payouts, so a forgotten dependency is a type error rather than a silent gap.
- [ ] The Terencana "first Pemakaman if sooner" trigger (ticket 37) is told through the same call once a Terencana burial can be recorded. Not on `main` when this ticket was written: only a Terencana placement exists, no Lokasi confirmation and no Terencana Pemakaman.

## Comments

- 2026-09-29 — Opened from the review that found the gap. The recorded instant is the moment the Admin Lokasi recorded it (the same `now` that starts the pay-after clock), not the calendar day entered, so the 2 Hari Kerja deadline counts from when the burial was entered.
