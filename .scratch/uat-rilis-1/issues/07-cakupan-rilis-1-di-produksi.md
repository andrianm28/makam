# Production would expose Rilis 2/3 features: decide the release scope before promote

Status: resolved
Spec: `.scratch/makam-v1/spec.md` "Release plan"; `docs/adr/0005-perpanjangan-in-rilis-1.md`; go-live checklist `go-live-rilis-1.md`.

## What happened

A read-only audit of `main` at 8a4f550 (2026-10-02, after batch 3) found **no release gate**: no feature flag or environment switch for Rilis 2/3. The only gate is a hard-coded "Segera hadir" that removes a link from a tile or menu; the URLs themselves work. Promoting `main` today would put on production:

- **Rilis 2, live:** ticket 42's ticks (`perpanjangan.pengingat_hak_pakai` emails Pemegang Hak at 60/30/7 days and weekly in the Masa Tenggang and opens Telepon Pemesan rows; `inventory.hak_pakai_kedaluwarsa`); ticket 41's manual Perpanjangan paths.
- **Layanan (tickets 49–56) and its thread/Keluhan (51, 52):** live from the homepage tile, the hub card and `/layanan`; Paket Layanan ticks (54) can issue Tagihan.
- **Rilis 3, live by URL or by an internal link:** DKI TPU catalog and pages (43), Saat Duka at a TPU in the main wizard (44, 45), TPU filing and Surat Kuasa (46), TPU Layanan order (56), Keluhan TPU and the Mitra Jasa area (55, 57), Wakaf Tanah (58: homepage tile and menu say "Segera hadir", but the Akun Saya "Wakaf" tab, the staff item and `/wakaf-tanah` are live).
- Not reachable: 35, 39, 47, 48 (not merged); 53 and 59 are waiting for merge.

The release plan and ADR 0005 keep these out of Rilis 1. Production would therefore not match the release plan. The risk is sharpest for ticket 42's reminder tick: it emails real families as soon as Hak Pakai rows exist, which the old-app data question (ticket 65 AC1) may create.

## What the owner decides (grilling)

Release scope for the first production promote: widen Rilis 1 to what `main` holds, or build a release gate, or a mix. See `## What to build (ADR 0006)

- `RILIS_TERBUKA` (1–3) in `src/lib/env.ts`, validated with Zod; production `1`, staging `3`; development and test default to `3` so nothing existing changes for tests and the e2e stack (`deploy/ci/e2e.env`).
- One map, in one module, from each feature to the release that opens it (Rilis 1: everything in ADR 0005 plus Layanan Makam at a Lokasi Mitra, tickets 49–54; Rilis 2: 35, 39, 41, 42, 59, 84; Rilis 3: 43–48, 55–57 and the TPU parts of 51–53, 58), and one function `rilisTerbuka(fitur)` read through the environment, not scattered `if`s.
- Closed feature: public and Akun Saya pages render a "Segera hadir" page; staff pages and Server Actions answer 404 (`notFound()`) before any domain call; menus, tiles, Akun Saya tabs and staff items show their "Segera hadir"/hidden state from the same map; scheduled ticks of a closed feature do not run (registered but skipped, logged once).
- Tests: the map covers every feature route and tick (a guard test that fails when a new `page.tsx` under a gated area or a new tick has no release); production setting closes a Rilis 2 and a Rilis 3 route, action and tick; staging setting opens them; the ticket 42 reminder tick sends nothing at `1`.
- Runbook: where the number is set on each host, and that opening a release is a host setting change plus a restart.

## Acceptance criteria

- [ ] With `RILIS_TERBUKA=1`, no Rilis 2/3 page, action or tick is reachable or runs; Rilis 1 (incl. Layanan at a Lokasi Mitra) is unchanged.
- [ ] With `3`, everything is open (staging, development, test, e2e unchanged).
- [ ] The guard test fails for an unmapped new route or tick.
- [ ] Runbook updated.

## Comments`.

## Comments

