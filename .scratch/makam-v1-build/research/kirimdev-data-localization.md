# Research: kirim.dev and Meta Local Storage (`data_localization_region=ID`)

Tickets: [../issues/05-whatsapp-and-sms-vendors.md](../issues/05-whatsapp-and-sms-vendors.md), [../issues/62-real-whatsapp-and-sms-adapters.md](../issues/62-real-whatsapp-and-sms-adapters.md)
Builds on: [../../makam-v1/research/19-whatsapp-providers.md](../../makam-v1/research/19-whatsapp-providers.md) (§1.5 data hosting, §1.3 authentication templates). That note did not cover kirim.dev itself; this one does.
Researched / accessed: 2026-09-25.
Legend: **[V]** = verified on a primary source · **[O]** = observed by probing kirim.dev's public API without a key (behaviour, not documentation) · **[I]** = inference from primary sources · **[U]** = not documented anywhere; ask kirim.dev.

Note on names: **kirim.dev** (api.kirim.dev, this note) is a different product from **Kirimdev** (kirimdev.com, api.kirimdev.com) and from KirimWA.id. Don't mix up their docs.

## TL;DR

1. **kirim.dev does not document Local Storage anywhere.** Its docs, pricing page, privacy policy, terms and AUP never mention `data_localization_region`, `storage_configuration`, "local storage" or data residency. **[V]**
   - Its API proxy does not expose the endpoints you would need to set it yourself. `POST /v23.0/{id}/register`, `/deregister` and `/settings` return **405 "method not allowed"** before authentication, the same as a made-up path. `/messages`, `/message_templates`, `/media` and `GET /{id}` reach the API-key check (401). **[O]**
   - With Embedded Signup, it is the **Tech Provider (kirim.dev) that calls `/register`** for your number. Meta's sample call for that step omits `data_localization_region`. **[V]** So only kirim.dev's backend, or a manual action by its support, can set `ID` for a number onboarded through its dashboard. **[I]**
   - **Answer: not self-serve. It needs a support request, and support may not be able to do it.** Confidence is **medium** that you cannot do it yourself through the API or docs. Whether kirim.dev can do it for you is **unknown**.
2. **Meta:** Indonesia (`ID`) is a supported region. **[V]**
   - The setting can only be changed while the number is **unregistered**. You can change it later by deregistering and re-registering, with under 5 minutes of downtime and no re-verification. So "cannot be changed later" is not strictly true, but through kirim.dev it effectively is, because you cannot call `/deregister`. **[V]/[O]**
   - It localizes **message content at rest** (text, media, template parameters) after a data-in-use window of up to **60 minutes**. It does not cover the contact book, business-management data, webhooks or backups. **[V]**
   - **Coexistence numbers can't be deregistered, so they can't get it later.** **[V]**
3. **kirim.dev hosting:**
   - **Not disclosed.** The privacy policy names only unnamed "infrastructure providers — hosting, database, and Redis". It says transfers abroad happen, and names Meta (United States). **[V]**
   - The API sits behind **Cloudflare**. Our requests hit Cloudflare's Jakarta PoP (`cf-ray …-CGK`), but that only proves the edge location, not where the origin is. **[O]**
   - **What kirim.dev stores:** inbound message content (the raw webhook payload, which includes content, sender number and IDs) for **7 days** by default, or 24 h if you lower it. Access-log metadata for 7 days / 24 h. **It does not store outbound message bodies.** **[V]**
   - **So even with `ID` set at Meta, inbound WhatsApp content sits in kirim.dev's database, in an undisclosed country, for up to 24 h–7 days.**
4. **Features and pricing:**
   - Flat fee of **US$3 / 5 / 8 a month** for 1 / 2 / 5 numbers, with a 7-day trial and no per-message markup. **Meta bills you directly.** **[V]**
   - Webhooks cover `messages` and `statuses` fields. They carry the Standard Webhooks signature plus Meta's original `X-Meta-Signature-256`, and are retried with backoff over several hours with replay available. **[V]**
   - Authentication templates with a copy-code button: **not mentioned by name**. kirim.dev forwards `POST /{WABA_ID}/message_templates` and `/messages` byte for byte, so Meta's `otp`/`copy_code` payload should work unchanged. **[I]**
