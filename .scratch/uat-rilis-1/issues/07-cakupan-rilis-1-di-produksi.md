# Production would expose Rilis 2/3 features: decide the release scope before promote

Status: needs-info
Spec: `.scratch/makam-v1/spec.md` "Release plan"; `docs/adr/0005-perpanjangan-in-rilis-1.md`; go-live checklist `go-live-rilis-1.md`.

## What happened

A read-only audit of `main` at 8a4f550 (2026-10-02, after batch 3) found **no release gate**: no feature flag or environment switch for Rilis 2/3. The only gate is a hard-coded "Segera hadir" that removes a link from a tile or menu; the URLs themselves work. Promoting `main` today would put on production:

- **Rilis 2, live:** ticket 42's ticks (`perpanjangan.pengingat_hak_pakai` emails Pemegang Hak at 60/30/7 days and weekly in the Masa Tenggang and opens Telepon Pemesan rows; `inventory.hak_pakai_kedaluwarsa`); ticket 41's manual Perpanjangan paths.
- **Layanan (tickets 49–56) and its thread/Keluhan (51, 52):** live from the homepage tile, the hub card and `/layanan`; Paket Layanan ticks (54) can issue Tagihan.
- **Rilis 3, live by URL or by an internal link:** DKI TPU catalog and pages (43), Saat Duka at a TPU in the main wizard (44, 45), TPU filing and Surat Kuasa (46), TPU Layanan order (56), Keluhan TPU and the Mitra Jasa area (55, 57), Wakaf Tanah (58: homepage tile and menu say "Segera hadir", but the Akun Saya "Wakaf" tab, the staff item and `/wakaf-tanah` are live).
- Not reachable: 35, 39, 47, 48 (not merged); 53 and 59 are waiting for merge.

The release plan and ADR 0005 keep these out of Rilis 1. Production would therefore not match the release plan. The risk is sharpest for ticket 42's reminder tick: it emails real families as soon as Hak Pakai rows exist, which the old-app data question (ticket 65 AC1) may create.

## What the owner decides (grilling)

Release scope for the first production promote: widen Rilis 1 to what `main` holds, or build a release gate, or a mix. See `## Comments`.

## Comments

- 2026-10-02 — Filed by the orchestrator from the audit; owner decision pending (grilling round 3).
- 2026-10-02 — **Settled through the `grilling` skill (round 3, owner "ya setuju semua" to the recommended answers):**
  - Q8: **build a release gate per environment before the first production promote.** One setting per environment (staging opens everything, production only Rilis 1) closes the Rilis 2/3 routes, menu items, Akun Saya tabs, staff items and scheduled ticks; Rilis 2 and 3 later open by changing the setting, not by a new promote. Production must match the release plan and ADR 0005.
  - Q9: on staging, ticket 42's reminder tick keeps running; the owner's test addresses receive the reminders (a test of the email and the Telepon Pemesan row).
  - Q10: a Ditangguhkan Lokasi's still-up page keeps its prices hidden (ticket 59, as built).
  - Design details of the gate go to grilling round 4; the decision is recorded as an ADR through `domain-modeling` once round 4 settles.
