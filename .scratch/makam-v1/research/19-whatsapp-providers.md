# Research: WhatsApp providers, OTP fallback and transactional email

Ticket: [../issues/19-notification-channels.md](../issues/19-notification-channels.md)
Researched / accessed: 2026-09-25. Sources are Meta developer docs and Meta's own rate-card files, plus provider pricing and docs pages.
Legend: **[V]** = verified on a primary source · **[S]** = secondary source only (blog, reseller, search snippet) · **[U]** = unverified or undocumented, needs a sales quote or a test.

## TL;DR

- **Meta pricing changes again on 1 Oct 2026, six days after this note.** The model has been per-message since 1 Jul 2025. From 1 Oct 2026 Meta also charges for **service (free-form, in-window) messages** at the utility rate, after a free tier of **1,000 service messages per business phone number per month**. It also charges for **utility templates sent inside the 24h customer-service window**, which were free from 1 Jul 2025 until then. **[V]**
- **Indonesia rates (IDR, per delivered message; Jul 2026 card, unchanged on the Oct 2026 card):** marketing **Rp586.33**, utility **Rp356.65**, authentication **Rp356.65**, authentication-international **Rp1,940.13**, service from 1 Oct 2026 **Rp356.65**. Volume-tier discounts start above 750,000 msgs/month, so they don't matter for us. **[V]**
- At our volume (about 1–3k template messages a month), Meta fees are roughly **Rp0.36–1.1 M/month** before tax. Choosing a BSP is mostly a choice about its **monthly fee** and whether you want its **inbox**.
- **Cloud API direct** is workable for a solo engineer. Onboarding: a verified Meta business portfolio (NIB/akta/NPWP-type documents), a display name, and a number that can receive SMS or a voice call and isn't active on the WhatsApp app. New portfolios can message 250 unique users per 24h outside the service window. Business verification (or 2,000 high-quality template sends in 30 days) lifts that to 2,000. **[V]**
- **Data residency:** Cloud API processes data in Meta data centres internationally, with up to 30-day retention. **Local Storage supports Indonesia (`data_localization_region=ID`)**, with a 60-minute in-use window outside the region. It is set per number while the number is unregistered. **[V]**
- **Unofficial gateways** (Fonnte, Wablas, WAHA/Baileys) break the WhatsApp ToS, and their own sites warn about bans. Don't use one as the only login channel.
- **SMS fallback:** local masked SMS costs about **Rp650–790/SMS** (Zenziva) and needs a registered sender ID. Twilio lists **US$0.4414/SMS** to Indonesia (about 20× higher). Twilio Verify does WhatsApp→SMS failover automatically but adds $0.05 per verification. **[V]**
- **Email:** **Amazon SES has a Jakarta region (ap-southeast-3), API only (no SMTP there)**, at $0.10/1,000 à la carte. Resend's regions are us-east-1, eu-west-1, sa-east-1 and ap-northeast-1 (no Jakarta), with a free plan of 3,000/month. Postmark starts at $15/month for 10k. **[V]**

---

## 1. Meta WhatsApp Cloud API (direct)

### 1.1 Pricing model [V]
- Per-message since **1 Jul 2025**: "You are only charged when a template message is delivered." Template categories are marketing, utility and authentication. https://developers.facebook.com/docs/whatsapp/pricing
- **Until 30 Sep 2026:** non-template (service) messages inside an open 24h customer-service window (CSW) are free, and **utility templates inside an open CSW are free**. The Free Entry Point (Click-to-WhatsApp ads or Page CTA) opens a 72h window in which everything is free. Same page.
- **From 1 Oct 2026** (Meta docs, Indonesian-locale page, section "Tarif layanan, berlaku tanggal 1 Oktober 2026"). https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#service-rates-effective-october-1-2026
  - "Meta akan mengenakan biaya per pesan untuk pesan layanan … tarif untuk pesan layanan akan sama dengan tarif pesan utilitas dan autentikasi, berdasarkan pasar." (Meta will charge per message for service messages … at the same rate as utility and authentication messages, by market.)
  - "Setiap nomor telepon bisnis memiliki satu tingkat gratis bersama untuk 1.000 pesan layanan yang dikirimkan per bulan … tidak akan diperpanjang." (Each business phone number has one shared free tier of 1,000 service messages delivered per month, with no roll-over.) Without a payment method, Meta sends service messages within the free tier but not after it.
  - "Mengenakan biaya untuk pesan utilitas sebagai tanggapan atas pengguna (dalam periode layanan pelanggan 24 jam), yang belum dikenakan biaya sejak 1 Juli 2025." (Meta will charge for utility messages sent in reply to users inside the 24h customer-service window, which have been free since 1 Jul 2025.) So **utility templates are no longer free in-window**.
  - The English `/docs/whatsapp/pricing/updates-to-pricing` page, as summarised by our fetch tool, did not surface this. The Indonesian-locale documentation page and the published 1 Oct 2026 rate-card PDF (which adds a **Service** column) both show it. Treat it as confirmed. A reseller (Zenziva) also lists "Service Rp367 … charging begins October 1, 2026". https://zenziva.id/harga/
