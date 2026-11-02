# Permintaan Kedukaan: domain

Type: task
Status: ready-for-agent
Spec: ../spec.md (stories 3–6; Rules)

## Acceptance criteria

- [ ] Filing per jenis validates its own fields; a bad phone or a missing per-jenis field is refused and nothing is kept.
- [ ] A filed Permintaan gets a unique Nomor Permintaan, status Diajukan, and a confirmation email to the Akun's Email Terverifikasi.
- [ ] The family lists its own Permintaan only, and cancels only while Diajukan.
- [ ] Admin Platform moves Diajukan → Dihubungi → Selesai, or cancels with a reason; anyone else is refused; final states cannot move; each move is audited and emails the family.
