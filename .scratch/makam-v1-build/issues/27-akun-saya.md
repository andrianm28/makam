# Akun Saya: Perlu tindakan, Pesanan and Makam tabs

Status: ready-for-agent
Blocked by: 25, 82
Spec: Solution (Akun Saya); Domain modules > 1. Identity & Access; ADR 0004 (supersedes 0003); stories 98, 99, 100, 101, 192, 193

## What to build

Akun Saya for any logged-in Akun: a Perlu tindakan strip, a Pesanan tab with every order on the Akun (newest first, including CS-submitted orders attached by Nomor Pemesanan; each order page holding its Tagihan, Bukti, IPTM scan and actions), and a Makam tab (Makam Keluarga) with every Hak Pakai and Makam TPU whose recorded Pemegang Hak email equals the Akun's Email Terverifikasi, even ones someone else ordered, each with its Pemakaman, active Paket, past photos and documents. Build the tabs as extension points that later tickets add items to.

## Acceptance criteria

- [ ] Masuk works cold (ticket 08) and shows empty tabs with guidance for an Akun with nothing recorded.
- [ ] Pesanan lists every order where the account is the Pemesan, newest first; each links to its order page with Tagihan, Bukti and actions.
- [ ] Makam lists every Hak Pakai where the Pemegang Hak's recorded email equals the Akun's Email Terverifikasi, including Hak Pakai from orders placed by someone else; each shows Lokasi, Petak / Kavling, status, end date, Pemakaman list and documents.
- [ ] Perlu tindakan shows, where present: unpaid Tagihan; missing documents; an alternative to accept; (later: Perlu Perbaikan, a consent to give) through a registry other tickets add to.
- [ ] Documents listed in Akun Saya open by their unguessable links.
- [ ] A profile section shows the Email Terverifikasi with "Verifikasi email" to change it (tickets 67, 82; it can't be removed) and lets the user edit the phone number, an unverified contact (ticket 82). _(Amended 2026-09-26, ADR 0004.)_
- [ ] A user sees only their own orders and graves (authorisation check).
- [ ] Tests: email-matching Makam tab (holder ≠ Pemesan); Perlu tindakan items appear and clear with state; isolation between accounts.

## Notes

Makam TPU items, active Paket, the Wakaf tab and the Pemegang Hak actions are added by tickets 46, 54, 58, 38 and 39. The Berhenti read-only view is ticket 59.

## Amended (2026-09-25, email login)

_Superseded in part 2026-09-26 (ADR 0004): the email can no longer be removed or saved unverified, and email is now the only login._

- The profile email field (add, change, remove) and its "Verifikasi email" action are built in **ticket 67**. This ticket places them in the Akun Saya profile and must not rebuild them. A verified email also gives email login ("Masuk dengan email"), so login is no longer WhatsApp only. Emails go through SumoPod SMTP, not SES.

## Comments

- 2026-09-26 — ADR 0004: Akun Saya is per Akun keyed by its Email Terverifikasi; the Makam tab matches Hak Pakai / Makam TPU by recorded email, not number; the profile has the email (change only through Verifikasi email) and an editable phone. The 2026-09-25 amendment ("add, change, remove", "login no longer WhatsApp only") is superseded. Now blocked by 82.
- 2026-09-28 — Builder pass (branch `ticket-27-akun-saya`). Readings/decisions for the owner to confirm:
  - **Route shape**: split `/akun` into a layout (header + Perlu Tindakan strip + `PageTabs`, docs/design-system.md's Detail pattern) with three routed tabs — `/akun` (Profil, unchanged from tickets 67/82), `/akun/pesanan`, `/akun/makam` — rather than one page with client-side tab state, since the design system prescribes "each tab its own URL" for a multi-tab record page and the codebase's own precedent (`LokasiMitraDetailLayout`) does the same. `e2e/masuk.spec.ts`'s cold-Akun assertion was updated to visit both tabs and read their `EmptyState` guidance, since the old single-card "Belum ada pesanan." text moved.
  - **Pesanan tab scope**: "every order on the Akun" is read as both a Pemesanan Makam (Lokasi Mitra) order and a Pengurusan order (TPU) — both share one Nomor Pemesanan series (Billing's) and both already have their own order pages (`/pesanan/[nomor]`, `/pengurusan/[nomor]`, tickets 22–25 and 44–45). New public reads: `pemesanan.pesananSaya(pemesan)` and `pengurusan.pesananSaya(pemesan)`, both newest-first by `diajukanAt`. "Including CS-submitted orders attached by Nomor Pemesanan" needed no special-casing: once an order's `pemesanAccountId` names this Akun, by whatever route, it's on the list.
  - **"IPTM scan" on the order page**: named in "What to build" but IPTM filing (ticket 46/47) isn't built yet, so no TPU order carries one today. Not built here — an existing order page's own content is that ticket's, not this one's, and the Pesanan tab only links to it.
  - **Makam tab scope**: built **Hak Pakai only** (matching AC 15's own wording), not Makam TPU — the ticket's own Notes say Makam TPU items are ticket 46's. New Inventory read `inventory.makamKeluargaSaya(email)` (deliberately separate from the public `makamPemegangHak`/`cariMakam`, whose privacy-list type — `KUNCI_HASIL_CARI_MAKAM` — must not grow to carry a Hak Pakai id or a full Pemakaman list to an anonymous lookup); it returns the Hak Pakai's own id, status, end date and every `PemakamanRow` it covers (date, layer, Almarhum). "Documents" = the Bukti Pemesanan(s) of the order(s) that granted that Hak Pakai, via a new `pemesanan.buktiUntukHakPakai(hakPakaiId)` (queries `pemesanan_makam` by its own `hakPakaiId` column, Pemesanan's own table, per AGENTS.md); returns an array on purpose as an extension point for a later Ganti Pemegang Hak / Perpanjangan order under the same Hak Pakai. "Active Paket" and "past photos" (Layanan, tickets 50/53/54) are not built — named in Notes as later tickets' own slice.
  - **Perlu Tindakan registry**: `src/lib/perlu-tindakan.ts`, a pure function (`perluTindakanDariPesanan`) over a small per-order summary (`RingkasanTindakan`), composed in `src/app/(site)/akun/data.ts` (`dataAkunSaya`, wrapped in React `cache()` so the layout's strip and the Pesanan tab's list share one read). "Unpaid Tagihan" = status `belum_dibayar` or `lewat_jatuh_tempo` (not `tidak_tertagih`, which Billing has already given up chasing — a reading worth confirming). "Missing documents" only fires for a Pemesanan order (the checklist's upload state exists); a Pengurusan order always reports 0 today, since the TPU document checklist tracks no upload state yet (tickets 46/47) — this is that provider's own extension point, not a gap narrowed here. A later ticket adds Perlu Perbaikan / a consent to give the same way: one more provider into the same list.
  - Tests: `src/domain/inventory/makam-saya.test.ts` (holder ≠ Pemesan, Kavling Pemakaman list, empty/isolation), `src/domain/pemesanan/pesanan-saya.test.ts` + `src/domain/pengurusan/pesanan-saya.test.ts` (newest-first, isolation between accounts), `src/lib/perlu-tindakan.test.ts` (each item appears and clears, isolation between orders), `src/lib/makam-keluarga-content.test.ts` (the new `kartuMakamSaya` card).
  - Verification: `npx vitest run` on the touched paths — 41 files, 285 tests passed; `npm run typecheck`, `npm run lint`, `npm run build` all clean.
