# TPU family forms: a Penilaian for TPU Layanan jobs, and a required tumpang consent

Status: resolved
Blocked by: none (found by the UAT runner audit; group B, plus owner rule C3; owner approved "ya keduanya", 2026-10-05)
Spec: ticket 51 (Keluhan and Penilaian), ticket 44 (Saat Duka at a TPU, tumpang); checklist R3-51.1, R3-44.2

## What to build

1. **Penilaian for a finished TPU Layanan job.** `src/app/layanan/[nomor]/pekerjaan-tpu.tsx` has the Keluhan form (test id `keluhan-tpu-form`) but no Penilaian. The Lokasi Mitra job page has one (`BeriPenilaian` in `src/app/layanan/[nomor]/keluhan.tsx`). Give TPU jobs the same, within the same window, feeding the Mitra Jasa scorecard (ticket 55) as the module already defines.
2. **A required consent for tumpang at a TPU DKI.** The Saat Duka TPU form (`src/app/pesan-makam/saat-duka/tpu/data-tpu.tsx`, about lines 340-362) shows the 3-year IPTM warning and lists the Pemegang Hak's letter of consent, but has no consent checkbox. Owner rule C3 (2026-10-05): **add a required checkbox.** "Kirim" stays disabled until the family confirms they understand the tumpang conditions (the 3-year rule, the Pemegang Hak's letter). The Server Action refuses an order without it (Zod).

## Acceptance criteria

- [ ] **Penilaian:** the family rates a TPU job after it is finished, once and within the window. The rating reaches the Mitra Jasa's scorecard read.
- [ ] **Tumpang consent:** "Kirim" stays disabled until it is checked. The action refuses a tumpang order without consent, with a clear message. Non-tumpang orders are unchanged.
- [ ] **Tests:** public functions on real Postgres for the Penilaian; the action's refusal for the consent; a static render for both.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Owner rule C3 chose 'Tambahkan centang wajib'.

### Build (2026-10-05)

Built on `origin/main` 9da0fb3b, branch `ticket-123-tpu-penilaian-persetujuan-tumpang`. Test first throughout: every test below went red on the old code before its change, except the ones that pin a rule that already held when they were written: a job under a Keluhan may be rated, a job not finished offers no form, a Tumpang with the box ticked and a new grave are placed, and the Penilaian action test (written after the action; pointing the action at the Lokasi function for a moment made it fail, then it was put back).

**What changed**

1. **Penilaian for a finished TPU job.**
   - Layanan owns a new table `penilaian_layanan_tpu` (migration `drizzle/0065_stale_captain_marvel.sql`, pure expand: one table, one foreign key, one unique index per job, a 1 to 5 CHECK; the upgrade seed carries its `bintang` override). `beriPenilaianTpu` (`src/domain/layanan/penilaian-tpu.ts`) is the Pemesan's own, 1 to 5 stars, an optional comment, once per job (`sudah_dinilai`), only for a job whose proof Admin Platform approved and that was not cancelled (`belum_selesai`); somebody else's job is `tidak_ditemukan`, an email that is not the Akun's is `bukan_pemesan`.
   - The Pemesan's read (`pesananTpuOf`) carries `penilaian: { bolehDinilai, dinilai }` on each job, never the stars. Admin Platform's list (`daftarPenilaian`) now holds the TPU jobs' Penilaian too (`sumber: "tpu"`: the TPU named where the Lokasi is, the grave as the family described it where the Petak is; the page says "Makam" for it). A Mitra Jasa's own reads carry no star or comment (tested).
   - The scorecard: `portPekerjaanTpu` now reports a job Admin Platform approved (counted at the approval, for the Mitra Jasa who holds it) with its Penilaian, so `skorMitraJasa` and `skorSaya` average it into `rataPenilaian` inside the 90 days. A Penilaian never goes to a Mitra Jasa who declined the job or was taken off it.
   - Screen: Server Action `beriPenilaianPekerjaanTpu` (thin: guard, role, Zod `beriPenilaianSchema`, domain) and `BeriPenilaianTpu` (test id `penilaian-tpu-form`) in `PekerjaanTpuDaftar`, which is shared by `/layanan/<nomor>` and the hari-H items on `/pengurusan/<nomor>`. The Lokasi form and the TPU form are one inner form; a TPU job's note says the Penilaian is not read by the Mitra Jasa (not "Lokasi Mitra"). A rated job says thanks.
