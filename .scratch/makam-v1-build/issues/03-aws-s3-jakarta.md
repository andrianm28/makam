# AWS Jakarta: private S3 buckets

Status: ready-for-human
Spec: Implementation Decisions > Architecture (files, backups); Adapter ports > FileStore; Further Notes > Pre-launch checklist; ADR 0002 (amendment 2026-09-25, later)

## What to build

Create the AWS account resources in region `ap-southeast-3` (Jakarta) in PT Jaya Korpora Prima's name: a private files bucket and a backups bucket. AWS is used for S3 only.

## Acceptance criteria

- [ ] AWS account owned by PT JKP, root MFA on, billing alert set.
- [ ] Bucket `makam-prod-files` in `ap-southeast-3`: all public access blocked, versioning on, default encryption on, CORS allowing PUT/GET from the app hostname (for signed-URL uploads).
- [ ] Bucket `makam-prod-backups` in `ap-southeast-3`: public access blocked, versioning on, Object Lock or a lifecycle rule for retention (choose and record), separate from the files bucket.
- [ ] IAM user/role for the app limited to `makam-prod-files` (Get/Put/Delete object); a separate one for backups limited to `makam-prod-backups`. Keys stored as VPS secrets, never committed.
- [ ] A client-side backup encryption key/passphrase generated (pgBackRest `repo-cipher-pass` or wal-g libsodium key), stored on the VPS and in an offline safe place owned by PT JKP.
- [ ] Record bucket names, region and IAM key names under `## Comments`.

## Notes

Biznet Gio NEO is the local fallback only after a compatibility spike; don't set it up now.

## Amended (2026-09-25, decided with the user)

- **SES is dropped from v1.** Every email goes through the SumoPod SMTP relay (ticket 04 for the set-up, ticket 68 for the adapter), so this ticket is now S3 only: files (ticket 60) and backups (ticket 64). The title was "AWS Jakarta: private S3 buckets and SES domain"; the file was `03-aws-s3-and-ses-jakarta.md`. Do not create an SES identity or grant `ses:Send*` to any IAM user.
