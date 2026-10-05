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

### Build (2026-10-05)

Builder (branch `ticket-119-antrean-telepon-dialog-status`, from origin/main 9da0fb3b). The Status line is untouched.

**1. The Telepon Pemesan row of the Antrean Lokasi.**
- The rule is in the Queues module, `teleponHref` in `src/domain/queues/antrean-lokasi-rows.ts`. A call about a Hak Pakai (`subjectKind` `hak_pakai`: its end is near, or its Pemegang Hak has no email) opens `/staf/admin-lokasi/<id>/hak-pakai/<hakPakaiId>`, the page the Denah's Petak redirects to and the masa tenggang row already opens. A row with a Nomor Pemesanan opens the order as before. Anything else (a Bukti Perpanjangan to hand over, a Hak Pakai reminder email that failed for good) stays on the Antrean Lokasi page, never `/pesanan/` with no Nomor.
- Logging the call is untouched: the form is on the row (`CatatPanggilanForm`, `notifications.catatPanggilan`), and a test shows the Hak Pakai's row closes when the call is logged.
- Tests in `src/domain/queues/antrean-lokasi.test.ts`, real Postgres, through `antreanLokasi`. Red first: 3 failed, each `Received: ".../pesanan/"`. (a) A Hak Pakai cleared in the Denah, no email: reminder tick, row, link to the Hak Pakai page, call logged, row closed. (b) A Hak Pakai nearing its end whose Pemegang Hak has an email: the same page. (c) A Bukti Perpanjangan with no email: the Antrean Lokasi page. I also added one assertion to the existing failed-message test: an order's rows still open the order ("as today").
- Beyond the wording: the Hak Pakai page now shows "Telepon Pemegang Hak". `hakPakaiById` already returned the number, the page did not show it, and the staff member needs it to make the call (the order page shows its phone). Display only, no domain rule, one line to drop. No test: the page is a Server Component and the repo has no page-render pattern.

**2. The Lokasi status dialogs.**
- Cause confirmed in a real browser before the fix, with a scratch harness (esbuild bundle of the real `StatusLokasiForms` in Chromium, not committed): after Tangguhkan with a reason and a status change while the dialog animates out, 2 "Pulihkan" buttons showed, and the Pulihkan dialog opened with "Alasan penangguhan" in its field; a reason typed and cancelled also came back. After the fix: 1 button, an empty field both times, and the confirming click still posts the typed reason.
- Fix, two parts as the ticket says. `StatusLokasiForms` gives its two Fragments a key (`tangguhkan`, `pulihkan`). `ConfirmDialog` keeps `{ open, reason }` in a reducer (`src/components/makam/confirm-dialog-state.ts`) that empties the reason when the dialog **opens**. It is not emptied on close: the confirm button closes the dialog and submits in the same click, and the form reads the textarea at that moment. With a reset on close in the harness, the emptied `required` textarea blocked the submit and nothing was posted.
- Tests: `src/components/makam/confirm-dialog-state.test.ts`, 5 tests (red: module missing; then green). The ticket allows "a static render or the action input". A static render cannot show this dialog (its content is portalled and closed); the action input is already covered on the server (`lokasi/status-pesanan.test.ts`, "records the reason Admin Platform gives in the audit entry of each decision") and the server was never the fault; the repo has no DOM test environment (`environment: "node"`). So the reset rule is tested as a pure state function, and the wiring (keys, reducer in the component) was checked in the browser harness only.
- `docs/design-system.md`: the ConfirmDialog row says every opening starts with the reason empty.

**Spec gaps and decisions for the owner:** no requirement was narrowed or reworded.
1. The ticket calls the Hak Pakai page the place "where the staff member logs the call". The call is logged on the Antrean row, as it is for an order (the order page has no call form either). I left it so; the AC "Logging the call still closes the row" holds and is tested.
2. A Telepon row for a Hak Pakai reminder email that failed for good (`pesan_lokasi`) carries only the message id, so it opens the Antrean Lokasi page, not the Hak Pakai. Leading it to the Hak Pakai needs the row to carry the Hak Pakai id, a Notifications schema change: a follow-up if wanted.
3. A reason typed for an action that then failed is not kept: the dialog opens empty every time, as the AC says.
4. The settle wait and its comment in UAT R2-59.1 (`uat/perjalanan/rilis2-bayar.uat.ts`) are untouched. The second "Pulihkan" no longer appears; the wait is harmless, the comment is now stale.
5. The "Telepon Pemegang Hak" line on the Hak Pakai page (above) is an addition the AC does not list.

**Verified** (whole logs read): `npx vitest run` over `src/domain/queues/antrean-lokasi.test.ts` (12 tests, 3 new), `src/components/makam/confirm-dialog-state.test.ts` (5), `src/domain/perpanjangan/pengingat.test.ts` and `src/domain/queues/konfirmasi-terencana-row.test.ts`: 4 files, 33 tests, exit 0. The source-scanning guards (`dependency-direction`, `no-ticket-numbers`, `no-retired-company-name`, `copy-scan`, `duplicate-routes`, `use-server-exports`): 6 files, 17 tests, exit 0. `npm run lint` exit 0 (6 warnings, none in these files). `npm run typecheck` exit 0. No `npm run build`, no full suite.
