# Makam.co.id

An end-to-end burial services platform run by the Operator: finding and booking burial plots, extending their tenure, ordering grave services, and facilitating land wakaf for cemeteries.

## Language

### Places

**Lokasi Makam**:
A whole cemetery (e.g. a TPU, a private cemetery, a cemetery on wakaf land) containing many plots.
_Avoid_: Makam (when meaning the whole cemetery), TPU (as a generic term)

**Lokasi Mitra**:
A Lokasi Makam run by a partner (private, wakaf, yayasan or masjid cemetery) that has signed a partnership with the Operator; the platform holds its Petak Makam and Pemegang Hak records.
_Avoid_: Mitra (alone), partner makam

**Terverifikasi**:
Said of a Lokasi Mitra that has passed the Operator's checks (signed agreement, a Kunjungan Verifikasi, tariffs entered) and may therefore be listed; every listed Lokasi Mitra is Terverifikasi. Never said of a TPU, which is shown as an official Pemda cemetery instead.
_Avoid_: Terdaftar, resmi (for a Lokasi Mitra), using it as a badge some listings lack

**Belum Tayang**:
Said of a Lokasi Mitra that is still being onboarded and is not yet listed: every Lokasi Mitra starts so, and stays so until it is Terverifikasi.
_Avoid_: Draft, nonaktif, pending

**Denah**:
The plot map of a Lokasi Mitra: a grid per blok in which each cell is a Petak Makam or a path, drawn by the Admin Lokasi; the Terencana plot picker shows it.
_Avoid_: Peta (for the plot map), site plan, layout

**Jam Operasional**:
The weekly hours and dated closures of a Lokasi Mitra, inside which its Saat Duka confirmation promise runs.
_Avoid_: Jam kerja, jam buka (as the setting)

**Kontak Siaga**:
The Admin Lokasi a family can phone outside a Lokasi Mitra's Jam Operasional; always one of that Lokasi's Admin Lokasi.
_Avoid_: On-call, kontak darurat, penjaga (as the role)

