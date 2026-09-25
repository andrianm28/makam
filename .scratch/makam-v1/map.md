# Map: Makam.co.id v1

Label: wayfinder:map

## Destination

A v1 MVP spec for makam.co.id, ready for `/to-spec`: per-pillar scope, actors and roles, money flow, data model, integrations, and operational processes, for a platform-only YIEM serving Jabodetabek: a handful of Lokasi Mitra plus TPU in DKI.

## Notes

- Source brief: [concept.md](./concept.md) (YIEM concept doc: menus, four user flows, homepage recommendation).
- Domain language lives in `CONTEXT.md`; use its terms (Lokasi Makam, Petak Makam, Pemesan, Pemegang Hak, Admin Lokasi, Admin YIEM, Pemesanan Saat Duka / Terencana, Layanan, Paket Layanan).
- Settled at charting:
  - Operating model: mixed. v1 starts with Lokasi Makam YIEM controls or has signed partners; open marketplace later. **Superseded** by "YIEM's current assets and records": YIEM owns no land; v1 = Lokasi Mitra (signed partners, none yet) + TPU DKI (Pengurusan only).
  - Pemesanan Makam covers both Saat Duka and Terencana.
  - All four pillars in v1; Wakaf Tanah limited to intake + status tracking (survey, akad, certificate stay offline).
  - Back office (Admin Lokasi, Admin YIEM) is in v1.
  - Layanan is fulfilled by Admin Lokasi; Admin YIEM defines Paket Layanan. **Amended**: at TPU, Layanan is fulfilled by Mitra Jasa.
  - Legal compliance (licensing, nazhir status, whether fees may be commercial) is out of scope; regulatory facts that shape product flow still apply.
- Builder: a solo engineer working with AI agents. Favour boring, managed, low-ops choices.
- Skills: grilling tickets call `grilling` + `domain-modeling`; research tickets call `research`.
- Research output lives in `.scratch/makam-v1/research/` (the repo has no commits yet, so no `research/*` branches).

## Decisions so far

