# Banner "pembayaran uji coba" while production pays through SumoPod's sandbox

Status: ready-for-agent
Blocked by: 100, 65
Spec: spec.md, Billing > Payment; owner decisions of 2026-10-03 (option tool): makam.co.id switches with SumoPod's sandbox until the live merchant account exists, and visitors see a trial banner meanwhile; the owner's `/to-tickets` of 2026-10-03

## What to build

At the switch, makam.co.id takes payments through SumoPod's sandbox, so no money moves until the live merchant account and keys are installed. While that lasts, every page shows a banner saying payments are a trial, and a Tagihan's Bayar step says so right beside the Bayar button. Both disappear by themselves once production pays live. The runbook's switch steps and the go-live checklist describe running on the sandbox.

## Acceptance criteria

- [ ] On makam.co.id, while production's payments go to SumoPod's sandbox, every page (public site, Masuk, Akun Saya, the staff area) shows a banner in Bahasa Indonesia saying payments are a trial and no money moves; it never shows when production pays live, nor on staging (which keeps its own banner) or in development. The wording is proposed in this ticket's Comments and confirmed by the owner.
- [ ] Shown or hidden is decided at runtime from production's payment configuration, never at build time: one image serves staging and production, and statically rendered pages show it too (as ticket 66 decided for the staging banner).
- [ ] On a Tagihan's Bayar step, while the sandbox is in use, a notice beside the Bayar button says the payment is a trial and no money moves.
- [ ] Neither can be dismissed; the banner pushes the page down instead of covering it, is readable on a phone and is announced once to screen readers (as ticket 66).
- [ ] The runbook's switch steps and the go-live checklist say how production runs on the sandbox (the payment base-URL override, the sandbox key and webhook secret, the sandbox webhook pointed at makam.co.id's payment webhook) and that installing the live keys and removing the override takes the banner and the notice away; `makam-preflight` names a production on the sandbox in one SKIP line.
- [ ] Tests: the shown or hidden decision (production on the sandbox shows; production live, staging and development hide); a Playwright check that neither appears on the local stack.

## Comments

### Build (2026-10-03, builder)

What changed:
- `paymentsAreTrial()` in `src/lib/env.ts`: true only when `APP_ENV=production` and `SUMOPOD_BASE_URL` is on the sandbox host; false for production live (unset or live host), staging, development, test and any malformed value (never throws).
- `/api/browser-config` serves `paymentTrial` next to the DSN (per request, `no-store`). `TrialPaymentBanner` (client, mounted in the root layout after `StagingBanner`) asks it after hydration via `fetchPaymentTrial` (`src/lib/payment-trial.ts`); hidden on the server and on any failure; in page flow, `role="status"`, no dismiss, `print:hidden`, `break-words`.
- Bayar step: `TrialPaymentNotice` under the Bayar button, driven by `paymentsAreTrial()` read in the dynamic document page.
- `makam-preflight`: one SKIP line, "production on the sandbox", when the prod env file's `SUMOPOD_BASE_URL` is the sandbox host; the sandbox key check still runs.
- Runbook: new section "Production on SumoPod's sandbox (ticket 101)" (sandbox checklist, going live), Hari switch step 1, the `SUMOPOD_BASE_URL` table row, the preflight table.
- Tests: Vitest for the decision, browser-config, the fetch helper, the components, the preflight; Playwright `e2e/trial-payment-banner.spec.ts` (not run: no stack here; lint and typecheck pass).

Wording proposed for the owner to confirm:
- Banner: "PEMBAYARAN UJI COBA — pembayaran di Makam.co.id saat ini masih percobaan, tidak ada uang yang berpindah."
- Bayar notice: "Pembayaran ini uji coba: tidak ada uang yang berpindah."

Spec gaps and decisions for the owner:
- The ticket vocabulary has no "in-review"; `Status:` left untouched.
- The runbook's older "Test payment" section names the webhook path `/api/webhooks/sumopod`; the real route is `/api/webhooks/pembayaran` (used in the new section). Not edited there.
- "Trial" is inferred from the override host only: a production with the override on the sandbox but a live key would still show the banner; the preflight/runbook say to remove the override together with installing live keys.
