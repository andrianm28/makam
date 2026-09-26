# Petak clearing, derived status and availability

Status: ready-for-agent
Blocked by: 13
Spec: Domain modules > 5. Inventory (Petak status, Kavling status, availability, Hak Pakai basics, Perlu Verifikasi, renumbering); stories 128, 169

## What to build

Let the Admin Lokasi clear new Petak blok by blok: Tersedia; Tidak Tersedia with a reason; or occupied, recording a minimal Hak Pakai / Almarhum or "data menyusul". This introduces the Hak Pakai entity (1..n Petak, one Pemegang Hak with name + phone number, email when known, and holder history, start/end date, status Aktif / Kedaluwarsa / Berakhir / Dibatalkan, Perlu Verifikasi flag) and the Pemakaman record (Almarhum, date, Petak, layer). Derive Petak and Kavling Keluarga status and expose the availability count per Jenis Makam that the listings use. Admin Platform can renumber a Petak, audited.

## Acceptance criteria

- [ ] Petak status is derived, never stored as a free field: Tersedia / Dipesan / Terisi / Masa Berlaku Habis / Tidak Tersedia (manual, with reason, only without an active Hak Pakai), plus the Perlu Verifikasi flag.
- [ ] A Petak with Perlu Verifikasi is not assignable or sellable until cleared.
- [ ] Clearing "occupied" with "data menyusul" creates a Hak Pakai flagged Perlu Verifikasi; an empty end date does not mean perpetual unless the Jenis Makam is perpetual.
- [ ] Kavling Keluarga status is derived: Tersedia / Dipesan / Terpakai sebagian / Penuh.
- [ ] Availability = count of cleared Tersedia units per Jenis Makam per Lokasi, a Kavling Keluarga counting as one.
- [ ] The Hak Pakai end date is empty for a perpetual Jenis Makam; otherwise the tenure clock starts at the first Pemakaman and a tumpang doesn't reset it.
- [ ] The Pemegang Hak is never the Almarhum (validation).
- [ ] Only Admin Platform renumbers a Petak; renumbering is audited with the old and new number. The old Nomor Makam is kept as a hidden alias: lookups by it (Perpanjangan, Makam keluarga hub, Admin Lokasi search) still find the Petak; aliases are never displayed, only in the audit log.
- [ ] Tests: derived Petak / kavling status for each case; Perlu Verifikasi gating; availability counts; tenure clock from the first Pemakaman; renumber restricted and audited; lookup by an old number finds the Petak while showing only the current number.

## Notes

The "Petak Perlu Verifikasi" Antrean Lokasi row is added in ticket 23 when the Antrean Lokasi exists. Excel import is deferred (Further Notes); this clearing flow is how records get in.

## Comments

- 2026-09-26 — ADR 0004: the Pemegang Hak record holds a phone number and, when known, an email (not a WhatsApp number). A Hak Pakai shows in the Akun whose Email Terverifikasi equals the recorded email; "data menyusul" may leave both empty (Perlu Verifikasi).
