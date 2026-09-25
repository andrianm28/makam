# Payment gateways and split payments in Indonesia

Type: research
Status: resolved
Map: ../map.md

## Question

Which Indonesian payment gateways (at least Xendit, Midtrans, DOKU) support split payments or sub-accounts (the platform collects, then pays out to each Lokasi operator), recurring billing (for recurring Paket Layanan), VA/QRIS/e-wallet methods, and onboarding a **yayasan** as the merchant? Compare fees, settlement times, KYC requirements for yayasan and for sub-merchants, and API quality for a solo developer.

## Answer

Full findings: [research/02-payment-gateway-split.md](../research/02-payment-gateway-split.md).

- **Split / sub-accounts**: Xendit xenPlatform is the only fully documented self-serve model (sub-account per Lokasi, split rules at settlement; splits not reversed on refund). DOKU has Split Settlement and Sub-Account V2, both sales-activated. Midtrans has no public split API.
- **Recurring**: no gateway auto-charges VA/QRIS. Design recurring Paket Layanan as a fresh VA/QRIS invoice per cycle, with auto-debit (card/e-wallet) as opt-in.
- **Fees**: VA ~IDR 4,000, QRIS 0.7% across the board; Xendit adds IDR 25k/active sub-account/month + 0.5% (cap IDR 10k) on splits, and a USD 50/month minimum for low-volume accounts from 1 Oct 2026. DOKU has the cheapest payouts (IDR 1,500).
- **Yayasan KYC**: Midtrans explicitly accepts yayasan (akta, SK Kemenkumham, NPWP, NIB); Xendit reportedly does (snippet only); DOKU unknown. Xendit sub-accounts need each Lokasi's own KYC incl. liveness.
- **Recommendation**: Xendit xenPlatform for v1; fallback DOKU Checkout + Split Settlement if partners can't do KYC or minimums hurt. Get written quotes and yayasan onboarding checklists from both, and confirm burial services aren't a restricted category.
- **Open**: YIEM holding funds and paying partners may fall under BI payment-provider rules — ticketed as "Payment licensing if YIEM holds and forwards funds".

Second, independent report: [research/payment-gateway-split.md](../research/payment-gateway-split.md). Where it differs: it confirms yayasan KYC for Xendit and DOKU from official docs (DOKU needs a Kemensos PUB licence if the business line is "Charity"); DOKU sub-accounts need no per-sub-account KYC; it could not verify the USD 50/month minimum (Xendit pages block fetches; its prices come from a 2025-11-03 archive) and flags a possible USD 5,000 per-entity setup fee on Xendit's global pricing page. Get a written quote before relying on either set of prices.

**Amended by "Money flow and revenue model"** (2026-09-25): YIEM collects everything into a single Xendit account and disburses partners per order, so xenPlatform sub-accounts and the DOKU split fallback are not needed in v1. Xendit is still the gateway (VA/QRIS invoices, disbursement API); recurring-Layanan design unchanged.
