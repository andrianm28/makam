# Denah builder: bloks, Petak Makam and Kavling Keluarga

Status: resolved
Blocked by: 12, 74
Spec: Domain modules > 5. Inventory (Denah); story 127

## What to build

The Inventory module's Denah and the Admin Lokasi editor: bloks as rows × columns grids, each cell a Petak Makam (Nomor Makam, Jenis Makam) or a path; Kavling Keluarga (Nomor Kavling) as fixed groups of adjacent cells; an optional site-plan photo per blok (FileStore). The editor is mobile-usable. New Petak are created with the Perlu Verifikasi flag (cleared in ticket 14).

## Acceptance criteria

- [x] **Prototype first** (decided 2026-09-26): after ticket 74 merges, a throwaway prototype of the editor on the new shell (desktop and phone) for the user to react to (mattpocock-skills:prototype); its decisions are recorded here before the build.
- [x] Three cell types: Petak Makam, Jalan, Bukan Petak. A new Blok (name unique per Lokasi, rows × columns) starts with every cell a Petak, numbered from an editable pattern prefixed with the Blok name (`A-01` …), each number editable.
- [x] Bulk editing: select many cells (drag on desktop, tap-select mode with a bottom action bar on phones) to make them Jalan / Bukan Petak, set Jenis Makam, renumber, or make a Kavling Keluarga; the grid pinch-zooms and pans on phones; tapping a cell opens its detail panel.
- [x] A Kavling Keluarga is at least 2 Petak connected by edges (not diagonals) within one Blok, has its own Jenis Makam and a pre-filled, editable Nomor Kavling (`A-K01`).
- [x] Rows/columns can be added at any edge and removed only when none of their Petak was ever used; a used Petak can't become another cell type.
- [x] Until the S3 FileStore exists (ticket 60), staging shows "Unggah foto belum tersedia" instead of the upload; tests use the in-memory FileStore; nothing is stored on the host disk.

- [x] An Admin Lokasi can create a blok with a size, mark cells as Petak or path, set Nomor Makam and Jenis Makam per Petak.
- [x] Nomor Makam is unique within the Lokasi; Nomor Kavling is unique within the Lokasi.
- [x] A Kavling Keluarga groups only adjacent Petak cells; it can be split only while it has no Hak Pakai.
- [x] Every new Petak starts with Perlu Verifikasi set.
- [x] A Petak with a Hak Pakai or Pemakaman can't be deleted or moved (rule enforced in the domain, even though Hak Pakai arrive in later tickets).
- [x] A site-plan photo can be attached per blok and viewed by signed URL.
- [x] All edits are audited.
- [x] Tests: adjacency rule for kavling; kavling split blocked once a Hak Pakai exists; no delete/move after use; uniqueness of numbers.

## Comments

- 2026-09-26 — Now also blocked by 74 (user decision): build the UI on the brand design system and staff shell from ticket 74 (spec, "Staff UI and design system").
- 2026-09-26 — Prototype done (https://claude.ai/artifact/9rzchqdiMRVuEmdSAQQKoz, branch worktree-agent-ac5f7e6b188a129d1, commit 041576e); the user accepted all four recommendations: Kavling Keluarga shown by a small icon in each of its cells plus an outline on its outer edges; the Petak detail panel floats above the bottom bar on phones, like the public Denah picker (tickets 13 and 36 share one grid renderer and legend colours); Ctrl/Shift-click selects scattered cells on desktop besides drag-select; row/column delete buttons appear at the grid edge on hover, with the compact list as a fallback. The prototype's first ticked criterion is done; build test-first from here.
- 2026-09-26 — Built. New `inventory` domain module (`src/domain/inventory/`: `schema.ts` owns `inventory_blok`, `inventory_petak`, `inventory_kavling`; migration `drizzle/0012_big_cardiac.sql`, renumbered from 0011 after rebasing onto ticket 82, which took 0011 for the email Akun key), test-first: adjacency (edge-connected, not diagonal; disconnected groups refused), kavling split blocked once a Hak Pakai exists, no delete/move/retype after use, Nomor Makam/Nomor Kavling uniqueness per Lokasi (across Bloks too), Perlu Verifikasi on every new Petak, row/column add at any edge and remove only when unused (with correct reindexing and Kavling adjacency preserved), site-plan photo via FileStore with `PortNotConfiguredError` refused as `penyimpanan_belum_tersedia`, and every write audited (new `AuditAction`s `denah.*`, `denah.lihat`/`denah.ubah` in `authorize.ts`, Admin Lokasi of that Lokasi only for edits). Ticket 14's Hak Pakai/Pemakaman don't exist yet, so "used" is a `first_used_at` column on Petak/Kavling that ticket 14's real Hak Pakai write will set for real; tests mark it directly (`tests/support/inventory.ts`, `markPetakUsedForTest`/`markKavlingUsedForTest`), the same stand-in pattern as `setLokasiMitraStatusForTest`. Added `isPortConfigured` to `src/adapters/live/not-configured.ts` so a page can show "Unggah foto belum tersedia" instead of the upload control, not just fail on submit. UI: `src/components/denah/grid.tsx` is the one shared grid renderer + legend (drag-select, Ctrl/Shift-click, tap-select mode, pinch/±zoom, edge "+" buttons) ticket 36 will reuse; the Admin Lokasi editor is at `/staf/admin-lokasi/[lokasiId]/denah(/[blokId])`, wired into the staff shell's nav (was a "Segera hadir" placeholder). Simplified from the prototype's decisions for this pass: the Kavling Keluarga outer-edge outline and the hover-only edge delete buttons are not built (icon-per-cell and the compact list remain); left for a follow-up polish pass, most naturally ticket 78's Admin Lokasi redesign. `npm run lint`, `npm run typecheck`, `npm run build`, `npm run build:worker` all pass; `npm run test:shared` 95 files / 978 tests passing after rebasing onto main (46 new in `src/domain/inventory/*.test.ts`, 3 new in `src/domain/identity/authorize.test.ts`).
- 2026-09-26 — Orchestrator (cloud): rebased onto ticket 75, which took migration `0012` (`0012_tired_pet_avengers`, `notifications_staff_alert`); this ticket's migration is now `drizzle/0013_big_cardiac.sql` (SQL unchanged, only new tables), its snapshot `0013` = 75's `0012` snapshot plus the three `inventory_*` tables, `prevId` chained to 75's. Merged by hand because `npm ci` could not reach the npm registry in this cloud session; CI validates the migration upgrade.
- 2026-09-26 — Orchestrator, cloud session 3: Rebased onto main b075569 (after 75 and 61) as 304136d, no conflicts; CI green. Merged into `main`.
