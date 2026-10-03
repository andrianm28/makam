# Banner "pembayaran uji coba" while production pays through SumoPod's sandbox

Status: resolved
Blocked by: 100, 65
Spec: spec.md, Billing > Payment; owner decisions of 2026-10-03 (option tool): makam.co.id switches with SumoPod's sandbox until the live merchant account exists, and visitors see a trial banner meanwhile; the owner's `/to-tickets` of 2026-10-03

## What to build

At the switch, makam.co.id takes payments through SumoPod's sandbox, so no money moves until the live merchant account and keys are installed. While that lasts, every page shows a banner saying payments are a trial, and a Tagihan's Bayar step says so right beside the Bayar button. Both disappear by themselves once production pays live. The runbook's switch steps and the go-live checklist describe running on the sandbox.

## Acceptance criteria

- [x] On makam.co.id, while production's payments go to SumoPod's sandbox, every page (public site, Masuk, Akun Saya, the staff area) shows a banner in Bahasa Indonesia saying payments are a trial and no money moves; it never shows when production pays live, nor on staging (which keeps its own banner) or in development. The wording is proposed in this ticket's Comments and confirmed by the owner.
- [x] Shown or hidden is decided at runtime from production's payment configuration, never at build time: one image serves staging and production, and statically rendered pages show it too (as ticket 66 decided for the staging banner).
- [x] On a Tagihan's Bayar step, while the sandbox is in use, a notice beside the Bayar button says the payment is a trial and no money moves.
- [x] Neither can be dismissed; the banner pushes the page down instead of covering it, is readable on a phone and is announced once to screen readers (as ticket 66).
- [x] The runbook's switch steps and the go-live checklist say how production runs on the sandbox (the payment base-URL override, the sandbox key and webhook secret, the sandbox webhook pointed at makam.co.id's payment webhook) and that installing the live keys and removing the override takes the banner and the notice away; `makam-preflight` names a production on the sandbox in one SKIP line.
- [x] Tests: the shown or hidden decision (production on the sandbox shows; production live, staging and development hide); a Playwright check that neither appears on the local stack.

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

### Review 1 (2026-10-03, head 389f467)

Standards: 0 blocking, 2 should-fix, 4 nit. Should-fix: (a) `src/lib/payment-trial.ts:12` reads the `/api/browser-config` JSON with an `as` cast; AGENTS.md says Zod at every boundary: use a `z.object({paymentTrial: z.boolean()})` safeParse. (b) `src/components/trial-payment-banner.tsx:15-20` fetch-in-useEffect differs from staging-banner's useSyncExternalStore; add a file comment saying why (value is runtime server state). Nits: `route.ts:7` comment overlong; `dokumen/[link]/page.tsx:178` long JSX line and import order (lines 24-25); repeated bg-warning class string (leave); notice lacks print:hidden but parent has it.

Spec: 0 blocking, 1 should-fix, 2 nit. All six criteria met in code; should-fix: owner has not confirmed the banner/notice wording (stays open for the owner). Nits: older runbook "Test payment" section names wrong webhook path `/api/webhooks/sumopod` (real: `/api/webhooks/pembayaran`); Playwright could also cover Akun Saya and staff area. Builder's noted gap (live key + sandbox override left in still shows banner) judged non-blocking: banner follows where payments go; runbook and preflight say remove the override.

### Fixes 1 (2026-10-03, builder)

- Zod safeParse of the browser-config body in `payment-trial.ts`. Spec gap for process: the old cast already returned hidden for every malformed body, so the new test (non-boolean `paymentTrial`, array, string, null) was green before the change and no red commit was possible; it is committed with the refactor as a characterization test.
- Banner comment explains the useEffect fetch (runtime server state); route.ts comment wrapped; page.tsx import order and long JSX line fixed.
- Runbook webhook path: the "Test payment" section (docs/ops/runbook.md ~1590) already registers `/api/webhooks/pembayaran` and only mentions `/api/webhooks/sumopod` as ticket 04's wrong name; the route exists at `src/app/api/webhooks/pembayaran`. No edit needed. Remaining `sumopod` webhook mentions are in ADR 0002 and tickets 07/65 (nginx exemption history), untouched.
- Skipped as told: Playwright extension, bg-warning extraction. Owner still to confirm wording.

### Owner confirmation and e2e (2026-10-03, ticket thread)

- The owner confirmed both texts as proposed, through the option tool on 2026-10-03: banner "PEMBAYARAN UJI COBA — pembayaran di Makam.co.id saat ini masih percobaan, tidak ada uang yang berpindah." and Bayar notice "Pembayaran ini uji coba: tidak ada uang yang berpindah.". The wording criterion is met and ticked.
- The runbook's "Test payment" section already registers `/api/webhooks/pembayaran`; it names `/api/webhooks/sumopod` only to say ticket 04's checklist was wrong, so no edit was needed.
- Playwright not run: `npm run stack -- up --build -d` failed in the image build (`npm ci` crashed with "Exit handler never called", a network problem inside Docker here). The last criterion (Tests) stays unticked until the spec passes on a stack; `npm run clean` was run afterwards.

- 2026-10-03 — Merged to main by the merge thread (af8db5f). Two-axis review complete (Standards + Spec): reviewed 0 blocking / 3 should-fix / 6 nit, re-reviewed 0 / 0 / 2 (sonnet, display-only change). **e2e first run in CI**: `e2e/trial-payment-banner.spec.ts` was not run locally, so the last AC (Tests) is ticked only after main CI's e2e job passes. The merge with main kept one coherent runbook passage for "Production on SumoPod's sandbox" (the owner's webhook decision, key rotation and `prod.env` values from the go-live docs, and this ticket's base-URL override, banner and notice and preflight SKIP line), nothing factual dropped. No migration, lockfile unchanged.
- 2026-10-03 — e2e first run in CI passed: main CI run 37141299386, job "E2E (Playwright against the pushed image)" success on bc71fe2; the last AC (Tests) is ticked.
