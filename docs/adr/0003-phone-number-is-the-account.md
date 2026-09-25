# A WhatsApp number is the account, for every role

Every account on makam.co.id is keyed by one WhatsApp number, and a WhatsApp OTP is the only login method for every role: Pemesan, Admin Lokasi, Petugas Lapangan, Mitra Jasa and Admin Platform, who must also use a TOTP authenticator. A Pemesan never signs up: the OTP at the end of the booking wizard verifies the number and creates the account at the same moment. We chose this over guest checkout (typos and fake orders would break the 2-hour Saat Duka confirmation and the invoice) and over email or Google login (a second identity to merge with the phone number, for families who mostly live on WhatsApp). Keying accounts by number also lets a Hak Pakai show up in its Pemegang Hak's account by matching the number recorded on it, and a logged-in holder skips the separate Pemegang Hak OTP. See `.scratch/makam-v1/issues/11-roles-and-accounts.md`.

## Consequences

- A WhatsApp delivery outage would block every login, so "Notification channels and WhatsApp provider" adds an SMS OTP fallback (a "Kirim lewat SMS" button after about 60 s) for every role.
- Changing a number is an admin action: the Admin Lokasi changes the number on a Hak Pakai, and Admin Platform moves a Pemesan's account to a new number, each after a KTP check and recorded in the audit log. There is no self-service recovery.
- One person has one number, so they have one account, which can hold several roles.
