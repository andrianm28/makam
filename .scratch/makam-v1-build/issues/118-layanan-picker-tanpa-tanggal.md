# Layanan pickers: an undated Terencana Layanan is dropped while still priced, and an emptied choice still submits

Status: ready-for-agent
Blocked by: none (found by the reviews of ticket 115; group A, Rilis 1 live on production; owner approved "ya keduanya", 2026-10-05)
Spec: tickets 50 and 53 (Layanan at checkout and at a Lokasi Mitra); `.scratch/makam-v1-build/uat-rilis-1-checklist.md` §11

## What to build

Two defects in the family's Layanan pickers, found while ticket 115 was reviewed.

1. **The Terencana checkout drops a Layanan picked without a date, while the price still counts it.** In `src/app/pesan-makam/terencana/data-kirim.tsx` (about line 88) the payload leaves out a chosen Layanan whose date is empty. The line (about line 235) and the bottom bar (about line 320) still add its price, so the family is shown a total higher than the Tagihan they get. Perpanjangan refuses an undated pick instead.
2. **The two Layanan order forms keep "" in the chosen variants after "Tidak dipesan".** This is in `src/app/layanan/form-pesanan.tsx` (about line 49) and `src/app/layanan/tpu/form-tpu.tsx` (about line 62):
   - at a Lokasi Mitra the price breakdown disappears while another Layanan is still chosen (`src/app/layanan/actions.ts`, about line 41);
   - on both forms "Pesan layanan" stays enabled with nothing chosen.

## Acceptance criteria

- [ ] **Terencana:** a chosen Layanan either reaches the order with a date, or is refused with a clear message before sending, the way Perpanjangan refuses it. The total shown always equals what the Tagihan will hold.
- [ ] **Layanan order forms (Lokasi Mitra and TPU):** putting a Layanan back to "Tidak dipesan" removes it from the choice. The breakdown stays right for the remaining choices. "Pesan layanan" is disabled when nothing is chosen.
- [ ] **Tests**, through the real payload or Server Action on real Postgres:
  - an undated Terencana pick is never silently dropped, and the shown total matches the Tagihan;
  - an emptied choice sends no item.
  The repo has no jsdom: use the patterns of ticket 115 (`src/app/layanan/item-pesanan.ts` and its tests) or `renderToStaticMarkup`.
- [ ] **No price rule change.**

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Rilis 1 is live, so this goes first.

### Build (2026-10-05)

Built on branch `ticket-118-layanan-picker-tanpa-tanggal`, based on origin/main 9da0fb3b. Not money code: no price, fee or rule changed.

**What changed**

