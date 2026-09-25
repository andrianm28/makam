# Research: S3-compatible object storage in Indonesia (files + Postgres backups)

Ticket: [../issues/12-tech-stack.md](../issues/12-tech-stack.md) (the "Files" and "Daily off-host backups" decisions)
Researched: 2026-09-25.
Legend: **[V]** = verified on a primary source (provider docs, pricing page, price-list API, project docs) · **[S]** = secondary source only (blog, third-party write-up, search snippet) · **[U]** = unverified, or my inference.

Workload assumed: fewer than 50 GB in year one. Private objects (KTP, heirship docs, IPTM scans, photo proof, transfer receipts) are served through short-lived presigned URLs. Daily pg_dump plus WAL archiving goes through pgBackRest or wal-g. Production runs on a **Lintasarta VPS in Jakarta** (see the ticket).

## TL;DR

- **Recommendation: AWS S3 in `ap-southeast-3` (Jakarta)** for both files and backups.
  - It is the only candidate whose features are fully documented: presigned URLs, multipart upload, versioning, **Object Lock**, lifecycle rules, SSE-S3 and SSE-KMS. pgBackRest, wal-g and AWS SDK v3 all target it as the reference implementation.
  - At 50 GB it costs about **US$1.25/month** for storage, plus cents for requests. Egress is free up to 100 GB/month across AWS as a whole.
  - It also puts the backups with a **different provider from the VPS (Lintasarta)**, so one provider incident or account problem cannot take out both the database and its backups.
- **Local alternative: Biznet Gio NEO Object Storage.** It is Rp1.000/GB/month (about Rp50.000/month for 50 GB) with "no bandwidth costs". It runs on Cloudian HyperStore and documents versioning and Object Lock (governance and compliance modes).
  - Its docs are thin. They show **Signature V2** in client examples and say nothing on SigV4, lifecycle or SSE.
  - Before relying on it, run a one-hour spike: AWS SDK v3 presign, multipart upload and checksum headers, pgBackRest `repo-type=s3` with `repo-target-time`, and Object Lock.
- **Not recommended:**
  - **IDCloudHost IS3**: cheapest at Rp500/GB/month, but its SLA claim is only 99.5%, it documents almost no S3 features, a user reported outages, and its site blocks bots.
  - **Lintasarta Deka Box**: same provider as the VPS, no public price, and no documentation for Object Lock or lifecycle.
  - **GCS `asia-southeast2`**: works, but its S3 interop is partial. S3 Object Lock and lifecycle calls do not map one-to-one, and it offers no advantage over AWS Jakarta for this stack.
- **Whichever you pick**, set `requestChecksumCalculation: 'WHEN_REQUIRED'` and `responseChecksumValidation: 'WHEN_REQUIRED'` on the AWS SDK v3 client when talking to any **non-AWS** endpoint (see §3). Use pgBackRest's **client-side** `repo-cipher-type=aes-256-cbc` or wal-g's libsodium key, so backups stay encrypted whatever the provider's SSE story is.

---

## 1. Comparison table

