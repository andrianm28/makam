# Hak Pakai expiry reminders, masa tenggang and manual ending

Status: ready-for-agent
Blocked by: 40
Spec: Domain modules > 5. Inventory (status, Pembongkaran, set Tidak Tersedia, end Hak Pakai); 15. Notifications (Hak Pakai end reminders); 14. Work Queues (Hak Pakai in masa tenggang); stories 57, 129, 130

## What to build

The end of a fixed-term Hak Pakai. Reminders go to the Pemegang Hak and the Admin Lokasi 60, 30 and 7 days before the end date, then weekly during the Masa Tenggang, each with a Perpanjangan link, stopping once a Perpanjangan is ordered. At the end date the Hak Pakai becomes Kedaluwarsa (Petak shows Masa Berlaku Habis); a "Hak Pakai in masa tenggang" row appears in the Antrean Lokasi so the Admin Lokasi decides whether to end it. From the Petak / Hak Pakai page the Admin Lokasi can end a Hak Pakai by hand (Berakhir with reason, final), record a Pembongkaran, or mark a Petak Tidak Tersedia.

## Acceptance criteria

- [ ] Reminders go by email to the Pemegang Hak's recorded email; a Hak Pakai nearing its end also raises a "Telepon Pemesan" row (ticket 20), as does any reminder for a Hak Pakai with no recorded email (ADR 0004).
- [ ] Reminder ticks at 60/30/7 days before and weekly in the Masa Tenggang, within 08:00–20:00, to both the Pemegang Hak and the Admin Lokasi; stop when a Perpanjangan is ordered or the Hak Pakai ends.
- [ ] Status Kedaluwarsa after the end date; still extendable until the Masa Tenggang ends (Lokasi policy, default 3 months).
- [ ] Masa tenggang row appears in Lainnya and closes on Perpanjangan payment or ending.
- [ ] Ending is final: Berakhir with a reason; any Paket on it stops (hook used by ticket 54); a resale creates a new Hak Pakai.
- [ ] After ending, the plot stays Terisi until a Pembongkaran is recorded, which makes it empty (Tersedia) again.
- [ ] Tidak Tersedia (with reason) only without an active Hak Pakai.
- [ ] All actions audited.
- [ ] Tests: reminder schedule; Kedaluwarsa transition; masa tenggang row; end → Terisi until Pembongkaran; Tidak Tersedia guard.

## Comments

- 2026-09-26 — ADR 0004: reminders go by email; a Hak Pakai nearing its end gets a "Telepon Pemesan" call row (criterion added). When exactly the row appears (e.g. at the 7-day reminder) is not fixed by ADR 0004; settle it while building.
- 2026-10-02 — Builder (branch `ticket-42-hak-pakai-expiry`; not a review record). **Domain slice built, UI not.**
  - **Built.** Inventory: `kedaluwarsaTick` (Aktif becomes Kedaluwarsa the day after the end date, WIB; Petak shows Masa Berlaku Habis), `hakPakaiMasaTenggang`, `hakPakaiMenjelangAkhir`, `akhiriHakPakaiManual` (Admin Lokasi, reason required, audited `hak_pakai.akhiri`; allowed on Aktif or Kedaluwarsa), `catatPembongkaran` (audited; plot Terisi until then, then Tersedia; migration 0050 adds `pembongkaran_at`). Tidak Tersedia is the existing `clearPetak` (refused while a Hak Pakai holds the Petak, allowed after a Pembongkaran). Antrean Lokasi "Hak Pakai dalam masa tenggang" row (Lainnya, no deadline). Perpanjangan `pengingatHakPakaiTick` (60/30/7 days, weekly in the Masa Tenggang, only 08:00-20:00 WIB, claim table `perpanjangan_pengingat`, migration 0051), Notifications `pengingatHakPakaiBerakhir` (email to the recorded email with the Perpanjangan link, Peringatan Staf to each Admin Lokasi, Telepon Pemesan row). Scheduler: `inventory.hak_pakai_kedaluwarsa` and `perpanjangan.pengingat_hak_pakai`, wired in the worker.
  - **Decisions (the owner's to overrule).** Kedaluwarsa starts the day after the end date (the end date is the last valid day, matching the Perpanjangan window). The Telepon Pemesan row opens with the 7-day reminder and every reminder after it, and with any reminder when no email is recorded (ADR 0004 left the moment open). A tick that first sees a Hak Pakai late sends only the latest stage. Reminders stop while an ordered Perpanjangan still waits for payment; a lapsed one lets them resume. "Any Paket on it stops": Layanan already refuses a Berakhir Hak Pakai (`hak_pakai_berakhir`), so no new hook was written.
  - **Not built (HANDOFF).** The staff UI: the Petak / Hak Pakai page with "Akhiri Hak Pakai", "Catat Pembongkaran" and "Tandai Tidak Tersedia" (Server Actions `guarded()` calling `inventory.akhiriHakPakaiManual` / `catatPembongkaran` / `clearPetak`), and the row's `href` (today the Denah page). No Hak Pakai detail page exists in `src/app/staf/admin-lokasi/[lokasiId]`. Unverified: `npm run build`, the pg-boss smoke test, and the full suite. After a Pembongkaran, burial layer counts for tumpang still read by Petak, not by Hak Pakai.
  - **Spec gaps for the owner.** None blocking. The spec says "at the end date the Hak Pakai becomes Kedaluwarsa" and the AC says "after the end date"; built as after.
