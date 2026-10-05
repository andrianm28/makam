# Staff screens: the Telepon Pemesan row for a Hak Pakai without email leads to a 404, and the Pulihkan dialog keeps the Tangguhkan reason

Status: ready-for-agent
Blocked by: none (found by the UAT runner audit and a review on 2026-10-05; group A; owner approved "ya keduanya", 2026-10-05)
Spec: tickets 42 (reminders and the Antrean) and 59 (Ditangguhkan and Berhenti); checklist R2-42.2 and R2-59.1

## What to build

1. **The Antrean Lokasi row "Telepon Pemesan" links to `/staf/admin-lokasi/<id>/pesanan/` with no Nomor (a 404)** when the Hak Pakai has no recorded email. Such a Hak Pakai has no order, for example one cleared in the Denah. The cause is `src/domain/queues/antrean-lokasi-rows.ts` (about line 101), which uses `telepon.nomorPemesanan ?? ""`. The row must lead to the Hak Pakai's own page, where the staff member logs the call.
2. **The Admin Platform's Lokasi status dialogs reuse one ConfirmDialog across the status change.** In `src/app/staf/admin-platform/lokasi/lokasi-forms.tsx` (about lines 378 and 393) the Fragments have no key. `src/components/makam/confirm-dialog.tsx` (about line 49) never resets its reason. So after Tangguhkan, the Pulihkan dialog opens with the suspension reason already typed in, and the Audit Log can record the wrong reason. For a moment two "Pulihkan" buttons also show.

## Acceptance criteria

- [ ] **The row:** "Telepon Pemesan" for a Hak Pakai without an order opens a page that exists, the Hak Pakai's page. With an order it opens the order as today. Logging the call still closes the row.
- [ ] **The dialogs:** each status dialog opens with an empty reason. A dialog never carries the reason of another action.
- [ ] **Tests:**
  - the queue row's link, through the Antrean read on real Postgres, for both kinds of Hak Pakai;
  - the dialog's reason resets, through a static render or the action input.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Both are small staff-side defects.
