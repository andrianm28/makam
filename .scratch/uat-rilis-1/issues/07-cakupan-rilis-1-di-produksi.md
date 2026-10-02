# Production would expose Rilis 2/3 features: decide the release scope before promote

Status: ready-for-agent
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
- 2026-10-02 — **Builder (branch `fix/release-gate`):** the release gate is built.
  - **Mechanism:** `src/lib/rilis-peta.ts` (plain data, client-safe): `fiturRilis` (inti 1; perpanjangan_lanjutan and lokasi_ditangguhkan 2; tpu, mitra_jasa, wakaf 3), route patterns, tick map, `terbukaDi`. `src/lib/rilis.ts`: `rilisAktif()` / `rilisTerbuka(fitur)` read `RILIS_TERBUKA` (Zod in `env.ts`; unset: production 1, else 3). `src/proxy.ts`: closed staff route answers 404, closed public/Akun Saya route is rewritten to `/segera-hadir` (also stops a Server Action posted to that URL). `guarded({ fitur })` and `gerbangAksi(fitur)` answer 404 before any actor read or domain call. `ticksForRelease` in the scheduler registers every tick but skips closed ones (logged once); worker uses it. Menus: `publicMenu({rilis})`, `homepageTilesUntuk`, Akun Saya tab, `staffMenu/staffPalette/staffPages({rilis})` follow the same map.
  - **Guard test** (`src/lib/rilis-guard.test.ts`): fails for a page with no mapped release (a new first-level folder under an area) and for a tick with no release.
  - **Runbook:** "Which release is open". `deploy/ci/e2e.env` sets `RILIS_TERBUKA=3` (tested).
  - **Decisions:** Rilis 1 route patterns are explicit per first-level area so a new area must be classified; a new subpage under a classified area inherits its release. `layanan.tandai_terlambat` stays Rilis 1 but its TPU half runs only when Mitra Jasa is open. Tickets 35, 39 and 84 have no route or tick on `main`, so they are not in the map yet.
  - **Spec gaps for the owner:** (1) the TPU parts of Layanan 51-53 inside the shared Layanan pages (`/layanan/[nomor]`, thread) are not hidden separately; a TPU job cannot be ordered at 1 (its order page is closed), so they show nothing. (2) The Saat Duka list hides TPU cards at 1, but the "TPU DKI" type chip remains. (3) `/pembatalan` is treated as Rilis 1 (Terencana cancellation). (4) Public menu "Layanan" item is still "Segera hadir" as before.