- Volume tiers apply to utility and authentication only, reset monthly and are based on charged messages. https://developers.facebook.com/docs/whatsapp/pricing
- Billing currency: IDR is supported. **[V]** Whether Meta adds Indonesian VAT (PPN 11%) for an Indonesian billing entity: resellers state "+11% PPN" **[S]**. Meta's own tax treatment for direct IDR billing was not checked **[U]**.

### 1.2 Indonesia rates [V]
Source: Meta rate-card files linked from https://developers.facebook.com/docs/whatsapp/pricing ("Cost per message in IDR … effective July 1, 2026" CSV, and "… effective October 1, 2026" PDF).

| Category | Rp / delivered msg (Jul 2026 card) | Oct 2026 card |
|---|---|---|
| Marketing | 586.33 | 586.33 |
| Utility | 356.65 | 356.65 |
| Authentication | 356.65 | 356.65 |
| Authentication-international | 1,940.13 | 1,940.13 |
| Service | n/a (free) | 356.65 (after 1,000 free / number / month) |

- Volume tiers (utility and authentication): 0–750,000 at list price; −5% from 750,001. Irrelevant at our scale.
- **Authentication-international** applies only when the business is eligible, operates in a *different* country from the recipient, and its start date has passed. Indonesia is one of the countries with this rate. A yayasan based in Indonesia messaging +62 users pays the normal authentication rate. https://developers.facebook.com/docs/whatsapp/pricing/authentication-international-rates
- Rough monthly cost at launch, Meta fees only: 1,000 authentication + 1,000 utility ≈ **Rp713k**. From Oct 2026, add in-window utility and any service replies beyond 1,000 free.

### 1.3 Authentication templates [V]
https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
- Fixed body text only: "*{{1}}* is your verification code." (localised). Two optional additions: the security line "For your security, do not share this code." and an expiry warning (1–90 min). No custom text, URLs, media or emojis.
- Button types:
  - **Copy code**: works everywhere; this is the realistic choice for a web app.
  - **One-tap autofill** and **zero-tap**: need an Android app with a handshake. The doc notes iOS 26+ keyboard suggestions work "with no integration needed" (from 15 Jun 2026). Neither is relevant for a Next.js web login.
- A TTL can be set on the template, so an undelivered OTP isn't delivered late.
- "Authentication messages are only delivered to a user's primary WhatsApp device." Messages are masked on linked devices. **UX implication:** a user who has only WhatsApp Web or Desktop open will not see the code there. They must look at their phone.

### 1.4 Onboarding (Indonesian yayasan)
- **Phone number** [V]: must be owned by you, include country and area code (no short codes), and be able to receive a voice call or SMS for verification. Landlines are allowed. A number currently active on WhatsApp Messenger or the Business app must be deleted first, unless onboarded through **Coexistence** (below). A display name is set at registration and appears on the business profile. https://developers.facebook.com/docs/whatsapp/phone-numbers
- **Number count**: 2 registered numbers initially, raisable to 20. https://developers.facebook.com/docs/whatsapp/overview/business-accounts
- **Business verification**: Meta's help article (https://www.facebook.com/business/help/159334372093366) could not be read by fetch. Indonesian resellers list NIB, akta pendirian, NPWP, a business bank statement, and a utility bill for address/phone; documents may be in Indonesian; the legal name must match exactly **[S]** (https://zenziva.id/articles/verifikasi-meta-business-portfolio, https://docs.360dialog.com/docs/resources/meta-business-verification). For a yayasan, expect the akta plus the SK Kemenkumham and the NPWP of the yayasan **[U]**.
- **Messaging limits** [V] https://developers.facebook.com/docs/whatsapp/messaging-limits
  - The limit is set at the **business-portfolio level** and shared by all numbers.
  - New portfolios can reach **250** unique users per rolling 24h *outside* a customer-service window.
  - To reach 2,000, do one of: verify the business, get partner verification, or deliver 2,000 high-quality template messages within 30 days.
  - After that, scaling to 10k / 100k / unlimited is automatic at good quality and ≥50% use within 7 days.
  - OTPs count toward the limit, because they go outside a window. 250/day is enough for a soft launch, but **get business verification done before launch**.
