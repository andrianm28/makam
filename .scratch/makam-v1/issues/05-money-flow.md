# Money flow and revenue model

Type: grilling
Status: resolved
Blocked by: 01, 02, 14
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

Who receives the Pemesan's payment (YIEM, then paid out to the Lokasi operator; or the operator directly), and how does YIEM earn (commission per transaction, markup on Layanan, subscription for operators, or no fee because it is a social mission)? Who is the seller of record, and who handles refunds?

Context from "YIEM's current assets and records": legal compliance is out of scope, so the fee model need not be tested against PP 9/1987 or payment-licensing rules. Money now also flows for TPU Pengurusan fees (YIEM keeps them) and to Mitra Jasa (fixed per-Layanan rate, paid manually by YIEM on a cycle). Lokasi Mitra tariffs are agreed per partner; decide whether YIEM adds a margin or takes a commission on top.

## Answer

Resolved by grilling with the user (2026-09-25). Decision record: [ADR 0001](../../../docs/adr/0001-yiem-collects-all-payments.md).

**Who receives the money**
- **YIEM collects every payment** into its own single Xendit account (VA / QRIS) and is the **seller of record** for every order: Lokasi Mitra Petak Makam, Perpanjangan and Layanan, TPU Pengurusan, and Layanan by Mitra Jasa. No gateway sub-account per Lokasi Mitra (amends "Payment gateways and split payments in Indonesia").
- **Full payment only** in v1; no down payment or cicilan (card instalments offered by the gateway are fine). Payment is normally before confirmation, except for Pemesanan Saat Duka, where "Speed and documents for Pemesanan Saat Duka" issues the invoice at confirmation, due within 3×24 h after the burial (per Lokasi), so payment never holds up a burial; the Lokasi carries the risk of non-payment.

**How YIEM earns (v1)**
- **Biaya Layanan Platform**: a **flat rupiah amount per order**, one **global** rate set by Admin YIEM, shown to the Pemesan as its own line on top of the Lokasi Mitra's tariff (the tariff itself is shown unchanged, per "harga transparan" / "sesuai tarif resmi"). It must be visible before checkout, not first revealed at payment.
- Applies **only to Lokasi Mitra orders**. On TPU orders YIEM's income is its own Pengurusan fee and its margin on Layanan (price to Pemesan minus the Mitra Jasa's fixed rate); no platform fee on top.
- Commission and partner subscription are the longer-term models; **out of scope for v1**, not designed now.

**TPU money**
- Pengurusan fee and TPU Layanan price: YIEM's revenue.
- A non-zero **Pemda retribusi** is collected **at cost** as a separate line; Admin YIEM or Petugas YIEM pays the Pemda. Zero-fee items (e.g. DKI IPTM) are shown as Rp 0.

**Pencairan (disbursing to those who did the work)**
- **Lokasi Mitra**: per order, automatically, via Xendit disbursement to the partner's registered bank account, once the order is **both paid and** confirmed done (so an unpaid Saat Duka invoice is never disbursed early): Petak Makam when the Admin Lokasi confirms it is allocated to the Pemesan (Saat Duka or Terencana); Perpanjangan when the Admin Lokasi confirms the extension; Layanan when its photo proof is uploaded. Amount = the partner's tariff (the platform fee stays with YIEM). The back office lists each Lokasi Mitra's Pencairan.
- **Mitra Jasa**: per job, immediately after **Admin YIEM approves** the photo proof; amount = the fixed rate for that Layanan type, to the Mitra Jasa's registered bank account.
- Recurring Paket Layanan: each cycle is its own invoice (per the gateway decision); Pencairan is per Layanan done.

**Refunds and cancellations**
- **Admin YIEM approves every refund.**
- **Before Pencairan**: the partner/Layanan amount is refunded in full. The platform fee is refunded when YIEM, the Lokasi Mitra or the Mitra Jasa caused the cancellation (Petak Makam unavailable, job not done); it is kept when the Pemesan cancels.
- **After Pencairan**: settled offline between YIEM and the partner; the platform never claws money back automatically.
- **Gateway fees** (VA, QRIS, disbursement) are absorbed by YIEM and never shown to the Pemesan.

**Hardship**
- No keringanan / voucher flow in v1. Admin YIEM handles hardship offline and can set a manual **harga khusus** override on an order.

**Invoices**: YIEM, as seller of record, issues the invoice the brief requires; its content is graduated to "Invoice and payment proof for the Pemesan". PPN / tax treatment falls under the out-of-scope legal and tax compliance.

**Amended by "Tech stack for a solo engineer with AI agents"** (2026-09-25): the single collecting account is **SumoPod**, not Xendit. SumoPod only withdraws to YIEM's own account, so each Pencairan (same per-order / per-job due rules as above) and each refund is a **manual bank transfer by Admin YIEM**, recorded in the app with the transfer proof. Gateway fees absorbed by YIEM now cover SumoPod fees and bank transfer costs.

**Amended by "Invoice and payment proof for the Pemesan"** (2026-09-25): Pencairan still becomes due per order / job, but Admin YIEM may batch several due Pencairan to one partner into a single transfer, recorded as one Bukti Pencairan. A Harga Khusus is borne by YIEM by default (partner's Pencairan stays the full tariff) unless a partner-agreed lower amount is recorded.

**Amended by "Pemesanan Terencana contract terms"** (2026-09-25): a Terencana Petak Makam's Pencairan is due when the Lokasi's Masa Pembatalan ends (default 7 days after payment), or at the first Pemakaman if sooner, not at the Admin Lokasi's confirmation. A Pembatalan refund after that window is deducted from the Lokasi Mitra's next Pencairan instead of being settled offline.

**Amended by "Unpaid Saat Duka Tagihan at a Lokasi Mitra"** (2026-09-25): when the family pays a Lokasi Mitra directly (recorded by the Admin Lokasi), no Pencairan is made for the tariff and the Biaya Layanan Platform owed is deducted from the Lokasi's next Pencairan. A Tagihan declared Tidak Tertagih costs the Lokasi its tariff and the Operator its platform fee; neither owes the other.

**Amended by "Mitra Jasa onboarding, service areas and quality"** (2026-09-25): a Mitra Jasa's Pencairan becomes due when the Keluhan window (3×24 h after Admin Platform approves the proof) closes with no Keluhan, not at approval. An upheld Keluhan cancels or holds it (see that ticket).

**Consistency review** (2026-09-25): "Payment is normally before confirmation" is out of date: a Pemesanan Terencana is confirmed by the Admin Lokasi first and then billed with a 24 h hold ("Petak Makam lifecycle", "Booking flow prototype for a Lokasi Mitra"), and a manually reviewed Perpanjangan is approved then billed ("How Perpanjangan verifies the Pemegang Hak"). Due dates for those Tagihan are open in "Tagihan deadlines and refunds after Pencairan". "invoice" in this ticket is a **Tagihan** in the glossary set by "Invoice and payment proof for the Pemesan".