- 2026-10-02 — Filed by the orchestrator from the audit; owner decision pending (grilling round 3).
- 2026-10-02 — **Settled through the `grilling` skill (round 3, owner "ya setuju semua" to the recommended answers):**
  - Q8: **build a release gate per environment before the first production promote.** One setting per environment (staging opens everything, production only Rilis 1) closes the Rilis 2/3 routes, menu items, Akun Saya tabs, staff items and scheduled ticks; Rilis 2 and 3 later open by changing the setting, not by a new promote. Production must match the release plan and ADR 0005.
  - Q9: on staging, ticket 42's reminder tick keeps running; the owner's test addresses receive the reminders (a test of the email and the Telepon Pemesan row).
  - Q10: a Ditangguhkan Lokasi's still-up page keeps its prices hidden (ticket 59, as built).
  - Design details of the gate go to grilling round 4; the decision is recorded as an ADR through `domain-modeling` once round 4 settles.
- 2026-10-02 — **Two-axis review of the release gate (branch `fix/release-gate`, head 98ca0d9).** Fixed point origin/main = f75ae2c, confirmed by the orchestrator (44 files).
  - **Standards: 3 hard, 2 borderline, 5 judgement.** HARD 1: ten Server Actions under closed features carry no gate — `src/app/pengurusan/[nomor]/pengajuan-actions.ts` (3), `src/app/staf/admin-platform/pengurusan/[nomor]/pengajuan-actions.ts` (4), `src/app/staf/mitra-jasa/pekerjaan/bukti-actions.ts` (3); Next resolves a Server Action by its ID at any URL, so the proxy is not a gate for actions, and no test covers actions. HARD 2: `src/proxy.ts` passes any path the map does not match, so an encoded segment (`/staf/admin-platform/%74pu/x`) escapes; decode/normalise before matching. HARD 3: the matcher's `.*\.[a-z0-9]+$` exclusion skips the proxy for a dynamic segment holding a dot. Borderline 4: `APP_ENV` defaults to `development`, so a production host without it opens Rilis 3 — the gate must fail closed. Borderline 5: `RILIS_TERBUKA` parsed twice and per request in the proxy. Judgement: `fitur` repeated on ~40 call sites and optional (omitted = open); the staff-nav `?? "inti"` fallback fails open; `rilis?: number` instead of the `Rilis` type; names `said`, `cocok` scoring; the `terlambatTick` TPU skip is not logged.
  - **Spec: 0 hard, 5 judgement.** ACs 1–4 delivered at route level; every audit entry point closed at 1; Rilis 1 (Layanan at a Lokasi Mitra, OTP Perpanjangan, the hub) open. Judgement: the "TPU DKI" chip still shows on the Saat Duka list at 1; `route.ts` handlers are not in the guard test; a merged branch adding a route under a mapped Rilis 1 area inherits Rilis 1 silently (35/39/84); the three ungated action files (same as Standards HARD 1, which the orchestrator rules hard: route-level blocking does not stop an action invoked by ID).
  - **Fix pass**: Standards 1–5 (actions: make the gate exhaustive — `fitur` required in `guarded()`, plus a guard test that every exported action in every `"use server"` file has a release; the proxy: normalise and decode; the matcher: no dot escape; fail closed without `APP_ENV`; parse once), the nav fallback, the `Rilis` type, the TPU chip, `route.ts` in the guard test.
- 2026-10-02 — **Builder (branch `fix/release-gate`):** the release gate is built.
  - **Mechanism:** `src/lib/rilis-peta.ts` (plain data, client-safe): `fiturRilis` (inti 1; perpanjangan_lanjutan and lokasi_ditangguhkan 2; tpu, mitra_jasa, wakaf 3), route patterns, tick map, `terbukaDi`. `src/lib/rilis.ts`: `rilisAktif()` / `rilisTerbuka(fitur)` read `RILIS_TERBUKA` (Zod in `env.ts`; unset: production 1, else 3). `src/proxy.ts`: closed staff route answers 404, closed public/Akun Saya route is rewritten to `/segera-hadir` (also stops a Server Action posted to that URL). `guarded({ fitur })` and `gerbangAksi(fitur)` answer 404 before any actor read or domain call. `ticksForRelease` in the scheduler registers every tick but skips closed ones (logged once); worker uses it. Menus: `publicMenu({rilis})`, `homepageTilesUntuk`, Akun Saya tab, `staffMenu/staffPalette/staffPages({rilis})` follow the same map.
  - **Guard test** (`src/lib/rilis-guard.test.ts`): fails for a page with no mapped release (a new first-level folder under an area) and for a tick with no release.
  - **Runbook:** "Which release is open". `deploy/ci/e2e.env` sets `RILIS_TERBUKA=3` (tested).
  - **Decisions:** Rilis 1 route patterns are explicit per first-level area so a new area must be classified; a new subpage under a classified area inherits its release. `layanan.tandai_terlambat` stays Rilis 1 but its TPU half runs only when Mitra Jasa is open. Tickets 35, 39 and 84 have no route or tick on `main`, so they are not in the map yet.
  - **Spec gaps for the owner:** (1) the TPU parts of Layanan 51-53 inside the shared Layanan pages (`/layanan/[nomor]`, thread) are not hidden separately; a TPU job cannot be ordered at 1 (its order page is closed), so they show nothing. (2) The Saat Duka list hides TPU cards at 1, but the "TPU DKI" type chip remains. (3) `/pembatalan` is treated as Rilis 1 (Terencana cancellation). (4) Public menu "Layanan" item is still "Segera hadir" as before.
