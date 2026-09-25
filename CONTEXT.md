# Makam.co.id

An end-to-end burial services platform run by Yayasan Indonesia Emas Merdeka (YIEM): finding and booking burial plots, extending their tenure, ordering grave services, and facilitating land wakaf for cemeteries.

## Language

### Places

**Lokasi Makam**:
A whole cemetery (e.g. a TPU, a private cemetery, a cemetery on wakaf land) containing many plots.
_Avoid_: Makam (when meaning the whole cemetery), TPU (as a generic term)

**Lokasi Mitra**:
A Lokasi Makam run by a partner (private, wakaf, yayasan or masjid cemetery) that has signed a partnership with YIEM; the platform holds its Petak Makam and Pemegang Hak records.
_Avoid_: Mitra (alone), partner makam

**TPU**:
A Lokasi Makam owned and run by a Pemda; the platform holds no inventory for it and only offers Pengurusan and Layanan there.
_Avoid_: Makam umum, using TPU for any cemetery

**Petak Makam**:
A single burial plot inside a Lokasi Makam; the physical unit that is booked and holds Pemakaman. What is extended is its Hak Pakai, not the plot.
_Avoid_: Makam (ambiguous), kavling (alone), lot

**Kavling Keluarga**:
A fixed group of adjacent Petak Makam at a Lokasi Mitra, sold as one indivisible unit under a single Hak Pakai.
_Avoid_: Kavling (alone), makam keluarga, blok keluarga

**Jenis Makam**:
A class of Petak Makam at a Lokasi Makam (e.g. by size, block or facilities) with its own price; what a Pemesan chooses before an Admin Lokasi assigns the exact Petak Makam.
_Avoid_: Tipe makam, kelas, kategori

**Nomor Makam**:
The identifier of a Petak Makam as recorded by its operator.
_Avoid_: Nomor petak, kode makam

**Nomor Kavling**:
The identifier of a Kavling Keluarga as recorded by its operator.
_Avoid_: Kode kavling

### People

**Pemesan**:
The person who places an order on the platform (usually a family member).
_Avoid_: Customer, pembeli, user

**Almarhum**:
The deceased person who is (or will be) buried in a Petak Makam.
_Avoid_: Jenazah (as the record), mendiang

**Calon Penghuni**:
The living person a Pemegang Hak names as intended for an unused Petak Makam, usually through a Pemesanan Terencana; a label the Pemegang Hak may change at any time, not a limit on who may be buried there. Becomes the Almarhum once buried.
_Avoid_: Almarhum (before death), pemilik

**Pemegang Hak**:
The person holding a Hak Pakai at a Lokasi Mitra, or named as ahli waris / penanggung jawab on the IPTM at a TPU; the only one who may extend it or allow a further Pemakaman under it. Not necessarily the Pemesan, and never the Almarhum.
_Avoid_: Ahli waris (as a synonym), pemilik makam

**Admin Lokasi**:
Staff of one Lokasi Mitra who manage its plot inventory, verify its Perpanjangan requests, and fulfil its Layanan orders.
_Avoid_: Makam admin, pengelola, operator (as a person)

**Admin YIEM**:
Central platform staff who onboard Lokasi Mitra, define Paket Layanan, review Pengajuan Wakaf, and file online Pengurusan for TPU.
_Avoid_: Superadmin, admin pusat

**Petugas YIEM**:
YIEM field staff who carry out Pengurusan that must be done in person.
_Avoid_: Kurir, staf lapangan

**Mitra Jasa**:
An individual service provider outside YIEM, paid per job, who fulfils Layanan at TPU.
_Avoid_: Vendor, tukang (as the role name), Mitra (alone)

**Wakif**:
The landowner (or heir or representative) who gives land as wakaf for a cemetery and applies through a Pengajuan Wakaf.
_Avoid_: Donatur, pewakaf

**Nazhir**:
The registered person, organisation or legal body that receives wakaf land and manages it; YIEM is not a Nazhir and only matches a Wakif to one.
_Avoid_: Pengelola (alone), penerima wakaf

### Journeys

**Pemesanan Makam**:
Booking a Petak Makam; either a Pemesanan Saat Duka or a Pemesanan Terencana.
_Avoid_: Booking, reservasi

**Pemesanan Saat Duka**:
A Pemesanan Makam made after a death, for an Almarhum awaiting burial. At a TPU it is carried out as Pengurusan: the TPU assigns the plot and the burial comes before the IPTM.
_Avoid_: At-need, pemesanan darurat

**Pemesanan Terencana**:
A Pemesanan Makam made in advance, reserving a Petak Makam for a Calon Penghuni.
_Avoid_: Pre-need, pre-order

**Hak Pakai**:
The right of one Pemegang Hak to use one Petak Makam or one Kavling Keluarga, either perpetual or for a fixed term counted from its first Pemakaman; a plot gets a new one each time it is sold again after the previous one ends.
_Avoid_: Hak milik, kepemilikan, sertifikat, sewa, IPTM (for Lokasi Mitra)

**Pemakaman**:
One burial of one Almarhum in a specific Petak Makam; several on the same Petak Makam make it a tumpang.
_Avoid_: Penguburan (as the record), interment

**Tumpang**:
Burying another Almarhum in a Petak Makam that already holds one, under the existing Hak Pakai.
_Avoid_: Tumpuk, makam susun

**Masa Tenggang**:
The period after a fixed-term Hak Pakai expires during which a Perpanjangan Makam is still accepted, before the Admin Lokasi may end it.
_Avoid_: Grace period, masa toleransi, dispensasi

