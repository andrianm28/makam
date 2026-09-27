# Saat Duka alternatif, Tolak and cancellation

Status: ready-for-agent
Blocked by: 23
Spec: Domain modules > 6. Pemesanan (Saat Duka: Tawarkan alternatif, Tolak, cancellation); 14. Work Queues (Tier 1 Saat Duka ditolak); Public site > After a Tolak; stories 31, 32, 33, 34, 118

## What to build

The exits from a Saat Duka order. The Admin Lokasi can Tawarkan alternatif (another Jenis Makam or day) or Tolak with a reason from a fixed list. The Pemesan accepts or declines an alternative with one tap, seeing the new all-in total; declining becomes a Tolak. A Tolak sends the Pemesan an email with a link to the Pilih makam list with a banner, the rejecting Lokasi removed, their data prefilled and TPUs included, and creates a Tier 1 "Saat Duka ditolak" row for Admin Platform to phone the family within 2 h. The Pemesan can cancel before the burial (a reason is required once confirmed); the Admin Lokasi can record a cancellation on the family's behalf.

## Acceptance criteria

- [x] Tolak reasons come from a fixed list; the order becomes Ditolak; declines are counted on the Lokasi.
- [x] An alternative shows the new all-in total from `quote()`; accept moves the order on with the new Jenis Makam / day (and the confirmation deadline logic still applies); decline makes it Ditolak.
- [x] The rebook link opens Pilih makam with a banner, without the rejecting Lokasi, with the Pemesan and Almarhum data prefilled and the TPU section included (when ticket 44 exists).
- [x] Tier 1 "Saat Duka ditolak" row with a 2 h deadline; closes when the call is logged.
- [x] Cancel before confirmation: nothing billed, order Dibatalkan.
- [x] Cancel after confirmation (before the burial, reason required): order Dibatalkan, Hak Pakai Dibatalkan, Petak back to Tersedia, the Tagihan Dibatalkan; any payment already made is refunded except the Biaya Layanan Platform (a refund request to ticket 31's flow); no cancellation fee.
- [x] Tests: each transition; decline-of-alternative = Tolak; cancellation effects before/after confirmation; the rebook link's prefilled data and excluded Lokasi.

## Notes

Hari-H Layanan refunds on cancellation (unless Sedang Dikerjakan) are ticket 53. Refund approval and transfer are ticket 31; until then this ticket records the refund request.

## Comments

- 2026-09-26 — ADR 0004: the Tolak link goes by email (and is on the order page), not WhatsApp; for an order with no email the Tier 1 "Saat Duka ditolak" call is the only channel.
- 2026-09-27 — Builder (branch `ticket-24-tolak-pembatalan`). All seven AC built; `npx vitest run` in this worktree: **196 files, 1823 tests, 0 failures**; `npm run lint`, `npm run typecheck` and `npm run build` green.
  - Migration **`drizzle/0025_early_eddie_brock.sql`** (additive only: 6 columns on `pemesanan_makam`, 2 on `tagihan`, 1 index, 1 CHECK). That is the number this base produced, so it **contends with ticket 44's 0025**; the orchestrator renumbers per the fixed queue. A second `npm run db:generate` answers "No schema changes", and the file is byte-identical to the copy set aside before that run, so no `CREATE TRIGGER` / `ALTER` was lost.
  - **AC 3's TPU clause is vacuous here: ticket 44 is NOT merged** (`src/domain/pengurusan/index.ts` is still the walking-skeleton placeholder, contrary to the brief). The rebook link reads the ordinary `pilihanSaatDuka` list, so the TPU section arrives with 44 without a further change here, but there is nothing to point at yet. `pemesanan.rebook` also requires the session: the prefilled fields are a phone number, an email and a dead relative's name, so another Akun's link is nothing found (the spec's privacy decision, not a narrowing of the AC).
  - AC 6 read as the ticket writes it: the Tagihan is cancelled **and** the refund of anything paid is recorded on it in the same commit (`pengembalian_diminta_at` / `pengembalian_jumlah`, the paid total less the Biaya Layanan Platform), which ticket 31 reads to approve and pay. Money is never dropped silently; the order's own reason is required once confirmed and kept on the order. The four writes (order, Hak Pakai, Petak, Tagihan) are one transaction, and a test gives a released plot to the **next** family, so "Tersedia" is proved sellable and not merely free on paper.
  - Two changes outside this ticket's own module, because a half state was reachable without them: Inventory's "the Hak Pakai that holds this plot" reads (`memegangPetak` / `memegangKavling`, used by `beri-hak-pakai` and `clearing`) now skip a `dibatalkan` Hak Pakai, since a cancelled plot was listed as `Tersedia` yet could never be assigned again; and `notifications.teleponPemesanTercatat` exists so the Tier 1 row can close on a logged call.
  - Not proved by a test, honestly: `batalkanHakPakai` refuses when a Pemakaman is recorded under the Hak Pakai (the "before the burial" boundary), because recording a Pemakaman is ticket 25 and no test can produce that state through the public interface today. The order-level guard (`dimakamkan` is not cancellable) is likewise untestable until 25.
  - The "rolls back mid-transaction" case is covered only by the refusal-before-write path (`alasan_wajib` leaves plot, right and bill untouched); no test forces an error in the middle of the four writes.