- 2026-10-02 — **Builder, fix pass (branch `fix/release-gate`, after the two-axis review):**
  - **1 (actions, exhaustive):** `guarded()` now requires `fitur` (every call says it; Rilis 1 says `"inti"`); the actions that skip `guarded` (Masuk, Kode Masuk steps, Bayar, `ingatKota`, harga pilihan, Perpanjangan OTP) call `gerbangAksi("inti")`; the ten ungated Pengurusan TPU, Admin Platform pengajuan and Mitra Jasa bukti actions carry `tpu` / `mitra_jasa`. Guard test `src/server/rilis-aksi-guard.test.ts` parses every `"use server"` file (an exported action must reach `guarded({fitur})` or `gerbangAksi`, directly or through a function of its own file) and every `guarded(` call. Red first: the three representatives of the ten reached the domain at `RILIS_TERBUKA=1`.
  - **2 (proxy path):** `normalisasiPath` decodes (to a fixed point), lower-cases, drops duplicate and trailing slashes before matching; tested with `%74pu`, `//`, trailing `/`, `%2574pu`, upper case.
  - **3 (matcher):** the `.*\.ext$` exclusion is gone; only `_next/`, `api/`, `favicon.ico`, `robots.txt`, `sw.js`, `staf.webmanifest`, `content/`, `brand/`, `icons/` are skipped; tested with dotted gated paths.
  - **4 (fail closed):** unset or unknown `APP_ENV` gives Rilis 1; only development, test and staging default to 3. Vitest sets `APP_ENV=test` so tests are unchanged.
  - **5:** `readRilisEnv` parses once per distinct setting pair (cached).
  - **6:** staff-nav unmapped item is hidden (not open), a test shows Rilis 3 hides nothing; `Rilis` type replaces `number`; "TPU DKI" chip and TPU section hidden at 1; `route.ts` handlers (outside `/api`) in the page guard; the `terlambatTick` TPU skip logs once; `said` renamed `sudahDicatat`, `cocok` renamed `skorKecocokan` with named score constants.
- 2026-10-02 — **Builder, re-review follow-up:** the action guard test now blanks comments before matching and fails closed on any export form it does not recognise (`export { a as b }`, `export *`, `export default`, sync `export function`); `export const x = async …` is checked like a function. Inline-source tests cover each.
- 2026-10-02 — Merged to main by the orchestrator. Two-axis review: 3 hard (Standards) fixed and re-reviewed (hard remaining no), the action-guard blind spots closed after; merge gate on the merged tree: typecheck, lint, build, full suite 322 files / 2887 tests passed (1 skipped), exit 0 (the first suite run died on a stopped Docker daemon after a container restart; Docker restarted and the suite re-run). Production opens Rilis 1 only once the host runs this image; staging opens 3. Branches for 35, 39 and 47 must now pass `fitur` to `guarded()` before they merge.
- 2026-10-02 — **Follow-up: main CI run 356 (ccd1de2) failed E2E** `e2e/public-site.spec.ts` (Wakaf Tanah linked; one "Segera hadir" instead of two): the spec hard-coded the pre-gate menu while the e2e stack runs `RILIS_TERBUKA=3`. Fixed on `fix/e2e-release-gate` (919634c): the spec derives "Segera hadir" from the release map; the top-menu Layanan item, wrongly "Segera hadir" though the spec's Release plan says Layanan Makam is live in Rilis 1, now links like the homepage tile (red-first unit test). Small-diff review: 0 hard. Merged with batch 47/39/35 (gate 330 files / 2959 tests). The Playwright spec could not run locally (Docker build fails at npm ci); main CI is the proof.
