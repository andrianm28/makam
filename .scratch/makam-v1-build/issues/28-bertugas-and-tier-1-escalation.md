# Bertugas, Tier 1 alerts and escalation

Status: ready-for-agent
Blocked by: 21, 24
Spec: Domain modules > 14. Work Queues (Ambil, Bertugas, escalation); 15. Notifications (Tier 1 staff alerts); 16. Scheduler (escalations, Bertugas auto-off); stories 142, 143

## What to build

Admin Platform can switch Bertugas on to receive Tier 1 alerts; who is Bertugas now is shown at the top of the Antrean. Bertugas switches off automatically at 18:00 or after 12 h, and going off duty asks the staff member to release or annotate their Ambil claims. Tier 1 rows alert the Bertugas staff (everyone if none) by web push + email; a Tier 1 row not taken within 30 min re-alerts every Admin Platform; a Konfirmasi TPU Saat Duka still unconfirmed at 90 min alerts everyone again; night TPU rows alert at 06:00. Tier 3–4 rows never alert.

## Acceptance criteria

- [ ] Bertugas on/off per Admin Platform; the Antrean header lists who is Bertugas now. Switching Bertugas on is refused unless the Admin Platform has at least one active Perangkat Push (ticket 21), with a pointer to turn push on (ADR 0004).
- [ ] While any Tier 1 row is untaken, a red banner shows in the header of every staff page of every Admin Platform (links to the Antrean); no call row for an unanswered Tier 1 alert (ADR 0004, amended 2026-09-26).
- [ ] A tick turns Bertugas off at 18:00 WIB or 12 h after it was switched on, whichever comes first; idempotent.
- [ ] Switching off (by hand) prompts release or a Catatan Internal on each claimed row; auto-off leaves claims and notes the event.
- [ ] A new Tier 1 row alerts the Bertugas Admin Platform (all Admin Platform if none is Bertugas).
- [ ] If not taken (Ambil) within 30 min, every Admin Platform is alerted; for Konfirmasi TPU Saat Duka, a further all-hands alert at 90 min if still unconfirmed (row type hook used by ticket 45).
- [ ] A Tier 1 row created outside 06:00–18:00 for a TPU subject alerts at 06:00.
- [ ] Tier 2 rows show in the Antrean without alerts; Tier 3–4 never alert.
- [ ] Tests: auto-off at 18:00 and at 12 h; alert recipients with and without Bertugas; 30 min and 90 min escalation timing with the fake Clock; night TPU alert at 06:00; idempotent ticks.

## Comments

- 2026-09-26 — ADR 0004: Tier 1 alerts are Peringatan Staf by web push + email, not WhatsApp; Bertugas needs at least one active Perangkat Push; an unanswered Tier 1 alert raises a call row (criteria added). Who is called on that row (the Bertugas Admin Platform, or the family) is not settled by ADR 0004; settle it while building.
- 2026-09-26 — Settled with the user: no call row for an unanswered Tier 1 alert (the platform cannot place calls; whoever missed push and email would miss the row too). Instead the header banner above, plus the existing 30 / 90 min escalation.
- 2026-09-29 — Builder report (branch `ticket-28-bertugas`, not yet reviewed). Built: `src/domain/queues/bertugas.ts` (Bertugas on/off/auto-off, table `antrean_bertugas`), `src/domain/queues/peringatan.ts` (Tier 1 alert tick, banner count, table `antrean_peringatan`), `src/domain/notifications/peringatan-antrean.ts` (words and channels), ticks `queues.peringatan_tier1` and `queues.bertugas_otomatis_mati` in the scheduler, migration `0039_wide_deadpool.sql` (two new tables, no CHECK, no contract DDL). Decisions the builder made inside the spec, for the reviewers to check: (1) the 30 and 90 min clocks count from the first alert (the tick's first sight of the row, or 06:00 for a night TPU row), because Tier 1 rows are projections with no creation time; (2) "row type hook" is `Tier1RowType.tundaMalam` and `.eskalasiLanjutMenit`, both set on Konfirmasi TPU Saat Duka, so ticket 45's row needs nothing more; (3) the automatic switch-off is no staff write, so it has no Entri Audit: the Bertugas stretch keeps `selesai_oleh = otomatis` (the note the staff member sees on the Antrean); (4) `Pengurusan.konfirmasiTpuTerbuka` lost its unused actor argument so the worker can read it; (5) `AntreanRow.alerts` is now true for Tier 1 only, as the AC says Tier 2 shows without alerts (three test expectations updated: telepon-pemesan-row, queues, ambil-surat-pengantar). Readings: `npm run test:shared` on the touched paths (queues, ambil-surat-pengantar, pengurusan, server, app/staf, scheduler, worker, audit, audit-view, tests/tooling, seed-representative): 56 files passed, 403 tests passed, 1 skipped, exit 0; new file `src/domain/queues/bertugas-tier1.test.ts` 18 of 18. `npm run typecheck`, `npm run lint` (0 warnings) and `npm run build` exit 0. Not covered by a test: the banner's non-zero count in the shell (the shell test only proves zero for Admin Platform and Admin Lokasi; the count itself is `queues.tier1BelumDiambil`, tested in the domain file) and the Bertugas forms in the browser.
