# An Email Terverifikasi is the account; no WhatsApp channel in v1

Supersedes ADR 0003 ("A WhatsApp number is the account") and its amendments. User decision, 2026-09-26.

v1 sends nothing through WhatsApp. The WhatsApp Business API (Meta and the kirim.dev reseller) is taken out of v1: its approval, message templates, per-message cost and vendor dependency weighed more than its reach, and it sat on the launch path. The `WhatsAppSender` port, its adapters and the WhatsApp Kode Masuk are removed rather than kept idle; a later version that wants WhatsApp builds the port again from the ports/adapters pattern. Tickets 05 and 62 leave v1.

Without WhatsApp a phone number can no longer be proven, so **an Akun is keyed by its Email Terverifikasi**. An Akun is created by a Kode Masuk sent to an email (at Kirim in a wizard, or on Masuk), and logged into the same way; every role, Admin Platform still with TOTP. The phone number stays on the Akun as a required contact that is never verified and never logs anyone in. We chose this over an unverified phone key (anyone could claim a number, so a Hak Pakai could no longer be matched by it) and over bringing SMS OTP back (another vendor, dropped on 2026-09-25). The reasoning of ADR 0003 against guest checkout still holds: the Kode Masuk at Kirim proves the email, which also catches typos.

## Consequences

- **Families without email** are the accepted risk. The Kirim screen offers "Tidak punya email? Minta bantuan CS", which opens a `wa.me` link to the Operator's CS number (a person answering in the WhatsApp Business app; no API) and shows the CS phone. CS / Admin Platform may submit the order on the family's behalf (audited); such an order may have no Akun, only a contact number, and CS shares its document links by hand. When the family later verifies an email, CS attaches the order to that Akun by its Nomor Pemesanan.
- **Hak Pakai** record the Pemegang Hak's phone and, when known, email. A Hak Pakai shows in the Akun whose Email Terverifikasi equals the recorded email; the Perpanjangan OTP path sends its code to that email, and a logged-in holder with that email skips it. With no recorded email, the manual KTP / heir / claim paths apply.
- **Notifications** to families go by email; when a family must act and email is not enough (a Saat Duka Tagihan overdue, a Hak Pakai nearing its end, a declined order), a "Telepon Pemesan" row in the Antrean has a person call. The chain is email, then a call row.
- **Peringatan Staf** go by web push to every Perangkat Push and by email. An Admin Platform can turn Bertugas on only with at least one active Perangkat Push. Unanswered Tier 1 alerts still escalate, with a call row in the Admin Platform Antrean.
- **Undangan Staf** are addressed to an email (phone as contact) and are accepted when the Akun with that Email Terverifikasi next logs in.
- **Pindah Nomor is replaced by Pemulihan Akun**: Admin Platform moves an Akun to a new email after a KTP check, for someone who lost access to their email, audited. The phone number is self-editable in Akun Saya.
- **Email deliverability is now critical**: the live SumoPod SMTP adapter (ticket 68) is a launch requirement.
- The CS WhatsApp number in Pengaturan Operator stays, used only for `wa.me` links and display.
