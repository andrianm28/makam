# Denah builder: bloks, Petak Makam and Kavling Keluarga

Status: ready-for-agent
Blocked by: 12
Spec: Domain modules > 5. Inventory (Denah); story 127

## What to build

The Inventory module's Denah and the Admin Lokasi editor: bloks as rows × columns grids, each cell a Petak Makam (Nomor Makam, Jenis Makam) or a path; Kavling Keluarga (Nomor Kavling) as fixed groups of adjacent cells; an optional site-plan photo per blok (FileStore). The editor is mobile-usable. New Petak are created with the Perlu Verifikasi flag (cleared in ticket 14).

## Acceptance criteria

- [ ] An Admin Lokasi can create a blok with a size, mark cells as Petak or path, set Nomor Makam and Jenis Makam per Petak.
- [ ] Nomor Makam is unique within the Lokasi; Nomor Kavling is unique within the Lokasi.
- [ ] A Kavling Keluarga groups only adjacent Petak cells; it can be split only while it has no Hak Pakai.
- [ ] Every new Petak starts with Perlu Verifikasi set.
- [ ] A Petak with a Hak Pakai or Pemakaman can't be deleted or moved (rule enforced in the domain, even though Hak Pakai arrive in later tickets).
- [ ] A site-plan photo can be attached per blok and viewed by signed URL.
- [ ] All edits are audited.
- [ ] Tests: adjacency rule for kavling; kavling split blocked once a Hak Pakai exists; no delete/move after use; uniqueness of numbers.
