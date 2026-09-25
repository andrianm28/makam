# Real FileStore (S3 Jakarta) and EmailSender (SES Jakarta) adapters

Status: ready-for-agent
Blocked by: 03
Spec: Adapter ports > FileStore, EmailSender; Implementation Decisions > Architecture (files); Data and privacy

## What to build

Implement the FileStore port on AWS S3 in `ap-southeast-3` (upload via presigned PUT, short-lived signed GET URLs, delete) and the EmailSender port on SES in the same region (document copies and fallback emails, with the Tagihan / Bukti link). Select them by env in the composition root; the in-memory fakes stay the default for tests.

## Acceptance criteria

- [ ] Uploads go directly from the browser to the private bucket via presigned URLs with a content-type and size limit; the app stores only the object key.
- [ ] Signed GET URLs expire within minutes (value documented); no object is public.
- [ ] Delete removes the object (versioning keeps history per bucket policy).
- [ ] SES sends from the verified domain; bounces/complaints are logged in the message log as gagal.
- [ ] A contract test suite runs the same assertions against the fake and (when credentials are present) the real adapters.
- [ ] No personal data in logs or Sentry from either adapter.
