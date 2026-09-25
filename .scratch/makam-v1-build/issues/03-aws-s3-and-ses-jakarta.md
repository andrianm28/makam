# AWS Jakarta: private S3 buckets and SES domain

Status: ready-for-human
Spec: Implementation Decisions > Architecture (files, backups); Adapter ports > EmailSender, FileStore; Further Notes > Pre-launch checklist

## What to build

Create the AWS account resources in region `ap-southeast-3` (Jakarta) in PT Jaya Korpora Prima's name: a private files bucket, a backups bucket, and SES sending for the domain.

## Acceptance criteria

- [ ] AWS account owned by PT JKP, root MFA on, billing alert set.
- [ ] Bucket `makam-prod-files` in `ap-southeast-3`: all public access blocked, versioning on, default encryption on, CORS allowing PUT/GET from the app hostname (for signed-URL uploads).
- [ ] Bucket `makam-prod-backups` in `ap-southeast-3`: public access blocked, versioning on, Object Lock or a lifecycle rule for retention (choose and record), separate from the files bucket.
- [ ] IAM user/role for the app limited to `makam-prod-files` (Get/Put/Delete object) and SES send; a separate one for backups limited to `makam-prod-backups`. Keys stored as VPS secrets, never committed.
- [ ] A client-side backup encryption key/passphrase generated (pgBackRest `repo-cipher-pass` or wal-g libsodium key), stored on the VPS and in an offline safe place owned by PT JKP.
- [ ] SES in `ap-southeast-3`: domain identity verified with DKIM, SPF and DMARC records; custom MAIL FROM set; production access requested (out of the SES sandbox) and granted; a sender address chosen (e.g. `dokumen@…`).
- [ ] Record bucket names, region, sender address and IAM key names under `## Comments`.

## Notes

Biznet Gio NEO is the local fallback only after a compatibility spike; don't set it up now.