| | AWS S3 `ap-southeast-3` | GCS `asia-southeast2` (XML API + HMAC) | Biznet Gio NEO Object Storage | IDCloudHost IS3 | Lintasarta Deka Box |
|---|---|---|---|---|---|
| **Location** | Jakarta region [V] | Jakarta region [V] | Indonesia. Endpoint `nos.wjv-1.neo.id` ("wjv" = West Java) [V endpoint, U meaning]. Single, 2- or 3-region replication [V] | "several IDCloudHost DCs in Indonesia" [V, no names]. A blogger saw the server in Jakarta [S] | 7 region choices across JKT, JBR and BTN, e.g. "Kencana JKT", "Karang JKT-BTN" [V]. "Spread across three data center locations" [V] |
| **Presigned URLs** | Yes [V, native] | Yes, V4 signing with HMAC [V] | Yes: the `neo-obs` tool offers "presign URL" [V] | [U] | [U] |
| **Multipart upload** | Yes [V] | Yes: "compatible with Amazon S3 multipart uploads" [V] | Yes: the KB mentions leftover multipart parts [S] | [U] | [U] |
| **Versioning** | Yes [V] | Yes, object versioning [V] | Yes, KB article [V] | [U] | Yes, KB article [V] |
| **Object Lock / immutability** | Yes, S3 Object Lock [V] | Bucket Lock and Object Retention Lock exist, but **not through the S3 Object Lock API** [V feature, U API mapping] | Yes: governance and compliance modes plus legal hold. Must be enabled at bucket creation and needs versioning [V] | [U] | Not documented [V: absent from docs index] |
| **Lifecycle rules** | Yes [V] | Yes, but the GCS lifecycle config differs from S3's [S] | Mentioned in the KB ("Lifecycle Policies are recommended") [S] | [U] | Not documented [V: absent from docs index] |
| **Server-side encryption** | SSE-S3 by default, SSE-KMS [V] | Always encrypted at rest. S3 SSE headers "not required" [V] | Only "Encryption with SSL" (in transit) is claimed [V]. At-rest SSE is [U] | Only SSL/HTTPS is claimed [V] | "Digital security system" marketing only [V]. SSE is [U] |
| **Bucket policy / CORS** | Yes [V] | IAM/ACL, not S3 bucket policies [V] | Both, KB articles [V] | [U] | Both, KB articles [V] |
| **Storage price** | **US$0.025/GB-month** (first 50 TB) [V] | **US$0.023/GiB-month** Standard, regional [V] | **Rp1.000/GB/month** single region, Rp2.000 for 2 regions, Rp3.000 for 3 regions [V] | **Rp500/GB/month** [V] | Not published. Priced by provisioned volume size [V: quota model]; the per-GB price is [U] |
| **Egress** | 100 GB/month free (all AWS), then **US$0.132/GB** [V] | **US$0.12/GiB** to Asia, 0–10 TiB [V] | "No bandwidth costs" [V] | [U] | "No additional charges for egress/ingress and port" [S, 2021] |
| **Requests** | PUT/COPY/POST/LIST US$0.005 per 1k; GET US$0.0004 per 1k [V] | Class A US$0.005 per 1k; Class B US$0.0004 per 1k [V] | None published [V: absent] | None published [U] | [U] |
| **Minimums** | None | None | Package/quota "resize" in the portal [V]; minimum is [U] | [U] | Pick a volume size in GB when creating it [V] |
| **SLA** | 99.9% monthly (credits of 10%, 25% and 100%) [V] | ≥ 99.9% for Standard in a regional location [V] | "SLA hingga 99,999%" ("up to") [V] | "SLA hingga 99.5%" [V] | Not stated on the product page [V: absent] |
| **Durability claim** | 99.999999999% (11 nines) [V] | 11 nines is Google's usual claim [U, not re-fetched] | None published | None published | "data integrity and consistency of up to 99.9999%" [V] |
| **Est. cost at 50 GB** | ≈ US$1.25 per month + requests (≈ Rp20k) [U: arithmetic] | ≈ US$1.15 per month + requests + egress [U: arithmetic] | ≈ Rp50.000 per month for a single region (tax excl.? [U]) | ≈ Rp25.000 per month [U: arithmetic] | Unknown |

Prices exclude PPN unless the provider says otherwise [U].

## 2. Per-provider notes and sources

### 2.1 AWS S3 — Asia Pacific (Jakarta) `ap-southeast-3`
- **Prices** come from the AWS Price List API offer file for `AmazonS3` in `ap-southeast-3`, published 2026-09-18 [V]:
  - Standard storage: "$0.025 per GB – first 50 TB / month of storage used".
  - Requests: "$0.005 per 1,000 PUT, COPY, POST, or LIST requests" and "$0.004 per 10,000 GET and all other requests".
  - Source: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-southeast-3/index.json
