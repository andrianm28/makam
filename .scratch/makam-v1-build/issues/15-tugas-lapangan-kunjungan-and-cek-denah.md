# Tugas Lapangan, Kunjungan Verifikasi and Cek Denah

Status: ready-for-agent
Blocked by: 13
Spec: Domain modules > 13. Field Work; Data and privacy; stories 12 (visit photos), 153, 173, 174, 175

## What to build

The Field Work module: Admin Platform creates and assigns a Tugas Lapangan (subject, address + pin, planned date, one Petugas Lapangan, a type-specific form with required uploads). Petugas Lapangan get a mobile "Tugas saya" list and can mark a task Selesai only once its required uploads are in. Implement the types Kunjungan Verifikasi (confirms address, pin, facilities, photos) and Cek Denah (spot-check of the Denah); leave hooks for Ambil surat pengantar, Berkas IPTM and Survei Wakaf (tickets 45, 46, 58).

## Acceptance criteria

- [ ] Admin Platform can create any Tugas Lapangan type and assign it to one Petugas Lapangan; the Petugas gets a WhatsApp alert (through the WhatsAppSender fake) for each assignment.
- [ ] "Tugas saya" shows address, pin (Leaflet), planned date and the type-specific form, and works on a phone.
- [ ] Selesai is rejected while any required upload is missing.
- [ ] A completed Kunjungan Verifikasi updates the Lokasi's pin, visit photos, facilities checklist and "dikunjungi" date.
- [ ] A completed Cek Denah is recorded on the Lokasi as the input to the Terencana switch (ticket 16).
- [ ] A Petugas Lapangan sees only the documents of cases assigned to them; no audit log.
- [ ] Admin Platform can order a Lokasi revisit (a new Kunjungan Verifikasi) ad hoc.
- [ ] Tests: Selesai gated on uploads per type; Kunjungan Verifikasi updates the Lokasi; Petugas visibility limited to assigned cases.
