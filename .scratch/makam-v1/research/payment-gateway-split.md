# Payment gateways and split payments in Indonesia

Research for ticket [02-payment-gateway-split](../issues/02-payment-gateway-split.md). Researched 2026-09-24 from primary sources: vendor docs, vendor pricing pages, and vendor GitHub repos. Every claim has a source. Where a live page was blocked, the source is an archived copy of the vendor's own page and is labelled as one. Section 6 lists what could not be verified.

**Question:** Which Indonesian gateways support split payments or sub-accounts (the platform collects, then pays out to each Lokasi Makam operator), recurring billing (for recurring Paket Layanan), VA/QRIS/e-wallets, and a **yayasan** (YIEM) as the merchant? Compare fees, settlement times, KYC for the yayasan and for sub-merchants, and API quality for a solo developer.

---

## 1. Xendit

### Split payments and sub-accounts (xenPlatform)
- xenPlatform adds sub-accounts under a master account. Sub-accounts are "distinct Xendit accounts created under your platform to represent your merchants, partners, vendors, or business branches". Each has its own balance, and you route to one by passing its ID in the `for-user-id` header. Source: https://docs.xendit.co/docs/sub-accounts
- Split Rules (`POST https://api.xendit.co/split_rules`) take a `flat` or `percent` amount and can list several destinations in `routes`. They are applied per transaction with the `with-split-rule` header. Three money flows are supported: sub-account to master (for example, the platform keeps a commission), sub-account to sub-account, and master to sub-account (the "Online Marketplace" case: the platform collects, then routes a share to the merchant). Source: https://docs.xendit.co/docs/split-payments
- The split runs **after the funds settle**, on the amount net of transaction fees. A 100% split fails because the fee can't be deducted. **Split fees are not automatically reversed on refunds**. Source: https://docs.xendit.co/docs/split-payments
- The master account can create payouts from a sub-account's balance via the API (`for-user-id`). Sub-account users can also withdraw, or set up auto-withdrawal, from their own dashboard. Source: https://docs.xendit.co/docs/payouts-for-sub-accounts
- Sub-accounts can have no dashboard of their own ("background-driven"), or they can get their own dashboard view. Source: https://docs.xendit.co/docs/sub-accounts
- xenPlatform is switched on from the dashboard. If you accept payments on behalf of other merchants, Xendit asks about payment licences, where your merchants are incorporated, and **who is liable for chargebacks**. Source: https://docs.xendit.co/docs/activate-xenplatform

### Sub-merchant KYC
- Sub-account KYC is "mandatory business verification". You can submit it on the sub-account's behalf (dashboard or API), or send an invite link so the operator's authorised representative submits it. Source: https://docs.xendit.co/docs/sub-accounts
- Only the Authorised Representative can submit the verification form, and they must pass a Face Verification (liveness) test. Source: https://docs.xendit.co/docs/xenplatform-global-accounts-setup
- There is an Account Holder API with a KYC status webhook. Entity types are CORPORATION, PARTNERSHIP, SOLE_PROPRIETORSHIP and INDIVIDUAL. Source: https://docs.xendit.co/apidocs/create-account-holder
- In Indonesia, "Individual applications are only allowed if they are XP sub-accounts". So an operator without a legal entity (for example, a mosque committee or an individual pengelola) can in principle be an individual sub-account. Source: https://docs.xendit.co/docs/indonesia-business-documents (the full per-entity document list is an embedded Airtable that could not be read; see section 6).

### Yayasan as the merchant
- Xendit's help centre says Xendit supports foundations and non-profits if they provide: owners'/directors' ID card and tax ID; NIB (or TDP/SIUP); latest deed (Akta); ministry ratification (SK Menkumham); a foundation licence; and other business licences for the activity. Source: Xendit Help Center article 4407822338317, "Can Xendit support a Foundation or other Non-Profit Organizations", read from the Wayback copy of 2025-08-03 because the live page returns HTTP 403 to automated clients: http://web.archive.org/web/20250803023335/https://help.xendit.co/hc/en-us/articles/4407822338317-Can-Xendit-support-a-Foundation-or-other-Non-Profit-Organizations

