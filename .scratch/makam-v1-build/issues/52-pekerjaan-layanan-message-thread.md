# Pekerjaan Layanan message thread

Status: ready-for-agent
Blocked by: 51
Spec: Domain modules > 9. Layanan (Message thread); stories 96, 131 (thread), 171, 180

## What to build

A message thread per Pekerjaan Layanan (text + photos) between the Pemesan and the fulfiller (Admin Lokasi or Mitra Jasa). Each new message notifies the Pemesan by email with a reply link (no message text or photo goes in the email). Admin Platform can read every thread and post. The thread closes when the Keluhan window ends. Contact details are never exchanged through the platform.

## Acceptance criteria

- [ ] Pemesan, the assigned fulfiller and Admin Platform can post; others can't read.
- [ ] A new message from staff/fulfiller sends the Pemesan an email with a reply link; the text and photos stay in-app.
- [ ] Mitra Jasa never see the Pemesan's phone number; the Pemesan sees the Mitra Jasa's first name and photo only.
- [ ] Photos go to FileStore, viewed by signed URL.
- [ ] The thread becomes read-only when the Keluhan window closes.
- [ ] Tests: access rules per role; notification sent without content; closing at window end.

## Comments

- 2026-09-26 — ADR 0004: thread notifications go by email, not a WhatsApp template (updated above).
- 2026-10-02 — Two-axis review (code-review skill, fixed point origin/main c621b71, branch at 22c43d1). Standards: 0 hard; process — code, migration, UI and tests in one commit, test order not verifiable; judgement — `milikSaya` and `namaDepanOf` computed twice in `thread.ts`, a no-op conditional on `peserta.peran`, `thread.ts` doing context + access policy + read/write (split the policy), the messages map typed `Record<string,string>`, photos written before the closed re-check (orphan files on a race). Spec: roles, content-free email, Mitra Jasa first name only and Lokasi closing correct; deferred to ticket 57 (now explicit there): the TPU closing signal and the Mitra Jasa page (story 180); scope creep — the contact-number text filter `kontak_tidak_boleh` is not asked for by the spec (the AC is met by projection) → owner decision, recommendation: drop it; photo/text limits are builder defaults, named as such here (3 photos, 12 MB each, 1000 characters, JPG/PNG/WebP). Fix pass: compute `milikSaya`/`namaDepanOf` once, drop the no-op conditional, type the messages map on the result reasons, check the Admin Lokasi access via `layanan.lihat_staf` is scoped to their own Lokasi (test it). Not in this pass: the policy split (judgement), the filter (waits for the owner).
- 2026-10-02 — Owner decision 2026-10-02 ("ya setuju semua" to the orchestrator's list of open questions; small concrete choices put to the owner directly, recorded here as settled): **drop the contact-number text filter** (`kontak_tidak_boleh`); the spec does not ask for it and the AC is met by projection. Fix pass to remove it and its tests.
