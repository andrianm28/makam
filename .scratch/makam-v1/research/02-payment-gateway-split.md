# Research: Payment gateways and split payments in Indonesia

Ticket: [../issues/02-payment-gateway-split.md](../issues/02-payment-gateway-split.md)
Researched: 2026-09-24. Sources are the gateways' own docs (via their `llms.txt` / `.md` mirrors), pricing pages, and help centers.
Legend: **[V]** = verified on a primary source · **[S]** = seen only in a search-engine snippet of a first-party page (the page returned 403 to direct fetch) · **[U]** = unverified / needs a sales quote.

## TL;DR

- **Xendit (xenPlatform)** is the only one of the three with a fully self-serve, publicly documented platform model: sub-account per Lokasi, KYC through API or an invite link, per-transaction split rules, payouts from sub-account balances, and a hosted Subscriptions scheduler. It fits "YIEM collects, each Lokasi operator gets paid" best.
- **DOKU** has two working options: **Split Settlement** (split a payment across verified settlement bank accounts, no sub-merchant KYC in the API) and **Sub-Account V2** (a wallet per party plus split rules). Both are "contact sales to activate". The cheapest disbursement (IDR 1,500 BI-FAST).
- **Midtrans** has the clearest yayasan document list and the simplest pricing, but **no publicly documented split or sub-merchant API**. A "Transaction Split" feature is mentioned only in release notes **[U]**. For per-Lokasi payouts you'd need Midtrans Payouts (Iris) and your own ledger.
- **Recurring:** no gateway can auto-debit VA or QRIS. Recurring Paket Layanan can auto-charge only through cards, e-wallet tokenization (GoPay/OVO/DANA/ShopeePay) or direct debit. For most families, "recurring" will realistically mean re-issuing a VA/QRIS invoice each cycle.
- All three accept yayasan as merchants (explicitly documented for Midtrans; Xendit via help center **[S]**; DOKU **[U]**).

## 1. Split payments / sub-accounts

### Xendit: xenPlatform [V]
- Sub-accounts are "distinct Xendit accounts created under your platform to represent your merchants, partners, vendors, or business branches". Balances are isolated. You transact for a sub-account by passing the `for-user-id` header with the master API key. https://docs.xendit.co/docs/sub-accounts
- **Split rules**: `POST /split_rules`, flat or percent, multiple `routes` per rule, applied per transaction with the `with-split-rule` header. Three supported flows: sub→master (e.g. YIEM takes commission), sub→sub, and master→sub ("Online Marketplace"). The split runs **at settlement**. A 100% split fails because fees are taken from the remainder. Splits are **not reversed on refund**; you reconcile manually. A split-status webhook exists. https://docs.xendit.co/docs/split-payments
- **Payouts**: the master can create payouts from a sub-account's balance (`for-user-id`). Sub-accounts can also withdraw or auto-withdraw from their own dashboard. https://docs.xendit.co/docs/payouts-for-sub-accounts
- VA and OTC show a customisable name. All other channels show the **sub-account's** name. https://docs.xendit.co/docs/accepting-payments-for-sub-accounts
- Webhooks for sub-account events can be sent to the master's URL ("synchronized"). https://docs.xendit.co/docs/xenplatform-global-accounts-setup

