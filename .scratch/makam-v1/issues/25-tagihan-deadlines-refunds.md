# Tagihan deadlines and refunds after Pencairan

Type: grilling
Status: resolved
Map: ../map.md

## Question

Close the gaps in the money rules the consistency review found:

1. **Lokasi Mitra Layanan Pencairan**: "Money flow and revenue model" and "Layanan catalog and Paket Layanan model" pay the Lokasi Mitra when the photo is uploaded; "Mitra Jasa onboarding, service areas and quality" delays only the Mitra Jasa's Pencairan until the Keluhan window closes. Should a Lokasi Mitra's Layanan Pencairan also wait for the window?
2. **Refunds after Pencairan**: "Money flow and revenue model" says they are settled offline and never clawed back; "Pemesanan Terencana contract terms" nets a Pembatalan from the next Pencairan; "Admin Platform back-office queue and on-call" nets "later refunds" in the Pencairan run; "Unpaid Saat Duka Tagihan" nets the platform fee. One general rule: net every post-Pencairan refund or partner-owed amount from the partner's next Pencairan, or only named cases?
3. **When the Keluhan window starts**: at the photo upload (CONTEXT, "Layanan catalog…", "Roles, accounts and access") or at Admin Platform's approval (tickets 22, 23)? At a TPU they differ by up to 24 h.
4. **Due dates and unpaid outcomes** for every Tagihan kind not yet covered: a Perpanjangan (Lokasi Mitra, and TPU if it is billed), a standalone Layanan order, a Pemesanan Terencana after its 24 h hold lapses (is the Tagihan cancelled with the hold?), a burial under an existing Hak Pakai. Does each one enter the "Tagihan lewat jatuh tempo" list from "Unpaid Saat Duka Tagihan"?
5. **Biaya Pemakaman on a later burial** under an existing Hak Pakai: when its Pencairan is due, and whether that Tagihan carries a second Biaya Layanan Platform (the Terencana "Nanti" line in the booking prototype).

## Answer

Resolved by grilling with the user (2026-09-25). `CONTEXT.md`: Keluhan window start, Tagihan pay-first / pay-after, new term **Potongan**.

**1. Lokasi Mitra Layanan Pencairan waits for the Keluhan window** (amends "Money flow and revenue model", "Layanan catalog and Paket Layanan model")
- Same rule as a Mitra Jasa: due when the Keluhan window closes with no Keluhan, or once a Keluhan is rejected.
- Keluhan upheld → free redo by the Lokasi (Pencairan released once the redo proof is shown) or refund (Pencairan cancelled). A Keluhan never needs money back from a partner.

**2. One netting rule for money a Lokasi Mitra owes the Operator** (replaces "after Pencairan: settled offline, never clawed back")
- Every amount a Lokasi Mitra owes (Terencana Pembatalan after the Masa Pembatalan, the platform fee on "Dibayar langsung ke Lokasi Mitra", any refund Admin Platform approves for something already paid out to the Lokasi) becomes a **Potongan** on its next Pencairan: a negative line on the Bukti Pencairan with a reason and a link to the Tagihan / Bukti Pengembalian Dana.
- A Potongan larger than what is due carries forward to the next Pencairan.
- A balance still open after **60 days**, or when the Lokasi is Berhenti: Admin Platform asks the partner to transfer it offline and records the payment.
- Goodwill refunds the Operator chooses to give come from its own funds and are never netted.
- **Mitra Jasa**: unchanged, nothing is ever clawed back (their Pencairan always waits for the window).

**3. The Keluhan window starts when the proof is shown to the Pemesan** (the Pekerjaan Layanan becomes Selesai): at a Lokasi Mitra the Admin Lokasi's upload, at a TPU Admin Platform's approval. 3×24 h from then.

**4. Due dates and unpaid outcomes**

Two kinds of Tagihan:
- **Pay-first** (nothing happens until paid): lapses to **Dibatalkan** at its due date; no chasing, never Lewat Jatuh Tempo or Tidak Tertagih.
- **Pay-after** (the burial happens before payment): Saat Duka checkout (Lokasi Mitra and DKI TPU) and a burial under an existing Hak Pakai. Only these enter "Tagihan lewat jatuh tempo" and can become Tidak Tertagih.

| Tagihan | Kind | Due | Unpaid |
|---|---|---|---|
| Pemesanan Terencana | pay-first | hold expiry (default 24 h, per Lokasi) | Dibatalkan with the hold, Petak → `Tersedia`; one WhatsApp reminder ~4 h before expiry; new order needed |
| Perpanjangan (Lokasi Mitra; quick or manual path) | pay-first | 3×24 h after issue; reminders H-1 and on the due day | Dibatalkan; the Hak Pakai is untouched (masa tenggang and end-date reminders carry on); a manual-path approval stays valid 30 days, so a new Tagihan needs no new documents |
| Standalone Layanan / Layanan at a non–Saat Duka checkout | pay-first | the earlier of 24 h after issue or the last day the lead time allows for the chosen target date | Dibatalkan, no Pekerjaan Layanan created |
| Paket Layanan cycle | pay-first | H-1 (issued H-7), unchanged | cycle skipped, unchanged |
| Burial under an existing Hak Pakai | pay-after | 3×24 h after the recorded burial; issued at the Admin Lokasi's confirmation | same as "Unpaid Saat Duka Tagihan": reminders H+3/7/14/30, two calls, Tidak Tertagih from H+30, Perpanjangan and Ganti Pemegang Hak blocked; the Hak Pakai is **not** ended for it (already paid for) |

Perpanjangan at a DKI TPU is left to "TPU order loose ends", which settles what that family pays.

**5. Biaya Pemakaman on a later burial**
- Pencairan due when the Tagihan is Lunas **and** the Pemakaman is recorded (same trigger as a Saat Duka Petak).
- The Tagihan carries its own **Biaya Layanan Platform** (as "Petak Makam lifecycle" and "Invoice and payment proof for the Pemesan" already say).
- The Terencana "Nanti" line in the booking flow reads "Biaya Pemakaman + Biaya Layanan Platform, sesuai tarif saat pemakaman (saat ini Rp X)".

**Consistency review 2** (2026-09-25, decided with the user):
- **Saat Duka Petak Pencairan**: due when the Tagihan is Lunas **and** the Pemakaman is recorded, for a Saat Duka checkout and for a burial under an existing Hak Pakai alike (replaces "on confirmation" in "Money flow and revenue model"). A cancellation before the burial therefore never needs a Potongan.
- **One due date per Tagihan**: a Tagihan with lines of different kinds (e.g. Perpanjangan + Layanan, Terencana + Layanan) takes the **earliest** due date among its lines; unpaid, the whole Tagihan is Dibatalkan.
- **Unpaid Layanan**: its Pekerjaan Layanan exists with status Menunggu Pembayaran and becomes **Dibatalkan** when the Tagihan lapses (replaces "no Pekerjaan Layanan created").
