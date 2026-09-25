# TPU Layanan order and Mitra Jasa assignment

Status: ready-for-agent
Blocked by: 50, 55
Spec: Domain modules > 9. Layanan (Order at TPU, Mitra Jasa hand assignment, accept deadline); 14. Work Queues (Tier 1 jobs due today without a Mitra Jasa, Tier 2 Tidak direspons / Ditolak / reassignment); 16. Scheduler (accept deadlines); stories 85, 156, 176, 178

## What to build

A family orders Layanan at a DKI TPU by describing the grave (TPU, blok/nomor, Almarhum, optional photo and pin) or by choosing their Makam TPU, at DKI prices with a pay-first Tagihan. Admin Platform assigns each Pekerjaan Layanan by hand from a picker hard-filtered by coverage (TPU and Layanan), status Aktif and availability. The Mitra Jasa gets a WhatsApp + push alert and accepts or declines in the app by the accept deadline (12 h or H-1 18:00, whichever is sooner); no answer counts as a decline (Tidak direspons). The Mitra Jasa sees the grave location or description, the Layanan, the target date and reference photos, never the family's contacts.

## Acceptance criteria

- [ ] Grave description order works without a Makam TPU; ordering from a Makam TPU prefills it.
- [ ] Picker shows only Aktif Mitra Jasa covering the TPU and the Layanan and not Tidak tersedia on the target date.
- [ ] Accept deadline = min(assignment + 12 h, H-1 18:00); the tick marks Tidak direspons and the job returns to the queue.
- [ ] Tier 1 row: jobs due today without an accepted Mitra Jasa; Tier 2 rows: Tidak direspons / Ditolak / flagged for reassignment.
- [ ] Reassignment: only the Mitra Jasa who does the job is paid (enforced in ticket 57).
- [ ] The Pemesan sees the Mitra Jasa's first name and photo once accepted.
- [ ] Tests: picker filters; accept deadline both branches; Tidak direspons counted on the scorecard; Mitra Jasa job view has no family contact fields.