### Recurring billing
- The Subscriptions product has plans, schedules and cycles. Xendit runs the scheduler and the retry logic, and sends webhooks for each cycle (`recurring.cycle.succeeded`, `recurring.cycle.failed`, and so on). Plans can be set up through a hosted checkout (`type: SUBSCRIPTION` payment session) or from an existing payment token. Source: https://docs.xendit.co/docs/subscriptions-overview
- Only some IDR channels support merchant-initiated (saved-token) charges: **CARDS, GOPAY / GOPAY_RECURRING, OVO, DANA, SHOPEEPAY and BRI_DIRECT_DEBIT**. VAs and QRIS do not. Source: the "Merchant Initiated Transaction" rows at https://docs.xendit.co/docs/available-payment-channels
- The price was **Rp 2.500 per active plan per month**. Source: archived Xendit ID pricing page (2025-11-03), http://web.archive.org/web/20251103043044/https://www.xendit.co/id/biaya/

### Payment methods and settlement (IDR)
From https://docs.xendit.co/docs/available-payment-channels:
- **VA:** BCA T+1 business day. BNI, BRI, BSI, BJB, CIMB, Mandiri, Permata, Muamalat, BSS, BNC, Hana: **instant**. BCA VA min Rp 10.000, max Rp 50.000.000.
- **QRIS:** T+2 business days.
- **E-wallets:** GoPay T+1. OVO, DANA, ShopeePay, LinkAja and AstraPay T+2.
- **Cards:** T+5. **Alfamart/Indomaret:** T+5.
- For e-wallets, QR, direct debit and PayLater, settlement is counted in calendar days unless stated otherwise. Source: https://docs.xendit.co/docs/settlements-overview

### Fees (Indonesia, excluding VAT unless noted)
Source: archived official ID pricing page, 2025-11-03 snapshot, http://web.archive.org/web/20251103043044/https://www.xendit.co/id/biaya/. The live page https://www.xendit.co/id/biaya/ returned HTTP 403 (Cloudflare bot check) to every automated fetch, so these may have changed since.
- **VA:** Rp 4.000 per transaction (aggregator model).
- **QRIS:** 0.7%, VAT included.
- **E-wallets:** AstraPay 1.5%, JeniusPay 2%, OVO 1.5–3.18%, ShopeePay 2–4%, LinkAja 1.5–3.15%. DANA is 1.5% with PIN and **3% without PIN, including recurring**.
- **Cards:** 2.9% + Rp 2.000.
- **Alfamart / Indomaret:** Rp 5.000 / Rp 5.500.
- **Payouts (disbursement):** Rp 2.500 per transfer.
- **xenPlatform:** Rp 25.000 per active sub-account per month. The in-house transfer/split fee is 0.5%, capped at Rp 10.000 per transaction, and is charged on the amount split, not the whole payment. The mechanics are confirmed at https://docs.xendit.co/docs/xenplatform-fees, which gives the example "0.5% x IDR 5,000 = IDR 25".
- Transaction fees come off the sub-account that receives the funds (direct billing). With **owned** sub-accounts, billing statements and tax invoices (Faktur Pajak) go to the master account. With **managed** sub-accounts, they go to the sub-account. Source: https://docs.xendit.co/docs/xenplatform-fees
- For comparison, the global pricing page lists a one-time **$5,000 "set-up fee" per entity** under "Additional Services". It is unclear whether this applies to Indonesian merchants, and the archived ID page does not list it. Source: http://web.archive.org/web/20260203085511/https://www.xendit.co/en/pricing/ (see section 6).

### API and SDK
- Markdown docs with an index for LLMs are at https://docs.xendit.co/llms.txt, and every page has a `.md` twin. That is useful when working with AI agents.
- The official SDKs are xendit-node (150★), xendit-php (193★) and xendit-python (47★), all last pushed 2025-10-01. Source: https://github.com/xendit/xendit-node, https://github.com/xendit/xendit-php, https://github.com/xendit/xendit-python (GitHub API, 2026-09-24). xendit-node's top-level modules are balance_and_transaction, customer, invoice, payment_method, payment_request, payout and refund. **It has no split-rule or sub-account module**, so xenPlatform calls are plain REST plus headers. Source: repo tree of https://github.com/xendit/xendit-node