- **Egress** comes from the `AWSDataTransfer` offer file for `ap-southeast-3` [V]: "$0.132 per GB – first 10 TB / month data transfer out beyond the global free tier". The free tier is the first 100 GB/month, aggregated across all AWS services and regions [V] (https://aws.amazon.com/s3/pricing/).
- **SLA:** below 99.9% monthly uptime earns a 10% credit, below 99.0% earns 25%, and below 95.0% earns 100% [V] https://aws.amazon.com/s3/sla/
- **Durability:** S3 Standard is "designed to provide 99.999999999% durability and 99.99% availability" [V] https://docs.aws.amazon.com/AmazonS3/latest/userguide/DataDurability.html
- **Features:** Object Lock, versioning, lifecycle, SSE and presign are the reference S3 API, so compatibility is not a question [V: AWS docs]. The region has 3 AZs [U, from memory].
- **Residency:** the data sits physically in Jakarta. Even so, AWS is a foreign ESP, and the ticket's data-residency research says that is fine under PP 71/2019 for a private-scope ESP [see research/12-tech-stack.md §1].

### 2.2 Google Cloud Storage — Jakarta `asia-southeast2`
- **Prices** are embedded in https://cloud.google.com/storage/pricing (fetched 2026-09-25) [V]:
  - Jakarta Standard: "$0.023 / 1 gibibyte month". Singapore is $0.020 and Iowa $0.02, for comparison.
  - Regional Standard operations: Class A $0.005 and Class B $0.0004 per 1,000.
  - Internet egress to Asia destinations: $0.12/GiB for 0–10 TiB.
- **SLA:** "Standard storage class in a Cloud regional location … >= 99.9%" [V] https://cloud.google.com/storage/sla
- **S3 interop:**
  - It works through `https://storage.googleapis.com` with HMAC keys and supports V4 signing [V] https://docs.cloud.google.com/storage/docs/interoperability
  - "XML API multipart uploads are compatible with Amazon S3 multipart uploads", but preconditions are unsupported and no MD5 is kept for multipart objects [V] https://docs.cloud.google.com/storage/docs/multipart-uploads
  - Multi-object delete is supported, but without conditional deletes [S: Google doc via search snippet] https://docs.cloud.google.com/storage/docs/xml-api/post-bucket
  - Migration guide: `x-amz-*` headers become `x-goog-*`, and SSE headers are "not required" [V] https://docs.cloud.google.com/storage/docs/migrating
  - Object Retention Lock and Bucket Lock exist, but the docs never mention S3 `PutObjectLockConfiguration` [V: absence] https://docs.cloud.google.com/storage/docs/object-lock
- **The AWS SDK v3 default CRC32 checksum headers are reported to be rejected by GCS's S3 API** [S: Apache Iceberg PR #17177 via search]. See §3.
- **Tooling:** pgBackRest (`repo-type=gcs`) and wal-g (`WALG_GS_PREFIX`) both have **native GCS drivers**, so backups would not need the S3 shim at all [V] (pgBackRest config reference; wal-g STORAGES.md).

### 2.3 Biznet Gio NEO Object Storage
- **Product page:** "S3 compatible cloud storage, fast access with no bandwidth costs … Multi Zone Replication … Encryption with SSL … 100% S3 Compatibel … assign to several Indonesian endpoints" [V] https://www.biznetgio.com/en/product/neo-object-storage
  - Prices in the HTML are Rp 1.000, Rp 2.000 and Rp 3.000 per GB/month for Single, Multi 2 and Multi 3 Region. A hidden (`display:none`) strike-through "Rp249.000" is a template artefact, not a price [V: raw HTML inspected].
- **Pricelist:** "protokol AWS S3 dan jaminan ketersediaan SLA hingga 99,999%". It lists Single Region 1/2 at Rp1.000, Multi Region 1/2 at Rp2.000 and Multi Region 3 at Rp3.000 per GB per month [V] https://www.biznetgio.com/pricelist
- **Getting started:** billing is "per gigabyte per month" and can be resized in the portal. It supports AWS SDKs for Python, NodeJS, Ruby and PHP [V] https://kb.biznetgio.com/id_ID/getting-started/getting-started-neo-object-storage
- **Endpoint and config:**
  - The s3cmd config uses `host_base = nos.wjv-1.neo.id` and `host_bucket = <bucket>.nos.wjv-1.neo.id`, so virtual-host style works [V] https://kb.biznetgio.com/id_ID/neo-object-storage/konfigurasi-dan-penggunaan-s3-api-pada-neo-object-storage
  - The S3 Browser guide says "Signature Version 2" [S: search snippet of the KB].
- **Object Lock:** governance mode (bypass needs `s3:BypassGovernanceRetention`), compliance mode (not even admins can delete) and legal hold. It must be enabled at bucket creation and needs versioning [V] https://kb.biznetgio.com/id_ID/neo-object-storage/mengenal-object-lock-pada-layanan-neo-object-storage
- **Other KB articles** cover versioning, bucket policy and CORS [V: KB index] https://kb.biznetgio.com/id_ID/neo-object-storage
- **Backend:** Biznet's own CLI supports "Cloudian HyperStore extension feature" and admin via "Cloudian CMC" [V] https://github.com/BiznetGIO/neo-obs. Cloudian generally supports SigV4, lifecycle and SSE [U: not checked on Biznet's deployment].
- **Gaps:** there is no published per-request price, egress price, minimum, durability figure or SSE-at-rest statement.

