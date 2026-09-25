# Lokasi Mitra onboarding record and Admin Lokasi invites

Status: ready-for-agent
Blocked by: 09
Spec: Domain modules > 3. Lokasi; 1. Identity & Access (Admin Lokasi); 2. Audit Log (Lokasi view); Public site > Map / pin provider; stories 137, 138, 150 (record, bank, policies, checklist, invites)

## What to build

The Lokasi module's Lokasi Mitra record and the Admin Platform onboarding screens: pengelola name, address, pin, city (kota/kab), agreement scan and date, bank account (Admin Platform only), facilities checklist + note, document checklist, policies and flags, and status (starts Belum Tayang). Admin Platform invites Admin Lokasi to a Lokasi by WhatsApp number and required email (ticket 09) (many-to-many, all equal); an account with several Lokasi gets a Lokasi switcher. Build the Leaflet + OpenStreetMap pin component (display and draggable entry, behind a small wrapper so tiles can be swapped) and the first FileStore upload flow (agreement scan, signed URLs). Add the audit log view queried by Lokasi for Admin Lokasi.

## Acceptance criteria

- [ ] A new Lokasi Mitra has status Belum Tayang; statuses Terverifikasi / Ditangguhkan / Berhenti exist but are set by later tickets.
- [ ] The document checklist defaults to: death certificate from the RS / Puskesmas; death report letter from the Lurah or RT/RW; KTP + KK of the Almarhum and of the Pemesan; editable per Lokasi.
- [ ] Policies with defaults: Masa Tenggang 3 months; max Perpanjangan terms K = 1; Terencana hold 24 h; Saat Duka payment window 3×24 h; Masa Pembatalan 7 days; later refund 0%; transfer fee (collected offline).
- [ ] Flags: "Pemesanan Terencana aktif" (off), boleh tumpang (min years, max layers), tumpang on released plots allowed, sale transfers forbidden (inheritance transfers always allowed).
- [ ] Only Admin Platform can change the bank account and which Admin Lokasi a Lokasi has; an Admin Lokasi attempt is rejected by the authorisation check.
- [ ] Files are uploaded to the FileStore port and viewed only through short-lived signed URLs.
- [ ] Admin Lokasi with several Lokasi switch between them; every Admin Lokasi screen is scoped to the current Lokasi.
- [ ] Admin Lokasi sees the audit log for its Lokasi, including Admin Platform's changes to tariffs, bank account and status, with Catatan Internal and Antrean claims hidden.
- [ ] Tests: defaults; bank account change restricted to Admin Platform and audited; Admin Lokasi scoping (cannot read another Lokasi); audit view filter.
