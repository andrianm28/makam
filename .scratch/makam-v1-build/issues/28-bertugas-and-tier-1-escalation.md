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
- 2026-09-28 — **Owner decision, settled and built here: Bertugas is an attribute of the Antrean, stored in a new `antrean_bertugas` table with a `petugas_account_id` column — not a column on the Akun Staf.** The Antrean is already where predictive work enters, so being on duty is a fact about an Antrean item rather than a state of an account. Two consequences the design keeps: a person can be on duty without becoming a Staf Akun (switching on creates no Akun, grants no role and starts no session, and a person with no Akun has no row and cannot be Bertugas), and the table has **no Lokasi column at all**, so one person is on duty for the whole Antrean at once. The alternative was rejected because a `bertugas` flag on the Akun Staf equates "staff" with "on call" and would make a person Bertugas at exactly one Lokasi, which contradicts the settled decision in ticket 55 that one Akun may hold many roles (`spec.md:342`). The rota stays outside the platform, as CONTEXT.md says.
- 2026-09-28 — Two timing points the AC left open, decided here and pinned in tests. (1) A Tier 1 escalation is counted from the moment the row was **announced**, not from the moment it appeared: for a row created inside 06:00–18:00 WIB the two are the same instant, and for a night TPU row it means nobody is escalated about a duty nobody had been told of. (2) The 18:00 WIB auto-off is a **wall-clock cut-off** and the 12 h cap is a plain duration from the Clock; neither is a Hari Kerja or service-hour deadline, so `addWorkingDays` has no part in this ticket, and the 06:00 hold is read off the working-time calculator's TPU schedule (`isOpenAt`, `nextDaytimeStart`) rather than computed by a deadline function. A Peringatan Staf is `transaksional` (`TABEL_ACARA.peringatan_staf`), so the 08:00–20:00 WIB reminder window — a delivery window for family reminders — never defers one; a test pins that a night TPU row alerts at 06:00 and not at 08:00.
- 2026-09-28 — Where the alert state lives: a projection has no rows to store an "already alerted" mark on, so the Work Queues module owns `antrean_peringatan` (row key + stage), and inserting a (row, stage) pair is the claim. That is what makes the tick idempotent, exactly as `pemesanan_makam.realert_pada` does for ticket 23's re-alert. A Tier 1 row type declares when and how far it escalates (`peringatan: { tpu, eskalasiMenit }` in the row-type registry), which is the hook ticket 45 uses for Konfirmasi TPU Saat Duka's 30 and 90 minutes.
