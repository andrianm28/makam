# Bertugas, Tier 1 alerts and escalation

Status: ready-for-agent
Blocked by: 21, 24
Spec: Domain modules > 14. Work Queues (Ambil, Bertugas, escalation); 15. Notifications (Tier 1 staff alerts); 16. Scheduler (escalations, Bertugas auto-off); stories 142, 143

## What to build

Admin Platform can switch Bertugas on to receive Tier 1 alerts; who is Bertugas now is shown at the top of the Antrean. Bertugas switches off automatically at 18:00 or after 12 h, and going off duty asks the staff member to release or annotate their Ambil claims. Tier 1 rows alert the Bertugas staff (everyone if none) by web push + email; a Tier 1 row not taken within 30 min re-alerts every Admin Platform; a Konfirmasi TPU Saat Duka still unconfirmed at 90 min alerts everyone again; night TPU rows alert at 06:00. Tier 3–4 rows never alert.

## Acceptance criteria

- [ ] Bertugas on/off per Admin Platform; the Antrean header lists who is Bertugas now. Switching Bertugas on is refused unless the Admin Platform has at least one active Perangkat Push (ticket 21), with a pointer to turn push on (ADR 0004).
- [ ] An unanswered Tier 1 alert also raises a call row in the Admin Platform Antrean, so a person phones about it (ADR 0004).
- [ ] A tick turns Bertugas off at 18:00 WIB or 12 h after it was switched on, whichever comes first; idempotent.
- [ ] Switching off (by hand) prompts release or a Catatan Internal on each claimed row; auto-off leaves claims and notes the event.
- [ ] A new Tier 1 row alerts the Bertugas Admin Platform (all Admin Platform if none is Bertugas).
- [ ] If not taken (Ambil) within 30 min, every Admin Platform is alerted; for Konfirmasi TPU Saat Duka, a further all-hands alert at 90 min if still unconfirmed (row type hook used by ticket 45).
- [ ] A Tier 1 row created outside 06:00–18:00 for a TPU subject alerts at 06:00.
- [ ] Tier 2 rows show in the Antrean without alerts; Tier 3–4 never alert.
- [ ] Tests: auto-off at 18:00 and at 12 h; alert recipients with and without Bertugas; 30 min and 90 min escalation timing with the fake Clock; night TPU alert at 06:00; idempotent ticks.

## Comments

- 2026-09-26 — ADR 0004: Tier 1 alerts are Peringatan Staf by web push + email, not WhatsApp; Bertugas needs at least one active Perangkat Push; an unanswered Tier 1 alert raises a call row (criteria added). Who is called on that row (the Bertugas Admin Platform, or the family) is not settled by ADR 0004; settle it while building.
