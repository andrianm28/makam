# Rilis 2/3 gaps to close before production opens level 3

Status: resolved
Blocked by: none
Spec: Release plan; owner decision 2026-10-02 (masa tenggang queue row stays); tickets 42, 44, 45; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

Small gaps found by the 2026-10-04 readiness sweep that must be closed before production opens level 3:

1. **Masa tenggang queue row.** The "Hak Pakai in masa tenggang" queue row disappears when the grace period ends (`src/domain/inventory/masa-berlaku.ts:68`, test `masa-berlaku.test.ts:101-102`). The owner decided on 2026-10-02 that it stays until staff act.
2. **TPU guide page** (`src/app/(site)/pengurusan-tpu/page.tsx`, `src/lib/content-pages.ts`):
   - It still says "Segera hadir" for the IPTM flows that are built.
   - The filing-only form (`/pesan-makam/pengurusan-iptm`) has no public link.
   - "Perpanjang IPTM" must say it applies only to IPTMs filed through the platform.
   - DKI prices shown during the beta are labelled "harga contoh".
3. **Stale header comment** at `src/lib/rilis-peta.ts:9-12`.

## Acceptance criteria

- [ ] The masa tenggang queue row stays after the grace period ends, until staff act, with a test.
- [ ] The TPU guide page links the built flows (gated by the release as today), limits the Perpanjang IPTM promise to platform-filed IPTMs, and labels beta prices "harga contoh". The copy is proposed in Comments for the owner's sign-off.
- [ ] The rilis-peta header matches the current map.

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (track A, MB5). Not money code.

### Build (2026-10-04)

Builder (Sonnet, branch `ticket-112-rilis-2-3-gaps`, base `7415fdf7`; not a review record). Not money code. Failing tests first and committed on their own (`11ee2c1d`, `972e1adf`), then the fixes; the header comment (item 3) is a comment and has no test.

**What changed**

1. **Masa tenggang queue row stays.** `inventory.hakPakaiMasaTenggang` no longer drops a Kedaluwarsa Hak Pakai the day after its Masa Tenggang; each item now carries `lewatMasaTenggang`. The row leaves only when a Perpanjangan is paid (the Hak Pakai is Aktif again) or the Admin Lokasi ends the Hak Pakai; time alone never removes it. The Antrean row's label "Hak Pakai dalam masa tenggang" is unchanged; its subject line says "masa tenggang berakhir 1 Januari 2027" once the period is over, "masa tenggang sampai ..." before. Tests (Inventory and Antrean Lokasi, public functions only): listed from Kedaluwarsa on with the last day of the Masa Tenggang still inside it; still listed the day after, months later and a year later, marked past it, still Kedaluwarsa; ending it by hand after the Masa Tenggang closes the row.
2. **TPU guide page** (`pengurusan-tpu/page.tsx`, copy in `content-pages.ts`).
   - The three ways in come from `jalanMasukTpuUntuk(rilis)`, the pattern the Beranda's tiles use (`hrefBilaTerbuka`): linked once the release opens `tpu` (read from `rilis-peta`), "Segera hadir." until then. Saat Duka di TPU → `/pesan-makam/saat-duka?jenis=tpu_dki`; "Sudah dimakamkan? Kami urus IPTM-nya" → `/pesan-makam/pengurusan-iptm` (the first public link to it); Perpanjang IPTM → `/akun/makam`.
   - Perpanjang IPTM says it is only for an IPTM filed through Makam.co.id and what to do for one the family filed itself.
   - The two Biaya Pengurusan carry "harga contoh" wherever prices may still be examples (`pricesMayBeExamples()` in `src/lib/env.ts`), with a note under the list.
   - Cara Kami Bekerja ("Izin TPU gratis") no longer says the guide is unpublished once TPU is open (`caraKamiBekerjaSectionsUntuk(rilis)`; unchanged for Rilis 1 and 2; the `(site)` layout is `force-dynamic`, so the page reads the release per request).
