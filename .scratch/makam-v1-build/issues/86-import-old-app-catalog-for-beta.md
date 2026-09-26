# Import the old app's cemetery catalog as beta data

Status: ready-for-agent
Blocked by: 12
Spec: Release plan (beta UAT push); ADR 0002 (beta UAT amendment); decided with the user 2026-09-26

## What to build

The v1 beta for UAT is seeded with the frozen Laravel app's cemetery catalog (read-only from its database at /home/ubuntu/makam-app's stack), so testers see real-looking Lokasi. Only non-personal catalog data comes across.

## Acceptance criteria

- [ ] An ops command (like `seed:admin`) reads, read-only, the old app's cemetery directory: name, address, city, coordinates / Google Maps URL, photos, facilities, and prices where they map to v1 Jenis Makam and tariffs; it creates Lokasi Mitra (and tariffs) in v1 marked as beta/dummy.
- [ ] It never reads or copies users, orders, payments, phone numbers, emails, documents or any personal data; a test proves the import only touches the whitelisted fields.
- [ ] Idempotent (running it twice doesn't duplicate); refuses on a database that isn't the beta/staging one unless explicitly allowed; every write audited as an ops action.
- [ ] Imported Jenis Makam whose all-in total exceeds the Rp 10 juta cap are kept but not listed (spec, Billing).
- [ ] Runbook section; the old app's stack and data are never modified.
