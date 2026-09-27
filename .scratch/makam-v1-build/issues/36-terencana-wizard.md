# Pemesanan Terencana wizard with Denah picker and plot hold

Status: ready-for-agent
Blocked by: 16, 82
Spec: Domain modules > 6. Pemesanan (Terencana); 5. Inventory (hold); Public site > Booking wizards (Terencana: Lokasi → Petak → Data & kirim); stories 39, 40, 41, 42, 43, 44, 45

## What to build

The Terencana wizard: Lokasi (filter by city, all-in price range and facilities; only Lokasi with Terencana switched on) → Petak (the Denah, picking one or more Tersedia Petak or a Kavling Keluarga; occupied, reserved and blocked plots not pickable; a tumpang-only plot tells the Pemesan to contact the Admin Lokasi) → Data & kirim (Calon Penghuni default "untuk saya sendiri", Pemegang Hak, required email and phone, email Kode Masuk at Kirim as in ticket 22). The headline price covers Harga Hak Pakai + Biaya Layanan Platform, with a separate "Nanti" line for Biaya Pemakaman + Biaya Layanan Platform "sesuai tarif saat pemakaman (saat ini Rp X)". The Syarat Pemesanan Terencana (Masa Pembatalan, later refund %, the right being against the Lokasi Mitra) is shown before Kirim and snapshotted on the order. Submission places a hold on the chosen plots.

## Acceptance criteria

- [ ] Only Terverifikasi Lokasi with "Pemesanan Terencana aktif" appear.
- [ ] The Denah picker allows only cleared Tersedia Petak / Tersedia Kavling Keluarga; Dipesan, Terisi, Tidak Tersedia and Perlu Verifikasi cells are disabled with a legend.
- [ ] A tumpang-only (released, still Terisi) plot shows "hubungi Admin Lokasi" instead of being pickable.
- [ ] Prices come from `quote()`; the Nanti line shows the current Biaya Pemakaman + Biaya Layanan Platform.
- [ ] The Syarat snapshot is stored on the order and later reads use the snapshot, not the Lokasi's current policy.
- [ ] Submission: status Diajukan, Nomor Pemesanan, hold on every chosen Petak / kavling so no one else can take it; a concurrent second submission for the same plot fails.
- [ ] Tests: hold placement and race; picker eligibility; Syarat snapshot immutability after a policy change.

## Notes

Empty-plot Layanan at this checkout is ticket 53.

## Comments