---

## 2. Midtrans

### Split payments and sub-accounts
- **No public split-payment or sub-account API was found** in Midtrans's full docs index (https://docs.midtrans.com/llms.txt). The platform-style feature that is documented is a **Partner account**: one Partner ID sees several Merchant IDs in one dashboard. It is described for a group of companies managing subsidiaries, and each subsidiary is its own merchant. Source: https://docs.midtrans.com/docs/difference-between-merchant-account-and-partner-account and https://docs.midtrans.com/docs/merchant-administration-portal-partner-multi-outlet
- The docs home page mentions a "**Transaction Split feature**" that merchants can subscribe to, but only in a release note about report columns. The linked changelog page returns 404, and no product or API doc for it was found. Source: https://docs.midtrans.com/ (home page) and https://docs.midtrans.com/docs/balance-page-manage-withdraw-your-funds
- Paying operators would need a separate disbursement product (the MAP "Disbursement" feature, funded by a disbursement balance top-up with maker/approver roles), not an automatic split. Source: https://docs.midtrans.com/docs/merchant-administration-portal-fitur-disbursement

### Yayasan as the merchant
- Midtrans lists **Foundation (Education, Health Services, Religious Activities, Social Fund)** as its own registration type. It requires: latest deed; SK Kemenkumham on establishment or amendment; chairman's KTP and NPWP; the foundation's NPWP; NIB/SIUP/TDP; and other foundation licences for its activities. Source: https://docs.midtrans.com/docs/what-are-the-legal-documents-required-for-midtrans-account-registration

### Recurring billing
- A Subscription API (`create-subscription`) takes `payment_type` **`credit_card` or `gopay`** (GoPay Tokenization), with interval/unit/max_interval and retry schedules. Source: https://docs.midtrans.com/reference/create-subscription
- Card recurring "needs additional bank's approval and agreement, contact us to apply", and the first transaction must be 3DS. Source: https://docs.midtrans.com/docs/one-click-two-clicks-and-recurring-transaction

### Fees (from https://midtrans.com/pricing, fetched 2026-09-24)
- **VA:** Rp 4.000 for all listed banks (BCA, BRI, BNI, Mandiri, Permata, CIMB, Danamon, BSI, SeaBank, Bank Saqu).
- **QRIS:** 0.7%. Also stated at https://docs.midtrans.com/docs/what-is-the-applicable-transaction-fee-for-qris.
- **E-wallets:** GoPay 2%, ShopeePay 2%, DANA 1.5%, OVO 1.5%.
- **Cards:** 2.9% + Rp 2.000. **Alfamart / Indomaret:** Rp 5.000.
- **Payouts:** Rp 5.000 by bank transfer, Rp 2.500 to GoPay.
- Fees exclude 11% VAT, which is worked through in an example at https://docs.midtrans.com/docs/how-much-does-midtrans-charge-for-its-payment-service. There is no implementation or maintenance fee (same source).

### Settlement
- Funds can be withdrawn once a transaction has been settled for **3 business days**, with no withdrawal fee. Auto-withdrawal can run daily, weekly or monthly, with a minimum of Rp 50.000. Payouts happen on working days only. Source: https://docs.midtrans.com/docs/when-can-i-withdraw-my-transaction-funds-from-midtrans, https://docs.midtrans.com/docs/how-can-i-have-my-money-in-my-account-payout, https://docs.midtrans.com/docs/balance-page-manage-withdraw-your-funds
- Each merchant account can have only one payout bank account. Source: https://docs.midtrans.com/docs/balance-page-manage-withdraw-your-funds

### API and SDK
- The official SDKs are midtrans-php (421★, last push 2025-03-18), midtrans-nodejs-client (220★, 2025-06-03) and midtrans-python-client (44★, 2023-10-18). Source: https://github.com/Midtrans (GitHub API, 2026-09-24). Snap, a hosted popup or redirect checkout, is the easiest integration: https://docs.midtrans.com/docs/snap

