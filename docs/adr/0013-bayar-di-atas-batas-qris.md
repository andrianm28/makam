# Tagihan above Rp 10.000.000: Virtual Account, then manual transfer

Amends the v1 spec (Billing: "v1 takes no order whose Tagihan would exceed Rp 10.000.000", decided 2026-09-26; user story 35) and ticket 61's "QRIS only". Owner decision, 2026-11-02 (dri, decision card "Pilih jalur bayar untuk Tagihan di atas Rp10 juta": **VA SumoPod + transfer manual**).

Private cemeteries (ADR 0012) sell plots from about Rp 30 juta up to billions (Graha Sentosa: Rp 109,7 juta to Rp 18,8 miliar), and every transaction must stay on the platform (dri, 2 Nov 10:37: WhatsApp is only for CS questions). The QRIS-only rule refused every such order.

## Decision

- **A Tagihan may be issued for any total up to `BATAS_TAGIHAN`** (Rp 100.000.000.000, what the platform holds exactly). Listings, the Saat Duka list, the Terencana picker (new price band "Di atas Rp 10 jt"), Layanan, Perpanjangan and Paket cycles no longer hide or refuse a total above Rp 10.000.000.
- **How it is paid depends on its total** (`caraBayar`, `src/domain/billing/batas.ts`):
  - up to Rp 10.000.000 (Bank Indonesia's QRIS cap): Bayar, by **QRIS**, as before;
  - above it, up to the PaymentProvider's Virtual Account limit: Bayar, by **Virtual Account**, settled by the same webhook as QRIS;
  - above that limit: **manual transfer** to the Operator's own account, shown on the Tagihan (and its PDF) with the Nomor Tagihan as the transfer note. Admin Platform matches the transfer and records it with its proof through the existing "Catat pembayaran manual" (ticket 30), which issues the Bukti Pembayaran. The money still goes to PT Jaya Korpora Prima (ADR 0001).
- **The Virtual Account limit is configuration, not a constant**: `SUMOPOD_BATAS_VA` (whole rupiah). SumoPod publishes no VA limit, so the owner sets it after paying a VA in the sandbox. Unset or 0 means Virtual Account is off and everything above Rp 10.000.000 is a manual transfer, so the change is safe to deploy before that check.
- **The VA bank is chosen on SumoPod's hosted checkout.** The adapter names `QRIS` for a QRIS payment and sends no method code for a VA payment; the banks offered are the ones enabled on the SumoPod project. The Bukti shows "Virtual Account" without the bank name (ticket 61, option a).
- **The Operator's bank account lives in Pengaturan Operator** (bank, number, holder; optional, all three or none; audited like every other value). Until it is entered a manual-transfer Tagihan points the family to CS for the account.

## Considered options

- **Manual transfer only.** Rejected as the main path: every large payment would wait for a person; kept as the fallback above the VA limit.
- **Down payment by QRIS, then the rest.** Rejected: the rest still needs VA or a transfer, and it splits one Tagihan into two money moments the domain does not model.
- **Instalments (the 6–36 months Graha Sentosa offers).** Deferred: holding a plot through months of instalments, and what happens when one is missed, is a new domain rule set, not a payment channel.

## Consequences

- A Paket Layanan cycle above Rp 10.000.000 is now issued instead of paused; the pause (ticket 54) remains only for a total Billing still refuses, which in practice no tariff reaches.
- Card payments and e-wallets above the QRIS cap are not offered: the hosted checkout may still show them, and SumoPod then refuses what its channel cannot take; the family can pick a VA bank on the same page.
