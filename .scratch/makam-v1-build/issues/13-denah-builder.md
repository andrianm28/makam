# Denah builder: bloks, Petak Makam and Kavling Keluarga

Status: ready-for-agent
Blocked by: 12, 74
Spec: Domain modules > 5. Inventory (Denah); story 127

## What to build

The Inventory module's Denah and the Admin Lokasi editor: bloks as rows × columns grids, each cell a Petak Makam (Nomor Makam, Jenis Makam) or a path; Kavling Keluarga (Nomor Kavling) as fixed groups of adjacent cells; an optional site-plan photo per blok (FileStore). The editor is mobile-usable. New Petak are created with the Perlu Verifikasi flag (cleared in ticket 14).

## Acceptance criteria

- [ ] **Prototype first** (decided 2026-09-26): after ticket 74 merges, a throwaway prototype of the editor on the new shell (desktop and phone) for the user to react to (mattpocock-skills:prototype); its decisions are recorded here before the build.
- [ ] Three cell types: Petak Makam, Jalan, Bukan Petak. A new Blok (name unique per Lokasi, rows × columns) starts with every cell a Petak, numbered from an editable pattern prefixed with the Blok name (`A-01` …), each number editable.
- [ ] Bulk editing: select many cells (drag on desktop, tap-select mode with a bottom action bar on phones) to make them Jalan / Bukan Petak, set Jenis Makam, renumber, or make a Kavling Keluarga; the grid pinch-zooms and pans on phones; tapping a cell opens its detail panel.
- [ ] A Kavling Keluarga is at least 2 Petak connected by edges (not diagonals) within one Blok, has its own Jenis Makam and a pre-filled, editable Nomor Kavling (`A-K01`).
- [ ] Rows/columns can be added at any edge and removed only when none of their Petak was ever used; a used Petak can't become another cell type.
- [ ] Until the S3 FileStore exists (ticket 60), staging shows "Unggah foto belum tersedia" instead of the upload; tests use the in-memory FileStore; nothing is stored on the host disk.

- [ ] An Admin Lokasi can create a blok with a size, mark cells as Petak or path, set Nomor Makam and Jenis Makam per Petak.
- [ ] Nomor Makam is unique within the Lokasi; Nomor Kavling is unique within the Lokasi.
- [ ] A Kavling Keluarga groups only adjacent Petak cells; it can be split only while it has no Hak Pakai.
- [ ] Every new Petak starts with Perlu Verifikasi set.
- [ ] A Petak with a Hak Pakai or Pemakaman can't be deleted or moved (rule enforced in the domain, even though Hak Pakai arrive in later tickets).
- [ ] A site-plan photo can be attached per blok and viewed by signed URL.
- [ ] All edits are audited.
- [ ] Tests: adjacency rule for kavling; kavling split blocked once a Hak Pakai exists; no delete/move after use; uniqueness of numbers.

## Comments

- 2026-09-26 — Now also blocked by 74 (user decision): build the UI on the brand design system and staff shell from ticket 74 (spec, "Staff UI and design system").