- **Coexistence** [V]: the same number runs on the WhatsApp Business app and Cloud API at once, and messages are mirrored both ways. Throughput is fixed at 20 mps, and groups, broadcast lists and calls are unsupported on the API side. It is available **only through Solution Partners or Tech Providers via Embedded Signup**, not to a business integrating directly. This is a cheap "inbox" if you go through a BSP that supports it. https://developers.facebook.com/docs/whatsapp/embedded-signup/custom-flows/onboarding-business-app-users

### 1.5 Data hosting / localization [V]
- "Cloud API processes messages on servers in Meta data centers." Messages are retained up to **30 days** (for retransmission and similar). https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/
- **Local Storage**: the `data_localization_region` parameter on number registration lists APAC regions **Australia (AU), Indonesia (ID), India (IN), Japan (JP), …** https://developers.facebook.com/docs/whatsapp/cloud-api/reference/registration
  - Message content may still be processed internationally during a **60-minute** data-in-use window, then persists only in-region.
  - It can be enabled or disabled only while the number is unregistered (deregister and re-register takes minutes, with no re-verification).
  - No extra fee is mentioned. https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/
- Whether a given BSP passes `data_localization_region` through for you **[U]**: ask them.

---

## 2. BSPs / Tech Providers

All of them pass Meta's per-message fee through, sometimes with a markup, and charge their own platform fee on top.

