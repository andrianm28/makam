# Saat Duka Kirim by a signed-in Pemesan does nothing visible

Status: in-progress
Blocked by: —
Spec: spec.md (makam-v1), Public site — Pilih makam / Data & kirim

## What to build

Found in the staging UAT on 2026-10-02. In the Saat Duka wizard at a Lokasi Mitra, a Pemesan who is already signed in presses "Kirim pesanan". The Server Action places the order (`{status: "selesai", nomor}`; MKM-2026-000004 was created), but the form only disables the button: no navigation and no message. The family sees nothing and may submit again. The no-session path already lands on the order page (server redirect to `pesananPath`), as do the Terencana wizard and the TPU form.

## Acceptance criteria

- [ ] After a successful Kirim, a signed-in Pemesan lands on `/pesanan/<nomor>`, exactly like the no-session path.
- [ ] A refused Kirim or one that needs a Kode Masuk stays on the form, unchanged.
- [ ] A test fails before the fix and passes after.

## Comments

- 2026-10-02 — Filed from the UAT (orchestrator). Branch `fix/saat-duka-kirim-masuk`.
