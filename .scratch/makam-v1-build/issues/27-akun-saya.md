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
