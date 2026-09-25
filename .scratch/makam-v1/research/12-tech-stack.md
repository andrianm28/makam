# Research: Tech stack facts (data residency, Jakarta hosting, Xendit SDKs)

Ticket: [../issues/12-tech-stack.md](../issues/12-tech-stack.md)
Researched: 2026-09-25.
Legend: **[V]** = verified on a primary source (regulation database, vendor docs, GitHub/npm) · **[S]** = secondary source only (law-firm or news write-up; primary text not reachable) · **[U]** = unverified, or my inference.

> **Not legal advice.** This is product research by a non-lawyer. Before you pick a hosting region for KTP scans and heirship documents, have counsel confirm the data-residency answer. That matters more once PP 33/2026 takes effect.

## TL;DR

- **A private ESP may host outside Indonesia (e.g. Singapore). Nothing in force requires a yayasan to keep data in Indonesia.** PP 71/2019 Pasal 21 allows it, on two conditions: supervision must stay effective, and regulators and law enforcement must be able to get access. UU PDP Pasal 56 allows cross-border transfer through a cascade: adequacy first, then binding safeguards, then the data subject's consent. **PP 33/2026**, the PDP implementing regulation, was promulgated on 16 Jul 2026 but **only takes effect on 16 Jan 2027**. It adds a pre-transfer assessment and a duty to inform data subjects. The authority (Lembaga PDP) had still not been formed as of mid-Sep 2026.
- **PSE registration with Komdigi is required.** The yayasan must register through OSS before the system goes live. Registration is a declaration, not a licence. If you skip it, the sanction ends in access blocking.
- **Jakarta regions:** AWS `ap-southeast-3`, GCP `asia-southeast2` (Cloud Run and Cloud SQL both available) and Azure Indonesia Central (GA 2025). Lightsail also runs in Jakarta. **No low-ops PaaS or managed-DB vendor checked has a Jakarta region.** Vercel, Netlify, Supabase, Neon, Render, Railway, Fly.io, Laravel Cloud and DigitalOcean all stop at Singapore. AWS App Runner has no Jakarta region and closed to new customers on 30 Apr 2026. Jakarta↔Singapore is about **17 ms** inter-region.
- **Xendit SDKs:** the official, same-generation (v7.0.0) SDKs are **Node/TS, PHP, Python and Go**. Java, .NET and Ruby are older hand-written libraries. **v7 is stale.** Its last code change was 29 May 2025. It covers the legacy Invoice (`/v2/invoices`), Payment Request v2 and Payouts **v2**. It does **not** cover Payments API v3, Payment Sessions (which replace Invoice), Payouts v3, xenPlatform sub-accounts or split-rule creation, and it has no webhook helper. Plan to call the REST API directly, at least for newer endpoints. Webhook verification is a static `x-callback-token` header check, so it is easy to do by hand.

---

## 1. Data residency and PSE registration

### 1.1 Storing data outside Indonesia (PP 71/2019)

