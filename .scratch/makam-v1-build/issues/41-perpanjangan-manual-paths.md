# Perpanjangan manual paths: KTP, heir and claim

Status: ready-for-agent
Blocked by: 40
Spec: Domain modules > 7. Perpanjangan (paths, 30-day approval); 5. Inventory (Perlu Verifikasi completion); 14. Work Queues (Periksa dokumen Perpanjangan); stories 59, 60, 61, 67, 124

## What to build

The three document-reviewed paths into Perpanjangan: a Pemegang Hak whose number changed uploads a KTP; an heir of a deceased Pemegang Hak files one combined Ganti Pemegang Hak + Perpanjangan request with the death certificate, heirship proof and their KTP; a relative of an Almarhum with no Pemegang Hak on record claims the Hak Pakai with a KTP, proof of relationship and any old receipt. Each becomes a "Periksa dokumen Perpanjangan" row in the Antrean Lokasi due in 2 working days. Approval (with the holder or number updated as needed) leads to the term choice and Tagihan of ticket 40; an approval stays valid for 30 days if the first Tagihan lapses.

## Acceptance criteria

- [ ] Each path collects its listed documents via FileStore; the Admin Lokasi sees them only for its Lokasi.
- [ ] Request statuses Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan (by the requester before a decision); the Periksa dokumen Perpanjangan row exists while Diajukan, due 2 working days on the Lokasi's Jam Operasional calendar (ticket 11); Perlu Perbaikan shows in Perlu tindakan.
- [ ] Approve (Disetujui) / reject (Ditolak) with a reason; approval of the heir path records the Ganti Pemegang Hak (history kept) and of the claim path records the Pemegang Hak; the number change path updates the number (audited).
- [ ] After approval the applicant chooses terms and gets the pay-first Tagihan (ticket 40 rules).
- [ ] If that Tagihan lapses, a new one can be issued without re-uploading for 30 days from approval; after 30 days a new review is needed.
- [ ] The same blocks as ticket 40 apply (overdue Tagihan, perpetual, too early, Berakhir, Dibatalkan).
- [ ] Completing a Perlu Verifikasi Hak Pakai (contact, end date) is part of the review when flagged.
- [ ] Tests: each path end to end at domain level; 30-day approval validity with the fake Clock; row deadline 2 working days; status transitions including the Perlu Perbaikan round trip.
