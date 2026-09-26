# Real FileStore adapter (S3 Jakarta)

Status: ready-for-agent
Blocked by: —
Spec: Adapter ports > FileStore; Implementation Decisions > Architecture (files); Data and privacy; ADR 0002

## What to build

Implement the FileStore port on AWS S3 in `ap-southeast-3`: upload via presigned PUT, short-lived signed GET URLs, and delete. Select it by env in the composition root. The in-memory fake stays the default for tests. This unblocks Pindah Nomor on staging and production (ticket 09: today `berkas_gagal_disimpan`, "menunggu S3, tiket 60").

## Acceptance criteria

- [ ] Uploads go directly from the browser to the private bucket via presigned URLs with a content-type and size limit; the app stores only the object key.
- [ ] Signed GET URLs expire within minutes (value documented); no object is public.
- [ ] Delete removes the object (versioning keeps history per bucket policy).
- [ ] Server-side puts (e.g. the Pindah Nomor KTP check, ticket 09) work through the same adapter.
- [ ] A contract test suite runs the same assertions against the fake and (when credentials are present) the real adapter.
- [ ] No personal data in logs or GlitchTip from the adapter.

## Amended (2026-09-25, email login and SumoPod SMTP)

- The title was "Real FileStore (S3 Jakarta) and EmailSender (SES Jakarta) adapters, and the email OTP fallback" and the file was `60-real-aws-adapters.md`. SES is dropped from v1 (ADR 0002 amendment).
- The ticket is split:
  - this ticket keeps the S3 FileStore (blocked by 03 only);
  - the real EmailSender on the SumoPod SMTP relay is ticket 68 (blocked by 04, not by AWS);
  - the "Kirim lewat email" fallback, and email login with it, is ticket 67.
- The number 60 stays with S3 because the app's Pindah Nomor message already says "menunggu S3, tiket 60".
- Blocked by 08 and 63 is gone: both were only for the fallback.

## Comments

- 2026-09-26 — ADR 0004: "the Pindah Nomor KTP check" is now the Pemulihan Akun KTP check (ticket 82); same adapter, same key prefix unless 82 renames it.
- 2026-09-26 — Rewritten by user decision (ADR 0002, beta UAT amendment): for v1, build a **FileStore on the host's disk** (a private makam-only Docker volume, never web-served directly; files served via short-lived signed URLs through the app, same port as the S3 adapter would use, KTP/documents never public), with tests at the port seam and the runbook; it is backed up with the database's nightly dump or its own nightly tar kept 7 days. The S3 adapter moves to v2 (still blocked by 03).