| Provider | Platform fee | Per-message on top of Meta | Inbox for inbound replies | Notes |
|---|---|---|---|---|
| **Twilio** | none | **+US$0.005 per message, inbound and outbound**; $0.001 per failed message | No (API only; you build it, or use Twilio Flex/Conversations) | Meta fees passed through. Good docs and SDKs, webhook-driven. Data is US-hosted **[U for WhatsApp specifically]**. https://www.twilio.com/en-us/whatsapp/pricing |
| **360dialog** | **€49 / number / month** (Regular); €99 Premium; €500 Scale | Meta fees; markup not stated **[U]** | No (raw API; the "Marketplace" connects third-party inbox tools) | Thin proxy over Cloud API, the closest thing to "Meta direct plus support". Hosting location not verified (architecture doc 404'd) **[U]**. https://www.360dialog.com/pricing |
| **Wati** | **US$15 / month** Growth (3 users), $25 Pro (5 users), $99 Business | Per-message by country; markup not published **[U]** | **Yes, shared team inbox on all plans** | Mainly an inbox/broadcast SaaS. API access by plan, and API quality **[U]**. https://www.wati.io/pricing/ |
| **Mekari Qontak** | From **Rp2,000,000 / month** (Service/Sales Suite Plus, 5 users); "prices vary, consult sales" | **[U]** | **Yes, omnichannel inbox, CRM, chatbot** | Local company, IDR invoicing and support. Overkill for us. https://qontak.com/harga/ |
| **Zenziva** (local reseller) | **[U]** (not shown on pricing page) | Utility/auth **Rp367**, marketing **Rp597**, service Rp367 from 1 Oct 2026 (excl. PPN 11%). About 3% over Meta | **[U]** | Also sells SMS masking, so one vendor covers WhatsApp and SMS fallback. https://zenziva.id/harga/ |
| **Infobip** | Custom / sales | Custom | Yes (Conversations product) | No public Indonesia rates. https://www.infobip.com/whatsapp-business/pricing |
| Damcorp, Jatis, Gupshup | not checked in depth | enterprise, sales-quoted **[U]** | | |

---

## 3. Unofficial gateways (Fonnte, Wablas, WAHA/Baileys)

- **How they work:** they log a normal WhatsApp account in as a linked device (you scan a QR code from the WhatsApp app), then drive it through reverse-engineered WhatsApp Web protocols. WAHA's engines are WEBJS, NOWEB (Baileys) and GOWS.
- **Cost:**
  - **Fonnte**: Free 1,000 msgs/month; Lite Rp25k; Regular 10k msgs Rp66k; Master unlimited Rp175k. https://fonnte.com/
  - **WAHA** Core is free and self-hosted. https://waha.devlike.pro/
- **Their own disclaimers:**
  - Fonnte: "bukanlah sebuah layanan yang berjalan diatas official API whatsapp" (it is not a service running on the official WhatsApp API). Users accept the "resiko banned dari pihak whatsapp" (risk of being banned by WhatsApp), with no SLA and no liability.
  - WAHA: "WhatsApp does not allow bots or unofficial clients on their platform, so this shouldn't be considered totally safe."
- **WhatsApp ToS:** users may not use the service for "bulk messaging, auto-messaging, auto-dialing", or access it "through automated or other means … in impermissible or unauthorized manners". https://www.whatsapp.com/legal/terms-of-service
- **Verdict:** a ban would lock every user out, because WhatsApp OTP is the only login. Not acceptable for login. At most a throwaway dev or test tool.

---

## 4. OTP fallback

### 4.1 SMS in Indonesia
- **Sender ID** [V, Twilio guidelines]:
  - Alphanumeric sender IDs must be pre-registered, domestic in about 3 weeks and international in about 4.
  - Unregistered traffic to Telkomsel, XL Axiata and Smartfren is blocked (since 21 Sep 2024).
  - Numeric sender IDs are not officially supported and get overwritten.
  - Domestic sender IDs must include the brand name in the message body.
  - Two-way SMS is not supported.
  - https://www.twilio.com/en-us/guidelines/id/sms
- **Local price:** Zenziva SMS masking costs **Rp650–790 per SMS**, depending on operator and deposit tier (Telkomsel cheapest, XL highest), excl. PPN. https://zenziva.id/harga/ The masking registration process and fee at Zenziva **[U]**.
- **Twilio SMS to Indonesia:** **US$0.4414 per segment**. Twilio says to contact sales for domestic or alphanumeric discounts. https://www.twilio.com/en-us/sms/pricing/id
- **Delivery reliability:** no primary data found **[U]**. Documented degradation factors are unregistered sender IDs and international routes (per the above).
- **Miscall OTP (Citcall):** the code is the last digits of the caller number on a missed call, and you pay only on success. Priced from about **Rp165 per successful miscall** **[S]** (https://entrepreneur.uai.ac.id/citcall-hadirkan-layanan-penyedia-password-lewat-missed-call/). Needs the user to read the caller ID, and awkward on web. Current pricing **[U]**. https://citcall.com/

### 4.2 Multi-channel verify services
- **Twilio Verify:**
  - **US$0.05 per successful verification** plus channel fees (SMS at the per-country rate, WhatsApp at Meta's fees). https://www.twilio.com/en-us/verify/pricing
  - WhatsApp→SMS failover is automatic: "WhatsApp (`channel=whatsapp`) will fallback to SMS (if SMS channel is enabled)". It triggers when the number has no WhatsApp, the channel is unavailable or degraded, or the template is misconfigured. https://www.twilio.com/docs/verify/fallback-scenarios
    - The Verify WhatsApp page calls "Optimal Channel Selection" a **pilot** **[V, contradictory maturity signals]**.
  - Since 1 Mar 2024 you must use **your own WABA/sender** for WhatsApp OTP. https://www.twilio.com/docs/verify/whatsapp
  - Indonesia per-verification all-in estimate: $0.05 + ~$0.021 WhatsApp ≈ **$0.07 (about Rp1,150)**, or $0.05 + $0.44 SMS ≈ $0.49 when it falls back. Expensive compared with DIY.
- **DIY alternative:** send the WhatsApp authentication template yourself (Rp356.65). On a `failed` status webhook, or on a user click of "send by SMS", send a local masked SMS (Rp650–790). This costs about a third of Twilio Verify, at the price of one extra integration.

---

## 5. Transactional email (invoices)

| Option | Price | Jakarta region? |
|---|---|---|
| **Amazon SES** | à la carte **$0.10 / 1,000 emails**, plus $0.12/GB of attachments (Essentials plan $0.16/1k). New accounts get up to $200 free-tier credits for 6 months. https://aws.amazon.com/ses/pricing/ | **Yes, `ap-southeast-3` (Jakarta) has the SES API endpoint, but "SMTP endpoints are not currently available in … Asia Pacific (Jakarta)"**, so use the HTTPS API or SDK. The default sandbox quota is 200/24h at 1/s until you request production access. https://docs.aws.amazon.com/general/latest/gr/ses.html |
| **Resend** | Free: 3,000/month, 100/day. Pro **$20/month for 50k**. https://resend.com/pricing | No. Regions are us-east-1, eu-west-1, sa-east-1 and ap-northeast-1, and account data stays in the US. https://resend.com/docs/dashboard/domains/regions |
| **Postmark** | Free 100/month; Basic **$15/month for 10k**, $1.80/1k overage. https://postmarkapp.com/pricing | Not checked **[U]** |

Cheapest boring option that sends from Jakarta: **SES ap-southeast-3 via API**. Simplest DX at our volume: Resend's free tier, as long as the 100/day cap holds.

---

## Open questions / to confirm with vendors
- Whether Meta's direct IDR invoicing adds PPN, and whether Meta issues a faktur pajak to a yayasan.
- The exact Meta business-verification document list for a *yayasan* (as opposed to a PT).
- For the chosen BSP: whether it supports Local Storage `ID`, Coexistence, and its markup over Meta rates.
- Zenziva SMS masking registration lead time and cost, and its per-operator delivery rates.