### DOKU: Split Settlement and Sub-Account V2 [V]
- **Split Settlement**: add `additional_info.settlement[]` (each entry is a `bank_account_settlement_id` with a PERCENTAGE or amount value) to a Checkout or Direct API payment. Settlement bank accounts are added in the Back Office and must reach status `Verified` first. It only works for **Aggregator merchants** (funds flow through DOKU) and must be enabled in Settings > Service, or via sales if that option is disabled. https://developers.doku.com/accept-payments/finance-and-settlement/split-settlement.md
  - This is the lowest-effort way to get "Lokasi X's share goes straight to Lokasi X's bank account". No wallet, no sub-merchant KYC in the API. However, the Lokasi operator is only a bank-account payee, not a merchant of record **[U: DOKU's own KYC on those payee accounts]**.
- **Sub-Account V2**: `POST /sub-account/v2.0/register` (required fields: `partnerReferenceNo`, `type`, `name`, `email`). Each sub-account gets IDR, pending-IDR and points balances plus an auto-assigned static BRI VA. Also available: `POST /sub-account/v2.0/split-rules`, balance and history endpoints, and transfer-out (payout). V1 is frozen. The product is Indonesia-only and needs sales activation. https://developers.doku.com/wallet-as-a-service/sub-account.md , https://developers.doku.com/wallet-as-a-service/sub-account/sub-account-v2.md
  - The register API collects no KYC documents. Whether DOKU requires KYC on sub-account holders off-API is **[U]**.

### Midtrans [V for absence in docs / U for feature]
- The public docs index (https://docs.midtrans.com/llms.txt) has **no** split, marketplace or sub-merchant pages. Payout is to the one billing account configured in the dashboard (manual or scheduled daily/weekly/monthly). https://docs.midtrans.com/docs/receive-your-fund
- Midtrans release notes mention a "Transaction Split" feature (with a "Single Auto Withdrawal Report for those who subscribe to the Transaction Split feature"), but it has no public docs **[U: ask sales]**.
- **Payouts (formerly Iris)** is a separate disbursement product (bank and e-wallet transfers, approval flow, beneficiaries API). https://docs.midtrans.com/docs/disbursement-overview . With Midtrans, per-Lokasi payouts = YIEM collects everything, keeps its own ledger, and disburses via Payouts.

## 2. Recurring billing (recurring Paket Layanan)

| | Scheduler provided? | Channels that can auto-charge |
|---|---|---|
| Xendit | Yes. Subscriptions (plan → schedule → cycles → attempts, retries, webhooks, hosted link to tokenize). https://docs.xendit.co/docs/subscriptions-overview | Only channels with Merchant-Initiated Transactions: **cards, GoPay, OVO, DANA, ShopeePay, BRI Direct Debit**. **Not VA, not QRIS.** [V] https://docs.xendit.co/docs/available-payment-channels , https://docs.xendit.co/docs/how-subscriptions-work |
| Midtrans | Yes. `POST /v1/subscriptions` with a schedule and retry schedule. https://docs.midtrans.com/reference/create-subscription | **Only `credit_card` and `gopay`** [V]. Card recurring "needs additional bank's approval and agreement". https://docs.midtrans.com/docs/one-click-two-clicks-and-recurring-transaction |
| DOKU | No general scheduler found in docs. You schedule charges yourself. | OVO recurring, BRI and Mandiri direct-debit recurring schemes, card tokenization [V from doc index]. https://developers.doku.com/llms.txt |

Implication: most families will pay by VA or QRIS, so the robust design is to **generate a new invoice per cycle** (payment link / VA with an expiry) and send a reminder. Auto-debit subscriptions are an optional extra for card or e-wallet users. This keeps us gateway-agnostic.

## 3. Payment methods (VA / QRIS / e-wallet)

All three support major-bank VAs, QRIS, and GoPay/OVO/DANA/ShopeePay/LinkAja, plus cards and minimarket.

Xendit settlement times from its channel table [V] (https://docs.xendit.co/docs/available-payment-channels):
- VA: most banks INSTANT, BCA T+1 business day
- QRIS: T+2 business days
- GoPay: T+1
- OVO, DANA, ShopeePay, LinkAja: T+2
- Cards: T+5
- Alfamart and Indomaret: T+5

## 4. Fees (excluding 11% PPN unless noted)

| | VA | QRIS | E-wallet | Card | Platform / split | Payout |
|---|---|---|---|---|---|---|
| **Midtrans** [V] https://midtrans.com/pricing | IDR 4,000 | 0.7% (VAT-incl.) | GoPay 2%, ShopeePay 2%, DANA 1.5%, OVO 1.5% | 2.9% + IDR 2,000 | n/a (no public split) | Payouts: [U] |
| **DOKU** [V] https://www.doku.com/en-us/pricing | IDR 4,000 (BCA 4,500) | 0.7% | DANA 1.5%, OVO 2–3.18%, ShopeePay 2–4%, LinkAja 2–3.5% or IDR 2,500 | 2.8% + IDR 2,000 | Sub-account: custom price [U] | **IDR 1,500 per BI-FAST transfer**; account validation IDR 500 |
| **Xendit** | [S] fixed **Xendit Processing Fee** (~IDR 4,000 per attempt) **plus** a payment-method fee. Snippets conflict on the VA method fee, so get a quote [U] | [S] 0.7% + processing fee | [S] DANA 1.5%, OVO 1.5–3.18%, ShopeePay 2–4% | [U] | **IDR 25,000 per active sub-account per month**; **0.5% of the split amount, capped IDR 10,000** [S], matching the model in docs [V] https://docs.xendit.co/docs/xenplatform-fees | [U] |

Xendit fee policy changes [V] (docs) / [S] (help center policy):
- A per-attempt **processing fee** applies to every payment, payout and refund initiated via API. https://docs.xendit.co/docs/transaction-fees
- A **USD 50 monthly minimum** applies from 1 Oct 2026 to dormant accounts or months with invoices under USD 50.
- A **USD 250/month legacy-API maintenance fee** applies from 1 Oct 2026, so integrate against the current (v3 / payment-session) APIs only. https://help.xendit.co/hc/en-us/articles/59516240127129-Xendit-Pricing-Policy [S]

For a low-volume v1, the Xendit minimum and processing fee make it noticeably more expensive per transaction than Midtrans or DOKU.

Settlement / withdrawal:
- Midtrans: payout-eligible 3 business days after the transaction settles [V]. https://docs.midtrans.com/docs/when-can-i-withdraw-my-transaction-funds-from-midtrans
- DOKU: H+1 to H+4 business days, per a DOKU blog snippet [S].
- Xendit: see the table in §3.

## 5. KYC: yayasan as merchant and Lokasi as sub-merchant

- **Midtrans** [V] lists "Foundation (Education, Health Services, Religious Activities, Social Fund)" as a supported type. Required documents: latest deed, Kemenkumham decree, chairman's KTP and NPWP, foundation NPWP, NIB/SIUP/TDP, and "other foundation licenses according to the foundation's activities". https://docs.midtrans.com/docs/what-are-the-legal-documents-required-for-midtrans-account-registration . The website must also meet criteria (see the FAQ in the index).
- **Xendit** [S]: the help-center article "Can Xendit support a Foundation or other Non Profit Organizations?" says yes, given the director's KTP and NPWP, NIB (or TDP/SIUP), a foundation licence and activity licences. https://help.xendit.co/hc/en-us/articles/4407822338317 . The KYC enums include `DONATIONS` and `GRANTS` as source of funds [V]. https://docs.xendit.co/docs/account-verification-enumerations
  - **Sub-accounts** need their own KYC [V]. Either the platform submits it (Dashboard or `Create Account v3` + `Submit account verification` API, with a status webhook), or the sub-account's Authorized Representative gets an invite link. **Only the Authorized Representative can submit, and they must pass face (liveness) verification.** https://docs.xendit.co/docs/xenplatform-global-accounts-setup
  - So every Lokasi operator (a person, yayasan, pengurus masjid, DKM, etc.) must be KYC-able as a business or individual on Xendit. For Lokasi that YIEM itself controls, a sub-account can be YIEM-owned (same entity, a "branch").
- **DOKU** [U]: yayasan onboarding documents are not published on a DOKU page we could reach. Split Settlement only needs verified bank accounts, so the KYC burden for Lokasi operators is lightest there.

Regulatory note [U, not researched here]: if YIEM itself holds funds and later redistributes them to third-party Lokasi operators, it may look like fund transfer / payment facilitation under BI rules. Gateway-held sub-account balances (Xendit, DOKU Sub-Account) or gateway-executed split settlement keep the licensed PJP holding the money. Worth a quick legal check before going the "collect everything then disburse" route.

## 6. API quality for a solo developer

- **Xendit**:
  - Best self-serve docs. Machine-readable `llms.txt` and `.md` mirrors, an OpenAPI-style reference, and a test mode.
  - Official SDKs, including Node, Python, PHP, Go and Java **[U: current versions not checked]**.
  - xenPlatform, Subscriptions and split rules are all documented end-to-end with webhooks.
  - Costs: the pricing model is more complex (processing fee + method fee + minimum), and there is a v3-vs-legacy API churn risk (maintenance fee).
- **Midtrans**:
  - Snap (hosted checkout) is the simplest integration in Indonesia, with mature official libraries (e.g. `midtrans-go`, Java, and more).
  - Large community and a sandbox.
  - Weakest fit for multi-party money flow because nothing platform-shaped is public.
- **DOKU**:
  - Docs are decent and also expose `llms.txt`.
  - SNAP-standard auth: B2B token, HMAC-SHA512 / asymmetric signatures, `X-EXTERNAL-ID` unique per day. That is more ceremony than Xendit's basic-auth API key.
  - Split and Sub-Account need sales activation.
  - It has a public sandbox demo for Sub-Account. https://sandbox.doku.com/demo/sub-account

## Recommendation

1. **v1 default: Xendit xenPlatform.**
   - Set up one master account (YIEM, as a yayasan) and one sub-account per Lokasi. YIEM-controlled Lokasi get YIEM-verified sub-accounts. Partner Lokasi get invite-link KYC.
   - Charge families via payment links / VA / QRIS created with `for-user-id` + `with-split-rule`, so YIEM's commission (if any) splits back to the master at settlement.
   - Paket Layanan recurrence: per-cycle invoices by default, Xendit Subscriptions as opt-in for card/e-wallet.
   - This is the most managed, least-custom-ledger option. Budget for the USD 50 monthly minimum, IDR 25k per active Lokasi per month, and the per-attempt processing fee, and get a written Indonesian fee quote first.
2. **Cheaper fallback: DOKU Checkout + Split Settlement.** Use this if Lokasi partners can't or won't do sub-account KYC and liveness, or if Xendit's fee floor matters at low volume. Each Lokasi is just a verified settlement bank account. You build the per-cycle invoicing yourself.
3. **Avoid Midtrans for v1's multi-Lokasi payout** unless sales confirms "Transaction Split" in writing. Midtrans is fine if v1 only covers YIEM-owned Lokasi and a single payee is acceptable.
4. Before committing, ask both Xendit and DOKU sales for:
   - (a) a yayasan onboarding checklist
   - (b) written IDR fees for VA, QRIS and e-wallet, plus platform fees
   - (c) confirmation that burial / cemetery services are not a restricted category