2. **Required tumpang consent.** `draftTpuSchema` takes `persetujuanTumpang` (only a literal `true` counts; absent or anything else is not consent) and refuses a Tumpang without it, under that field, with "Centang dulu persetujuan syarat Tumpang (aturan 3 tahun dan surat persetujuan Pemegang Hak) sebelum mengirim." The same schema guards `kirimPengurusanTpu` and the Kode Masuk step (`verifikasiKodeMasukDanKirimTpu`), so the disabled button is not the only gate. On the form, `PersetujuanTumpang` (a required checkbox, in the Tumpang block under the IPTM photo, naming the IPTM in force, the 3 years and the Pemegang Hak's written consent) and `TombolKirimTpu` ("Kirim pengurusan" stays disabled for a Tumpang until it is ticked, with a line saying why). A new grave never waits for it and its draft is unchanged.

**Decisions**

- A Penilaian of a TPU job has **no deadline**, exactly as at a Lokasi Mitra (`bolehDinilai`: finished, not cancelled, not yet rated; a job under a Keluhan may still be rated). See the first gap below.
- A separate table per kind of job, as `keluhan_layanan_tpu` is to `keluhan_layanan`: widening `penilaian_layanan` to both would have dropped its foreign key (contract DDL).
- The consent is a **boundary** requirement only (the Server Action's Zod): the Pengurusan module does not take or store it, since staff placements have no checkbox and every existing Tumpang placement and test would otherwise have to carry it. It is not recorded on the order.
- The fixtures `pekerjaanTpuDiterima`, `kirimBuktiPekerjaanTpu` and `pekerjaanTpuSelesai` went into `tests/support/layanan-tpu.ts` for reuse.

**Spec gaps and decisions for the owner**

1. **"Within the same window" has no window to copy.** The Lokasi Mitra Penilaian (ticket 51, `bolehDinilai`) has no deadline: any time once the job is finished, once. The AC ("rates ... once and within the window") is read as that, so the TPU Penilaian opens when Admin Platform approves the proof and never closes. If the owner wants it bound to the 3×24 h Keluhan window (or any other), that is one rule for both kinds of job, to be decided and then changed in both.
2. **The Mitra Jasa scorecard still does not feed everything for a TPU job.** `portPekerjaanTpu` never reported a finished job (`dihitungPada` stayed null for it, so Selesai was 0 for every TPU Mitra Jasa); its own comment said tickets 57 and 51 would. A Penilaian is only averaged over a counted job, so this ticket made a job approved by Admin Platform count as Selesai, at `selesaiAt`. **Terlambat and Keluhan upheld are still not fed for TPU jobs** (ticket 51's contract: upheld = Keluhan `kerjakan_ulang` or `dana_kembali`; the redo of a TPU job is a row of its own, and one redone by another Mitra Jasa leaves the original in Keluhan, never counted). Two visible effects until it is: a job refunded after a Keluhan counts as Selesai without the upheld mark, and a redo by the same Mitra Jasa counts as a second Selesai. Needs the owner's call on what each number means for a TPU job, then a ticket.
3. **A TPU Keluhan's decision page does not show the job's Penilaian**, as the Lokasi one does. Admin Platform reads it in the list (`/staf/admin-platform/penilaian`). Not part of the AC; say if it is wanted.
4. **UAT scripts**: R3-51.1 (Keluhan and Penilaian) and R3-44.2 (the consent is a `manual` step) can now automate the two screens: test ids `penilaian-tpu-form` and `penilaian-tpu`, and the checkbox "Saya paham syarat Tumpang ...". I did not change the scripts (they run against staging, and I could not run them).

**Tests** (all through public functions on the shared test Postgres, `MAKAM_TEST_PG=shared npx vitest run <paths>`; logs kept whole)

- New: `src/domain/layanan/penilaian-tpu.test.ts` (9: stars and one per job; not finished, even with the proof waiting; the Pemesan's own; the Pemesan's read of it; a job under a Keluhan; Admin Platform alone; the scorecard mean; the 90-day window; the Mitra Jasa who did the job), `src/app/layanan/[nomor]/actions.test.ts` (2), `src/app/pesan-makam/saat-duka/tpu/persetujuan-tumpang.test.ts` (7, static render of the box and of Kirim), and 3 each added to `src/app/layanan/[nomor]/pekerjaan-tpu.test.ts` (static render of the Penilaian) and `src/app/pesan-makam/saat-duka/actions.test.ts` (the action's refusal for the consent, at Kirim and at the Kode Masuk step, and the placed Tumpang and new grave).
- Final consolidated run: `src/domain/layanan`, `src/domain/pengurusan`, `src/app/pesan-makam`, `src/app/layanan`, `src/app/pengurusan`, `src/app/staf/admin-platform/penilaian`, `src/components`, `tests/uat`, `tests/seed-representative.test.ts`, the release-gate, `use server` exports, copy and ticket-number guards: exit 0, **77 files, 902 tests passed**.
- `npm run typecheck` exit 0; `npm run lint` exit 0 (0 errors, the same 6 warnings as before, none in these files); `npm run build` once, exit 0, then `rm -rf .next dist`.

### Review and merge (2026-10-06, orchestrator; fixed point 9da0fb3b, head 4591e979)

- **Two-axis review:** Standards and Spec reviewers (sonnet) in parallel; round 0: Standards Hard: 0, soft: 4, Spec Hard: 0, soft: 4.
- **Status:** clean, with Hard 0 on both axes in the last round. The soft findings and the builder's spec gaps are in the review entries and in "Spec gaps and decisions for the owner" above; the owner triages them.
- **Merged** in batch MB15, after the full verification (typecheck, lint, build, `npm run test:shared`).