**Nomor Pemesanan**:
The identifier of a Pemesanan Makam, given on submission and shown at confirmation.
_Avoid_: Booking ID, kode booking

**Bukti Pemesanan**:
The proof of the Hak Pakai granted by a paid Pemesanan Makam (Lokasi, Petak Makam, Pemegang Hak, masa Hak Pakai), issued in the Lokasi Mitra's name once payment settles; it carries no amounts.
_Avoid_: Bukti booking, receipt, kwitansi

**Bukti Perpanjangan**:
The proof of a paid Perpanjangan Makam at a Lokasi Mitra, showing the old and new end dates, issued in the Lokasi Mitra's name; at a TPU the Pemda-issued permit plays this role.
_Avoid_: Surat perpanjangan, bukti bayar perpanjangan

**Pembatalan**:
Cancelling a paid Pemesanan Terencana before any Pemakaman, at the Pemegang Hak's request, with a refund under the Lokasi Mitra's policy paid through YIEM; the Hak Pakai becomes Dibatalkan.
_Avoid_: Refund (as the act), pengembalian (alone)

**Masa Pembatalan**:
The period after a Pemesanan Terencana is paid, set per Lokasi Mitra, in which a Pembatalan refunds the full tariff.
_Avoid_: Cooling-off, masa tenggang (that is for expiry)

**Pengembalian Hak Pakai**:
A Pemegang Hak giving an unused Hak Pakai back to the Lokasi Mitra, which ends it; any compensation is agreed directly between them, never through YIEM.
_Avoid_: Buyback, jual kembali, Pembatalan

**Ganti Pemegang Hak**:
Recording a new Pemegang Hak on an existing Hak Pakai (inheritance or sale), keeping the history of earlier holders.
_Avoid_: Pengalihan, balik nama, transfer

**Perpanjangan Makam**:
Extending a fixed-term Hak Pakai (at a Lokasi Mitra) or a TPU permit by one or more further terms.
_Avoid_: Renewal, sewa ulang

**Pengurusan**:
YIEM handling a Pemda permit on a family's behalf at a TPU: arranging the burial with the TPU and then filing the new or tumpang IPTM for a Pemesanan Saat Duka, or filing the IPTM for a Perpanjangan Makam. The Pemda, not YIEM, issues the permit.
_Avoid_: Calo, jasa urus, fasilitasi (as the name)

**Pengajuan Wakaf**:
A Wakif's application to give land as wakaf for a cemetery (sosial or keluarga), which YIEM facilitates up to the ikrar at the KUA and the BPN certificate without ever receiving the land or any money.
_Avoid_: Wakaf (alone, when meaning the application), donasi tanah

### Services

**Layanan**:
A grave service in the catalog (e.g. flowers, headstone, cleaning, grass care, photo/video report), from one global list kept by Admin YIEM, offered at a Lokasi Mitra or at TPU at a fixed price, possibly in fixed-price variants.
_Avoid_: Produk, jasa

**Pekerjaan Layanan**:
One Layanan carried out at one Petak Makam on one target date, with its own status and photo proof; by the Admin Lokasi at a Lokasi Mitra, by a Mitra Jasa at a TPU.
_Avoid_: Order layanan, tugas, job

**Paket Layanan**:
A bundle of Layanan defined by Admin YIEM with a frequency: one-off, or repeated every month, three months or year, creating one Pekerjaan Layanan per Layanan per cycle.
_Avoid_: Langganan, bundle

**Keluhan**:
A Pemesan's complaint about a finished Pekerjaan Layanan, filed within 3×24 hours of its photo proof and settled by Admin YIEM with a redo or a refund.
_Avoid_: Komplain, dispute, klaim

### Money

**Harga Hak Pakai**:
A Lokasi Mitra's price for a new Hak Pakai, set per Jenis Makam.
_Avoid_: Harga makam, harga kavling

**Biaya Pemakaman**:
A Lokasi Mitra's fee for carrying out one Pemakaman, charged on every burial including those under an existing Hak Pakai (tumpang may have its own amount).
_Avoid_: Biaya gali, ongkos kubur

**Biaya Layanan Platform**:
YIEM's own flat fee on a Lokasi Mitra order, shown to the Pemesan as a separate line on top of the Lokasi Mitra's tariff.
_Avoid_: Komisi, admin fee, markup

**Tagihan**:
YIEM's request to pay a fixed set of lines by a due date, one per payment moment (a checkout, a Perpanjangan, a burial under an existing Hak Pakai, a Paket Layanan cycle); never changed once issued, only cancelled and replaced.
_Avoid_: Invoice, faktur, nota

**Bukti Pembayaran**:
YIEM's receipt for a settled Tagihan, a separate document from the Tagihan itself.
_Avoid_: Kwitansi, receipt, struk

**Bukti Pengembalian Dana**:
YIEM's record of a refund transfer to a Pemesan, referencing the Tagihan it partly or fully reverses.
_Avoid_: Nota kredit, refund receipt

**Bukti Pencairan**:
YIEM's record of one bank transfer to a Lokasi Mitra or Mitra Jasa, listing every Pencairan it covers.
_Avoid_: Slip payout, settlement report

**Pencairan**:
YIEM paying out the collected amount for one order or job to the Lokasi Mitra or Mitra Jasa that did the work, once that work is confirmed done.
_Avoid_: Payout, settlement, transfer

**Harga Khusus**:
A price set by hand by Admin YIEM on a single order, replacing the normal price for a family in hardship.
_Avoid_: Diskon, voucher, keringanan (as the record)