- PP 71/2019 is **in force** (*Berlaku*), with no amendments listed. [V] https://peraturan.bpk.go.id/Details/122030/pp-no-71-tahun-2019
- **Pasal 21 (private scope):** "PSE Lingkup Privat dapat melakukan pengelolaan, pemrosesan, dan/atau penyimpanan Sistem Elektronik dan Data Elektronik di wilayah Indonesia dan/atau di luar wilayah Indonesia." If the operator does this outside Indonesia, it "wajib memastikan efektivitas pengawasan oleh Kementerian atau Lembaga dan penegakan hukum". It must also provide access to its electronic system and data for supervision and law enforcement. [V: text as quoted on Kominfo's FAQ and in the PP PDF, https://dpmptsp.nttprov.go.id/wp-content/uploads/2024/09/PP-no-71-tahun-2019-ttg-Penyelenggaraan-Sistem-dan-transaksi-Elektronik.pdf]
- By contrast, **public-scope** ESPs (Pasal 20) must store data in Indonesia unless the technology is unavailable there. A yayasan is private scope. [V, same source]
- **Sector overlays:** sector regulators (OJK/BI) impose localisation on regulated financial firms. Those rules bind Xendit as the payment provider, not the yayasan. [U: I did not check PBI/POJK text for this ticket]

### 1.2 Cross-border transfer (UU 27/2022 PDP and PP 33/2026)

- UU 27/2022 is in force. The 2-year adjustment period ended on 17 Oct 2024. [V: status] https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022
- **Pasal 56 cascade.** A controller may transfer personal data abroad, and must meet one of these conditions, in this order:
  1. the recipient country's protection is equal to or higher than Indonesia's; or
  2. there is "pelindungan yang memadai dan bersifat mengikat" (binding safeguards, such as contract clauses); or
  3. the data subject has consented.
  [V: widely quoted text. S for exact wording, since I did not re-open the PDF]
- **The Constitutional Court (MK) upheld Pasal 56** in Putusan 137/PUU-XXIII/2025, 19 Jan 2026. It held that a data transfer is an administrative or technical act, not an international agreement. [S] https://www.hukumonline.com/berita/a/transfer-data-lintas-negara-dan-ilusi-pelindungan-data-pribadi-pasca-putusan-mk-lt6981468330d9c/
- **PP 33/2026** (implementing PP for the PDP law): set and promulgated on 16 Jul 2026 (LN 2026 No. 88). It has 225 articles and **takes effect on 16 Jan 2027**. [S: consistent across hukumonline, paralegal.id and others. I could not find it on JDIH BPK, where a search returned 0 results on 2026-09-25]
  - Pasal 160–166 cover cross-border transfer. The controller must first map the transfer, check that it is necessary, assess the legal instrument it relies on, and assess the risk to data subjects. It must also inform data subjects of the purpose, the safeguards, the risks and the mitigation. Pasal 165 restates the adequacy → binding safeguards → consent cascade. Procedural reporting details are left to a later Lembaga PDP regulation. It contains **no localisation requirement**. [S] https://veritask.ai/id/artikel/pengaturan-teknis-pelindungan-data-pribadi-dan-kewajiban-pengendali-serta-prosesor-akhirnya-terbit-lewat-pp-33-2026
  - Sanctions can reach up to 2% of annual revenue. [S]
- **No adequacy list exists yet.** As of Sep 2026 the Lembaga/Badan PDP has not been formed. Komdigi said in Jul 2026 that the Perpres was in its final stage. [S] https://nasional.kompas.com/read/2026/07/27/15423511/komdigi-ungkap-perpres-pembentukan-badan-perlindungan-data-pribadi-sedang ; https://www.cnbcindonesia.com/tech/20260916120242-37-768329/lembaga-perlindungan-data-belum-ada-begini-nasib-data-warga-ri
  - **Practical consequence [U]:** with no adequacy decision for Singapore, a Singapore-hosted setup would rely on **binding safeguards**, i.e. the cloud vendor's DPA or SCC-style terms, backed up by **explicit consent** at sign-up. Hosting in Jakarta removes the whole cross-border question.
- **Data categories [U, from UU PDP Pasal 4].** KTP/NIK, KK and phone numbers are *data pribadi umum*. Two things may be *data pribadi spesifik*: health data (a death certificate may show the cause of death) and personal financial data. Spesifik data raises the bar for a DPIA once PP 33/2026 applies.

### 1.3 PSE registration (Permenkominfo 5/2020 as amended by 10/2021)

- Status: *Berlaku*, amended by Permenkominfo 10/2021. [V] https://peraturan.bpk.go.id/Details/203049/permenkominfo-no-5-tahun-2020
- **Who must register (Pasal 2).** Every private ESP whose system provides or processes, among other things, trade or financial transactions, or personal data for services to the public tied to electronic transactions. makam.co.id takes payments and processes KTP data, so it falls in scope. [V: summary of Pasal 2 via Wikisource copy] https://id.wikisource.org/wiki/Peraturan_Menteri_Komunikasi_dan_Informatika_Republik_Indonesia_Nomor_5_Tahun_2020
- **How:** apply online through **OSS (RBA)**, which is linked to Komdigi's system at https://pse.komdigi.go.id. Registration must happen **before the system goes live**. [V/S]
- **What you declare (Pasal 3).** The declaration covers:
  - the system's name, sector, URL, DNS/IP;
  - the business model and a short functional description;
  - **the personal data processed**;
  - **where data is managed, processed and stored**;
  - commitments on information security, personal-data protection, and system fitness testing.
  There is no document review. It is a self-declaration. [V: Wikisource copy]
- **Sanctions (Pasal 7):** written warning, then temporary suspension, then **access blocking** (*pemutusan akses*), then revocation. [V: Wikisource copy]
- **Open point [U]:** whether a yayasan can file through OSS without an NIB, and which KBLI code to use. The yayasan probably needs an NIB first. Confirm this with the OSS helpdesk.

## 2. Hosting with a Jakarta region (as of Sep 2026)

| Provider | Jakarta? | Nearest | Notes / source |
|---|---|---|---|
| **AWS** | **Yes**, `ap-southeast-3`, 3 AZs, opened 13 Dec 2021 | — | [V] https://aws.amazon.com/blogs/aws/now-open-aws-asia-pacific-jakarta-region |
| AWS **Lightsail** (VPS, managed DB, containers) | **Yes**, `ap-southeast-3` | — | Lowest-ops AWS option in Jakarta. [V] https://docs.aws.amazon.com/general/latest/gr/lightsail.html |
| AWS **App Runner** | No | Singapore | **Closed to new customers from 30 Apr 2026**. AWS points to ECS Express Mode instead. [V] https://docs.aws.amazon.com/general/latest/gr/apprunner.html ; https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html |
| **GCP** | **Yes**, `asia-southeast2` | — | **Cloud Run** runs in Jakarta (Tier 2 pricing), and so does **Cloud SQL**. This is the lowest-ops *serverless* pairing with Jakarta residency. [V] https://docs.cloud.google.com/run/docs/locations ; https://docs.cloud.google.com/sql/docs/postgres/locations |
| **Azure** | **Yes**, *Indonesia Central*, 3 AZs, GA April/May 2025 | — | [V] https://news.microsoft.com/id-id/2025/05/27/microsoft-opens-indonesia-central/ . Coverage per service (e.g. PostgreSQL Flexible, App Service) is [U]. |
| Vercel | No (19 compute regions) | `sin1` | Has PoPs, but compute and data stay in Singapore. The default region is `iad1`, so set it explicitly. [V] https://vercel.com/docs/regions |
| Netlify Functions | No | `sin` | Default region is `cmh` (Ohio). [V] https://docs.netlify.com/build/functions/optional-configuration/ |
| Cloudflare | Has edge PoPs, but no data-residency option for Indonesia | Regional Services supports Singapore | D1 only offers the `apac` location hint. Jurisdictions exist only for EU and FedRAMP. [V] https://developers.cloudflare.com/data-localization/region-support/ ; https://developers.cloudflare.com/d1/configuration/data-location/ |
| Supabase | No | `ap-southeast-1` | [V] https://supabase.com/docs/guides/platform/regions |
| Neon | No | `aws-ap-southeast-1` | Azure regions are deprecated. [V] https://neon.com/docs/introduction/regions |
| Render | No (5 regions) | Singapore | [V] https://render.com/docs/regions |
| Railway | No (4 regions) | `asia-southeast1-eqsg3a` (Singapore) | [V] https://docs.railway.com/reference/deployment-regions |
| Fly.io | No (18 regions) | `sin`, which has Managed Postgres | [V] https://docs.fly.io/reference/regions/ |
| Laravel Cloud | No | `ap-southeast-1` | Laravel **Vapor** (serverless on your own AWS account) does support Jakarta. [V] https://laravel.com/cloud/docs/applications ; https://blog.laravel.com/vapor-asia-pacific-jakarta-region-is-now-available |
| DigitalOcean | No | SGP1, which has App Platform and Managed DBs | [V] https://docs.digitalocean.com/platform/regional-availability/ |
| **Biznet Gio** (local) | **Yes**, several Indonesian DCs | — | NEO Cloud VMs, managed Kubernetes, S3-compatible object storage. **No managed Postgres/MySQL** on the product page. [V] https://www.biznetgio.com/en/services |
| **IDCloudHost** (local) | **Yes**, Jakarta, Bogor and Cibitung DCs (Singapore also offered) | — | VPS, Kubernetes, S3 object storage. Managed DB is [U] (the site returned 403). [S] |

**Latency:** AWS `ap-southeast-1` ↔ `ap-southeast-3` is about **17 ms** inter-region. [S: economize.cloud measurement] https://www.economize.cloud/resources/aws/latency/ap-southeast-1-vs-ap-southeast-3/ . For end users on Indonesian ISPs, Singapore typically adds only a few tens of ms over Jakarta [U]. Latency is therefore not the deciding factor. Data residency and PDP compliance are.

## 3. Xendit official server SDKs

Sources: GitHub API and npm, queried 2026-09-25 [V]; plus a clone of `xendit/xendit-node`.

| Repo | Lang | Latest | Last real code commit | Notes |
|---|---|---|---|---|
| `xendit/xendit-node` (`xendit-node` on npm) | TypeScript | **v7.0.0** (2025-05-29) | 2025-05-29 "Generated Xendit node SDK" | OpenAPI-generated. Requires Node ≥18. TS types included. |
| `xendit/xendit-php` (`xendit/xendit-php`) | PHP ≥7.4 | 7.0.0 (2025-05-29) | 2025-05-29 | Same generator. About 60k downloads/month on Packagist. |
| `xendit/xendit-python` | Python | v7.0.0 (2025-05-29) | 2025-05-29 | Same generator. |
| `xendit/xendit-go` (`/v7`) | Go | v7.0.0 (2025-05-29) | 2025-05-29 | Same generator. |
| `xendit/xendit-java` | Java | v1.23.0 (2023-03-30) | 2023-03-30 | Old hand-written library. Covers legacy Disbursement and Invoice. Effectively unmaintained. |
| `xendit/xendit-dotnet` | C# | — | 2023-09 | Effectively unmaintained. |
| `xendit/xendit-ruby` | Ruby | — | 2021-06 | Effectively unmaintained. |

None of these repos is archived. The only commits since May 2025 are an org-wide "update-status workflow" chore from 1 Oct 2025.

**What v7 covers** (the same modules in all four generated SDKs; paths taken from the `xendit-node` source):
- **Invoice** (`/v2/invoices`, including expire) and the `InvoiceCallback` payload type. ✔
- PaymentRequest v2 (`/payment_requests`), PaymentMethod v2, Refund, Balance, Transaction, Customer. ✔
- **Payout v2** (`/v2/payouts`, `/payouts_channels`). ✔ The legacy `/disbursements` endpoint is **not** in v7.
- The `for-user-id` header (xenPlatform "act as sub-account") on every module. ✔ The `with-split-rule` header on PaymentRequest. ✔
- **Not covered:**
  - xenPlatform account creation and **split-rule creation** (`/split_rules`);
  - **Payments API v3** (`/v3/payment_requests`, `/v3/payment_tokens`);
  - **Payment Sessions** (`/sessions`);
  - **Payouts v3** (`/v3/payouts`, the current API reference, updated 2026-07-08);
  - Subscriptions;
  - webhook verification helpers.

**Where Xendit's docs have moved** [V: docs.xendit.co `llms.txt` and pages]:
- Invoice / Payment Link is now called **"legacy"**. Xendit's guide says to migrate to `POST /sessions` with `mode: PAYMENT_LINK`. No sunset date is given. https://docs.xendit.co/docs/migrate-to-payment-session.md
- Payments API v3 needs an `api-version` header. No v2 sunset date is given. https://docs.xendit.co/docs/migrate-payment-api-v2-to-v3.md
- The Payouts API reference is **v3.0.0** (`POST /v3/payouts`, "Payout v3 webhook"). https://docs.xendit.co/apidocs/payouts-introduction.md
- **Webhooks:** verified by comparing the `x-callback-token` header with the token from the Dashboard (a static shared secret, not an HMAC signature). Failed deliveries are retried up to 6 times with exponential backoff. The docs say nothing about SDK helpers. https://docs.xendit.co/docs/handling-webhooks.md

**Implication [U]:** the SDK language barely matters. Xendit's first-party SDKs lag the API by about a year and a half. Any stack will end up with a thin hand-written REST client, at least for Sessions, v3, Payouts v3 and split rules, plus a constant-time token comparison for webhooks. Node/TS and PHP are the best-supported *if* you use the SDK for Invoice or Payout v2.

## Open questions

1. PP 33/2026: get the official text (JDIH Setneg or BPK once it is indexed). Confirm Pasal 160–166 and any record-keeping or reporting duty for transfers.
2. Whether the yayasan needs an NIB/KBLI before PSE registration in OSS.
3. Azure Indonesia Central: which managed Postgres and app-hosting services are available there.
4. Whether Xendit plans a v8 SDK covering v3, Sessions and xenPlatform. Ask Xendit support. Its help-center SDK article returned 403.
