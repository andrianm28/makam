# Admin Platform Antrean framework

Status: ready-for-agent
Blocked by: 16
Spec: Domain modules > 14. Work Queues (Antrean); stories 140, 141, 143 (Catatan Internal), 144

## What to build

The Work Queues module for Admin Platform: the Antrean as a projection of domain state, where each row type is a query plus a deadline rule, rows are never created by hand and close themselves when state moves on. Four tiers, sorted by tier then deadline. Ambil soft claims (visible to all, takeable by anyone, logged), Catatan Internal threads on every row and order, and the counter strip. Deliver it with its first row types: Tier 4 "publish-gate checks" (a Belum Tayang Lokasi with the gate incomplete), "Lokasi revisits" and "other Tugas Lapangan" (unassigned or overdue).

## Acceptance criteria

- [ ] A row-type registry: each type declares tier, query, deadline rule and the link to its subject; adding a type needs no change to the Antrean UI.
- [ ] Rows sort by tier, then deadline; a row past its deadline is marked.
- [ ] Ambil: any Admin Platform can take a row, including one already taken; each Ambil is logged in the audit log.
- [ ] Catatan Internal can be added on any row and any order; never shown to the Pemesan, Mitra Jasa or Admin Lokasi.
- [ ] The counter strip shows Pencairan due, overdue Tagihan, Terlambat jobs, open Keluhan and rows past deadline; counters with no source yet show 0 and are filled by later tickets.
- [ ] The three Tier 4 row types appear when their state is true and disappear when it's not (e.g. the publish-gate row closes when the Lokasi is published).
- [ ] Tier 3–4 rows never alert.
- [ ] Tests: rows appear with the right tier and deadline and close themselves; sorting; Ambil logged; Catatan Internal hidden from non–Admin Platform roles.

## Notes

Bertugas and Tier 1 alerting come in ticket 28. The spec doesn't define the trigger for the Tier 4 "Lokasi revisits" and "publish-gate checks" rows (see 00-index); this ticket takes the reading above.
