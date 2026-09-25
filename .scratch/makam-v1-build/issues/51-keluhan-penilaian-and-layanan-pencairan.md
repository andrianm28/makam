# Keluhan, Penilaian and Layanan Pencairan

Status: ready-for-agent
Blocked by: 32, 50
Spec: Domain modules > 9. Layanan (Keluhan window and outcome, Penilaian, Kerjakan ulang); 11. Payouts (Layanan due); 14. Work Queues (Tier 1 Keluhan); 16. Scheduler (Keluhan window closes); stories 94, 95, 97, 131 (Keluhan, redo), 158

## What to build

After proof is shown to the Pemesan (Admin Lokasi upload at a Lokasi; Admin Platform approval at a TPU, ticket 57), a 3×24 h Keluhan window opens. The Pemesan can file a Keluhan (Tier 1 row: first response in 4 daytime hours, decided within the window) and give an optional 1–5 star Penilaian with a comment, visible to Admin Platform only. Admin Platform decides: redo (same or another fulfiller) or refund, and may override the fulfiller's Pencairan amount with a note. A redo at a Lokasi reaches the Admin Lokasi as a Kerjakan ulang row (Mendesak); the Admin Lokasi sees the Keluhan on its Pekerjaan Layanan page. Register the Layanan Pencairan trigger: due when Lunas and the window closes with no Keluhan, a Keluhan is rejected, or the redo proof is shown.

## Acceptance criteria

- [ ] The window starts when the proof is shown to the Pemesan and lasts 3×24 h; Keluhan after it is refused.
- [ ] Tier 1 Keluhan row; closes when decided.
- [ ] Outcomes: rejected; redo (new proof restarts the shown-proof event); refund (item, via ticket 31; netted as Potongan if already paid out).
- [ ] Pencairan override with a mandatory note (e.g. half).
- [ ] Kerjakan ulang row for the Admin Lokasi; closes on new proof.
- [ ] Penilaian 1–5 + comment, one per Pekerjaan Layanan, hidden from Admin Lokasi and Mitra Jasa.
- [ ] Window-close tick (idempotent) makes the Layanan Pencairan due and signals thread closing (ticket 52).
- [ ] Tests: window start at the Lokasi (upload) vs the TPU (approval); each outcome's effect on Pencairan; override; Penilaian visibility.
