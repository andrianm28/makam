# Admin Platform Antrean framework

Status: ready-for-agent
Blocked by: 16, 74
Spec: Domain modules > 14. Work Queues (Antrean); stories 140, 141, 143 (Catatan Internal), 144

## What to build

The Work Queues module for Admin Platform: the Antrean as a projection of domain state, where each row type is a query plus a deadline rule, rows are never created by hand and close themselves when state moves on. Four tiers, sorted by tier then deadline. Ambil soft claims (visible to all, takeable by anyone, logged), Catatan Internal threads on every row and order, and the counter strip. Deliver it with its first row types: Tier 4 "Lokasi revisits" and "publish-gate checks", which appear only after Admin Platform presses "Minta kunjungan ulang" on a Lokasi Mitra (creating the Kunjungan Verifikasi Tugas Lapangan, ticket 15; no automatic schedule in v1), and "other Tugas Lapangan" (unassigned or overdue).

## Acceptance criteria

- [ ] A row-type registry: each type declares tier, query, deadline rule and the link to its subject; adding a type needs no change to the Antrean UI.
- [ ] Rows sort by tier, then deadline; a row past its deadline is marked.
- [ ] Ambil: any Admin Platform can take a row, including one already taken; each Ambil is logged in the audit log.
- [ ] Catatan Internal can be added on any row and any order; never shown to the Pemesan, Mitra Jasa or Admin Lokasi.
- [ ] The counter strip shows Pencairan due, overdue Tagihan, Terlambat jobs, open Keluhan and rows past deadline; counters with no source yet show 0 and are filled by later tickets.
- [ ] The three Tier 4 row types appear when their state is true and disappear when it's not. "Lokasi revisit" is open while a Kunjungan Verifikasi from "Minta kunjungan ulang" is not Selesai; "publish-gate check" is open from that visit's Selesai until Admin Platform records that the Lokasi still meets the publish gate (audited). Neither appears without that button press (no row for a Belum Tayang Lokasi during onboarding).
- [ ] Tier 3–4 rows never alert.
- [ ] Tests: rows appear with the right tier and deadline and close themselves; sorting; Ambil logged; Catatan Internal hidden from non–Admin Platform roles.

## Notes

Bertugas and Tier 1 alerting come in ticket 28. The Tier 4 revisit trigger was settled on 2026-09-25 (see 00-index); how the two rows split one revisit is this ticket's reading.

## Comments

- 2026-09-25 — From ticket 08 (WhatsApp OTP login): please add the test "an OTP failure creates no Antrean row" once the Antrean exists. Drive `identity.requestOtp` with a WhatsAppSender that throws (it returns `gagal_kirim`), then read the Antrean and check that no row came from it. The OTP is sent directly through WhatsAppSender, not through Notifications, so nothing should reach a queue. Ticket 08 could not test this because the queues module was still empty.

- 2026-09-26 — Now also blocked by 74 (user decision): build the UI on the brand design system and staff shell from ticket 74 (spec, "Staff UI and design system").
