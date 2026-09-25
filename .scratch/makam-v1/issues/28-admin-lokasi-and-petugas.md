# Admin Lokasi back office and Petugas Lapangan work

Type: grilling
Status: resolved
Map: ../map.md

## Question

"Admin Platform back-office queue and on-call" covered the Operator's own staff only.

1. **Admin Lokasi work list and alerts**: confirmations (Saat Duka 2 working hours, Terencana), Perpanjangan reviews, Pekerjaan Layanan, recording a Pemakaman and a pembongkaran, Ganti Pemegang Hak, Pembatalan and Pengembalian Hak Pakai. One queue like Admin Platform's Antrean or separate pages? How are a Lokasi's operating hours and after-hours on-call contact configured, and who is alerted?
2. **Plot map**: how the Admin Lokasi defines the per-blok layout the Terencana plot picker needs (drawn in the back office, uploaded image with pins, a grid), given the Excel import is deferred.
3. **Petugas Lapangan tasks**: how surat pengantar pickups, Kunjungan Verifikasi, Wakaf Tanah surveys and plot-map spot-checks are assigned, scheduled and tracked (Antrean rows, a separate task list, a mobile view), and what they upload.
4. **Who phones the family** after a final failed WhatsApp / email on a Lokasi Mitra order: "Notification channels and WhatsApp provider" says the Admin Lokasi; "Unpaid Saat Duka Tagihan" and ticket 22 say Admin Platform for its own work. Split by message type?
5. **Audit log**: who can view it (Admin Platform only, Admin Lokasi for their Lokasi), and which Admin Lokasi actions are logged.

## Answer

Resolved 2026-09-25 (grilling). `CONTEXT.md`: added **Antrean Lokasi**, **Jam Operasional**, **Kontak Siaga**, **Denah**, **Tugas Lapangan**; widened **Perlu Verifikasi** to Petak Makam. Order statuses, the Terencana confirmation deadline and Pembatalan rows belong to "Lokasi Mitra order lifecycle"; this answer only gives them a place in the Antrean Lokasi.

**1. Antrean Lokasi**
- The same model as Admin Platform's Antrean, limited to one Lokasi Mitra (a switcher for people who manage several): rows come from state, close themselves and link to the normal detail page. **No Ambil claims, no Bertugas, no tiers.** The team is too small to need them.
- Two groups, each sorted by deadline:
  - **Mendesak**: Konfirmasi Saat Duka; Pekerjaan Layanan due today; **Kerjakan ulang** (a Keluhan Admin Platform upheld, with a new target date).
  - **Lainnya**: Konfirmasi Terencana; Periksa dokumen Perpanjangan (requests without the Pemegang Hak OTP); Pekerjaan Layanan upcoming / Terlambat; **Catat Pemakaman** (the confirmed burial date has passed and no Pemakaman is recorded); Ganti Pemegang Hak request; Hak Pakai in masa tenggang (waiting for Perpanjangan or a manual end); failed-notification calls (see 4); Petak Perlu Verifikasi (see 2).
- Terencana confirmation and Pembatalan rows take their deadlines and actions from "Lokasi Mitra order lifecycle".
- Pembongkaran, Pengembalian Hak Pakai, Tidak Tersedia and ending a Hak Pakai are actions on the Petak / Hak Pakai page, not rows.
- **Keluhan** stays with Admin Platform (per "Layanan catalog and Paket Layanan model"). The Admin Lokasi sees it on the Pekerjaan Layanan page and can write in its thread. They only get a row (Kerjakan ulang) when Admin Platform upholds it and asks for a redo.

**2. Jam Operasional, Kontak Siaga, alerts**
- **Jam Operasional**: a weekly schedule (per day: closed, or open–close) plus dated closures (Lebaran and the like). The Admin Lokasi edits it (audited), and a change applies to orders submitted afterwards. The 2 h Saat Duka confirmation clock runs only inside it.
- **Kontak Siaga**: must be **one of that Lokasi's Admin Lokasi**, chosen from a list, so the person a family phones at night can also confirm from their phone. A caretaker who takes those calls is invited as an Admin Lokasi. The Pemesan sees their name and number after hours.
- Alerts (unchanged from "Notification channels and WhatsApp provider"): a new Saat Duka order alerts every Admin Lokasi of the Lokasi plus the Kontak Siaga by WhatsApp + web push, at any hour. **New:** still unconfirmed after **1 h** of Jam Operasional → alerted again. At 2 h it becomes Admin Platform's "Konfirmasi Lokasi terlambat" row, as already decided.