3. **`rilis-peta.ts` header** now matches the map: tickets 35, 39 and 41 have their routes and ticket 42 its ticks under `perpanjangan_lanjutan`, 59's tick is under `lokasi_ditangguhkan`, ticket 84 (Pintu Masuk cell) has no route or tick and nothing closes it, 58 is no longer called a "TPU part". The note on `perpanjangan_lanjutan` no longer says 35 is "when it lands".

**Copy proposed for the owner's sign-off** (Bahasa Indonesia; as in the code, nothing else on the page changed)

- Card "Tiga jalan masuk lewat Makam.co.id", description: "Pilih yang sesuai dengan keadaan keluarga Anda." (was "Perpanjang IPTM dan mengurus berkas sendiri menyusul.")
- Saat Duka di TPU: "kami siapkan pemakamannya bersama TPU lalu mengurus IPTM-nya." (unchanged)
- Perpanjang IPTM: "memperpanjang izin makam yang akan berakhir." then "Hanya untuk IPTM yang kami ajukan lewat Makam.co.id. Buka Makam Keluarga di Akun dengan email yang tercatat pada makamnya, lalu pilih Perpanjang IPTM. IPTM yang diurus sendiri tidak termasuk; untuk itu ikuti ketentuan pemerintah daerah atau tanya CS."
- Sudah dimakamkan? Kami urus IPTM-nya: "kalau keluarga sudah memakamkan sendiri, Anda hanya perlu berkas ini saja." (unchanged, now linked)
- Beside each Biaya Pengurusan amount: "harga contoh". Under the list, replacing "Harga ini berlaku sejak {tanggal}." while examples show: "Selama masa uji coba, Biaya Pengurusan di atas adalah harga contoh, bukan harga yang berlaku."
- Cara Kami Bekerja, Izin TPU gratis, second paragraph once TPU is open: "Keluarga boleh mengurus berkas ini sendiri, dan urutannya mengikuti ketentuan pemerintah daerah serta penjelasan dari TPU yang setempat. Langkah mengurusnya sendiri kami tuliskan di halaman Pengurusan di TPU DKI. Untuk langkah yang tepat di daerah Anda, tanya CS lewat WhatsApp."

**Spec gaps and decisions for the owner**

