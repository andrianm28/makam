# Perpanjangan manual paths: KTP, heir and claim

Status: resolved
Blocked by: 40
Spec: Domain modules > 7. Perpanjangan (paths, 30-day approval); 5. Inventory (Perlu Verifikasi completion); 14. Work Queues (Periksa dokumen Perpanjangan); stories 59, 60, 61, 67, 124

## What to build

The three document-reviewed paths into Perpanjangan: a Pemegang Hak whose Hak Pakai has no recorded email, or who can no longer use it, uploads a KTP; an heir of a deceased Pemegang Hak files one combined Ganti Pemegang Hak + Perpanjangan request with the death certificate, heirship proof and their KTP; a relative of an Almarhum with no Pemegang Hak on record claims the Hak Pakai with a KTP, proof of relationship and any old receipt. Each becomes a "Periksa dokumen Perpanjangan" row in the Antrean Lokasi due in 2 working days. Approval (with the holder or number updated as needed) leads to the term choice and Tagihan of ticket 40; an approval stays valid for 30 days if the first Tagihan lapses.

## Acceptance criteria

- [ ] Each path collects its listed documents via FileStore; the Admin Lokasi sees them only for its Lokasi.
- [ ] Request statuses Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan (by the requester before a decision); the Periksa dokumen Perpanjangan row exists while Diajukan, due 2 working days on the Lokasi's Jam Operasional calendar (ticket 11); Perlu Perbaikan shows in Perlu tindakan.
- [ ] Approve (Disetujui) / reject (Ditolak) with a reason; approval of the heir path records the Ganti Pemegang Hak (history kept) and of the claim path records the Pemegang Hak; the KTP path updates the recorded email and / or phone number (audited).
- [ ] After approval the applicant chooses terms and gets the pay-first Tagihan (ticket 40 rules).
- [ ] If that Tagihan lapses, a new one can be issued without re-uploading for 30 days from approval; after 30 days a new review is needed.
- [ ] The same blocks as ticket 40 apply (overdue Tagihan, perpetual, too early, Berakhir, Dibatalkan).
- [ ] Completing a Perlu Verifikasi Hak Pakai (contact, end date) is part of the review when flagged.
- [ ] Tests: each path end to end at domain level; 30-day approval validity with the fake Clock; row deadline 2 working days; status transitions including the Perlu Perbaikan round trip.

## Comments

- 2026-09-26 — ADR 0004: the KTP path is for a holder with no usable recorded email (was "number changed"); approval updates the recorded email and phone.

- 2026-09-29 — Builder report (branch `ticket-41-perpanjangan-manual`, not yet reviewed). Readings, each from a log kept whole: `npm run test:shared -- src/domain/perpanjangan src/domain/identity/authorize.test.ts src/lib/perlu-tindakan.test.ts src/components/makam/status-badge.test.ts src/domain/queues src/domain/inventory tests/tooling` = 41 files, 454 passed, 1 skipped; `tests/seed-representative.test.ts src/app src/lib src/server` = 74 files, 611 passed; `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run build` exit 0 (the four new routes are listed). No full suite (the orchestrator's).
  - Design: a manual request is `perpanjangan_permohonan` (migration 0039, no CHECK, so no seed override; additive nullable `perpanjangan.permohonan_id`). Approval records the applicant's Akun email (an Email Terverifikasi) and phone as the holder's contact (KTP: `ubahKontakPemegangHak`) or as the new Pemegang Hak (heir, claim: `gantiPemegangHak`, history kept, readable through `riwayatPemegangHak`), completes a Perlu Verifikasi Hak Pakai in the same transaction (`lengkapiHakPakai`, end date required when none is on record), and sets `berlaku_sampai` = approval + 30 x 24 h. Every write is its own Entri Audit (`perpanjangan.setujui|tolak|minta_perbaikan`, `hak_pakai.ganti_pemegang|ubah_kontak_pemegang`), nested savepoints in one transaction; the entries carry the last 4 digits of the phone and no email.
  - The order step is shared: `pesanTagihan` (extracted from `ajukanPerpanjangan`, ticket 40's direct path unchanged) is what `pesanDariPermohonan` calls after checking approval, owner, 30 days and "not yet paid", so status, `tawaran`, the K limit, the overdue-Tagihan block and the payment effect are the direct path's own. A lapsed first Tagihan is replaced without uploading again; day 31 needs a new request.
  - Documents: private FileStore only, at most 3 MB each (three of them must fit a Server Action body, which `next.config.ts` caps at 11 MB); staff read them through 5-minute signed URLs, only for the request's own Lokasi.
  - Deliberately not built, for the reviewers to weigh: no family message on approve / reject / Perlu Perbaikan (the spec's Notifications list names none and the ACs ask for none; the family sees it on the request page and in Akun Saya's Perlu tindakan strip). Ticket 42 is expected to touch `queues` deps, `tests/support/perpanjangan.ts` and the runtime the same way, so a merge conflict there is additive.
- 2026-09-29 — Merged to `main` (branch at 448a02f; its migration renumbered 0039 → 0041, byte-identical, second `db:generate` empty, snapshot chain unchanged). Two-axis review: the first review found orphan private files when a submission or correction was refused, the Berkas read-back schema repeated, `isi()` copied between actions files and `permohonan.ts` too large; the fix pass cleans up stored files on refusal and on replacement (tested), keeps one `berkasPermohonanSchema`, one `src/server/form-fields.ts` helper and splits the module; the KTP-path finding was left unchanged because the spec (story 59: "no email recorded, or whose recorded email I can no longer use") lets the Pemegang Hak choose the path, which the re-review confirmed. Re-review: every item OK, no hard violation. Follow-ups: none.