5. **Before registering:**
   - Use a **new number, not Coexistence**. Get kirim.dev to confirm **in writing** that it will register it with `ID`, or use a bring-your-own-account (BYOA) route where you register it yourself.
   - Then verify with `GET /{phone-number-id}/settings` **before** sending live traffic.

---

## 1. Does kirim.dev support `data_localization_region=ID`?

### 1.1 What kirim.dev documents [V]
Whole docs table of contents (https://kirim.dev/docs/): Introduction, Sending messages, Templates, Media, Webhooks, Rate limits, Errors. None of these pages, and none of https://kirim.dev/, /privacy, /terms or /aup, mentions local storage, data localization, data residency, region, `/register`, `/settings` or a two-step PIN.

Onboarding, as documented:
> "In the dashboard, connect a WhatsApp number — onboard one through Embedded Signup, or bring your own WhatsApp Business account. Coexistence numbers are supported. Once the number is connected, it can send." (https://kirim.dev/docs/)

Scope of the proxy:
> "this documentation covers what's specific to kirim.dev: the base URL, authentication, and which endpoints are available." (https://kirim.dev/docs/)
> `404 KirimRoutingException` — "Unknown or unsupported route, or an account you do not own." (https://kirim.dev/docs/errors/)

The only endpoints documented are `/{PHONE_NUMBER_ID}/messages`, `/{WABA_ID}/message_templates` (GET, POST, DELETE) and media upload.

### 1.2 What the proxy actually routes [O]
We sent unauthenticated requests to `https://api.kirim.dev/v23.0/123/<path>` on 2026-09-25. No key was used and nothing was sent to Meta.

| Request | Result | Reading |
|---|---|---|
| `POST …/messages`, `…/message_templates`, `…/media` | 401 `KirimAuthException` | routed (reaches key check) |
| `GET …/123` (phone number node) | 401 | routed |
| `POST …/register` | **405 method not allowed** | not routed |
| `POST …/deregister` | **405** | not routed |
| `POST …/settings` | **405** | not routed |
| `POST …/request_code`, `…/verify_code`, `…/whatsapp_business_profile` | 405 | not routed |
| `POST …/foo_bar_nonexistent` | 405 | control: unknown path gives the same result |
| `GET …/123/register` | 200 HTML (SPA fallback) | not an API route |

Conclusion: a kirim.dev API key cannot be used to call Meta's Register, Deregister or Settings APIs. The ordering is consistent with a route allowlist that is checked before auth. **[O]** A dashboard option might exist behind login at https://app.kirim.dev; we could not see it without an account. **[U]**

### 1.3 Who calls `/register` in Embedded Signup [V]
Meta's Tech Provider onboarding guide, "Step 3: Register the customer's phone number", has the provider call `POST /<BUSINESS_CUSTOMER_PHONE_NUMBER_ID>/register` with `messaging_product` and `pin` only. https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider

The Register API also says: "A phone number **must** be registered within 14 days after going through the Embedded Signup flow." https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/register-api

Since "Connect a number — that is the whole onboarding" (https://kirim.dev/), kirim.dev performs that registration itself **[I]**. Whether it passes `data_localization_region`, or first calls `/settings` with `storage_configuration`, is **undocumented** **[U]**.

### 1.4 The BYOA route [I]
kirim.dev also accepts "your own WhatsApp Business account". It stores "Your Meta credentials — access token, app secret, and webhook verify token" (https://kirim.dev/privacy) and forwards `X-Meta-Signature-256` "for BYOA verification" (https://kirim.dev/docs/webhooks/). This reads as: you bring your own Meta app, system-user token and WABA.

In that case you own the token and can call `graph.facebook.com` directly, before handing the credentials to kirim.dev:
- `POST /{id}/settings` with `storage_configuration` `ID`
- then `/register`
- then `GET /{id}/settings` to check

This is the most reliable way to guarantee `ID`. It means doing Meta's app setup yourself (a Meta developer app, system user and permanent token), which removes part of the reason for using kirim.dev. Confirm with kirim.dev that BYOA works this way **[U]**.

### 1.5 Answer
- Local Storage is not self-serve on kirim.dev through its API or docs (confidence **medium**: docs are silent, and the proxy refuses `/register`, `/deregister` and `/settings`).
- The only paths are (a) a support request, which may or may not be possible, or (b) BYOA, registering the number yourself before connecting it.

---

## 2. Meta Local Storage: the facts [V]

Sources:
- LS: https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/ (updated 21 May 2026; English via the `.md` variant)
- REG: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration
- SET: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/settings-api
- PRIV: https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/

- **Indonesia is supported.** REG lists `data_localization_region` values:
  - APAC: AU, **ID**, IN, JP, SG, KR
  - Europe: DE, CH, GB
  - LATAM: BR
  - MEA: BH, ZA, AE
  - NORAM: CA
- **Two ways to enable it:**
  - API v21.0+: `POST /{phone-number-id}/settings` with `{"storage_configuration": {"status": "IN_COUNTRY_STORAGE_ENABLED", "data_localization_region": "ID"}}` on an **unregistered** number, then `POST /{id}/register` with `messaging_product` and `pin`. (LS)
  - v20 and older, or still accepted: include `"data_localization_region": "ID"` in the `/register` body. (LS, REG)
- **Checking it:** `GET /{id}/settings` returns `storage_configuration.status` and `data_localization_region`. (LS)
  - The SET reference schema instead shows `enabled`/`region` fields, which contradicts LS. Trust the LS guide's shape and check the actual response.
  - Via kirim.dev, `GET /{id}/settings` is **untested**. `GET /{id}` is routed, but `/settings` may not be. Ask kirim.dev. **[U]**
- **When it can be changed:**
  - "Local storage can only be enabled or disabled on WhatsApp Business phone numbers when they are in an unregistered state. If the phone number is registered, it must be deregistered and re-registered with local storage enabled." (LS)
  - "Once you enable local storage, you cannot disable or change local storage directly. Instead, you must deregister the number and register it again…" (REG)
  - Downtime is "typically less than five minutes" and there is no need to re-verify the number (LS FAQ). So it is changeable later, **provided you can call `/deregister`**.
- **Deregister limits** (REG):
  - At most 10 requests per number per 72 h, then error `133016` and a 72 h lock.
  - "You cannot use this endpoint to deregister a business phone number that is in use with both Cloud API and the WhatsApp Business app", which means **Coexistence**.
  - Coexistence onboarding also says to "skip the phone number registration step, as the number is already registered". https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
  - Together these mean a Coexistence number has no path to enable Local Storage **[I]**.
- **What it covers:**
  - Message content (text bodies, media payloads, template static text and send-time parameters) is persisted **only in-region after the data-in-use period**.
  - The data-in-use period is **up to 60 min** for Cloud API (90 min for Marketing Messages API). During it, content "may be stored on Meta data centers internationally while being processed". (LS)
- **What it does not cover:**
  - "A limited set of metadata attributes" stored with content, which is tokenized and encrypted.
  - The **contact book** (phone numbers extracted from shared vCards), which "is hosted on Meta data centers, regardless of your local storage configuration".
  - Other business-management data, webhooks and backups. These are not listed as in scope (LS).
  - It also does nothing about the BSP's own copy of webhooks (see §3).
- **Limits** (LS):
  - Media uploaded by a Local Storage number is usable only by that number.
  - Uploaded media is accessible for 30 days.
  - No fee is mentioned.
- **Baseline without it:** Cloud API processes messages in Meta data centres with **maximum 30-day** retention (PRIV).

---

## 3. kirim.dev hosting, data held, webhooks, pricing, templates

### 3.1 Hosting and data held [V unless marked]
Source: https://kirim.dev/privacy (last updated 1 Aug 2026).

- **Location:** not stated.
  - Section 6 lists "Infrastructure providers — hosting, database, and Redis", unnamed.
  - Section 6.2: "Some providers above process data across borders. In particular, Meta / WhatsApp (United States) processes message content and phone numbers… personal data may be transferred and processed across borders… (for example, the European Commission's Standard Contractual Clauses)."
  - Neither the privacy policy nor the terms (https://kirim.dev/terms) name a legal entity, address or governing law. UU PDP is not mentioned.
- **Stored:**
  - Account data.
  - Meta token, app secret and verify token, encrypted with AES-256-GCM.
  - API keys as an HMAC hash.
  - Webhook URLs and secrets.
  - **Inbound webhook payloads, "which, for an inbound message, includes the message content, the sender's phone number, and message identifiers"**. These are kept for **7 days by default, or 24 h if lowered (max 7 days)**, with one copy per endpoint. Delivery and read status events are held the same way.
  - Access logs: method, route kind, API version, status, upstream error code, timings and caller IP. No bodies. Kept 7 days / 24 h.
- **Not stored:**
  - Outbound message, media and template bodies ("streamed straight through").
  - Coexistence history sync.
  - No readable inbox.
  - Redis holds only the API-key hash cache and rate-limit counters.
- **Edge:** api.kirim.dev resolves to Cloudflare IPs (172.67.150.55, 104.21.11.192). Our requests were served from the CGK (Jakarta) PoP. The origin region is unknown. **[O]**
- **Implication for makam.co.id** **[I]**:
  - Outbound OTP codes and notification parameters pass through kirim.dev but are not stored there.
  - Inbound replies and status events are stored there for up to 24 h (set this) to 7 days, in an unknown country.
  - Set retention to **24 hours** in the kirim.dev dashboard.

### 3.2 Webhooks and status callbacks [V]
Source: https://kirim.dev/docs/webhooks/

- **Setup:** register endpoints in the dashboard with a URL and fields to subscribe to, "e.g. `messages`, `statuses` (1–40 fields)". An endpoint can optionally be scoped to one number. The signing secret is shown once.
- **Payload:** "the WhatsApp webhook payload, unchanged".
- **Headers:** `webhook-id` (use it to dedupe), `webhook-timestamp` and `webhook-signature` (Standard Webhooks, HMAC-SHA256 over `id.timestamp.payload`), plus `X-Meta-Signature-256`.
- **Retries:** "retried with backoff over several hours". Delivery history and replay are in the dashboard. An endpoint that keeps failing is auto-disabled, with a warning first.
- **Fit:** this covers ticket 62's status webhook (sent / delivered / read / failed arrive as Meta `statuses` events) and the inbound-message auto-reply. Verify with the `standardwebhooks` library, not Meta's `X-Hub-Signature-256` flow.

### 3.3 Pricing [V]
Source: https://kirim.dev/ (#pricing) and https://kirim.dev/terms

- **Starter US$3/month (1 number) · Basic US$5 (2) · Pro US$8 (5).** Every plan has a 7-day trial, "Full Meta throughput", webhooks and 7-day logs.
  - The homepage copy also says "Start on Starter at $2", which conflicts with the $3 card. Treat $3 as current.
- "Meta bills you directly for conversations — we don't mark that up. You pay kirim.dev a flat monthly subscription… no per-message fee, no per-seat cost."
  - Terms: Meta charges are "billed directly by Meta to you through your own WhatsApp Business billing".
- So PT JKP needs its own payment method on the WABA in Meta Business Manager.
- Rate limits are Meta's tiers (80 mps standard). A 429 comes with `Retry-After`. https://kirim.dev/docs/rate-limits/
- **Liability cap:** 3 months of fees (https://kirim.dev/terms). At US$3–8/month that is effectively nil.

### 3.4 Authentication templates with copy-code button [I]
- kirim.dev templates doc: `POST https://api.kirim.dev/v23.0/{WABA_ID}/message_templates` (GET/POST/DELETE), "Template components, categories, and button types are documented in Meta's Cloud API reference". All bodies are "forwarded to Meta byte for byte". https://kirim.dev/docs/templates/, https://kirim.dev/docs/
- **Meta's copy-code template** (https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates):
  - `"category": "authentication"`
  - body `add_security_recommendation`
  - footer `code_expiration_minutes` (1–90)
  - button `{"type": "otp", "otp_type": "copy_code", "text": "…"}` (≤25 chars)
  - optional `message_send_ttl_seconds`
  - URLs, media and emojis are not supported
- Nothing in kirim.dev rewrites or restricts categories, so this should work. **Not explicitly stated by kirim.dev.** Test it in the 7-day trial.

---

## 4. What the buyer must do before registering the number

1. **Decide the number type: a fresh number, not Coexistence.** A Coexistence number is already registered and can't be deregistered, so it can never get `ID` (§2). Ticket 19's "new notify-only API number" already fits.
2. **Get kirim.dev's answer in writing before connecting the number.** Once kirim.dev's Embedded Signup registers it without `ID`, fixing it needs `/deregister`, which kirim.dev's API doesn't route (§1.2). Send the questions below.
3. **If kirim.dev can't do it, pick one:**
   - (a) **BYOA** (§1.4): create your own Meta app and system user under PT JKP's business portfolio, add and verify the number in WhatsApp Manager, then call `POST /{id}/settings` (`IN_COUNTRY_STORAGE_ENABLED`, `ID`), then `POST /{id}/register` with your 6-digit PIN. Check with `GET /{id}/settings`, and only then connect it to kirim.dev as BYOA.
   - (b) Accept Meta's default international processing. The spec already allows this; record it in ticket 05.
4. **Record the two-step PIN** you or kirim.dev set at registration. Re-registering, for example after a display-name change, needs it (REG).
5. **Check once, after registration and before live traffic:** `GET /{id}/settings` returns `storage_configuration.status = IN_COUNTRY_STORAGE_ENABLED` and `data_localization_region = ID`. Ask kirim.dev to show this in the dashboard, or run it with your own token under BYOA.
6. **In kirim.dev, set webhook/access-log retention to 24 hours.**

---

## 5. Questions to send kirim.dev support (support@kirim.dev)

> 1. When you register a number connected through your Embedded Signup, can you enable Meta Cloud API Local Storage for Indonesia, either by calling `POST /{phone-number-id}/settings` with `{"storage_configuration":{"status":"IN_COUNTRY_STORAGE_ENABLED","data_localization_region":"ID"}}` before `/register`, or by passing `"data_localization_region":"ID"` to `/register`? Is this a dashboard option, or a request to support before we connect?
> 2. Your API returns 405 for `/register`, `/deregister` and `/settings`. If a number is registered without local storage, can you deregister and re-register it with `ID` for us? How long does that take?
> 3. Can we read `GET /{phone-number-id}/settings` through api.kirim.dev (or the dashboard) to confirm `storage_configuration`?
> 4. For "bring your own WhatsApp Business account": can we register the number ourselves on graph.facebook.com (with local storage) and then connect it to kirim.dev with our own system-user token and app secret? Is anything in your connect flow going to re-register it?
> 5. In which country and with which provider are your servers, database and Redis hosted, where inbound webhook payloads are stored for 24 h–7 days? Is there an Indonesian option?
> 6. What legal entity operates kirim.dev, which law governs the terms, and do you offer a data processing agreement suitable for Indonesia's UU PDP (No. 27/2022)?
> 7. Can you confirm that authentication-category templates with an `otp` / `copy_code` button can be created and sent through `/message_templates` and `/messages` unchanged?
> 8. Which Meta Graph API version do you support (your docs show v23.0)? Can we pin a later one?

## Sources
- kirim.dev: https://kirim.dev/ · https://kirim.dev/docs/ · https://kirim.dev/docs/templates/ · https://kirim.dev/docs/webhooks/ · https://kirim.dev/docs/rate-limits/ · https://kirim.dev/docs/errors/ · https://kirim.dev/privacy · https://kirim.dev/terms · https://kirim.dev/aup
- Meta:
  - Local storage: https://developers.facebook.com/documentation/business-messaging/whatsapp/local-storage/
  - Registration: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration
  - Register API: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/register-api
  - Settings API: https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-phone-number/settings-api
  - Tech Provider onboarding: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider
  - Coexistence: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
  - Data privacy: https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/
  - Copy-code templates: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates
- Probe (§1.2): unauthenticated `curl` requests to `https://api.kirim.dev/v23.0/123/*`, 2026-09-25.
