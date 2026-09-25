# Money flow and revenue model

Type: grilling
Status: resolved
Blocked by: 01, 02, 14
Map: ../map.md

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
