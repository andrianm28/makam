# Layanan order forms drop the extra text and the chosen target date

Status: resolved
Blocked by: none (found in the Rilis 1 UAT on staging, 2026-10-05; blocks the G2 sign-off and the switch, owner approved "ya 115")
Spec: tickets 50 (Layanan order at a Lokasi Mitra) and 56 (TPU Layanan); `.scratch/makam-v1-build/uat-rilis-1-checklist.md` §11

## What to build

Both family-side Layanan order forms build their payload with the **variant id** as the key, while their state is keyed by the **Layanan id**:

- `src/app/layanan/form-pesanan.tsx:73` (Lokasi Mitra);
- `src/app/layanan/tpu/form-tpu.tsx:106` (TPU).

Each builds `item` with `tanggal[id] ?? grup.targetPalingDini` and `teks[id]`, where `id` is the variant id, but `onTanggal` and `onTeks` store `[layanan.id]` (`form-pesanan.tsx:99-100`, `form-tpu.tsx:177-178`). So:

1. **A Layanan with an extra text field can never be ordered.** For example Batu Nisan's "Tulisan pada nisan": the text is always sent as `null`, and the domain refuses with `teks_kosong`, shown to the family as "Layanan ini minta isian tambahan. Isi dulu kolomnya." although the field is filled.
2. **The target date the family picks is silently ignored.** The earliest allowed date is sent instead.

UAT evidence: Pemesan at Pemakaman Wakaf Al-Ikhlas, Petak A-03, Batu Nisan (Granit Abu-abu 80×100), tulisan filled, refused (screenshot `/home/ubuntu/uat-runs/2026-10-04-rilis1/bukti/11-layanan-dari-sisi-keluarga-11-pemesan-memesan-layanan-lew/03-pesan-layanan-nomor-pesanan-dan-tagihan.png`).

## Acceptance criteria

- [ ] **Lokasi Mitra form:** sends, for every chosen variant, the text and the target date the family entered for its Layanan; with no date entered, the earliest allowed date as today.
- [ ] **TPU form:** the same.
- [ ] **The Layanan pickers in the checkout steps** (Saat Duka, Terencana, Perpanjangan; ticket 53) and any other client form that keys state by Layanan and reads it by variant are checked for the same mistake and fixed where found, each fix with a test. The ticket's Comments name what was checked.
- [ ] **Tests**, through the form's real payload, not a private helper:
  - a chosen Batu Nisan with its tulisan is accepted;
  - a chosen date reaches the order;
  - a missing tulisan is still refused.
  - Follow the existing form or action tests for these pages (`src/app/layanan/**.test.ts*`); a component test of the payload, or the server action with the payload the form builds, as the neighbours do.
- [ ] **Not money code** (no price rule changes); the prices shown and charged are unchanged.

## Comments

- 2026-10-05: Filed by the orchestrator from the UAT finding; owner approved ("ya 115"). Root cause confirmed by reading `form-pesanan.tsx:66-75, 92-101` and `tpu/form-tpu.tsx:106, 177-178`.

### Build (2026-10-05)

Built on branch `ticket-115-layanan-form-keys`, based on 2b2acd02 (the local `main` with this ticket filed; `origin/main` is one commit behind and has no ticket file).

**What changed**

