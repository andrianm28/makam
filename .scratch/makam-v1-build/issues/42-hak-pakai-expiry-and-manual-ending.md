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
- 2026-10-02 — Owner decision 2026-10-02 ("ya setuju semua" to the orchestrator's list of open questions; small concrete choices put to the owner directly, recorded here as settled): the builder's decisions are **accepted** — Kedaluwarsa starts the day after the end date; the Telepon Pemesan row opens from the 7-day reminder on, or with any reminder when there is no recorded email.
