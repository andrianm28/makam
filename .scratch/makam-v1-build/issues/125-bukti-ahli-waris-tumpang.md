# Tumpang at a Lokasi Mitra: the heirship proof can be uploaded

Status: resolved
Blocked by: none (found by the UAT runner audit; group B; owner approved "ya keduanya", 2026-10-05)
Spec: ticket 35 (tumpang under an existing Hak Pakai, with consent); checklist R2-35.3

## What to build

When the Pemegang Hak has died, a tumpang needs the heirs' consent with a heirship proof (ticket 35). The Admin Lokasi's tumpang screen has no file input for it (`src/app/staf/admin-lokasi/[lokasiId]/pesanan/[nomor]/tumpang-forms.tsx`). `tumpang-actions.ts` (about line 21) reads `buktiFileKey`, but nothing ever sets it. Add the upload: the private FileStore through the usual upload path, served by short-lived signed URLs, never into logs or Sentry.

## Acceptance criteria

- [ ] **The Admin Lokasi uploads the heirship proof** (PDF, JPG or PNG, up to the usual limit) when confirming a tumpang that needs it. The action stores its key, and the order and the Audit Log show that a proof is on file.
- [ ] **Without a required proof, the action refuses** with a clear message.
- [ ] **Privacy:** the file lives only in the private FileStore. It is served only by a short-lived signed URL to the staff who may see it.
- [ ] **Tests:** the action with the in-memory FileStore fake on real Postgres; the refusal; a static render of the form.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Rilis 2 gap before level 3.

### Build (2026-10-05)

Builder (Sonnet, branch `ticket-125-bukti-ahli-waris-tumpang`, base `9da0fb3b`; not a review record). Not money code. Failing tests first and committed on their own (`1bada329`: 14 of the new tests failing, each for the right reason), then the code. The one test added after that (the refused-write cleanup) was seen red by switching the cleanup off, then green again.

**What changed**

1. **The proof is a file the Admin Lokasi uploads.** The "Catat persetujuan" form (`tumpang-forms.tsx`) has a file input `bukti` (PDF, JPG or PNG through `accept`; the limit is worded from the shared `UNGGAHAN_MAX_BYTES`, 10 MB). It is enabled and required only while "Bukti ahli waris dibawa di hari-H" is picked; the verbal choice leaves it disabled. `catatKonsenTumpangAction` hands the file to Pemesanan as `bukti: { body, contentType }`. The old hidden `buktiFileKey` is gone from the action and from `catatKonsenSchema`: a key that came from a form could name any file in the store, so the module now alone decides where a proof is kept.
2. **Pemesanan owns the rule** (`src/domain/pemesanan/tumpang.ts`, `catatKonsenTumpang`). An `ahli_waris` consent without the proof is refused (`bukti_ahli_waris_wajib`: "Unggah bukti ahli waris (foto JPG atau PNG, atau PDF) untuk mencatat persetujuan ahli waris."). A file sent with a `verbal` consent is refused (`bukti_hanya_untuk_ahli_waris`). The file is checked by its bytes through the shared `ekstensiUnggahan` (PDF, JPG or PNG, not empty, at most 10 MB; else `berkas_tidak_didukung`), put in the private FileStore at `bukti-ahli-waris/<pesanan id>/<uuid>.<ext>` before the write, and deleted again when the write is refused (e.g. an implicit consent is already settled) or the store fails (`penyimpanan_belum_tersedia`). The key is written to `pemesanan_makam.konsen_bukti_file_key`, a column that already existed: no migration.
3. **The order and the Audit Log show it.** `orderUntukStaf(...).tumpang.buktiAhliWarisAda` is new; the Admin Lokasi's panel says "Bukti ahli waris: terlampir." with a link "Buka bukti"; the Entri Audit `pemesanan.konsen_tumpang` carries `buktiAda: true|false` in `after`. The key is in neither.
4. **Served only by a short-lived signed URL.** New `pemesanan.urlBuktiAhliWaris(actor, nomor)` and route `GET /staf/admin-lokasi/[lokasiId]/pesanan/[nomor]/bukti-ahli-waris` (the shape of the agreement scan's route): 303 to a 5-minute signed URL made at click time (`DOKUMEN_URL_SECONDS`), `Cache-Control: no-store`; 401 not signed in, 403 for staff who may not read the order (another Lokasi's Admin Lokasi), 404 with no proof on file. The page never holds a signed URL. The route sits inside the existing `/staf/admin-lokasi/[x]/pesanan/**` release-gate pattern, so the map is unchanged.
5. Three existing consent tests (two in the domain, one for the action) that logged an heirship consent with no file now pass the proof, because the rule is new; nothing else in them changed.

