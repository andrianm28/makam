# Mitra Jasa Pencairan page (ticket 55 AC3)

Status: ready-for-agent
Blocked by: none (found by the UAT runner audit; group B, a gate for level 3; owner approved "ya keduanya", 2026-10-05)
Spec: ticket 55 AC3 (the Mitra Jasa sees their Pencairan), ticket 57 (TPU jobs paid through Pencairan); checklist R3-55.2, R3-57.2

## What to build (MONEY DISPLAY)

`src/app/staf/mitra-jasa/pencairan/page.tsx` is a stub: a heading and an EmptyState that says "Segera hadir". Ticket 55 AC3 and the checklist ask that a Mitra Jasa sees their Pencairan. Each one shows its jobs, with the Layanan, the date and the rate, and no Potongan. Build it from the Payouts and Layanan modules' public reads; the tests already have a `pencairanSaya`-style helper in `tests/support/layanan-tpu.ts`.

## Acceptance criteria

- [ ] **A signed-in Mitra Jasa sees their Pencairan**, newest first. For each: its status and due or paid date, then each job with its Layanan, TPU, date and rate, then the total. There is no Potongan line (Mitra Jasa rates are paid in full).
- [ ] **A Mitra Jasa sees only their own Pencairan.** Other parties' data, family documents and Hak Pakai are never shown.
- [ ] **An empty state** when there is nothing yet.
- [ ] **Tests:** the read on real Postgres (only own items, the amounts equal what Payouts will pay) and a static render.
- [ ] **Money display:** reviewed on the opus tier.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). A gate before level 3 (plan: 'AC3 tiket 55, tampilan Pencairan').
