# Roles, accounts and access

Type: grilling
Status: resolved
Map: ../map.md

## Question

Must a Pemesan create an account, or can they check out as a guest (important for a grieving family in a rush)? How do they log in (WhatsApp OTP, email, Google)? What can Admin Lokasi and Admin YIEM see and do, and can one Admin Lokasi handle several Lokasi Makam?

Context from "YIEM's current assets and records": two more roles now exist. **Petugas YIEM** (YIEM field staff doing in-person Pengurusan) and **Mitra Jasa** (individual service providers at TPU; minimal mobile account to see jobs, upload photo proof, mark done). Admin Lokasi exists only for Lokasi Mitra; Admin YIEM onboards partners manually and invites Admin Lokasi.

Context from "How Perpanjangan verifies the Pemegang Hak": proof of being the Pemegang Hak is a WhatsApp OTP to the number recorded on the Hak Pakai, independent of how the Pemesan logs in; the Admin Lokasi reviews KTP / heirship / claim documents; Admin YIEM reviews TPU documents and files as proxy.

## Answer

Decided with the user on 2026-09-25 (grilling). ADR: [0003 A WhatsApp number is the account](../../../docs/adr/0003-phone-number-is-the-account.md).

**Pemesan: no signup, verify on submit**

- No guest checkout and no signup form. At "Data & kirim" → Kirim, a **WhatsApp OTP** verifies the Pemesan's number and silently creates or logs into an account keyed by that phone number. No password.
- **WhatsApp OTP is the only login method** in v1 (no Google, no email login). An optional email on the order is only for receiving invoices. When WhatsApp delivery fails, an SMS OTP fallback applies (settled in "Notification channels and WhatsApp provider").
- **Akun Saya** shows "Pesanan saya" (orders placed from this number) and "Makam yang saya pegang" (every Hak Pakai whose recorded Pemegang Hak WhatsApp equals the login number, even if someone else ordered it), with Perpanjangan and Layanan actions.
- When the logged-in number equals the number on the Hak Pakai, the separate Pemegang Hak OTP of "How Perpanjangan verifies the Pemegang Hak" is skipped: the login OTP already proves it.
- Only the Admin Lokasi can change the WhatsApp number on a Hak Pakai, after a KTP check, audit-logged. The Pemegang Hak cannot change it themselves.
- Lost number: Admin YIEM moves the account to a new number after a KTP check against the order data, audit-logged. No self-service recovery.
- No shared family access in v1: only the Pemesan (and the Pemegang Hak, once the Hak Pakai exists) sees an order.

**Staff: invite-only, same login**

- Admin Lokasi, Admin YIEM, Petugas YIEM and Mitra Jasa are invited by Admin YIEM; the first Admin YIEM is seeded from the CLI.
- Everyone logs in with WhatsApp OTP; **Admin YIEM additionally requires a TOTP authenticator** (they change bank accounts, record Pencairan, approve refunds).
- Petugas YIEM and Mitra Jasa use the same responsive web app on their phones (installable PWA), no native app.
- **One person = one account (one number) with any number of roles**; the staff area is a separate section with a role switcher. Holding the Admin YIEM role always requires TOTP.
- Sessions: Pemesan 90 days; staff 30 days on a trusted device; Admin YIEM 12 hours. Admin YIEM can deactivate any staff account; history is kept.

**Admin Lokasi**

- Many-to-many: one person can administer several Lokasi Mitra (Lokasi switcher); a Lokasi can have several Admin Lokasi, all with equal rights over that Lokasi only.
- Only Admin YIEM changes a partner's bank account, its tariffs (from the partnership agreement), and who its Admin Lokasi are.

**Admin YIEM**

- One role in v1, no finance/ops split. Every Admin YIEM action touching money or a Hak Pakai goes to an **audit log** (who, when, before/after).

**Who sees the family's data**

- Admin Lokasi: the Pemesan's name and WhatsApp, the Almarhum and documents, for their own Lokasi's orders only.
- Petugas YIEM: the documents of the Pengurusan cases assigned to them.
- Mitra Jasa: only the job (grave location or description, Layanan, target date, reference photos), never the Pemesan's name or number. They contact the family through a **message thread per Pekerjaan Layanan** (text + photos). The Pemesan is notified by WhatsApp with a link to reply; Admin YIEM can read every thread and step in; the thread closes when the Keluhan window (3×24 h after the photo proof) ends.
