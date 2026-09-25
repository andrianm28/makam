# Operator entity: PT Jaya Korpora Prima and YIEM's role

Type: grilling
Status: resolved
Map: ../map.md

## Question

The user stated (2026-09-25) that the whole platform is registered in the name of **PT Jaya Korpora Prima**, which is the **operator and manager of the platform**. Every decision so far assumed YIEM (the yayasan) runs makam.co.id. What changes?

- **Seller of record and money**: who collects payments (whose SumoPod account and bank account), issues every Tagihan / Bukti, earns the Biaya Layanan Platform, Pengurusan fees and Layanan margin, makes Pencairan and refunds? Does ADR 0001 ("YIEM collects all payments") become "PT Jaya Korpora Prima collects all payments"?
- **YIEM's remaining role**, if any: founder / brand / social partner, the Wakaf Tanah facilitator, a Lokasi Mitra, or gone from the product?
- **Staff roles**: are "Admin YIEM" and "Petugas YIEM" renamed (e.g. Admin Platform, Petugas Lapangan), and are Mitra Jasa contracted by the PT?
- **Contracts**: who signs the partnership agreement with each Lokasi Mitra and the arrangement with each Mitra Jasa; who files Pengurusan as proxy (the generated surat kuasa names whom)?
- **What families see**: brand, "dikelola oleh ..." footer, name on Tagihan / Bukti documents, the concept brief's YIEM framing (Tentang Kami, trust elements).
- **Wakaf Tanah**: can a PT facilitate a Pengajuan Wakaf, or does that pillar stay with YIEM?

Legal compliance stays out of scope (PSE registration, Perda 3/2007 yayasan requirement, PP 9/1987); this ticket is about who each product role, document and money flow names.

Once resolved: rename in `CONTEXT.md`, amend ADR 0001 / 0003 and the tickets that name YIEM as an actor (01, 05, 07, 10, 11, 12, 15, 16, 17, 19), and update the map's Notes.

## Answer

Resolved 2026-09-25 (grilling).

- **YIEM leaves the product entirely.** No endorsement, no pillar, no staff role, no history line on Tentang Kami. The concept brief's yayasan framing (mission, trust cues) is dropped.
- **Glossary term: Operator.** "The legal entity that runs makam.co.id, signs with every partner, collects every payment and issues every document; currently PT Jaya Korpora Prima." Every decision that said "YIEM" as an actor now reads "the Operator". The legal name appears only where a document or footer must name it.
- **Seller of record: the Operator (PT JKP)**, for everything ADR 0001 gave YIEM: the SumoPod account, the receiving bank account, every Tagihan / Bukti, the Biaya Layanan Platform, the TPU Pengurusan and Layanan margin, Pencairan and refunds, Harga Khusus and unpaid TPU invoices. The decision itself is unchanged; ADR 0001 is amended.
- **Staff roles renamed**: Admin YIEM → **Admin Platform**, Petugas YIEM → **Petugas Lapangan**. Both are PT JKP staff.
- **Contracts**: PT JKP signs every Lokasi Mitra partnership agreement and every Mitra Jasa arrangement.
- **Surat kuasa** for TPU Pengurusan gives authority to PT Jaya Korpora Prima, represented by the named Petugas Lapangan or Admin Platform who does the filing (filled in from their account), so it survives staff turnover.
- **What families see**: the brand is "Makam.co.id" everywhere; the footer reads "Makam.co.id dikelola oleh PT Jaya Korpora Prima"; Tagihan and every Bukti carry PT JKP's legal name, address and contact in the header (Bukti Pemesanan / Perpanjangan still prove the right in the Lokasi Mitra's name); Tentang Kami is rewritten around makam.co.id and PT JKP.
- **Wakaf Tanah stays as decided**, with the Operator as facilitator (intake, Nazhir matching, status; never land or money), plus page copy: "Tanah diwakafkan langsung kepada Nazhir; makam.co.id tidak menerima tanah maupun uang."
- **Vendor accounts** all registered to PT JKP: SumoPod, bank, WhatsApp Business / Meta business verification via kirim.dev (display name "Makam.co.id"), SES, Zenziva, VPS, S3 storage, Sentry, GitHub, the `makam.co.id` domain registrant.

Applied: `CONTEXT.md` (Operator entry, role renames, YIEM removed), ADR 0001 amended and retitled, ADR 0003 role names, an amendment banner on every resolved ticket that names YIEM as an actor, map Destination / Notes / Decisions-so-far.
