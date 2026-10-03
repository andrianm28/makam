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
