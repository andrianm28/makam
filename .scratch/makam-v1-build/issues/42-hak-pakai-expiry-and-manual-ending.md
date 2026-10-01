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
- 2026-10-01 — Builder (branch `ticket-42`; not yet reviewed). Built the Inventory half of this ticket; the reminder-sending half is handed off below.
  - **Kedaluwarsa transition.** `inventory.tandaiKedaluwarsa(now)` (tick `inventory.tandai_kedaluwarsa`, hourly) turns an Aktif fixed-term Hak Pakai Kedaluwarsa once its WIB end date is behind today; the end date itself stays Aktif ("after the end date"). The Petak then shows Masa Berlaku Habis. Idempotent.
  - **Masa tenggang row (story 130).** `inventory.hakPakaiMasaTenggang(lokasiId)` reads Kedaluwarsa rights whose Lokasi policy Masa Tenggang (default 3 months) still covers today; the Antrean Lokasi's Lainnya row "Hak Pakai in masa tenggang" projects it and closes itself on a Perpanjangan payment (Aktif again) or an ending (Berakhir). It links to the Denah page, because no Petak / Hak Pakai page exists yet.
  - **Berakhir by hand (story 129).** `inventory.berakhirkanHakPakai(actor, lokasiId, { hakPakaiId, alasan })`, permission `hak_pakai.berakhir` (that Lokasi's own Admin Lokasi), audited as `hak_pakai.berakhir`. An Aktif or Kedaluwarsa right may be ended; ending is final.
  - **Pembongkaran (story 129).** Two nullable columns on `inventory_hak_pakai` (`pembongkaran_at`, `pembongkaran_reason`; migration `0047` is expand-only) and `inventory.catatPembongkaran`, audited as `hak_pakai.pembongkaran`. Only a Berakhir right may be demolished, once; `memegangPetak` / `forStatus` then treat the plot as free, so it derives Tersedia and can be sold or cleared again.
  - **Tidak Tersedia guard.** `clearPetak` mode `tidak_tersedia` already refused any holding right; a Berakhir right without a Pembongkaran still holds the grave (Terisi), and the guard only lifts after the Pembongkaran. Tested.
  - **Reminder schedule rule (pure).** `inventory/expiry.ts` `pengingatHakPakaiHari` gives 60/30/7 days before and then weekly through the Masa Tenggang; `sudahKedaluwarsa` and `masaTenggangSelesai` with it. Tested; not yet sent.
  - **Spec gaps / decisions.** None: the ACs not covered below are simply not built yet. `Status:` untouched.
  - Tests: `src/domain/inventory/expiry.test.ts` (schedule, Kedaluwarsa date) and `akhir-masa-pakai.test.ts` (transition, masa tenggang row, ending, Pembongkaran, Tidak Tersedia guard). `npx vitest run src/domain/inventory src/domain/queues` = 219 passed; `src/domain/scheduler src/worker` = 7 passed; lint, typecheck and build clean.

  **HANDOFF (next agent).** Not built: the reminder *sending* — email to the Pemegang Hak and the Admin Lokasi at 60/30/7 and weekly in the Masa Tenggang within 08:00–20:00, the "Telepon Pemesan" row for a nearing-end Hak Pakai and for one with no recorded email, and "stop when a Perpanjangan is ordered" (read `perpanjangan.perpanjanganUntukHakPakai`). Also not built: the Petak / Hak Pakai page and its Server Actions to call `berakhirkanHakPakai` / `catatPembongkaran` (domain functions are ready); the Antrean row links to the Denah. Add a Notifications tick composing the new Inventory read and the Perpanjangan read; dedupe each reminder per (Hak Pakai, macam). Unverified: no e2e.
