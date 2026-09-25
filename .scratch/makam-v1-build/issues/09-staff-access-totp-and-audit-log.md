# Staff access: roles, invites, TOTP and the Audit Log

Status: ready-for-agent
Blocked by: 08
Spec: Domain modules > 1. Identity & Access; 2. Audit Log; stories 167, 168, 170, 184

## What to build

Add staff roles to Identity & Access (Admin Lokasi, Admin Platform, Petugas Lapangan, Mitra Jasa; one account may hold many), invite-only staff onboarding, a CLI command that seeds the first Admin Platform, TOTP for Admin Platform on top of the OTP, and the staff area as a separate section of the app with a role switcher. Build the Audit Log module that records every staff write, and use it from the first staff actions here: invite, deactivate, and moving a Pemesan's account to a new number after a KTP check.

## Acceptance criteria

- [ ] `pnpm seed:admin <phone>` (or equivalent) creates the first Admin Platform; there is no other way to create one without an invite.
- [ ] Admin Platform can invite staff by WhatsApp number with a role; the invitee logs in by OTP and gets the role.
- [ ] Admin Platform must enrol and pass TOTP after the OTP; its session lasts 12 h. Other staff sessions last 30 days on a trusted device.
- [ ] Admin Platform can deactivate any staff account; the account's history (orders, audit entries) remains.
- [ ] The staff area has a role switcher for accounts holding several roles; each role sees only its own menu.
- [ ] Admin Platform can move a Pemesan's account to a new number after uploading/confirming a KTP check (file via FileStore), audited with the reason.
- [ ] Every staff write goes through an audit helper recording actor, role, time, entity, before/after and reason; reads are not logged.
- [ ] The authorisation check denies Mitra Jasa and Petugas Lapangan any audit log read.
- [ ] Tests: TOTP required for Admin Platform; 12 h vs 30-day session expiry with the fake Clock; invite → role granted; deactivation blocks login; account move keeps history; every staff write in this ticket produces an audit entry.

## Notes

The Lokasi-scoped audit view for Admin Lokasi is ticket 10. See `.scratch/makam-v1/issues/11-roles-and-accounts.md` if role details are needed. The spec doesn't say which session length applies to an account holding Admin Platform plus other roles (see 00-index).
