# Staging banner on dev.makam.co.id

Status: ready-for-agent
Spec: Implementation Decisions > Architecture (pre-live environment: staging is public since 2026-09-25)

## What to build

Staging at `https://dev.makam.co.id` is public (no basic auth, user decision 2026-09-25). Show a thin banner at the top of every page there so no visitor mistakes it for the real service: "STAGING — bukan layanan resmi Makam.co.id. Data dan pembayaran di sini hanya untuk uji coba." It never appears in production or development.

## Acceptance criteria

- [ ] The banner shows on every page (public site, Masuk, Akun Saya, staff area) when the page is served from the staging host, and never on `makam.co.id` / `www` or other hosts.
- [ ] It works on statically rendered pages: decide from the runtime host, not a build-time value. One image serves staging and production, so reuse the existing hostname → environment mapping (`browserSentryEnvironment` in `src/lib/env.ts`) instead of adding a second one.
- [ ] It is not dismissible, does not cover content (pushes the page down), is readable on a phone, and has `role="status"` or equivalent so it is announced once.
- [ ] Tests: a unit test for the host → shown/hidden decision (staging host shows; production hosts, localhost and unknown hosts hide); a Playwright test that the banner is absent on the local stack (development) — and, if the Playwright setup can fake the host, present for `dev.makam.co.id`.
