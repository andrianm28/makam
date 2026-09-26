# A WhatsApp number is the account, for every role

**Status: superseded by ADR 0004 (2026-09-26): an Email Terverifikasi is the account; no WhatsApp channel in v1.**

Every account on makam.co.id is keyed by one WhatsApp number, and a WhatsApp OTP is the only login method for every role: Pemesan, Admin Lokasi, Petugas Lapangan, Mitra Jasa and Admin Platform, who must also use a TOTP authenticator. A Pemesan never signs up: the OTP at the end of the booking wizard verifies the number and creates the account at the same moment. We chose this over guest checkout (typos and fake orders would break the 2-hour Saat Duka confirmation and the invoice) and over email or Google login (a second identity to merge with the phone number, for families who mostly live on WhatsApp). Keying accounts by number also lets a Hak Pakai show up in its Pemegang Hak's account by matching the number recorded on it, and a logged-in holder skips the separate Pemegang Hak OTP. See `.scratch/makam-v1/issues/11-roles-and-accounts.md`.

## Consequences

- A WhatsApp delivery outage would block every login, so "Notification channels and WhatsApp provider" adds an SMS OTP fallback (a "Kirim lewat SMS" button after about 60 s) for every role.
- Changing a number is an admin action: the Admin Lokasi changes the number on a Hak Pakai, and Admin Platform moves a Pemesan's account to a new number, each after a KTP check and recorded in the audit log. There is no self-service recovery.
- One person has one number, so they have one account, which can hold several roles.

## Amendment (2026-09-25)

SMS is removed from v1 (Zenziva is dropped). The first consequence above changes: the OTP fallback after about 60 s is **email OTP through SES** ("Kirim lewat email"), offered only for an account that already has an email on record. Every staff invite (Admin Platform, Admin Lokasi, Petugas Lapangan, Mitra Jasa) requires an email, so every staff account has the fallback. A Pemesan with no email has no fallback and is pointed to the CS WhatsApp number. The WhatsApp number is still the account and the only identity; the email only carries a code for the account it is recorded on. Admin Platform TOTP is unchanged.

## Amendment (2026-09-25, later): email login

The user decided that the WhatsApp OTP is no longer the only login. This amends the first sentence above ("the only login method for every role") and the amendment before this one (email only as a fallback after about 60 s). The original reasoning still holds for identity: we still reject email as a second identity to merge, and email only opens an Akun that WhatsApp already created.

- **Email login for every role.** Any Akun with an **Email Terverifikasi** may log in with a 6-digit Kode Masuk sent to that email, as an equal alternative that the user may choose at any time from the "Masuk dengan email" link, not only as a fallback. This covers the Pemesan and every staff role. Why: a WhatsApp outage, a phone left at home, or a staff member at a desk should not block login, and a proven email is safe to trust for an Akun that already exists.
- **Same rules as the WhatsApp code.** Expiry 10 min; the 5th wrong code burns it; resend after 60 s; at most 5 per rolling hour; lockout after 10 wrong codes in 60 min. Limits are counted per email and per IP. Like the WhatsApp code, the email code is sent directly by Identity & Access, not through Notifications: no message-log entry and no automatic retries.
- **Verified means proven.** An email becomes an Email Terverifikasi only when a code sent to it is entered: through "Verifikasi email" in the Akun Saya profile or the staff area, or on the first successful email login. An email that has only been typed in (on an order, or by Admin Platform on an Undangan Staf) is not verified, and email login is not offered for it. This replaces "every staff invite requires an email, so every staff account has the fallback": staff still give an email at invite, but must verify it before they can log in with it.
- **One Akun per verified email.** Verifying an email that is already verified on another Akun is refused; Admin Platform resolves such cases through CS.
- **No account enumeration.** For an unknown or unverified email, Masuk shows the same reply as for success: "Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim."
- **The 60 s fallback is the same feature.** "Kirim lewat email" about 60 s after a WhatsApp code sends the same email Kode Masuk under the same verified-email rule. A Pemesan without an Email Terverifikasi is still pointed to the CS WhatsApp number.
- **Staff.** An Admin Platform who logs in by email must still pass TOTP. Session rules are unchanged: 12 h for any Akun holding Admin Platform, 30 days for other staff, 90 days for a Pemesan.

**Unchanged:** the WhatsApp number (+62) is still the Akun's key and its only identity. New Akun are created only through a WhatsApp Kode Masuk (at Kirim in a wizard or on Masuk); an email login never creates an Akun. Pindah Nomor, the Pemegang Hak number match and "no self-service recovery" are unchanged. Email login is not a way to recover a lost number.