### 2.4 IDCloudHost IS3
- **Product page** (fetched via a reader proxy, because Cloudflare blocks direct fetches): "Hanya Rp 500 /GB/Bulan", "Support S3 API Ready", "Data Center Indonesia – Didukung infrastruktur lokal dengan SLA hingga 99.5%", "enkripsi SSL (HTTPS)", and "didistribusi dibeberapa data center milik IDcloudhost di beberapa lokasi di Indonesia" [V] https://idcloudhost.com/object-storage/
- **Management API:** it has bucket and key endpoints (`/v1/storage/bucket`, `/v1/storage/user/keys`), is location-scoped, and bills buckets to a billing account [V] https://api.idcloudhost.com/
- **Endpoint:** `https://is3.cloudhost.id`, path-style [S: GitHub PR / search snippet]. A user review describes an incomplete feature set (no static site hosting, bucket deletion took 4–5 days), a 503 outage, and ~1-day support replies [S] https://farrelf.blog/nyobain-object-storage-dari-idcloudhost/
- **Gaps:** there are no first-party docs on versioning, Object Lock, lifecycle, SSE, egress or request pricing [U].

### 2.5 Lintasarta Cloudeka Deka Box
- **Product page:** "Compliant with the S3 protocol", "replication control", "data integrity and consistency of up to 99.9999%" [V] https://www.cloudeka.id/en/products/deka-box-en/
  - The pricing block on that page shows a VM template ("IDR 95,000 / Month 1vCPU 1 GB RAM…"), which is clearly not a Deka Box price [V: page defect].
  - The page's TLS chain is incomplete, so strict fetchers fail.
- **Docs:**
  - Deka Box is "spread across three data center locations". The create form offers regions Kencana JKT, Putri JKT-JBR, Halimun JKT-BTN-JBR, Karang JKT-BTN, Parahu JBR, Salak BTN-JBR and Krakatau BTN, plus a "volume size in GB" and a "billing type" [V] https://docs.cloudeka.ai/deka-box/create-deka-box.md
  - The docs index covers versioning, bucket policies, CORS and static web. There is **nothing on Object Lock, lifecycle, SSE or presign** [V] https://docs.cloudeka.ai/llms.txt
- **Egress:** "tidak ada biaya tambahan untuk egress/ingress dan port" [S: Dicoding blog, Dec 2021].
- **Same provider as the production VPS**, so a backup there is off-host but not off-provider [V: ticket 12].

### 2.6 Other options (not shortlisted)
- **Alibaba Cloud OSS, Indonesia (Jakarta) `ap-southeast-5`:** endpoint `oss-ap-southeast-5.aliyuncs.com` [V] https://www.alibabacloud.com/help/en/oss/user-guide/regions-and-endpoints
  - OSS supports "a subset of Amazon S3 API operations" and **only virtual-hosted-style** requests [S: search snippet of the Alibaba doc] https://www.alibabacloud.com/help/en/oss/developer-reference/compatibility-with-amazon-s3
  - Jakarta pricing was not verified [U].
- **Huawei Cloud OBS and Tencent COS** also have Jakarta regions [U: not checked]. None of these beats AWS Jakarta on compatibility for this stack.

## 3. Known incompatibilities with AWS SDK v3, pgBackRest and wal-g

- **AWS SDK for JS v3 ≥ 3.729.0** enables default CRC32 request checksums (`WHEN_SUPPORTED`) on uploads and validates checksums on downloads [V] https://github.com/aws/aws-sdk-js-v3/issues/6810 ; https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html
  - Many S3-compatible stores reject the new headers. GCS's S3 API, MinIO (older), Dell ECS and Garage are all reported [S: minio#20845, iceberg PR #17177, provider PRs].
  - **Fix:** `new S3Client({ endpoint, forcePathStyle, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })`, or set the env vars `AWS_REQUEST_CHECKSUM_CALCULATION` and `AWS_RESPONSE_CHECKSUM_VALIDATION` to `WHEN_REQUIRED` [V: setting names].
  - This does not apply to real AWS S3.
