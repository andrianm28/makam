# Pemesanan Saat Duka wizard at a Lokasi Mitra

Status: resolved
Blocked by: 16, 82
Spec: Domain modules > 6. Pemesanan (Saat Duka); Public site > Booking wizards; stories 17, 18, 20, 21, 22, 24, 25, 26, 28

## What to build

The Pemesan's Saat Duka path, prototype 18 variant D: one decision per screen, a progress bar with back, a sticky total bar and no review screen. Screen 1 "Pilih makam": one list of Lokasi Mitra × Jenis Makam cards sorted by all-in total, filtered by city (prefilled from the last choice), only cards with Tersedia units, each with its count; outside Jam Operasional the card says when confirmation will come and shows the Kontak Siaga. Screen 2 "Data & kirim": Pemesan name, email and phone number, Almarhum name + date of death, optional planned burial time and placement wish, Pemegang Hak defaulting to "Saya sendiri" (else name + phone number, and email if known), the note that nothing is paid now and documents can follow, and the email Kode Masuk at Kirim that verifies the email and creates the Akun (ticket 82), with "Tidak punya email? Minta bantuan CS" below it. Submission creates the order in the Pemesanan module (status Diajukan, Nomor Pemesanan) and shows a status timeline with the computed confirmation deadline.

## Acceptance criteria

- [ ] Cards use `quote()` for the all-in total (Harga Hak Pakai + Biaya Pemakaman + Biaya Layanan Platform) and hide Jenis Makam with 0 cleared Tersedia units; the count is shown.
- [ ] Only Terverifikasi Lokasi appear; the Lokasi page deep link preselects the Lokasi.
- [ ] The sticky bar shows "Total semua biaya" and expands to the itemised lines.
- [ ] Outside Jam Operasional the card shows the confirmation time from the working-time calculator (2 service hours) and the Kontak Siaga's name and number.
- [ ] Kirim sends a Kode Masuk to the typed email (ticket 82; a logged-in Pemesan skips it); on success the Akun of that email exists and is logged in. Below it, "Tidak punya email? Minta bantuan CS" opens the `wa.me` link to the CS WhatsApp number and shows the CS phone (Pengaturan Operator, ticket 63). _(Amended 2026-09-26, ADR 0004; was the WhatsApp OTP with the "Kirim lewat email" fallback.)_
- [ ] The order gets a Nomor Pemesanan `MKM-YYYY-NNNNNN` and status Diajukan; the order page shows the timeline and "dikonfirmasi paling lambat <waktu>".
- [ ] The Pemegang Hak defaults to the Pemesan and can never be the Almarhum.
- [ ] Nothing is billed at submission (no Tagihan exists).
- [ ] "Data & kirim" has a required email field and a phone field. The email is proven by the Kode Masuk and is the Akun's Email Terverifikasi; every family message goes there (ticket 20). The phone is saved as an unverified contact. _(Amended 2026-09-26, ADR 0004; was an optional email for copies.)_
- [ ] Tests: domain test for submission (order, Nomor Pemesanan, deadline from Jam Operasional, no Tagihan); list filtering by Tersedia and city; a Playwright pass through both screens with the fake email outbox.

## Notes

The TPU section below the cards is ticket 44; hari-H Layanan at checkout is ticket 53; the same email field (required since 2026-09-26, ADR 0004) is on the Terencana (36), TPU (44), Perpanjangan (40) and standalone Layanan (50) checkouts and in the Akun Saya profile (27).

## Amended (2026-09-25, decided with the user)

- [ ] ~~When the OTP cannot be delivered (WhatsApp outage) and the number has no account with an email, the screen shows the CS WhatsApp and phone contact; Admin Platform can submit the Saat Duka order on the family's behalf from the back office (audited, reason "diajukan oleh Admin Platform"), attaching the family's number unverified until their first successful login.~~ (removed 2026-09-26, ADR 0004). Replaced by: CS / Admin Platform can submit the Saat Duka order on the family's behalf from the back office (audited, reason "diajukan oleh CS"), with or without an Akun (a contact number only); CS shares its document links by hand. When the family later has an Email Terverifikasi, CS attaches the order to that Akun by its Nomor Pemesanan (audited).