**3. Denah (plot map)**
- **Grid per blok**: rows × columns. Each cell is a Petak Makam (Nomor Makam) or an empty path cell. A Kavling Keluarga is a group of adjacent cells. An optional uploaded photo of the site plan per blok is shown beside the grid for orientation. The Admin Lokasi builds it in the back office.
- Every generated Petak starts **Perlu Verifikasi**. The Admin Lokasi clears the grid blok by blok, marking each Petak Tersedia, Tidak Tersedia, or occupied. Occupied means either a minimal Hak Pakai / Almarhum entry or "Terisi, data menyusul"; the latter stays Perlu Verifikasi. Until the Excel import exists, this is how existing records get in. Saat Duka depends on it too: only cleared Tersedia Petak are counted and can be assigned.
- **After use**: a Petak with a Hak Pakai or Pemakaman can't be deleted or moved, only marked Tidak Tersedia. Only Admin Platform can renumber it (audited), because Nomor Makam is how families look up Perpanjangan. The Admin Lokasi can freely add rows, columns and bloks. New Petak start Perlu Verifikasi and stay hidden from the Terencana picker until cleared. A new blok needs no new spot-check unless Admin Platform orders one.

**4. Who phones the family after a final failed send (Lokasi Mitra orders)**
- Split by who owns the subject of the message. **Admin Platform**: money messages (Tagihan, its reminders, Bukti Pembayaran, refunds), consistent with "Unpaid Saat Duka Tagihan at a Lokasi Mitra". **Admin Lokasi**: the Lokasi's own work (confirmation / Bukti Pemesanan, Perpanjangan outcome, Hak Pakai expiry reminders, Layanan the Lokasi fulfils). Each failure becomes a row in the owning side's Antrean. OTP failures follow the SMS fallback and create no row.

**5. Tugas Lapangan (Petugas Lapangan work)**
- One record per piece of field work: type, subject (order / Lokasi / Pengajuan Wakaf), address + pin, planned date, one assigned Petugas Lapangan, a type-specific form.
- Types and what "Selesai" requires:
  - **Ambil surat pengantar** (created **automatically** when a TPU Saat Duka order is confirmed): a scan, "asli diterima", a handover date.
  - **Berkas IPTM** for a TPU Perpanjangan (originals, per "How Perpanjangan verifies the Pemegang Hak"): scans, "asli diterima", a handover date.
  - **Kunjungan Verifikasi**: the confirmed pin, labelled visit photos, the facilities checklist.
  - **Survei Wakaf**: photos, the checklist (access road, boundaries, disputes, fit for burial), a recommendation.
  - **Cek Denah**: per blok, "sesuai" or a list of mismatched Petak, with photos.
- Admin Platform creates the non-automatic ones from the Lokasi / Wakaf page and assigns every task by hand. The Petugas gets a WhatsApp + push alert. The Petugas works from a mobile **Tugas saya** list (same PWA) and can only mark a task Selesai once the required uploads are in.
- Unassigned or overdue tasks become Admin Platform Antrean rows: Ambil surat pengantar in **Tier 2**, the rest in **Tier 4**. No routing, no calendar.

**6. Audit log**
- **Every staff write action** is logged for every role: who, when, before/after, and the reason where one is required. Reads are not logged.
- **Admin Platform** sees everything. **Admin Lokasi** see every entry about their own Lokasi, including Admin Platform's actions on it (tariff versions, bank account, publish status, Ditangguhkan, renumbering). Catatan Internal and the Operator's Antrean claims stay hidden from them. Mitra Jasa and Petugas Lapangan see no log.

**Final review** (2026-09-25): Pembatalan, Pengembalian Hak Pakai and Ganti Pemegang Hak **requests** from a Pemegang Hak are **Antrean Lokasi rows** due within **2 working days** ("Lokasi Mitra order lifecycle", "Homepage, search and Akun Saya"); the Petak / Hak Pakai page actions remain for changes the Admin Lokasi starts itself (e.g. a pembongkaran, a phoned-in request). A Pembatalan refund row reaches Admin Platform only after the Admin Lokasi confirms no Pemakaman.
