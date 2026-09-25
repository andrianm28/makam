# Akun Saya: Perlu tindakan, Pesanan and Makam tabs

Status: ready-for-agent
Blocked by: 25
Spec: Solution (Akun Saya); Domain modules > 1. Identity & Access; ADR 0003; stories 98, 99, 100, 101

## What to build

Akun Saya for any logged-in number: a Perlu tindakan strip, a Pesanan tab with every order from the number (newest first, each order page holding its Tagihan, Bukti, IPTM scan and actions), and a Makam tab (Makam Keluarga) with every Hak Pakai and Makam TPU whose Pemegang Hak number matches the account, even ones someone else ordered, each with its Pemakaman, active Paket, past photos and documents. Build the tabs as extension points that later tickets add items to.

## Acceptance criteria

- [ ] Masuk works cold (ticket 08) and shows empty tabs with guidance for a number with nothing recorded.
- [ ] Pesanan lists every order where the account is the Pemesan, newest first; each links to its order page with Tagihan, Bukti and actions.
- [ ] Makam lists every Hak Pakai where the Pemegang Hak number equals the account's number, including Hak Pakai from orders placed by someone else; each shows Lokasi, Petak / Kavling, status, end date, Pemakaman list and documents.
- [ ] Perlu tindakan shows, where present: unpaid Tagihan; missing documents; an alternative to accept; (later: Perlu Perbaikan, a consent to give) through a registry other tickets add to.
- [ ] Documents listed in Akun Saya open by their unguessable links.
- [ ] A profile section lets the user add, change or remove the optional email used only for copies of Tagihan / Bukti documents via SES.
- [ ] A user sees only their own orders and graves (authorisation check).
- [ ] Tests: number-matching Makam tab (holder ≠ Pemesan); Perlu tindakan items appear and clear with state; isolation between accounts.

## Notes

Makam TPU items, active Paket, the Wakaf tab and the Pemegang Hak actions are added by tickets 46, 54, 58, 38 and 39. The Berhenti read-only view is ticket 59.
