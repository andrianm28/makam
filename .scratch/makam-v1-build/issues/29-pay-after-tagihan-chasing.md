# Chasing overdue pay-after Tagihan and Tidak Tertagih

Status: ready-for-agent
Blocked by: 25
Spec: Domain modules > 10. Billing (Chasing, Tidak Tertagih loss, blocks while overdue); 15. Notifications (reminder schedule); 14. Work Queues (Tier 3 Tagihan lewat jatuh tempo); stories 133, 160

## What to build

Chasing for pay-after Tagihan only (Saat Duka and burials under an existing Hak Pakai): automatic reminders at H+3/7/14/30 after the due date, an overdue list from H+1 with a call log, a Tier 3 Antrean row, Admin Lokasi push at H+1 and on Tidak Tertagih, and Admin Platform declaring Tidak Tertagih by hand from H+30 after at least one logged call. The Admin Lokasi gets a read-only list of its Lokasi's overdue Tagihan with the call log and can add notes. Expose the "overdue pay-after Tagihan on this Hak Pakai" query that blocks Perpanjangan and Ganti Pemegang Hak, and let the Admin Lokasi end the Hak Pakai once the Tagihan is Tidak Tertagih.

## Acceptance criteria

- [ ] Reminders to the Pemesan at H+3, H+7, H+14 and H+30 within 08:00–20:00, stopping as soon as the Tagihan is Lunas or Tidak Tertagih.
- [ ] The overdue list starts at H+1; call log entries carry outcome janji bayar / tidak diangkat / menolak / nomor salah; the row expects at least two calls, around H+1 and around H+14, made 08:00–20:00.
- [ ] The Admin Lokasi adds notes on the same call log for its own Lokasi's Tagihan and can't declare Tidak Tertagih.
- [ ] Tidak Tertagih is rejected before H+30 or with no logged call; after it the Tagihan stays payable.
- [ ] Admin Lokasi web push at H+1 and when the Tagihan is declared Tidak Tertagih.
- [ ] `isBlockedByOverdueTagihan(hakPakai)` returns true while a Lokasi Mitra Saat Duka Tagihan on it is Lewat Jatuh Tempo.
- [ ] Once Tidak Tertagih, the Admin Lokasi may end the Hak Pakai (Berakhir with reason); not for a burial under an existing Hak Pakai.
- [ ] Tidak Tertagih loss: no Pencairan is due for it unless the family pays later (enforced when ticket 32 lands; recorded here as the Tagihan state).
- [ ] Tests: reminder schedule and stop conditions; Tidak Tertagih guard (H+30 + a call); block query; end-Hak-Pakai permission after Tidak Tertagih only.