- [YIEM's current assets and records](issues/01-yiem-current-assets.md): YIEM owns nothing; v1 = 3–10 Lokasi Mitra (platform is their system of record) + DKI TPU Pengurusan; Admin YIEM / Petugas YIEM / Mitra Jasa split the TPU work; tariffs fixed per partner.
- [Payment gateways and split payments in Indonesia](issues/02-payment-gateway-split.md): Xendit for v1; recurring Layanan = per-cycle VA/QRIS invoice, auto-debit opt-in. Sub-account split later dropped by "Money flow and revenue model".
- [Wakaf tanah regulation and the platform's role](./issues/03-wakaf-regulation.md): only a registered Nazhir can receive the land (ikrar before PPAIW at KUA, BPN issues a certificate in the Nazhir's name); the platform can only facilitate intake, documents and status, never money or land; ikrar, survey and certification stay offline; PP 9/1987 bars commercial management of non-public cemeteries.
- [Regulation of cemetery plots and tenure](./issues/04-cemetery-plot-regulation.md): TPU tenure is per-region (Jakarta IPTM: 3 yrs, renewable, free since 2024, filed via JakEVO; lapsed plots open to tumpang by strangers); pre-need booking banned in TPUs (Jakarta/Surabaya/Bandung), so Pemesanan Terencana only fits private/wakaf Lokasi; private cemeteries sell perpetual transferable usage rights; Perpanjangan at DKI TPUs is a facilitation service, the Pemda issues the permit.
- [Speed and documents for Pemesanan Saat Duka](./issues/08-saat-duka-urgency.md): at a Lokasi Mitra, the Pemesan picks a Jenis Makam, the Admin Lokasi assigns the Petak and confirms within 2 working hours (24/7 intake, on-call contact after hours); payment never holds up a burial (invoice at confirmation, due within 3×24 h after it); per-Lokasi document checklist, mostly brought or uploaded later.
- [Money flow and revenue model](issues/05-money-flow.md): YIEM collects everything as seller of record (one Xendit account, full payment only); earns a flat global Biaya Layanan Platform on Lokasi Mitra orders only; Pencairan per order to Lokasi Mitra on confirmation and to Mitra Jasa on Admin YIEM's photo approval; Admin YIEM approves refunds, gateway fees absorbed.
- [Petak Makam lifecycle](issues/06-petak-lifecycle.md): Petak Makam / Hak Pakai (1..n plots, one Pemegang Hak, own status) / Pemakaman; tenure per Jenis Makam (perpetual or N years from first burial), Perpanjangan 1–K terms from the old end date, masa tenggang then manual ending only; occupied plots stay Terisi until pembongkaran; Harga Hak Pakai + Biaya Pemakaman on every burial; indivisible Kavling Keluarga; Ganti Pemegang Hak on the same Hak Pakai; 24 h Terencana hold; imports flagged Perlu Verifikasi.
- [How Perpanjangan verifies the Pemegang Hak](issues/07-perpanjangan-verification.md): Lokasi Mitra: lookup by Nomor Makam/Kavling or Almarhum without exposing the Pemegang Hak; WhatsApp OTP to the number on the Hak Pakai skips Admin Lokasi review, else KTP / heirship / claim documents checked by the Admin Lokasi; anyone may pay; no Perpanjangan once Berakhir. DKI TPU: old IPTM is the proof, YIEM files as proxy with a generated surat kuasa, Petugas YIEM handles originals, the new IPTM scan and expiry are stored.
- [Layanan catalog and Paket Layanan model](issues/09-layanan-catalog.md): one global Layanan list (Admin YIEM) with fixed-price variants, lead time and "bisa hari-H" flag; Lokasi Mitra prices from the agreement, TPU one DKI-wide price + Mitra Jasa rate; Paket = sum of items, sekali/bulanan/3-bulanan/tahunan, per-cycle invoice H-7, unpaid cycle skipped; platform fee per invoice; each Pekerjaan Layanan has a target date ±2 days, in-app photo proof, cancel until H-1, Terlambat and Keluhan (3×24 h) handled by Admin YIEM; TPU jobs assigned by hand; anyone may order for a non-Berakhir Petak Makam or a described TPU grave.

## Not yet specified

- **Notifications**: WhatsApp vs SMS vs email for booking proofs, Perpanjangan reminders before expiry, Layanan photo reports. Hangs on the stack (paid WA API cost now sits with YIEM).
- **Onboarding existing records**: the one-off Excel import of a Lokasi Mitra's plots and Pemegang Hak. Lifecycle is now settled (Petak Makam / Hak Pakai / Pemakaman); the template waits on the first partner showing how they keep records.
- **TPU outside DKI**: Pengurusan for Bogor, Depok, Tangerang and Bekasi TPUs, each with its own Perda and mostly manual procedures.
- **Mitra Jasa operations**: recruiting, vetting and quality control of Mitra Jasa, service areas, and sanctions for repeated Terlambat / Keluhan. Job assignment, Terlambat and Keluhan handling are settled in "Layanan catalog and Paket Layanan model".
- **Unpaid Saat Duka invoices**: after a burial at a Lokasi Mitra, a family may never pay the 3×24 h invoice. The Hak Pakai stays active and no Pencairan goes out until payment ("Money flow and revenue model", "Petak Makam lifecycle"); still open is who chases payment, for how long, and whether the partner ever bears the loss.
- **Trust and transparency surface**: how "harga transparan" and "lokasi terverifikasi" show up (published official tariffs, verification badge criteria).
- **Content pages**: Tentang Kami, FAQ, Daftar Lokasi Makam; probably trivial once the rest is known.

## Out of scope

- Open self-serve onboarding for third-party cemetery operators (a later marketplace phase, not v1).
- Legal and regulatory compliance (payment licensing, nazhir status, PP 9/1987 commercial limits); ruled out by the user. [Payment licensing if YIEM holds and forwards funds](issues/13-payment-licensing.md) closed on this basis.
- [Legal standing of YIEM to operate and charge](issues/14-legal-standing.md): legal opinion on PP 9/1987, Jakarta Perda 3/2007 permit and Perpanjangan service fees; closed on the same basis.
- Commission on partner tariffs and partner subscriptions: longer-term revenue models; v1 uses only the Biaya Layanan Platform ("Money flow and revenue model").
- Down payments and cicilan run by the platform, and keringanan / voucher flows for families who cannot pay (v1: full payment only; hardship handled offline with a manual harga khusus).
- PPN and tax treatment of invoices: legal/tax compliance, same basis as above.
