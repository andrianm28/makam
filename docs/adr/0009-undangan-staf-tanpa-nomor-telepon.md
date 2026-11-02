# Undangan Staf tanpa nomor telepon: the contact number is optional for every staff role

Amends the v1 spec (user story 170; Identity & Access > Roles, the Undangan Staf rule) and the `CONTEXT.md` entries **Undangan Staf** and **Kontak Siaga**. Owner decision, 2026-11-02.

An Undangan Staf no longer needs a phone number, for every role it can carry: Admin Platform, Admin Lokasi, Petugas Lapangan and Mitra Jasa. The email is the account (ADR 0004) and the Kode Masuk by email the only login factor (ADR 0008), so the number was only ever a contact, and requiring it blocked inviting staff whose number the Admin Platform did not have yet.

- **Optional, still checked when given.** An invite with the field left empty is sent without a number. A number that is typed in is normalised and validated as before (+62 only in v1): an invalid one is still refused, never stored as typed and never silently dropped.
- **The Akun keeps its own number.** Accepting an invite with a number gives an Akun that has none that number as its contact (as before); an invite without a number leaves the Akun's number as it is. The staff member can add one later themselves.
- **Kontak Siaga needs a number.** The Kontak Siaga is the person a family phones, so an Admin Lokasi without a number cannot be picked as Kontak Siaga: the picker shows it with "belum ada nomor" and it cannot be chosen, and the domain refuses such a pick (`belum_ada_nomor`). A Lokasi Mitra still needs one Kontak Siaga, now one with a number, before it can be published.
- **Display.** The open invites list and the Akun Staf list show "–" where no number was given.

## Data

Expand only: `identity_staff_invite.phone_number` drops NOT NULL (`identity_user.phone_number` was already nullable). The running release keeps writing a number on every invite and reads it as before, so the rollout needs no contract step.