## Amended (2026-09-25, email login)

_Superseded 2026-09-26 (ADR 0004): this whole section; the email on "Data & kirim" is now required and proven by the Kode Masuk at Kirim, and there is no fallback._

- The email typed on "Data & kirim" is stored **unverified**. It gets Tagihan / Bukti copies through SumoPod SMTP (SES is dropped), but it never enables the "Kirim lewat email" fallback or email login until the Pemesan verifies it ("Verifikasi email" in Akun Saya, ticket 67). The fallback is offered only for an Email Terverifikasi of the number's existing Akun, and it comes from ticket 67, not ticket 60.
- In the WhatsApp-outage criterion above, "no account with an email" means "no Akun with an Email Terverifikasi".

## Comments

- 2026-09-27 — Built on branch `ticket-22-saat-duka-wizard`. Module `src/domain/pemesanan` (owns `pemesanan_makam`): `pilihanSaatDuka()` and `placeSaatDuka()` + `orderOf()`; the Nomor Pemesanan comes from Billing's own MKM series inside the order's transaction, so nothing is numbered twice. Wizard at `/pesan-makam/saat-duka` (Pilih makam → Data & kirim) and the order at `/pesanan/[nomor]`; migration `0017_pemesanan_makam.sql`. **For ticket 20**: the one integration point is `PemesananNotifikasi` (`pemesananDiajukan`), wired in `src/composition/pemesanan.ts` to a documented no-op until Notifications has a family message — pass the runtime's `notifications` there and nothing else in the wizard changes. Also new: `inventory.tersediaPerJenisMakam()`, `lokasi.bukaSekarang()`, the Kontak Siaga's and Admin Lokasi's `name`, `KodeMasukForm`'s optional `defaultEmail`, and the dev-only `seed-saat-duka` CLI (e2e) that gives a stack one Terverifikasi Lokasi Mitra with cleared Tersedia Petak.
- 2026-09-26 — Decided with the user: variant D of prototype 18 stays the flow; only its styling is new (brand tokens, Plus Jakarta Sans, Forest primary buttons on Ivory, no Lora), settled in the public prototype (ticket 26) before the build.
- 2026-09-26 — ADR 0004: Data & kirim asks for email (required) and phone; Kirim sends an email Kode Masuk that creates or logs into the Akun; "Tidak punya email? Minta bantuan CS" replaces the WhatsApp-outage pointer; CS / Admin Platform may submit on the family's behalf, possibly with no Akun, and attach the order later by Nomor Pemesanan. Now blocked by 82. The same email field rule applies to 36, 40, 44 and 50.
- 2026-09-26 — Decided with the user from the public prototype (https://claude.ai/artifact/SYuh5fzc8TjkWQ5aoecYiF, branch worktree-agent-ab5e1eadecba063e3, commit 3607d88): the wizard header keeps only the logo and "Tanya CS" (no site menu or footer); on Pilih makam the primary action sits in the sticky bar, on Data & kirim Kirim sits at the end of the form after the "belum ada yang dibayar" note; the Kode Masuk step opens inline under the form (no separate screen); cards of a Lokasi with more than one Jenis Makam are grouped per Lokasi with the out-of-hours notice and Kontak Siaga shown once per Lokasi, Lokasi ordered by their cheapest all-in total; the city filter defaults to "Semua kota" for a first-time visitor (last choice or the deep-linked Lokasi's city otherwise).
- 2026-09-26 — User decision (supersedes the same-day manual-transfer note): v1 takes no order whose Tagihan would exceed Rp 10.000.000 (QRIS cap); see spec, Billing. The Saat Duka list hides Jenis Makam whose all-in total exceeds it.