- **Terencana "Data & kirim"** (`src/app/pesan-makam/terencana/layanan-petak.ts`, new; `data-kirim.tsx` calls it): `layananPetakKosong(opsi, pilihan)` is the one function that decides what the order carries and what the screen adds to the total. Each Layanan picked is either in `item` with its date, or named in `tanpaTanggal`, and then `ditolak` holds the words that refuse Kirim ("Pilih tanggal pengerjaan untuk ..., atau ubah pilihannya menjadi Tidak dipesan. Sampai itu dilakukan, layanannya belum dihitung di total dan pesanan belum bisa dikirim."). The screen no longer filters an undated pick out of the payload: Kirim, and the Kode Masuk step too, refuse with that message before anything is sent (the Kode Masuk is kept for the next try). The line "Layanan ditambahkan ke Tagihan" and the sticky bar use `subtotal`, which counts only the picks that have a date, so the total shown is what the Tagihan will hold; a note under the picker names the undated ones; the refusal this screen gave is cleared when the choice changes.
- **Layanan order forms** (`src/app/layanan/item-pesanan.ts`, used by `form-pesanan.tsx` and `tpu/form-tpu.tsx`): `pilihVarian` (the state change: "Tidak dipesan" takes the Layanan out of the choice instead of storing "") and `varianDipilih` (the one reader of the chosen variants: the price asked, the TPU form's parts, the count that turns "Pesan layanan" on, and the items). Per form, only the `variantIds` line and the `onPilih` line changed. At a Lokasi Mitra the running price (`hargaPilihanLayanan`) is no longer asked about "" (it refuses an empty id, as every boundary does), so the breakdown stays for the remaining choices; on both forms "Pesan layanan" is off with nothing chosen.

**Tests** (test first: the new functions were first written as the old inline code, bug included, and the tests run against them)

- `src/app/pesan-makam/terencana/layanan-petak.test.ts` (7): the function alone, including a sweep of every combination of two Layanan (not picked, picked, picked with or without a date) holding that no pick is lost (sent, or named) and that the subtotal is the sum of what is sent.
- `src/app/pesan-makam/terencana/actions.test.ts` (+4, now 6): the real `kirimPesananTerencana` on real Postgres, then the Lokasi Mitra's confirmation, then the Tagihan read back: the total the bar shows (Denah total plus `subtotal`) is `tagihan.total` for two dated Layanan, for one put back to "Tidak dipesan", and once an undated one is given its date; an undated pick is refused on the screen; a Layanan that reaches Kirim with no date is refused and holds no plot.
- `src/app/layanan/item-pesanan.test.ts` (+5, now 8): `pilihVarian` and `varianDipilih`. `src/app/layanan/actions.test.ts` (+4, now 11): after the Batu Nisan is put back, the real `hargaPilihanLayanan` still prices the Tabur Bunga and its total is the order's `total`; Kirim sends only the remaining Layanan; with everything put back nothing is priced and no item is sent; the price read stays strict about "". `src/app/layanan/tpu/actions.test.ts` (+2, now 8): the same for Kirim at a TPU.
- Red before the fix: 5 of 13 in the Terencana files (undated pick not named, not refused, price counted: "expected 550000 to be 400000"), and 8 of 31 in the Layanan files ("expected null not to be null" for the breakdown, "expected [ '' ] to deeply equal []" for the button). The other tests were guards that held before and must keep holding.
- Green: `npx vitest run src/app/layanan src/lib/layanan-pilihan.test.ts src/app/pesan-makam/terencana`: exit 0, 8 files, 56 tests (34 before). With `src/app/pesan-makam/saat-duka` added: 14 files, 77 tests. The source-scanning guards (`dependency-direction`, copy guards, `rilis-guard`, `rilis-aksi-guard`, `brand-tokens`, `tests/uat/kata-di-sumber`, `selektor-persis`, `tombol-diganti-nama`): exit 0, 10 files, 278 tests. `npm run typecheck`: exit 0. `npm run lint`: exit 0 (6 warnings, none in these files). `npm run build` not run: no new server/client boundary (the new file imports a pure lib and a type).

### Spec gaps and decisions for the owner

- **Terencana: refuse, not default.** AC 1 allows either. I chose to refuse an undated pick before sending, because the spec and the screen say the work is done "pada tanggal yang Anda pilih" and the picker (shared with Perpanjangan) shows an empty date field, while the two order forms (ticket 115) show the earliest date in the field and send it. If you prefer the same default on Terencana, it is one place: `layananPetakKosong` would use the Layanan's `tanggalPalingDini` when no date is picked.
- **The total counts dated picks only.** An undated Layanan is named under the picker instead of priced, so the total shown is always what the Tagihan would hold.
- **Server unchanged.** `kirimPesananTerencana` already refused a Layanan with no date (the generic "Periksa lagi isian Anda."); a test now holds it. The clear message is the form's, before sending.
- **Perpanjangan "Tambah Layanan" not changed** (outside the ticket): its sticky total still counts an undated pick, and its refusal is the generic "Isian belum lengkap. Periksa lagi lalu coba kembali." No Tagihan can differ (the order is refused), but its message and total now differ from Terencana's. A follow-up if you want them alike.
- **Kode Masuk step of the two order forms:** its own submit button ("Pesan layanan") is not disabled with nothing chosen. The family reaches it only after pressing the main button once; if they then empty the choice, the server answers "Pilih minimal satu layanan." and the code is not used.
- **Not tested by clicking:** the repo has no jsdom and `renderToStaticMarkup` only renders the empty first state, so the click paths (pick, "Tidak dipesan", Kirim refused) are covered through the pure functions the three forms call and the real Server Actions, not through a rendered form. The UAT journey `uat/perjalanan/10-layanan.uat.ts` (section 11b) fills the date before it reads `total-layanan`, so it fits the new behaviour (read, not run).