---

## 3. DOKU

### Split payments and sub-accounts
- There are **two mechanisms**:
  1. **Split Settlement.** You add `additional_info.settlement` to a payment and split, by `FIX` or `PERCENTAGE`, to **bank accounts registered in the DOKU back office**. It is "for Aggregator Merchant" only and works with Checkout and Direct API. Source: https://developers.doku.com/accept-payments/finance-and-settlement/split-settlement
  2. **Sub-Account V2**, under "Wallet as a Service". Sub-accounts are created by API (`POST /sub-account/v2.0/register`) with name, type and optional email/phone. Each gets IDR, Pending-IDR and Points balances plus an auto-assigned BRI VA. Split rules (`POST /sub-account/v2.0/split-rules`, percentage or flat) run automatically at settlement when a payment carries `additionalInfo.account.id` and `split_rule_id`. Transfers can go between sub-accounts or out to 100+ banks. Hierarchies are unlimited. Source: https://developers.doku.com/wallet-as-a-service/sub-account/sub-account-v2, https://docs.doku.com/wallet-as-a-service/sub-account/account-management
- **Channel limits.** Sub-account routing works for VA (all banks), QRIS, OVO, DANA, ShopeePay, LinkAja, cards, Alfa and Indomaret via **DOKU Checkout**. Via **Direct API**, only VA, DOKU e-Wallet and convenience stores are supported. Source: https://docs.doku.com/wallet-as-a-service/sub-account
- Sub-Account must be switched on by Sales, and **pricing is "Contact Sales"**. It is for Indonesian business accounts only. DOKU says it is a "technology infrastructure layer", not a financial institution. Source: https://docs.doku.com/wallet-as-a-service/sub-account/faq
- A Hold & Release Settlement API lets you hold a payment's settlement until you release it (`POST /finance/v1/release`). This could support escrow-like "release to operator after the service is done". Source: https://developers.doku.com/accept-payments/finance-and-settlement/hold-and-release-settlement

### Sub-merchant KYC
- The Sub-Account docs **describe no per-sub-account KYC**: registration takes only name, type, email and phone. KYB applies to the platform's own business account. This comes from DOKU's docs, including the answer of their doc-search endpoint, which cites https://docs.doku.com/wallet-as-a-service/sub-account/account-management and https://docs.doku.com/get-started/activate-business/business-account. Whether Sales imposes KYC on sub-accounts during activation is **unverified**.

### Yayasan as the merchant
- **"Foundation" is a listed legal entity under the Corporate business account type.** Corporate uploads are: NIB; Akta Pendirian and amendments; SK Kemenkumham; business-proof photo; NPWP; and the director's KTP. The **Charity** line of business also needs a **Surat Izin PUB (Pengumpulan Uang dan Barang) from the Ministry of Social Affairs**. Source: https://docs.doku.com/get-started/activate-business/business-account
- "DOKU will not settle your funds if your business account has not been verified." Source: https://docs.doku.com/accept-payments/finance-and-settlement/settlement-time

### Recurring billing
- **FlexiBill** has two parts. *Subscription and Billing* issues invoices by email or WhatsApp each cycle, and customers pay through a link. *Account Billing* auto-debits cards (SALE + RECURRING/MOTO) and direct debit on a DOKU-hosted or merchant-hosted scheduler. FlexiBill needs a KYB-verified corporate account and has a host-to-host API. Source: https://docs.doku.com/subscription-and-billing/flexibill
- OVO recurring and BRI/Mandiri direct-debit recurring also exist in the Direct API. Source: https://developers.doku.com/llms.txt (OVO, BRI Direct Debit and Mandiri Direct Debit entries)

