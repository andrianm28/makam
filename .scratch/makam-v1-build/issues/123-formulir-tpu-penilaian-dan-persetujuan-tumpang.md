# TPU family forms: a Penilaian for TPU Layanan jobs, and a required tumpang consent

Status: ready-for-agent
Blocked by: none (found by the UAT runner audit; group B, plus owner rule C3; owner approved "ya keduanya", 2026-10-05)
Spec: ticket 51 (Keluhan and Penilaian), ticket 44 (Saat Duka at a TPU, tumpang); checklist R3-51.1, R3-44.2

## What to build

1. **Penilaian for a finished TPU Layanan job.** `src/app/layanan/[nomor]/pekerjaan-tpu.tsx` has the Keluhan form (test id `keluhan-tpu-form`) but no Penilaian. The Lokasi Mitra job page has one (`BeriPenilaian` in `src/app/layanan/[nomor]/keluhan.tsx`). Give TPU jobs the same, within the same window, feeding the Mitra Jasa scorecard (ticket 55) as the module already defines.
2. **A required consent for tumpang at a TPU DKI.** The Saat Duka TPU form (`src/app/pesan-makam/saat-duka/tpu/data-tpu.tsx`, about lines 340-362) shows the 3-year IPTM warning and lists the Pemegang Hak's letter of consent, but has no consent checkbox. Owner rule C3 (2026-10-05): **add a required checkbox.** "Kirim" stays disabled until the family confirms they understand the tumpang conditions (the 3-year rule, the Pemegang Hak's letter). The Server Action refuses an order without it (Zod).

## Acceptance criteria

- [ ] **Penilaian:** the family rates a TPU job after it is finished, once and within the window. The rating reaches the Mitra Jasa's scorecard read.
- [ ] **Tumpang consent:** "Kirim" stays disabled until it is checked. The action refuses a tumpang order without consent, with a clear message. Non-tumpang orders are unchanged.
- [ ] **Tests:** public functions on real Postgres for the Penilaian; the action's refusal for the consent; a static render for both.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Owner rule C3 chose 'Tambahkan centang wajib'.
