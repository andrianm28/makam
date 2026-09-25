# Unpaid Saat Duka Tagihan at a Lokasi Mitra

Type: grilling
Status: resolved
Map: ../map.md

## Question

After a burial at a Lokasi Mitra, the family may never pay the Saat Duka Tagihan (due 3×24 h after the burial). Who chases payment (Admin Platform, the Admin Lokasi, or automated reminders only), on what cadence and for how long? When does the Tagihan become "tidak tertagih", and what follows: does the Lokasi Mitra bear the loss entirely (no Pencairan ever), can the Operator share it, can the Admin Lokasi mark it as settled directly with the family (paid on site, outside the platform)? What does the Pemesan's account and the Hak Pakai show meanwhile, and does an unpaid Tagihan block later actions on that Hak Pakai (Perpanjangan, tumpang, Layanan, Ganti Pemegang Hak)?

Context from "Money flow and revenue model" and "Petak Makam lifecycle": the Hak Pakai stays active and no Pencairan goes out until payment; the Lokasi carries the risk of non-payment. From "Pemesanan Saat Duka at a DKI TPU via Pengurusan": at a TPU the Operator bears the loss and the IPTM is handed over regardless. From "Invoice and payment proof for the Pemesan": Admin Platform can record a later offline payment by hand, and a Tagihan is never changed, only cancelled and replaced. From "Notification channels and WhatsApp provider": reminders go out by WhatsApp 08:00–20:00 at set cadences.

## Answer

Resolved by grilling with the user (2026-09-25). New term in `CONTEXT.md`: Tidak Tertagih.

**Chasing** (Admin Platform, for both Lokasi Mitra and DKI TPU orders)

1. Automated WhatsApp reminders continue after the due date at **H+3, H+7, H+14 and H+30**, then stop (08:00–20:00 window, same channel rules as "Notification channels and WhatsApp provider"). They also stop as soon as the Tagihan is paid or declared Tidak Tertagih.
2. From **H+1**, the Tagihan appears on a **"Tagihan lewat jatuh tempo"** list in the **Admin Platform** back office, with the family's phone number and a call log. Admin Platform phones the family (not the Admin Lokasi); minimum **two logged calls**, around H+1 and around H+14, 08:00–20:00, each with an outcome: janji bayar / tidak diangkat / menolak / nomor salah.
3. The Admin Lokasi sees a **read-only** list of its own Lokasi's overdue Tagihan (status, due date, call log), can **add notes** to the log, and gets a web push at H+1 and when a Tagihan is declared Tidak Tertagih.

**Due date clock**: the Tagihan's printed due date comes from the planned burial date at confirmation. If the recorded Pemakaman date differs, the Tagihan is not reissued; the reminder schedule and the "lewat jatuh tempo" clock run from the **recorded** burial date.

**Paid directly to the Lokasi** (Lokasi Mitra only): the Admin Lokasi records "Dibayar langsung ke Lokasi Mitra" with a proof (e.g. receipt photo); audited, and Admin Platform can reverse it. The Tagihan becomes Lunas, a Bukti Pembayaran is issued with that method and worded "diterima oleh Lokasi Mitra X", which releases the Bukti Pemesanan as usual. No Pencairan for the tariff (the Lokasi already holds the money); the Biaya Layanan Platform the Lokasi now owes is **deducted from its next Pencairan**. At a DKI TPU there is no such path; cash goes through Admin Platform's existing manual-payment record.

**Tidak Tertagih**: a new Tagihan status. **Admin Platform** declares it, no earlier than **H+30** and only after at least one logged call attempt; the Admin Lokasi is notified. Never set automatically. The Tagihan stays payable (link or manual record) and moves to Lunas if the family pays later.

**Loss**: at a Lokasi Mitra, the Lokasi loses its tariff and the Operator loses its Biaya Layanan Platform; neither owes the other anything. At a DKI TPU the Operator bears the loss (unchanged).

**Effect on the Hak Pakai** while the Tagihan is Lewat Jatuh Tempo or Tidak Tertagih:

- The Hak Pakai stays **Aktif**; no Bukti Pemesanan until paid. Akun Saya shows the order as "Belum Lunas" with amount, due date and a pay button.
- **Perpanjangan and Ganti Pemegang Hak are blocked** ("Lunasi Tagihan TGH/… terlebih dahulu", with the payment link).
- **Layanan orders are allowed** (prepaid anyway). **A later burial under the same Hak Pakai is allowed**; the Admin Lokasi sees a warning banner when confirming it.
- Once the Tagihan is **Tidak Tertagih**, the Admin Lokasi **may end the Hak Pakai by hand** (`Berakhir`, reason "Tagihan tidak tertagih", mandatory note). Never automatic. The Petak stays `Terisi` until pembongkaran, as for any ended Hak Pakai. At a DKI TPU there is no Hak Pakai to end; the IPTM is handed over regardless.
