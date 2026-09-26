# Real FileStore adapter (S3 Jakarta)

Status: resolved
Blocked by: —
Spec: Adapter ports > FileStore; Implementation Decisions > Architecture (files); Data and privacy; ADR 0002

## What to build

Implement the FileStore port on AWS S3 in `ap-southeast-3`: upload via presigned PUT, short-lived signed GET URLs, and delete. Select it by env in the composition root. The in-memory fake stays the default for tests. This unblocks Pindah Nomor on staging and production (ticket 09: today `berkas_gagal_disimpan`, "menunggu S3, tiket 60").

**Superseded for v1** by the 2026-09-26 rewrite in `## Comments`: a host-disk FileStore behind the same port, not S3 (moved to v2). The acceptance criteria below are read against that rewrite (a private disk volume and its own signed-URL route stand in for "the private bucket" and "presigned URLs").

## Acceptance criteria

- [x] Uploads go directly from the browser to the private bucket via presigned URLs with a content-type and size limit; the app stores only the object key. — *v1 (host disk): every current caller already uploads server-side (KTP check, agreement scan bodies arrive via a Server Action), so there is no direct browser-to-store upload to build; `DiskFileStore.put` enforces a content type and `FILE_STORE_MAX_BYTES` (15 MB) regardless of caller.*
- [x] Signed GET URLs expire within minutes (value documented); no object is public. — callers set their own expiry (5 min for the agreement scan, `AGREEMENT_SCAN_URL_SECONDS`); `DiskFileStore.signedUrl` HMAC-signs `key` + `expiresAt`, checked by `/api/files/[...key]` (`readSigned`); the volume is never mounted into nginx or Next's static handler.
- [x] Delete removes the object (versioning keeps history per bucket policy). — *v1 (host disk): no object versioning; `delete` removes both the blob and its metadata. History is whatever the nightly 7-day tar still holds.*
- [x] Server-side puts (e.g. the Pindah Nomor KTP check, ticket 09) work through the same adapter. — also the Pemulihan Akun KTP check (ticket 82, ADR 0004) and the Lokasi Mitra agreement scan; all go through `DiskFileStore`, no dedicated code path per caller.
- [x] A contract test suite runs the same assertions against the fake and (when credentials are present) the real adapter. — `src/adapters/file-store.contract.ts`, run against `FakeFileStore` (`src/adapters/memory/fake-files.test.ts`) and `DiskFileStore` (`src/adapters/live/disk-file-store.test.ts`): put/signedUrl/delete, expiry, replace-on-same-key, path-traversal keys, size limit, missing content type.
- [x] No personal data in logs or GlitchTip from the adapter. — the adapter and the route never call `console.*` or a reporter (test: "writes nothing to the console…"); errors carry only the key (a UUID path, not personal data) and never file bytes; `scrub.ts` is unchanged (no request bodies to Sentry/GlitchTip already).

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
- 2026-09-26 — Built (TDD, `mattpocock-skills:tdd`):
  - **Port** (`src/ports/file-store.ts`): added `FILE_STORE_MAX_BYTES` (15 MB, defense in depth) and `isSafeFileKey` / `assertSafeFileKey` — the one path-traversal-safety check both the fake and the disk adapter use, so a key either is refused everywhere or nowhere.
  - **Live adapter** (`src/adapters/live/disk-file-store.ts`, `DiskFileStore`): `put`/`delete` on `<root>/blobs/<key>` + `<root>/meta/<key>.json` (temp file + rename, so a reader never sees a partial write); `signedUrl` HMAC-SHA256-signs `key` + `expiresAt` with `AUTH_SECRET` (the same secret the identity module already uses for OTP hashes, under a different label) and points at `/api/files/<key>`; `readSigned(key, expiresAt, signature)` re-derives and checks that signature (`timingSafeEqual`) and the Clock-based expiry, for the route below.
  - **Route** (`src/app/api/files/[...key]/route.ts`): Zod-validates the key segments and `exp`/`sig`, then serves the bytes with `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. No session check — like `/dokumen/[link]/pdf`, the signature is the whole authorization, already checked once by whoever called `signedUrl` (e.g. `lokasi.agreementScanUrl`).
  - **Fake** (`src/adapters/memory/fake-files.ts`): now shares the same key-safety and size guard, so both adapters behave alike.
  - **Contract** (`src/adapters/file-store.contract.ts`): put/signedUrl/delete round trip, expiry at the boundary, replace-on-same-key, path-traversal keys, oversized body, missing content type — run against `FakeFileStore` and `DiskFileStore`.
  - **Composition** (`src/composition/adapters.ts`, `src/server/runtime.ts`, `src/lib/env.ts`): staging/production always wire `DiskFileStore` (root `FILES_ROOT`, default `/data/files`, matching the new Docker volume; no more `notConfigured`); development/test keep the fake.
  - **Docker/ops**: `docker-compose.prod.yml` adds a private `files` volume mounted at `/data/files` in `web` and `worker` only (no nginx, no static route). `deploy/bin/makam-backup-files` tars the volume nightly (03:15 WIB) via `deploy/systemd/makam-staging-files-backup.{service,timer}`, keeps 7 days, wired into `deploy/install-host.sh` (not run on the host — that stays a separate, human-gated step). `docs/ops/runbook.md` gets a new "File storage (the private FileStore) and its backup" section plus `FILES_ROOT`/backup rows in the existing tables.
  - **Copy**: `berkas_gagal_disimpan`'s message no longer says storage is "belum tersedia di lingkungan ini" (no longer true once this shipped); now "Penyimpanan berkas sedang bermasalah, coba lagi."
  - **Verification**: `npm run lint` clean; `npm run typecheck` clean; `npm run test:shared` — **94 test files, 1014 tests, all passed**; `npm run build` (Next.js 16.3.6, Turbopack) succeeds, `/api/files/[...key]` listed as a dynamic route; `npm run build:worker` succeeds.
- 2026-09-26 — Orchestrator (cloud): rebased onto main after tickets 75 and 61. Ticket 82 had deleted `pindah-nomor/actions.ts` (Pindah Nomor became Pemulihan Akun), so the deletion stands and this ticket's copy change for `berkas_gagal_disimpan` moved to `pemulihan-akun/actions.ts` ("Penyimpanan berkas sedang bermasalah, coba lagi. Email belum dipindah."). `adapters.ts`, the runbook's env table and the index keep both 61's SumoPod and this ticket's FileStore lines.
- 2026-09-26 — Orchestrator, cloud session 3: Rebased onto ticket 76 (57004ac) as 42df84a, no conflicts; checked that 13's `isPortConfigured` treats the DiskFileStore as configured; CI green. Merged into `main`.