- 2026-09-26 — ADR 0004: Data & kirim follows ticket 22: required email proven by the Kode Masuk, phone as contact, "Tidak punya email? Minta bantuan CS". Now blocked by 82.
- 2026-09-26 — Decided with the user from the public prototype v2 (https://claude.ai/artifact/SYuh5fzc8TjkWQ5aoecYiF, branch worktree-agent-ab5e1eadecba063e3, commit 23d2d17): the Terencana Lokasi step has no total bar and a card opens the Denah; the Denah picker shows Tersedia / Pilihan Anda / Dipesan / Terisi / Tidak Tersedia / Kavling Keluarga / Jalan / Bukan Petak, with a small corner dot on a Terisi Petak that can still take a tumpang (legend "Terisi, bisa untuk tumpang (hubungi Admin Lokasi)"); several Petak across Bloks or Jenis Makam may be picked in one order (one Hak Pakai each, same Pemegang Hak) or one whole Kavling Keluarga; a Petak taken meanwhile is caught both at Lanjut and at Kirim with the same friendly message, returning to the Denah with the other picks kept; the Syarat Pemesanan Terencana are shown and snapshotted with the order, with no "Saya setuju" checkbox; one Biaya Layanan Platform per Tagihan.
- 2026-09-26 — User decision (supersedes the same-day manual-transfer note): v1 takes no order whose Tagihan would exceed Rp 10.000.000 (QRIS cap); see spec, Billing. The Denah picker refuses a selection whose total would exceed it, with a clear message.
- 2026-09-27 — **Built** on `main` a7b4964 (branch `ticket-36-terencana-wizard`), test-first at each module's public seam against real Postgres with the fake Clock and fakes.
  - **Inventory** gains the Denah the picker draws (`publicDenah`, `tersediaUntukTerencana`, the pure `pilihanOf`) and the plot hold (`inventory_plot_hold`: one row per held Petak Makam or Kavling Keluarga, a unique index per unit). `tahan` answers with exactly the state the picker shows, takes an advisory lock per Lokasi Mitra, and must be called `within` the order's transaction; `lepasTahan` frees an order's plots (its decline, withdrawal or lapse — tickets 37/38 call it). `InventoryDeps` gains `lokasi` (a listed Lokasi Mitra's Terencana switch and its tumpang rules), as Tariffs already does.
  - **Pemesanan** is the wizard's three steps and its order: `pilihanTerencana` (only Terverifikasi Lokasi Mitra with Terencana on, by city, all-in price band and facilities), `denahTerencana` (the Denah priced by `quote()`, the "Nanti" line, the Syarat, the Kontak Siaga), `placeTerencana` (holds every chosen plot, takes the Nomor Pemesanan, snapshots the Syarat, all in one transaction with the announcement afterwards) and `terencanaOf` (the order, with the Syarat from its own snapshot). The order lives in `pemesanan_terencana` + `pemesanan_terencana_unit`; see the merge note below.
  - **Prices** are `quote()`'s throughout: the picker prices each Jenis Makam once, `totalTerencana` adds one Biaya Layanan Platform for the whole selection and refuses what the QRIS cap cannot take (the same rule the submission re-checks authoritatively), and the "Nanti" line is the current Biaya Pemakaman + Biaya Layanan Platform. `QRIS_PAYMENT_CAP`/`withinPaymentCap` moved to `src/domain/billing/batas.ts` (no Node-only import) so the picker and the domain ask one question.
  - **The wizard** is `/pesan-makam/terencana` (the URL the Lokasi page already linked to): Lokasi → Petak → Data & kirim, one screen per URL, a progress bar with back, Blok tabs, the legend, a per-cell detail panel, the sticky total with the "Nanti" box, the Syarat before Kirim, the email Kode Masuk at Kirim (with "Tidak punya email? Minta bantuan CS" from Pengaturan Operator) and the confirmation read back from the order. No e2e: the ticket asks for none and CI runs it on `main`.
- 2026-09-27 — **Merge notes for the orchestrator** (tickets 20, 22 and 77 are in flight):
  - **Migration** `0017_slim_aqueduct` (three CREATE TABLEs, no destructive DDL, so no `-- contract:`) collides with ticket 22's `0017_pemesanan_makam`: renumber on merge and regenerate the journal.
  - **Two tables instead of one.** Ticket 22 builds `pemesanan_makam` (kind-discriminated, one plot) for the Saat Duka order; this ticket's order is several plots with a Calon Penghuni and a Syarat snapshot, so it has its own tables. On merge the orchestrator may fold these into `pemesanan_makam` with `kind = "terencana"`, or keep them; the module doc says which. Either way `src/domain/pemesanan/{index,schema}.ts` and the migration both need reconciling.
  - **Identical additions** to shared files (resolve by keeping one copy): `pemesanan.buat` / `pemesanan.lihat` + `pemesanan_makam` + `pemesananResource` in `src/domain/identity/{authorize,index}.ts`, and `defaultEmail` on `KodeMasukForm` (ticket 22 added the same three).
  - **Messages are a seam, not a send.** `PemesananNotifikasi.pemesananTerencanaDiajukan` is the one call the order makes of Notifications (after its transaction commits); `src/composition/pemesanan.ts` holds the no-op, and `src/server/runtime.ts` carries a `TODO(ticket 20)` to pass `serverRuntime().notifications` once that module has the family message and the staff alert. Nothing else in the wizard sends a message.
  - **Lokasi fix this ticket needed:** `setPoliciesAndFlags` refused any save while "Pemesanan Terencana aktif" was on, so a Lokasi Mitra's Masa Pembatalan could never change again once it took Terencana orders (the Admin Platform form posts the flag). It now refuses only *switching it on*, which stays `activateTerencana`'s gated job.
  - **Judgement calls:** one order takes several Petak Makam **or** one whole Kavling Keluarga, never a mix (a mix is refused, as it is a Petak twice and a Kavling once); the picker's non-pickable cells stay tappable and explain why in the detail panel, as prototype v2 decided; the confirmation lives on the wizard's own URL (`?langkah=terkirim&terkirim=<nomor>`) because the order page is ticket 22's route; `pemesanan.lihat` is authorized but no page uses it yet (the confirmation reads the order for the signed-in Akun).