- **SigV4:** AWS SDK v3 signs only with SigV4, so presigned URLs from `@aws-sdk/s3-request-presigner` are SigV4 query-string URLs [U: well known, not re-fetched]. Biznet's KB shows SigV2 for GUI clients, so **SigV4 presign on NEO has to be tested** [U].
- **Path vs host style:**
  - pgBackRest `repo-s3-uri-style` is `host` (default) or `path` [V] https://pgbackrest.org/configuration.html
  - wal-g uses `AWS_S3_FORCE_PATH_STYLE` and `AWS_ENDPOINT` for S3-compatibles [V] https://github.com/wal-g/wal-g/blob/master/docs/STORAGES.md
  - IDCloudHost is reportedly path-style [S]. Alibaba OSS is host-style only [S]. Biznet supports host-style [V].
- **pgBackRest:**
  - Repo types are `azure`, `cifs`, `gcs`, `posix`, `s3` and `sftp` [V].
  - Server-side encryption is only `repo-s3-kms-key-id` (AWS KMS) or `repo-s3-sse-customer-key` (SSE-C). Neither is portable to local providers, so use `repo-cipher-type=aes-256-cbc`: "encryption is always performed client-side even if the repository type (e.g. S3) supports encryption" [V].
  - `repo-target-time` reads a versioned repo as of a point in time. It "is supported by S3, GCS, and Azure", and the docs suggest "object locking for S3 and soft delete for GCS" [V]. That makes provider-side versioning plus Object Lock directly useful against ransomware or accidental deletion.
  - Latest release is 2.59.1 (2026-08-17) [V: GitHub API].
- **wal-g:**
  - It has S3 (`WALG_S3_PREFIX`, `WALG_S3_SSE`) and native GCS (`WALG_GS_PREFIX`) support [V].
  - Client-side encryption is available through `WALG_LIBSODIUM_KEY` [V] https://github.com/wal-g/wal-g/blob/master/docs/README.md
  - Latest release is v3.0.9 (2026-08-20) [V: GitHub API].
  - wal-g is Go-based. Whether its AWS SDK sends default checksums was not checked [U].

## 4. Recommendation

1. **Use AWS S3 `ap-southeast-3`** with two buckets:
   - `makam-files`: private, Block Public Access on, SSE-S3, versioning on, and a lifecycle rule that expires non-current versions after N days.
   - `makam-backups`: versioning plus **Object Lock in governance mode**, a lifecycle rule for retention, and pgBackRest `repo-cipher-type=aes-256-cbc`.

   Use separate IAM users: the app can only reach `makam-files`, and the backup agent can only `PutObject`/`GetObject` on `makam-backups` without delete. The cost is about US$2–4/month in year one. Everything is first-class for SDK v3, pgBackRest and wal-g, and the data stays in Jakarta while being off-provider from Lintasarta.
2. **If "Indonesian company" matters, not just "Indonesian location"**, use **Biznet NEO (single region, Rp1.000/GB)**. Adopt it only after a spike that proves these five things:
   - (a) SDK v3 `PutObject`, multipart upload and presigned GET work with `WHEN_REQUIRED` checksums.
   - (b) pgBackRest `repo-type=s3` runs `backup`, `check` and `restore`.
   - (c) An Object Lock bucket blocks deletes.
   - (d) A lifecycle rule applies.
   - (e) You get written confirmation of at-rest encryption and the request and egress pricing.
3. Avoid IDCloudHost IS3, because too much is unverified and the 99.5% SLA is weak. Avoid Deka Box for backups (same provider as the VPS). Skip GCS (partial S3 interop, no gain over AWS Jakarta).

## 5. Open questions
- Biznet: is there at-rest SSE? Does SigV4 presign work? What are the request fees, the minimum package and the durability figure? Are the prices incl. or excl. PPN?
- Should the files bucket and the backups bucket sit with the same provider (the ticket currently says yes), or should backups go to a second provider for more independence?
- Retention periods for KTP and heirship documents under UU PDP. These drive the lifecycle rules and the Object Lock retention length. This is a legal question, not a storage one.
