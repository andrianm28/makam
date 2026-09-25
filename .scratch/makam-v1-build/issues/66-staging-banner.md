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

## Comments

- 2026-09-25: Built on branch `worktree-agent-aed708ff61701f5e4`. Not yet deployed to staging.
  - **Decision.** `showsStagingBanner(hostname)` in `src/lib/env.ts` returns true only when `browserSentryEnvironment(hostname)` is `staging`, so it reuses the one hostname → environment mapping. Today that means only `dev.makam.co.id`, in any letter case.
  - **Banner.** `src/components/staging-banner.tsx` is a client component that `src/app/layout.tsx` renders as the first child of `<body>`, so every page gets it, now and in future (public site, Masuk, Akun Saya, the staff area). It reads `window.location.hostname` through `useSyncExternalStore` with a server snapshot of "hidden". The server HTML (including static pages) and the first client render always agree, and the banner appears right after hydration, so there's no hydration mismatch. It sits in normal page flow (not fixed or sticky), so it pushes the page down. It uses `role="status"`, amber (`bg-amber-400` / `text-amber-950`, not a brand colour), wraps its text, and has no close control.
  - **Tests.** Unit test in `src/lib/env.test.ts` ("staging banner (from the page's host …)"): `dev.makam.co.id` and `DEV.MAKAM.CO.ID` show it; `makam.co.id`, `www.makam.co.id`, `localhost`, `127.0.0.1`, `beta.makam.co.id`, `dev.makam.co.id.evil.example` and `""` hide it. Playwright test in `e2e/staging-banner.spec.ts`: no banner on `/`, `/masuk` and `/health` on the local stack. With Chromium's `--host-resolver-rules=MAP dev.makam.co.id <stack host>`, the same stack is served as `http://dev.makam.co.id:3310`, and there the banner shows with the exact text on `/`, `/masuk` and `/health`. The tests also check that it sits at the top above `<main>` with no button, and that at 360 px it neither overflows nor makes the page scroll sideways. Akun Saya and the staff area aren't loaded under the staging host in e2e. They share the root layout, so they're covered by the same code path.