### Fees (from https://www.doku.com/en-US/pricing, fetched 2026-09-24, excluding VAT)
- **VA:** Rp 4.000 (BCA Rp 4.500).
- **QRIS:** 0.7%.
- **E-wallets:** DOKU e-Wallet and DANA 1.5%. OVO 2–3.18%, ShopeePay 2–4%, LinkAja 2–3.5% or Rp 2.500.
- **Cards:** 2.8% + Rp 2.000.
- **Alfamart:** Rp 5.000. **Indomaret:** Rp 6.500.
- **Direct debit:** 2% + Rp 2.000.
- **Transfer (payout):** Rp 1.500 per transfer (BI-FAST package). **Account validation:** Rp 500.
- **Wallet-as-a-Service (Sub-Account):** "Custom Price".
- No setup fee and no monthly fee.

### Settlement (aggregator scheme, working days; from https://docs.doku.com/accept-payments/finance-and-settlement/settlement-time)
- **VA:** T+1 for most banks. BCA and DOKU VA T+2.
- **QRIS:** T+1.
- **E-wallets:** OVO, ShopeePay and DANA T+2. LinkAja T+1.
- **Cards:** T+2 to T+3. **Alfa / Indomaret:** T+4.
- Settlements are processed on working days, 12:00–14:00 WIB.
- In Sub-Account, Checkout/Direct-API money sits in `PENDING_IDR` until settlement. BRI VA top-ups are available in real time. Source: https://docs.doku.com/wallet-as-a-service/sub-account/faq

### API and SDK
- The docs are thorough (GitBook, with `llms.txt`, `.md` pages and an `?ask=` Q&A endpoint), and there is a no-setup sandbox demo of Sub-Account. Source: https://docs.doku.com/wallet-as-a-service/sub-account
- The APIs are SNAP-style, with B2B access tokens and HMAC signatures, which is more ceremony than Xendit's basic-auth API key. Source: https://developers.doku.com/wallet-as-a-service/sub-account/sub-account-v2
- The official SDKs are small: doku-nodejs-library (5★), doku-php-library (6★) and doku-python-library (2★), all last pushed July 2025. Source: https://github.com/PTNUSASATUINTIARTHA-DOKU (GitHub API, 2026-09-24). The Node SDK repo contains VA and account-binding models but **no sub-account module** (repo tree).

---

## 4. Other contender (briefly)
- **OY! Indonesia** documents a "Payment Routing" API that routes an incoming payment onward to disbursement recipients. Source: https://api-docs.oyindonesia.com/. A search-result snippet of an OY! product page said routing goes to "up to 10 recipient accounts", but this could not be confirmed on a fetched page. KYC for recipients and pricing were not checked. It is not evaluated further here.

---

## 5. Comparison

| | Xendit | Midtrans | DOKU |
|---|---|---|---|
| Platform split / sub-accounts | **Yes**: xenPlatform sub-accounts + Split Rules (flat/%, multi-route), all via API | **No public API found**. Partner account = multiple separate merchants. "Transaction Split" mentioned but undocumented | **Yes**: Sub-Account V2 + split rules, or Split Settlement to registered bank accounts |
| Split on which channels | Any charge type ("Create a charge of any type") | n/a | All channels via Checkout. Direct API: VA, DOKU wallet, OTC only |
| Sub-merchant KYC | **Mandatory** (by platform on their behalf, or invite). Face verification of authorised representative. Individuals allowed as sub-accounts | n/a (each MID = full merchant onboarding) | **None documented** per sub-account (platform KYB only) |
| Yayasan as merchant | Yes (help-centre doc list) | Yes, explicit "Foundation" type | Yes, "Foundation" under Corporate. Charity line adds PUB licence |
| Recurring | Subscriptions product (scheduler + retries). Cards, GoPay, OVO, DANA, ShopeePay, BRI DD. Rp 2.500/active plan/mo | Subscription API: card (needs bank approval) + GoPay | FlexiBill: invoice-per-cycle (any channel) + auto-debit (card, direct debit) |
| VA / QRIS / e-wallet fees | Rp 4.000 / 0.7% / 1.5–4% | Rp 4.000 / 0.7% / 1.5–2% | Rp 4.000 (BCA 4.500) / 0.7% / 1.5–4% |
| Platform fees | Rp 25.000 per active sub-account/mo + 0.5% of split amount (cap Rp 10.000) | n/a | Contact Sales |
| Payout fee | Rp 2.500 | Rp 5.000 bank | Rp 1.500 (BI-FAST) |
| Settlement | VA mostly instant (BCA T+1). QRIS T+2. E-wallets T+1–2 | Withdraw ≥ 3 business days after settlement | VA T+1 (BCA T+2). QRIS T+1. E-wallets T+1–2 |
| Docs / SDK for solo dev | Best: clean REST, basic auth, LLM-friendly docs, maintained SDKs (no xenPlatform module) | Good for plain checkout (Snap), popular SDKs. Weak for platform | Good docs, but SNAP-style signing and tiny SDKs without sub-account support |
| Self-serve activation of platform feature | Dashboard "Activate xenPlatform" (with review questions) | n/a | Contact Sales |

