# Jam Operasional, Kontak Siaga and the working-time calculator

Status: ready-for-agent
Blocked by: 10
Spec: Domain modules > 3. Lokasi (Jam Operasional, Kontak Siaga, working-time calculator); story 132

## What to build

Let the Admin Lokasi set its Lokasi's Jam Operasional (weekly hours plus dated closures) and pick the Kontak Siaga from that Lokasi's Admin Lokasi. Build the Lokasi module's working-time calculator: given a Lokasi's Jam Operasional (or the fixed TPU window 06:00–18:00 every day) and a start instant, compute the deadline for N service hours and the next "working day end". Add the two working-day calendars (Admin Platform: Monday–Friday minus national holidays from a list Admin Platform keeps; Admin Lokasi: the Lokasi's Jam Operasional) and N-working-days deadlines. Expose a helper that renders the pre-submission promise text (e.g. "dikonfirmasi paling lambat pukul 08:00").

## Acceptance criteria

- [ ] Weekly hours per weekday (possibly closed) and dated closures can be set by the Admin Lokasi; changes are audited.
- [ ] The Kontak Siaga must be one of the Lokasi's Admin Lokasi; picking anyone else is rejected; removing that Admin Lokasi forces a new pick.
- [ ] `deadline(schedule, start, hours)` pauses outside open hours and on closures (e.g. submitted Sat 21:00, open Sun closed, Mon 08:00–16:00 → 2 service hours ends Mon 10:00).
- [ ] `nextWorkingDayEnd(schedule, start)` returns the end of the next open day after `start`.
- [ ] The TPU schedule is 06:00–18:00 every day (a night submission at 23:00 with 2 service hours → 08:00 next day).
- [ ] Working-day calendars: the Admin Platform calendar is Monday–Friday minus Indonesian national holidays, from a holiday list Admin Platform maintains (audited); an Admin Lokasi calendar is the Lokasi's Jam Operasional open days minus its dated closures. `addWorkingDays(calendar, start, n)` returns the end of the nth working day after `start` (23:59 WIB on the Admin Platform calendar; closing time of Jam Operasional on a Lokasi calendar). Every "N working days" deadline (refund transfer, Pencairan, filing-only check and filing, Wakaf first contact, Setor Retribusi, Admin Lokasi request rows) uses it.
- [ ] "Daytime hours" (Keluhan first response) = hours counted only within 06:00–18:00 WIB, i.e. the TPU schedule.
- [ ] All computations are in Asia/Jakarta and read "now" from the Clock only when a caller doesn't pass a start.
- [ ] Tests: table-driven cases for overnight pauses, weekends, dated closures, a start inside open hours, a start exactly at close, and the TPU window; Admin Platform working days across a weekend and a listed national holiday; Lokasi working days across a closed weekday and a dated closure.
