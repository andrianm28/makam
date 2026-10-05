# Tumpang at a Lokasi Mitra: the heirship proof can be uploaded

Status: ready-for-agent
Blocked by: none (found by the UAT runner audit; group B; owner approved "ya keduanya", 2026-10-05)
Spec: ticket 35 (tumpang under an existing Hak Pakai, with consent); checklist R2-35.3

## What to build

When the Pemegang Hak has died, a tumpang needs the heirs' consent with a heirship proof (ticket 35). The Admin Lokasi's tumpang screen has no file input for it (`src/app/staf/admin-lokasi/[lokasiId]/pesanan/[nomor]/tumpang-forms.tsx`). `tumpang-actions.ts` (about line 21) reads `buktiFileKey`, but nothing ever sets it. Add the upload: the private FileStore through the usual upload path, served by short-lived signed URLs, never into logs or Sentry.

## Acceptance criteria

- [ ] **The Admin Lokasi uploads the heirship proof** (PDF, JPG or PNG, up to the usual limit) when confirming a tumpang that needs it. The action stores its key, and the order and the Audit Log show that a proof is on file.
- [ ] **Without a required proof, the action refuses** with a clear message.
- [ ] **Privacy:** the file lives only in the private FileStore. It is served only by a short-lived signed URL to the staff who may see it.
- [ ] **Tests:** the action with the in-memory FileStore fake on real Postgres; the refusal; a static render of the form.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Rilis 2 gap before level 3.