**Tanggal Tutup**:
A whole date on which a Lokasi Mitra is closed despite its weekly hours; part of its Jam Operasional.
_Avoid_: Hari libur (for a Lokasi's own closure), cuti

**Hari Kerja**:
A day that counts toward an "N hari kerja" deadline: for Admin Platform, Monday–Friday that is not a Hari Libur Nasional; for an Admin Lokasi, an open day of its Lokasi's Jam Operasional that is not a Tanggal Tutup.
_Avoid_: Working day (in copy), hari aktif, business day

**Hari Libur Nasional**:
A date on the national holiday list Admin Platform keeps; it is not a Hari Kerja for Admin Platform, and does not close a Lokasi Mitra unless it is also a Tanggal Tutup there.
_Avoid_: Tanggal merah, cuti bersama (unless listed)

**Kunjungan Verifikasi**:
A Petugas Lapangan's site visit to a Lokasi Mitra confirming its address, map pin, facilities and photos; required before it is listed and repeated whenever Admin Platform asks.
_Avoid_: Survei (reserved for Wakaf Tanah), audit

**Ditangguhkan**:
A Lokasi Mitra temporarily taken off the listings by Admin Platform: it grants no new Hak Pakai, while everything under existing Hak Pakai (burials, Perpanjangan, Layanan, Pembatalan, Ganti Pemegang Hak) and orders already in progress carry on. A Mitra Jasa can be Ditangguhkan too: no new jobs until Admin Platform reinstates them.
_Avoid_: Nonaktif, diblokir

**Berhenti**:
A Lokasi Mitra whose partnership has ended, from an effective date set by Admin Platform (until then it behaves as Ditangguhkan): the platform then takes no order of any kind for it, and its existing Hak Pakai stay visible to their Pemegang Hak, who deal with the pengelola directly. A Mitra Jasa can be Berhenti too: ended for good, history still visible to them.
_Avoid_: Berakhir (reserved for a Hak Pakai), putus kontrak

**TPU**:
A Lokasi Makam owned and run by a Pemda; the platform holds no inventory for it and only offers Pengurusan and Layanan there.
_Avoid_: Makam umum, using TPU for any cemetery

**Makam TPU**:
The Operator's record of a grave at a DKI TPU that it has filed an IPTM for: the TPU, block and number, Almarhum, Pemegang Hak with their WhatsApp number, and the current IPTM with its expiry. The TPU counterpart of a Hak Pakai as far as the platform is concerned.
_Avoid_: TPU plot record, Hak Pakai (for a TPU)

**Petak Makam**:
A single burial plot inside a Lokasi Makam; the physical unit that is booked and holds Pemakaman. What is extended is its Hak Pakai, not the plot.
_Avoid_: Makam (ambiguous), kavling (alone), lot

**Makam Keluarga**:
Every grave a family already holds a right to, as the Pemegang Hak sees them: its Hak Pakai at Lokasi Mitra (single Petak Makam or Kavling Keluarga) and its Makam TPU. The starting point for Perpanjangan, a further burial, Layanan and requests.
_Avoid_: Kavling Keluarga (for this), makam saya

**Kavling Keluarga**:
A fixed group of adjacent Petak Makam at a Lokasi Mitra, sold as one indivisible unit under a single Hak Pakai.
_Avoid_: Kavling (alone), blok keluarga, makam keluarga (that is every grave a family holds, see Makam Keluarga)

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

**Akun**:
The identity on makam.co.id keyed by one WhatsApp number (+62), which can hold several roles: Pemesan by default, plus staff roles by invitation. It is created only by a Kode Masuk sent to that WhatsApp number; an Email Terverifikasi is a second way into an existing Akun, never a second identity.
_Avoid_: User, pengguna (as a domain term)

**Kode Masuk**:
The single-use code that logs a person into an Akun, sent either to the Akun's WhatsApp number or to its Email Terverifikasi; the same rules apply to both.
_Avoid_: OTP (alone, in user-facing text), kata sandi, PIN, token

**Email Terverifikasi**:
An email address on an Akun that has been proven by entering a code sent to it; only such an email can receive a Kode Masuk, and it belongs to at most one Akun. An email that has only been typed in (on an order, or on an Undangan Staf) is not an Email Terverifikasi.
_Avoid_: Email terdaftar, email akun (for an unproven email), login email

**Verifikasi Email**:
Proving an email for one's own Akun by entering the code sent to it, which makes it the Akun's Email Terverifikasi (replacing any earlier one only then); it is the only way to add or change one's own login email. The code is not a Kode Masuk and logs no one in.
_Avoid_: Konfirmasi email, aktivasi email, email login

**Akun Staf**:
An Akun holding at least one staff role (Admin Platform, Admin Lokasi, Petugas Lapangan, Mitra Jasa); always has an email on record, which is not an Email Terverifikasi until proven; it may change that email only by Verifikasi Email and may never remove it.
_Avoid_: Admin user, akun admin

**Undangan Staf**:
Admin Platform's single-use, expiring offer of one staff role to a WhatsApp number and email; the role is granted when the Akun of that number next logs in with a Kode Masuk. It is also the only way a Dinonaktifkan Akun holds a staff role again.
_Avoid_: Invite link, pendaftaran staf

**Dinonaktifkan**:
Said of a former Akun Staf whose staff roles Admin Platform has taken away: it has no staff access, but still logs in as a Pemesan, and its orders and Entri Audit stay.
_Avoid_: Dihapus, Ditangguhkan (reserved for a Lokasi Mitra or Mitra Jasa)

**Pindah Nomor**:
Admin Platform moving an Akun to a new WhatsApp number after checking the holder's KTP, keeping everything recorded on the Akun.
_Avoid_: Ganti nomor (as self-service), pemulihan akun, Ganti Pemegang Hak

**Almarhum**:
The deceased person who is (or will be) buried in a Petak Makam.
_Avoid_: Jenazah (as the record), mendiang

**Calon Penghuni**:
The living person a Pemegang Hak names as intended for an unused Petak Makam, usually through a Pemesanan Terencana; a label the Pemegang Hak may change at any time, not a limit on who may be buried there. Becomes the Almarhum once buried.
_Avoid_: Almarhum (before death), pemilik

**Pemegang Hak**:
The person holding a Hak Pakai at a Lokasi Mitra, or named as ahli waris / penanggung jawab on the IPTM at a TPU; the only one who may extend it or allow a further Pemakaman under it. Not necessarily the Pemesan, and never the Almarhum.
_Avoid_: Ahli waris (as a synonym), pemilik makam

**Operator**:
The legal entity that runs makam.co.id, signs with every partner, collects every payment and issues every document; currently PT Jaya Korpora Prima.
_Avoid_: YIEM, yayasan, pengelola platform

**Admin Lokasi**:
Staff of a Lokasi Mitra who confirm or decline its orders, manage its plot inventory and Denah, verify its Perpanjangan requests, handle Pembatalan and Pengembalian Hak Pakai requests, record Pemakaman, and fulfil its Layanan orders, all through the Antrean Lokasi.
_Avoid_: Makam admin, pengelola, operator (as a person)

**Admin Platform**:
The Operator's central staff who onboard and verify Lokasi Mitra and Mitra Jasa, keep the Layanan catalog and Paket Layanan, confirm and file TPU Pengurusan, assign TPU Pekerjaan Layanan, approve refunds, decide Keluhan, chase overdue Tagihan, make Pencairan, and review Pengajuan Wakaf; all through the Antrean.
_Avoid_: Superadmin, admin pusat

**Petugas Lapangan**:
The Operator's field staff who do the work that needs someone on site: in-person Pengurusan, Kunjungan Verifikasi, the Wakaf Tanah survey and plot-map spot-checks.
_Avoid_: Kurir, staf lapangan

**Mitra Jasa**:
An individual service provider outside the Operator, paid per job, who fulfils Layanan at TPU. Each covers a set of DKI TPUs and a set of Layanan, and is Aktif, Ditangguhkan (no new jobs, reversible) or Berhenti (ended for good).
_Avoid_: Vendor, tukang (as the role name), Mitra (alone)

**Wakif**:
The landowner (or heir or representative) who gives land as wakaf for a cemetery and applies through a Pengajuan Wakaf.
_Avoid_: Donatur, pewakaf

**Nazhir**:
The registered person, organisation or legal body that receives wakaf land and manages it; the Operator is not a Nazhir and only matches a Wakif to one.
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

**Pembongkaran**:
Removing the remains from a Petak Makam, done offline and recorded by the Admin Lokasi; only then can a Terisi plot become empty again.
_Avoid_: Penggalian ulang, ekshumasi (as the record)

**Perlu Verifikasi**:
The flag on a record the platform cannot yet trust: an imported Hak Pakai whose Pemegang Hak contact or end date is missing, or a Petak Makam newly drawn in the Denah whose state the Admin Lokasi has not yet confirmed. It clears when the Admin Lokasi completes it; until then the Petak is neither assigned nor sold.
_Avoid_: Draft, belum lengkap

**Tumpang**:
Burying another Almarhum in a Petak Makam that already holds one, under the existing Hak Pakai.
_Avoid_: Tumpuk, makam susun

**Masa Tenggang**:
The period after a fixed-term Hak Pakai expires during which a Perpanjangan Makam is still accepted, before the Admin Lokasi may end it; for an IPTM, the Pemda's own grace period (3 months in DKI).
_Avoid_: Grace period, masa toleransi, dispensasi

**Nomor Pemesanan**:
The identifier of a Pemesanan Makam, given on submission and shown at confirmation.
_Avoid_: Booking ID, kode booking

**Bukti Pemesanan**:
The proof of the Hak Pakai granted by a paid Pemesanan Makam (Lokasi, Petak Makam, Pemegang Hak, masa Hak Pakai), issued in the Lokasi Mitra's name once payment settles; it carries no amounts. Never issued for a TPU order, where the IPTM is the proof.
_Avoid_: Bukti booking, receipt, kwitansi

**Bukti Perpanjangan**:
The proof of a paid Perpanjangan Makam at a Lokasi Mitra, showing the old and new end dates, issued in the Lokasi Mitra's name; at a TPU the Pemda-issued permit plays this role.
_Avoid_: Surat perpanjangan, bukti bayar perpanjangan

**Pembatalan**:
Cancelling a paid Pemesanan Terencana before any Pemakaman, at the Pemegang Hak's request, with a refund under the Lokasi Mitra's policy paid through the Operator; the Hak Pakai becomes Dibatalkan.
_Avoid_: Refund (as the act), pengembalian (alone)

**Masa Pembatalan**:
The period after a Pemesanan Terencana is paid, set per Lokasi Mitra, in which a Pembatalan refunds the full tariff.
_Avoid_: Cooling-off, masa tenggang (that is for expiry)

**Pengembalian Hak Pakai**:
A Pemegang Hak giving an unused Hak Pakai back to the Lokasi Mitra, which ends it; any compensation is agreed directly between them, never through the Operator.
_Avoid_: Buyback, jual kembali, Pembatalan

**Ganti Pemegang Hak**:
Recording a new Pemegang Hak on an existing Hak Pakai (inheritance or sale), keeping the history of earlier holders.
_Avoid_: Pengalihan, balik nama, transfer

**Pengurusan IPTM**:
A filing-only Pengurusan for a family that buried at a DKI TPU on their own: the Operator files the new or tumpang IPTM, paid before the filing.
_Avoid_: Urus izin, Pengurusan (alone, when meaning this order)

**Perpanjangan Makam**:
Extending a fixed-term Hak Pakai (at a Lokasi Mitra) or a TPU permit by one or more further terms.
_Avoid_: Renewal, sewa ulang

**IPTM**:
Izin Penggunaan Tanah Makam, the Pemda permit for a grave at a DKI TPU, issued for a fixed term and renewed through Pengurusan; the TPU counterpart of a Hak Pakai.
_Avoid_: Hak Pakai (for a TPU), sertifikat makam

**Surat Kuasa**:
The authorisation, generated by the platform and signed by the Pemegang Hak, that lets the Operator (represented by the filing staff member) apply for an IPTM on the family's behalf.
_Avoid_: Kuasa (alone), surat izin

**Pengurusan**:
The Operator handling a Pemda permit on a family's behalf at a TPU: arranging the burial with the TPU and then filing the new or tumpang IPTM for a Pemesanan Saat Duka, filing only the IPTM after a burial the family arranged themselves, or filing the IPTM for a Perpanjangan Makam. Pengurusan that arranges a burial is paid after it; filing-only Pengurusan is paid before the filing. The Pemda, not the Operator, issues the permit.
_Avoid_: Calo, jasa urus, fasilitasi (as the name)

**Pengajuan Wakaf**:
A Wakif's application to give land as wakaf for a cemetery (sosial or keluarga), which the Operator facilitates up to the ikrar at the KUA and the BPN certificate without ever receiving the land or any money.
_Avoid_: Wakaf (alone, when meaning the application), donasi tanah

### Services

**Layanan**:
A grave service in the catalog (e.g. flowers, headstone, cleaning, grass care, photo/video report), from one global list kept by Admin Platform, offered at a Lokasi Mitra or at TPU at a fixed price, possibly in fixed-price variants.
_Avoid_: Produk, jasa

**Pekerjaan Layanan**:
One Layanan carried out at one Petak Makam on one target date, with its own status and photo proof; by the Admin Lokasi at a Lokasi Mitra, by a Mitra Jasa at a TPU.
_Avoid_: Order layanan, tugas, job

**Paket Layanan**:
A bundle of Layanan defined by Admin Platform with a frequency: one-off, or repeated every month, three months or year, creating one Pekerjaan Layanan per Layanan per cycle.
_Avoid_: Langganan, bundle

**Terlambat**:
Said of a Pekerjaan Layanan with no photo proof two days after its target date; flagged to Admin Platform and the fulfiller.
_Avoid_: Overdue, telat

**Keluhan**:
A Pemesan's complaint about a finished Pekerjaan Layanan, filed within 3×24 hours of its photo proof being shown to the Pemesan as Selesai, and settled by Admin Platform with a redo or a refund.
_Avoid_: Komplain, dispute, klaim

**Penilaian**:
A Pemesan's optional 1–5 star rating, with comment, of one finished Pekerjaan Layanan; seen only by Admin Platform.
_Avoid_: Review, ulasan, rating (as the term)

### Money

**Harga Hak Pakai**:
A Lokasi Mitra's price for a new Hak Pakai, set per Jenis Makam.
_Avoid_: Harga makam, harga kavling

**Masa Hak Pakai**:
How long a Hak Pakai lasts: Selamanya, or a fixed number of years that is also the length of one Perpanjangan Makam term. A Hak Pakai keeps the Masa Hak Pakai of its Jenis Makam as it was when bought, even if the Jenis Makam's changes later; only a fixed-term Hak Pakai can be extended, each term at the Jenis Makam's Perpanjangan price in force at the time of the Perpanjangan.
_Avoid_: Tenor, durasi sewa, masa berlaku (alone)

**Tarif**:
A price entered by Admin Platform (a Lokasi Mitra's Harga Hak Pakai, Masa Hak Pakai and Perpanjangan price per Jenis Makam, its Biaya Pemakaman, or one of the Operator's global amounts), kept as versions each in force from its Tanggal Berlaku; a version is never changed or removed, only followed by a newer one.
_Avoid_: Price list, daftar harga (as the record), harga (alone)

**Tanggal Berlaku**:
The date from which a version of a Tarif is in force, today or later, never earlier; shown as "Harga berlaku sejak <tanggal>" for the version in force and "Harga baru mulai <tanggal>" for one scheduled.
_Avoid_: Effective date, tanggal efektif, tanggal mulai (alone)

**Tarif Diperiksa**:
Admin Platform's mark that a Lokasi Mitra's Tarif have been checked against its agreement; one of the conditions for it to become Terverifikasi.
_Avoid_: Tarif disetujui, tarif final

**Biaya Pemakaman**:
A Lokasi Mitra's fee for carrying out one Pemakaman, charged on every burial including those under an existing Hak Pakai (tumpang may have its own amount).
_Avoid_: Biaya gali, ongkos kubur

**Biaya Layanan Platform**:
The Operator's own flat fee on a Lokasi Mitra order, shown to the Pemesan as a separate line on top of the Lokasi Mitra's tariff.
_Avoid_: Komisi, admin fee, markup

**Biaya Pengurusan**:
The Operator's own service fee for a Pengurusan at a TPU, one amount when it arranges a burial and a lower one for filing only, shown on the Tagihan as a service fee, never as a government charge.
_Avoid_: Biaya admin, jasa urus

**Retribusi Pemda**:
A government fee for a TPU permit or burial, collected at cost as its own line and paid on to the Pemda; shown as Rp 0 where the Pemda charges nothing.
_Avoid_: Pajak, biaya pemerintah

**Tagihan**:
The Operator's request to pay a fixed set of lines by a due date, one per payment moment (a checkout, a Perpanjangan, a burial under an existing Hak Pakai, a standalone Layanan order, a Paket Layanan cycle); never changed once issued, only cancelled and replaced. Most are paid before anything happens and simply lapse when unpaid; only those for a burial that has already happened (a Saat Duka order, a burial under an existing Hak Pakai) are chased after their due date.
_Avoid_: Invoice, faktur, nota

**Tidak Tertagih**:
A Tagihan the Operator has given up chasing after its due date; it stays payable, but no one is owed a Pencairan for it.
_Avoid_: Write-off, piutang macet, hangus

**Bukti Pembayaran**:
The Operator's receipt for a settled Tagihan, a separate document from the Tagihan itself.
_Avoid_: Kwitansi, receipt, struk

**Bukti Pengembalian Dana**:
The Operator's record of a refund transfer to a Pemesan, referencing the Tagihan it partly or fully reverses.
_Avoid_: Nota kredit, refund receipt

**Bukti Pencairan**:
The Operator's record of one bank transfer to a Lokasi Mitra or Mitra Jasa, listing every Pencairan it covers.
_Avoid_: Slip payout, settlement report

**Pencairan**:
The Operator paying out the collected amount for one order or job to the Lokasi Mitra or Mitra Jasa that did the work, once the order is paid and the work is done and no longer open to reversal (for a Saat Duka Petak Makam or a later burial once the Pemakaman is recorded; for a Pemesanan Terencana after its Masa Pembatalan; for a Pekerjaan Layanan after the Keluhan window).
_Avoid_: Payout, settlement, transfer

**Potongan**:
An amount a Lokasi Mitra owes the Operator (a refund of money already paid out to it, a platform fee on money it received directly), deducted from its next Pencairan.
_Avoid_: Clawback, tagihan balik, denda

**Harga Khusus**:
A reduction set by hand by Admin Platform on a single order for a family in hardship, shown on the Tagihan as its own negative line beside the normal prices, never as a silently changed price.
_Avoid_: Diskon, voucher, keringanan (as the record)

### Operations

**Antrean**:
The Admin Platform's single list of open work, one row per task that an order, job, payment or Lokasi currently needs; a row closes itself when that thing's state moves on.
_Avoid_: Inbox, tiket, to-do

**Antrean Lokasi**:
The Admin Lokasi's list of open work for one Lokasi Mitra, built and closed from state like the Antrean, split into Mendesak and Lainnya, without claims or Bertugas.
_Avoid_: Antrean (alone, for the Lokasi's list), inbox

**Tugas Lapangan**:
One piece of field work assigned to a Petugas Lapangan (surat pengantar pickup, IPTM originals, Kunjungan Verifikasi, Survei Wakaf, Cek Denah), done only once its required uploads are in.
_Avoid_: Job, Pekerjaan (reserved for Pekerjaan Layanan), kunjungan (alone)

**Bertugas**:
An Admin Platform who has marked themselves on duty and so receives urgent alerts; the rota behind it lives outside the platform.
_Avoid_: Piket, shift, on-call (as the term)

**Catatan Internal**:
A staff-only note on an order, job or Antrean row, used to hand work over; never shown to the Pemesan or Mitra Jasa.
_Avoid_: Komentar, memo

**Audit Log**:
The Operator's permanent record of every staff write; reads are never in it. Mitra Jasa and Petugas Lapangan never see it.
_Avoid_: Riwayat, activity log

**Entri Audit**:
One record in the Audit Log: which Akun did it, under which role, when, to what, the before and after, and the reason.
_Avoid_: Log (alone), histori

**Pengaturan Operator**:
The Operator's own reference values that no other screen owns, kept by Admin Platform: its legal name, registered address and contact, and the CS WhatsApp number with its reply hours. Each change takes effect from the moment it is made; an issued Tagihan or Bukti keeps the values in force when it was issued.
_Avoid_: Konfigurasi, settings (alone), data perusahaan

**Peringatan Staf**:
A message that tells a staff member about work needing them (a new order, an Antrean row, an assigned job); it always goes by WhatsApp, and also by push to each of their Perangkat Push.
_Avoid_: Notifikasi (alone), alert, reminder (for staff)

**Perangkat Push**:
One browser or installed staff app on which an Akun Staf has turned on push, for as long as that login lasts: Keluar there, or anything else that ends the login (Dinonaktifkan, a new role granted on another device), turns it off, and so does the browser no longer accepting pushes. An Akun Staf may have several.
_Avoid_: Langganan (reserved sense: Paket Layanan), subscription, token