**Spec gaps and decisions for the owner**

- No acceptance criterion is narrowed. Decisions the owner may overturn:
  - **"A tumpang that needs it" is read as an heirship consent** (`via: ahli_waris`): the proof is required there and only there. A consent logged this way **before** this change has no file and shows no proof line; nothing was backfilled, and confirming such an order is not blocked.
  - **A verbal consent takes no file.** The consent can be decided only once, so a file sent with the verbal choice would otherwise be dropped for good. The form keeps the field disabled for it; the module refuses it for any other caller.
  - **Who may open the proof:** "the staff who may see it" is read as the staff who may read the order (`pemesanan.lihat_staf`): that Lokasi's own Admin Lokasi, and Admin Platform after TOTP, exactly as for every document on an order (`urlDokumenUntukStaf`). The spec's data-and-privacy list names Admin Lokasi, Petugas Lapangan and Mitra Jasa and says nothing about Admin Platform; to make it Admin Lokasi only, change the action in `urlBuktiAhliWaris` and add it to the matrix (one new action).
  - **The Audit Log shows a flag, never the key** (the ticket says never into logs); the agreement scan and the KTP check do put their key in `after`.
- Not changed, for the owner to know: `src/lib/observability/scrub.ts` masks the signed query of the Surat Kuasa link only. The FileStore's own signed URLs (`/api/files/<key>?exp=&sig=`, for every file, not this one) are not masked there. Nothing in this change logs or reports a key, the file or a signed URL, and the route redirects instead of fetching.

**Tests** (real Postgres on the shared `makam-testpg`, in-memory FileStore fake, fake Clock; `MAKAM_TEST_PG=shared npx vitest run <paths>`)

- Domain, `src/domain/pemesanan/tumpang.test.ts`, new block "Bukti ahli waris on a further burial's consent": the proof kept only in the FileStore with the order and the Entri Audit showing it and neither carrying the key; refused without the proof (nothing stored, no reminder, consent still waits, can be logged afterwards); refused when empty, over 10 MB, a renamed text file, or another declared type; a JPG, a PNG and a PDF of exactly 10 MB accepted; a file with a verbal consent refused; no file left behind when the consent was already settled or the write is refused (implicit consent); the signed link opens the file for 5 minutes for the Lokasi's Admin Lokasi and Admin Platform, refused for another Lokasi's Admin Lokasi, expired after 6 minutes; no link without a proof or for an unknown order.
- Action, `tumpang-actions.test.ts`: the file reaches the FileStore, the order and Audit show it; the refusals say what to upload (no file, wrong type, a file with a verbal consent) and store nothing.
- Route, `bukti-ahli-waris/route.test.ts`: 303 with `no-store` to the signed link, 403, 401, 404.
- Static render, `tumpang-forms.test.ts`: the file field (name, accept, label, limit, disabled and not required while verbal), gone once settled, the proof line and its link only when a proof is on file; `tumpang-panel.test.ts` for the view-model flag.
- Counts, each read off a whole log: the five files above, 5 files / 49 tests passed, exit 0; the touched module's neighbours (`src/domain/pemesanan`, `src/app/staf/admin-lokasi`, `rilis-guard`, `rilis`, `duplicate-routes`, `tumpang-panel`), 38 files / 324 tests passed, exit 0; `npm run typecheck` exit 0; `npm run lint` exit 0 (0 errors, 6 warnings in files this change does not touch).

**Unverified:** a real browser (the field's enabling and requirement with the radio, a multipart upload through Next's Server Action, following the 303 to a `DiskFileStore` link); `npm run build` and e2e were not run (no schema, no new dependency; the client file imports only a pure lib). The UAT journey R2-35.3 (`uat/perjalanan/rilis2-tanpa-bayar.uat.ts`) still walks the heirship step by hand, as before; it can now attach the file after picking the radio.

### Review and merge (2026-10-06, orchestrator; fixed point 9da0fb3b, head 0ac31234)

- **Two-axis review:** Standards and Spec reviewers (sonnet) in parallel; round 0: Standards Hard: 0, soft: 7, Spec Hard: 0, soft: 5.
- **Status:** clean, with Hard 0 on both axes in the last round. The soft findings and the builder's spec gaps are in the review entries and in "Spec gaps and decisions for the owner" above; the owner triages them.
- **Merged** in batch MB15, after the full verification (typecheck, lint, build, `npm run test:shared`).