---

## 6. Not verified / open
- **Current Xendit Indonesia prices.** The live pricing and help-centre pages block automated access (HTTP 403). The figures come from an archived snapshot of 2025-11-03. Confirm with Xendit, including whether the **$5,000 per-entity setup fee** on the global page applies in Indonesia.
- **Xendit's Indonesian KYC document list per entity type** (for sub-accounts, and whether "yayasan" is an accepted sub-account entity) is in an embedded Airtable that could not be read: https://docs.xendit.co/docs/indonesia-business-documents
- **What Midtrans "Transaction Split" is**, and whether Midtrans offers a marketplace/payment-facilitator programme through Sales. Only a release-note mention was found.
- **DOKU Sub-Account pricing**, and whether DOKU applies KYC to sub-accounts during Sales activation.
- **Regulatory fit** (not a gateway question, but it blocks the choice): whether YIEM collecting money for operators is allowed without a payment licence, whether YIEM must be seller of record (links to the "Invoices and tax" open item), and whether collecting **wakaf** funds triggers the PUB licence or BWI rules. Nothing here was checked against Bank Indonesia or Kemensos regulation.
- **OY! Indonesia** was only glanced at.

---

## 7. Recommendation (opinion, separate from the facts above)

**Use Xendit xenPlatform for v1**, with YIEM as the master account and one sub-account per Lokasi Makam operator.

- It is the only one of the three whose split/sub-account feature is **self-serve, fully documented, and works on every payment channel**. That matches the map's "boring, managed, low-ops" constraint for a solo builder.
- Its KYC model fits the v1 operating model (a few Lokasi that YIEM controls or has signed partners for). YIEM can submit KYC for its own Lokasi. Partner operators get an invite link. Individual pengelola are allowed as sub-accounts. The KYC burden is real, since each authorised representative needs a liveness check, but it also backs up the "lokasi terverifikasi" promise.
- The routing flow is Pemesan pays → funds land in the **Lokasi's sub-account** (`for-user-id`) → a Split Rule sends YIEM's commission to the master account. Alternatively, collect into the master account and route the operator's share (the "marketplace" flow). **Grill which one is right**, because it decides who the seller of record is and who receives Faktur Pajak (owned vs managed sub-accounts).
- For recurring Paket Layanan, prefer **invoice-per-cycle** (a Xendit payment link each cycle, paid by VA or QRIS) over auto-debit. Indonesian families mostly pay by VA/QRIS, and those channels can't be charged by the merchant. Keep Xendit Subscriptions for customers who opt into GoPay, OVO or a card.
- Cost at small scale: Rp 25.000 per active Lokasi per month plus at most Rp 10.000 per split, on top of Rp 4.000 per VA payment. That is negligible next to plot prices.
- **Fallback: DOKU Sub-Account.** It is attractive if per-operator KYC is a blocker (none documented) or if the Rp 1.500 payout fee matters. The costs are a Sales-gated activation, undisclosed platform pricing and heavier SNAP signing.
- **Midtrans** is not recommended for the split requirement. It is fine only if YIEM decides to collect everything as a single merchant and pay operators by manual or batch disbursement.

Next steps: before committing, confirm current Indonesian pricing and the set-up fee with Xendit Sales, and get a regulatory check on the collect-then-route model.