- `src/app/layanan/item-pesanan.ts` (new; types only, so it is safe on a client component's import graph): `itemPesananLayanan(layanan, { dipilih, tanggal, teks })`, the one function that builds the `item` both forms send. The two inline copies in `form-pesanan.tsx` and `tpu/form-tpu.tsx` (which read `tanggal[id]` and `teks[id]` by the **variant** id while the forms store them under the **Layanan** id) are replaced by a call to it. It finds the Layanan a chosen variant belongs to and reads the date and the text under that `grup.id`. Only the `item:` line of each draft changed: the state (three maps keyed by Layanan id), the fields and the order the items come in (the order the family chose them, which is the order the price is asked in) are as they were.
- The date falls back to the earliest allowed one with `||`, not `??`. The bug hid it: a date field the family clears again shows the earliest date, and the old code ignored every date, so a plain key fix with `??` would have started sending `""` for a cleared field and the action would refuse it. A test holds this.

**Tests** (test first: the lookup was first moved into the function as it was, bug included, and the tests were written and run against it)

- `src/app/layanan/actions.test.ts` (7) and `src/app/layanan/tpu/actions.test.ts` (6): the real Server Actions (`kirimPesananLayanan`, `kirimPesananLayananTpu`) on real Postgres, with the payload built the way the form builds it: what the order page hands the form (`tampilanPesananLayanan`, `tampilanPesananTpu`) through `itemPesananLayanan`, read back through `pesananLayananOf` and `pesananTpuOf`. A Batu Nisan with its Tulisan pada nisan is accepted and the trimmed text is on the order; a picked target date is the order's; no date, or a cleared one, is the earliest the lead time allows; a missing or blank Tulisan is still refused with "Layanan ini minta isian tambahan. Isi dulu kolomnya."; two Layanan keep their own date and text; at a Lokasi Mitra a Layanan put back to "Tidak dipesan" is not on the order.
- `src/app/layanan/item-pesanan.test.ts` (3): the function alone, with Layanan ids and variant ids that differ.
- Red: with the old variant-keyed lookup back in the function, 7 of the 16 fail, with exactly the two UAT symptoms (the refusal above although the field is filled; 2026-10-20 replaced by the earliest date, 2026-10-02). The other 9 are guards that held before and must keep holding (the refusals, the earliest date, the cleared date, "Tidak dipesan"). With the fix: 16 of 16. `npm run lint` and `npm run typecheck`: exit 0 (lint has 6 warnings, none in these files).

**What was checked for the same mistake** (AC 3; no fix was needed in any of them, so no test was added there)

- Saat Duka at a Lokasi Mitra, `pesan-makam/saat-duka/data/data-kirim.tsx`: `PilihLayanan` and `itemDariPilihan(..., "hari_h")`, one `PilihanPerLayanan` map written and read under `grup.id`.
- Saat Duka at a TPU, `pesan-makam/saat-duka/tpu/data-tpu.tsx` (lines 106-107, 179-180, 562-580): `hariHDipilih` and `hariHTeks`, set and read under `grup.id`.
- Terencana, `pesan-makam/terencana/data-kirim.tsx`: `PilihLayanan` and `itemDariPilihan(..., "petak_kosong")`.
- Perpanjangan "Tambah Layanan", `components/layanan/tambah-layanan-perpanjangan.tsx` (used by `perpanjangan/[hakPakaiId]/page.tsx` and `perpanjangan/permohonan/[id]/permohonan-forms.tsx`): `PilihLayanan` and `itemDariPilihan(..., "perpanjangan")`.
- The shared pieces: `components/layanan/pilih-layanan.tsx` (`ubah(grup.id, ...)`, `nilai[grup.id]`) and `lib/layanan-pilihan.ts` (`pilihan[grup.id]` in both functions). `src/lib/layanan-pilihan.test.ts` already uses Layanan ids that differ from the variant ids (`l-nisan` / `v-nisan`) for hari-H and Perpanjangan items.
- A sweep of every client component for id-keyed state (`useState<Record<...>>`, `Map`, `Set`, reducers, and `teks[`, `tanggal[`, `dipilih[` reads): the only hits are the two forms and `data-tpu.tsx`. The staff forms pass a Layanan or variant id as a hidden input.

**Spec gaps and decisions for the owner**

1. **AC 4 asks for a test "through the form's real payload"; the repo cannot render a form.** Vitest runs in `node` and only picks up `*.test.ts`; there is no jsdom or Testing Library, and there were no tests under `src/app/layanan` for the ticket to follow (the neighbours are the action tests of `saat-duka` and `terencana`). I took the ticket's second form of the test: the real Server Action with the payload the form builds, from one function both forms call and the page's own read. What no test reaches is each form handing its three maps to that function (one typed call per form, the setters untouched). A component test would need `jsdom` and `@testing-library/react` as new devDependencies; that is new test tooling and a lockfile change, so I did not add it. Say if you want it.
2. **Found, not changed (not this ticket's mistake; for triage).**
   - Both forms keep `""` in `variantIds = Object.values(dipilih)` after a Layanan is put back to "Tidak dipesan" (`form-pesanan.tsx:48`, `form-tpu.tsx:61`). At a Lokasi Mitra that makes `hargaPilihanLayanan` (`z.array(z.uuid())`) answer null for the whole set, so the price breakdown disappears while another Layanan is still chosen; on both forms "Pesan layanan" stays enabled with nothing chosen and the action then refuses with "Periksa lagi isian Anda." What is charged is not affected. The fix is to leave the empty ids out, but it lives in a component and needs the DOM test above.
   - Terencana (`pesan-makam/terencana/data-kirim.tsx:88`): a Layanan picked with no date is left off the order without a word (`satu.targetDate ? [...] : []`), while the "Layanan ditambahkan ke Tagihan" line and the total bar still count its price. A Perpanjangan pick with no date is refused by the action's schema instead. Both use the same `PilihLayanan`. Ticket 53's rule should say which it is: refuse with a message, or prefill the earliest date as the two standalone forms do.
3. **Decision:** the forms keep their three maps instead of moving to `PilihanPerLayanan`, the model of the checkout pickers, so no field of either form changed. Moving would make this mistake impossible to write; it is an optional follow-up.

### Review and merge (2026-10-05, orchestrator; fixed point 2b2acd02, head 6544378b)

- **Two-axis review:** the Standards and Spec reviewers (sonnet) ran in parallel. Standards Hard: 0, soft: 4; Spec Hard: 0, soft: 2.
- **The fix:** `itemPesananLayanan` reads the text and the date by the Layanan id, and both forms use it.
- **Tests:** 16 new tests drive the real Server Actions on Postgres; 7 of them were red on the old lookup, showing both UAT symptoms.
- **Checkout pickers** (Saat Duka, TPU, Terencana, Perpanjangan) were checked and found clean.
- **Merged** in batch MB8. The UAT rerun of §11 on staging is the browser check.

Follow-ups, deliberately left, for owner triage:
- AC 4's tests call the shared function, not each form's own call site; the repo has no jsdom or Testing Library (an owner decision whether to add them).
- Both forms keep "" in the chosen variants after "Tidak dipesan": the price breakdown vanishes, and "Pesan layanan" stays enabled with nothing chosen.
- The Terencana checkout drops a Layanan picked without a date while its price still counts in the subtotal.
- Duplicated test helpers.
- The name clash of `ItemPesananLayanan`.