- **What marks "the beta" (decision, yours to overrule).** No marker for Data Contoh exists on `main` (ticket 109 builds `contohAktif`). I used `pricesMayBeExamples()`: true everywhere except a production paying live, so staging shows the label too (level 3 UAT can see it) and production shows it while `paymentsAreTrial()` is on; an unknown `APP_ENV` counts as examples, never as live. When 109 lands, swap the one call in the page for its flag.
- **Which rows are labelled (decision).** Only the two Biaya Pengurusan. The Retribusi Pemda row is not: ticket 111 enters Rp 0 as a real value ("owner confirms"). If it is also contoh, it is one line in `barisHargaTpu` plus the note's wording.
- **Perpanjang IPTM links to `/akun/makam`, not to its form.** The form needs a Makam TPU id (`/pesan-makam/perpanjang-iptm/[makamTpuId]`), which only the Akun's Makam tab and the reminder email know. A visitor who is not signed in lands on Masuk first.
- **Cara Kami Bekerja was touched** because the ticket names `content-pages.ts`; the acceptance criteria name only the guide page. Easy to drop.
- **Found, not changed** (outside the ticket's bullets):
  1. The guide's "Harga Layanan di TPU DKI" card still says "belum tersedia. Segera hadir." Ticket 43's AC 6 (the DKI Layanan price list) was never built; the TPU Layanan order `/layanan/tpu` (ticket 56) exists and shows DKI prices inside its form. Choose: link the card to it, build a list here (then "harga contoh"), or leave.
  2. The Makam keluarga hub's "Pengurusan IPTM" card (`kartuAksi` in `makam-keluarga-content.ts`) has no address and says "Segera hadir." in every release, so the filing-only form still has no link from the hub at level 3.
  3. The FAQ answer "Perpanjangan" says the Perpanjangan page "belum ada di makam.co.id" and sends the family to the CS. That has been untrue since ADR 0005 opened Perpanjang Makam in Rilis 1 (the hub's `?aksi=perpanjang`), so it matters at the level 1 go-live; a test pins the old sentence.
  4. No reminder goes out after the Masa Tenggang (spec: weekly "during" it, unchanged), so the row is now the only prompt left for the Admin Lokasi, which is the point of the decision.
  5. ADR 0006 does not mention ticket 84; the header says what the code does (no gate). The plan's E1 amendment should record it.

**Tests** (read off whole logs, exit codes in brackets)

- Red: `masa-berlaku.test.ts` + `antrean-lokasi.test.ts`: 4 failed, 16 passed [1]. Green: 2 files, 20 tests [0].
- Red: `content-pages.test.ts` + `env.test.ts`: 18 failed, 87 passed [1]. Green: 2 files, 105 tests [0].
- Guards and neighbours (dependency-direction, no-ticket-numbers, no-retired-company-name, no-ops-email-verification, rilis-guard, rilis, proxy, public-navigation, homepage-content, makam-keluarga-content, content-pages, env): 12 files, 157 tests [0].
- `src/domain/inventory` + `src/domain/queues` folders: 29 files, 230 tests [0].
- `npm run lint` [0], 0 errors (6 warnings, none in touched files); `npm run typecheck` [0].
- Not run: `npm run build` (not needed; the page change is typechecked), the full suite and e2e (the orchestrator's). Unverified: the guide page rendered in a browser (no page test seam; its logic is in `content-pages.ts`, tested).

### Review and merge (2026-10-04, orchestrator; fixed point 7415fdf7, head 08b0fccc)

- **Two-axis review:** the Standards and Spec reviewers (sonnet) ran in parallel. Both reported **Hard: 0** on the first round; every acceptance criterion was MET.
- **Verification:** merged in batch MB4 with 112 and 113; the full suite passed (364 files, 3651 tests).
Owner sign-off (2026-10-04): the proposed TPU guide copy above is approved as written.

Soft follow-ups, deliberately left (the top ones):
  - docs/ops/runbook.md:2024-2033 vs src/lib/env.ts:408 and src/app/(site): The 'Going live' step says only the banner and the Bayar notice disappear when the SUMOPOD_BASE_URL line is deleted. pricesMayBeExamples now ties 'har
  - src/domain/inventory/masa-berlaku.ts:69-75 (per-row read at :72): Removing the `hariIni > masaTenggangBerakhir` cutoff turns a list bounded to the 3-month Masa Tenggang into one that grows with every Kedaluwarsa Hak 
  - src/lib/content-pages.ts:152-195, src/app/(site)/pengurusan-tpu/page.t: /pengurusan-tpu is itself gated on `tpu` (the proxy rewrites it to Segera hadir below Rilis 3) and all three ways in gate on `tpu` (content-pages.ts:1
  - src/domain/queues/antrean-lokasi-rows.ts:144,149,152 and src/domain/in: The row is still labelled 'Hak Pakai dalam masa tenggang' when lewatMasaTenggang is true, and the subject line differs by one word (`berakhir` vs `sam
  - src/app/(site)/pengurusan-tpu/page.tsx:104-110 and :11: Choosing between the example note and 'Harga ini berlaku sejak' is a nested ternary in JSX with no test seam, while catatanHargaContoh lives in conten
  - src/domain/queues/antrean-lokasi.test.ts:122-135, src/lib/content-page: Tidy-ups. Helper hakPakaiBerakhir20261001 is declared inside the describe with a date in its name, while its neighbours (siapkanOperator, setupAntrean
