# Spec: Makam.co.id v1

Status: ready-for-agent
Map: [map.md](./map.md)

Synthesised from the map's Decisions-so-far (tickets 01–29), `CONTEXT.md` and ADRs 0001–0004 (ADR 0004 of 2026-09-26 supersedes ADR 0003: v1 has no WhatsApp channel, and an Akun is keyed by its Email Terverifikasi). Where a ticket was amended later, the latest amendment is what this spec states. Domain terms follow `CONTEXT.md`.

## Problem Statement

A family in Jabodetabek who has just lost someone usually has hours to find a grave. Today they phone around cemeteries, get prices by word of mouth, queue at offices, and deal with papers they have never seen before. At a DKI TPU the permit (IPTM) comes from a government system most families don't know, and middlemen charge for "help" that should be free. Families who want to plan ahead can't compare private cemeteries or see what a plot really costs. Families who already have a grave lose track of when its right to use ends, can't easily renew it, and have no reliable way to order flowers, cleaning or a headstone and see that the work was done. Landowners who want to give land as wakaf for a cemetery don't know where to start.

The cemeteries have their own problems. Private, wakaf, yayasan and masjid cemeteries keep plot and right-holder records on paper or in spreadsheets, confirm bookings by phone, chase payments by hand, and have no channel that brings them families.

The Operator, PT Jaya Korpora Prima, wants to run one trustworthy platform for all of this. It owns no land. It signs partnerships with a handful of cemeteries (Lokasi Mitra), offers Pengurusan at DKI TPUs, collects every payment as seller of record, and pays partners out. The platform is built by one engineer working with AI agents, so it has to be low-ops.

## Solution

**makam.co.id v1**: a mobile-first web app (installable PWA for staff) with four pillars and a back office.

1. **Pemesanan Makam**
   - **Pemesanan Saat Duka** at a Lokasi Mitra: pick a Jenis Makam from an all-in-price list. The Admin Lokasi assigns the Petak Makam and confirms within 2 hours of Jam Operasional. Payment never holds up the burial: the Tagihan is due 3×24 h after it.
   - **Pemesanan Saat Duka at a DKI TPU**, carried out as Pengurusan: Admin Platform secures the burial with the TPU and confirms within 2 service hours (06:00–18:00). The Operator files the IPTM on JakEVO afterwards.
   - **Pemesanan Terencana** at a Lokasi Mitra: the Pemesan picks exact plots on a Denah (plot map), the Admin Lokasi confirms, and the Pemesan pays within a 24 h hold.
   - **A further burial under an existing Hak Pakai** (tumpang, the next plot of a Kavling Keluarga, the Calon Penghuni's burial), with the Pemegang Hak's consent.
2. **Perpanjangan Makam**
   - At a Lokasi Mitra: look up the grave without exposing the Pemegang Hak, prove you are the holder (a code sent to the email recorded on the Hak Pakai, or documents checked by the Admin Lokasi), choose terms, pay, and receive a Bukti Perpanjangan.
   - At a DKI TPU: a filing-only Pengurusan of the IPTM, paid before filing, with the new IPTM scan stored on the family's Makam TPU.
3. **Layanan Makam**: one global catalog (flowers, headstone, cleaning, grass care, photo/video report) at fixed prices, ordered one-off or as a recurring Paket Layanan. At a Lokasi Mitra the Admin Lokasi does the work; at a TPU a Mitra Jasa does. Every job has in-app photo proof, a Keluhan window and optional Penilaian.
4. **Wakaf Tanah**: a one-page Pengajuan Wakaf with manual status tracking. The Operator only facilitates and never receives land or money. Every ikrar goes to a Nazhir.

Every family logs in with a Kode Masuk sent to their email, and the Akun is keyed by its Email Terverifikasi (ADR 0004, 2026-09-26); a new Akun is created by the Kode Masuk at Kirim or on Masuk. The phone number stays on the Akun as a contact that is never verified. v1 sends nothing through WhatsApp: the CS WhatsApp number is only a `wa.me` link to a person, and a family without email is helped by CS, who may submit the order on its behalf. **Akun Saya** shows their orders, every grave they hold (Makam Keluarga) and their Pengajuan Wakaf.

The back office has three staff views, all working from self-closing queues:
- **Admin Platform**: onboarding, TPU work, refunds, Keluhan, chasing, Pencairan, Wakaf, through the Antrean.
- **Admin Lokasi**: confirmations, Denah, Pemakaman, Perpanjangan checks, Layanan, requests, through the Antrean Lokasi.
- **Petugas Lapangan and Mitra Jasa**: their assigned field tasks and jobs.

Payments are collected through SumoPod. The Operator issues every Tagihan and Bukti. Pencairan and refunds are manual bank transfers recorded with proof.

## User Stories

### Visitor and search

1. As a grieving family member, I want the homepage to put "Keluarga baru saja wafat" first, so that I reach the urgent path without reading anything else.
2. As a family planning ahead, I want a separate "Siapkan makam untuk nanti" entry, so that I'm not pushed through the urgent flow.
3. As a visitor, I want tiles for Perpanjang Makam, Layanan Makam, Urus di TPU DKI and Wakaf Tanah below the hero (Perpanjang Makam and Layanan Makam open the Makam keluarga hub with that action preselected), so that every pillar is one tap away.
4. As a visitor, I want a trust strip ("Lokasi terverifikasi · Harga transparan · Bantuan administrasi") linking to a Cara Kami Bekerja page, so that I can check what those claims mean.
5. As a visitor, I want a WhatsApp CS button on every page (a `wa.me` link to a person answering in the WhatsApp Business app; ADR 0004), so that I can ask a human at any point.
6. As a visitor on a phone, I want a menu drawer with the same items as the desktop top bar (Pesan Makam, Makam Keluarga, Layanan, Wakaf Tanah, Daftar Lokasi, Masuk / Akun Saya), so that navigation is the same on every device.
7. As a visitor, I want a Daftar Lokasi Makam directory of every listed Lokasi Mitra and DKI TPU, filterable by city, type and facilities, with "mulai Rp X" all-in on each card (at a DKI TPU, X = the burial Biaya Pengurusan + Retribusi Pemda), so that I can browse without starting an order.
8. As a visitor, I want every Lokasi Mitra page to show "Terverifikasi Makam.co.id · dikunjungi <bulan tahun>" with a "what we checked" popover, so that I know someone visited it.
9. As a visitor, I want a Lokasi Mitra page to show every Harga Hak Pakai per Jenis Makam with its tenure, the Biaya Pemakaman (and tumpang amount), Perpanjangan prices, Layanan prices, the Pembatalan policy, the document checklist and "Harga berlaku sejak <tanggal>", all as all-in totals with the parts in small print, so that the price on the page is the price on the Tagihan.
10. As a visitor, I want to see "Harga baru mulai <tanggal>" when a tariff change is scheduled, so that I'm not surprised.
11. As a visitor, I want to see the pengelola's name ("Dikelola oleh Yayasan X") on the Lokasi page, so that I know who grants my Hak Pakai.
12. As a visitor, I want the Petugas Lapangan's dated visit photos and a facilities checklist on the Lokasi page, so that I can judge the place without visiting.
13. As a visitor, I want each DKI TPU page to say "TPU resmi Pemprov DKI Jakarta", show whether it takes new plots and when that was last updated, and show a price box (retribusi IPTM Rp 0, the two Biaya Pengurusan amounts as service fees), so that I understand what the Operator charges and what the government charges.
14. As a visitor, I want a "Pengurusan di TPU DKI" page with a free DIY guide and the DKI Layanan price list, so that I know I can do it myself for free.
15. As a visitor, I want a suspended Lokasi's page to say "sementara tidak menerima pesanan" rather than disappear, so that old links still explain themselves.
16. As a visitor, I want Tentang Kami, FAQ and Hubungi Kami pages and a footer saying "Makam.co.id dikelola oleh PT Jaya Korpora Prima", so that I know who runs the platform.

### Pemesanan Saat Duka at a Lokasi Mitra

17. As a Pemesan, I want one list of Lokasi Mitra × Jenis Makam cards sorted by all-in total, filtered by city (prefilled from my last choice), so that I can choose a grave in one screen.
18. As a Pemesan, I want to see only cards with Tersedia units, each with its count, so that I never pick something that can't be served.
19. As a Pemesan, I want a TPU section below the Lokasi Mitra cards ("dimakamkan lewat Pengurusan"), listing only TPUs taking new plots, and a type chip Semua / Lokasi Mitra / TPU DKI, so that I can compare both options.
20. As a Pemesan outside a Lokasi's Jam Operasional, I want the card to say when confirmation will come and show the Kontak Siaga, so that I know whom to call at night.
21. As a Pemesan, I want to give only my name, my email and a phone number, and the Almarhum's name and date of death (optionally planned burial time and a placement wish), so that I can submit quickly. (Amended 2026-09-26, ADR 0004: the email is required, proven by the Kode Masuk at Kirim and used for every message; the phone is an unverified contact.)
22. As a Pemesan, I want to name a Pemegang Hak other than me (name + phone number, and email if known), defaulting to "Saya sendiri", so that the right sits with the right family member.
23. As a Pemesan, I want to add "bisa hari-H" Layanan (e.g. bunga tabur) for the burial day, billed pay-after on the same Tagihan (also at a DKI TPU, where a Mitra Jasa does the work), so that I can arrange flowers in the same order.
24. As a Pemesan, I want a sticky bottom bar showing "Total semua biaya" that expands to the itemised lines, so that I always know what I'll pay.
25. As a Pemesan, I want the screen to say nothing is paid now and documents can follow, so that I'm not blocked at a hard moment.
26. As a Pemesan, I want a Kode Masuk sent to my email at Kirim to verify my email and create my Akun at the same moment, so that I don't have to sign up. (Amended 2026-09-26, ADR 0004: was a WhatsApp OTP to my number.)
27. ~~As a Pemesan whose account has a verified email, I want a "Kirim lewat email" button about 60 s after the OTP, so that a WhatsApp problem doesn't stop me; without a verified email on my account I want to be pointed to the CS WhatsApp number instead. (Amended 2026-09-25: "an email" became "a verified email"; see story 189.)~~ (removed 2026-09-26, ADR 0004). Replaced by: as a Pemesan without email, I want "Tidak punya email? Minta bantuan CS" at Kirim, opening a `wa.me` link to the CS WhatsApp number and showing the CS phone, so that CS / Admin Platform can submit the order on my behalf (audited).
28. As a Pemesan, I want a Nomor Pemesanan and a status timeline straight after Kirim, with the computed confirmation deadline, so that I know when to expect an answer.
29. As a Pemesan, I want the confirmation to show the assigned Petak Makam, the Admin Lokasi's contact, the document checklist and the payment deadline ("pemakaman tetap berjalan"), so that I know what to bring and that payment won't hold up the burial.
30. As a Pemesan, I want to upload documents later or bring them on the day, so that paperwork doesn't block the burial.
31. As a Pemesan, I want to accept or decline an alternative the Admin Lokasi offers (another Jenis Makam or day) with one tap, seeing the new all-in total, so that I can decide quickly.
32. As a Pemesan whose order was declined, I want a link to other options in my city (by email and on my order page), with my data carried over and TPUs included, so that I can rebook in one tap.
33. As a Pemesan whose order was declined, I want an Admin Platform staff member to phone me within 2 hours, so that I'm not left alone.
34. As a Pemesan, I want to cancel myself before the burial (with a reason once it is confirmed), so that I can change plans. Nothing has been billed before confirmation; after confirmation the Tagihan is cancelled, and any payment already made is refunded except the Biaya Layanan Platform.
35. As a Pemesan, I want to pay by VA or QRIS through a payment link that anyone in my family can use, so that whoever has the money can pay.
36. As a Pemesan, I want a Bukti Pembayaran and then a Bukti Pemesanan once paid, so that I have proof of both the money and the right.
37. As a Pemesan, I want the order to show Dimakamkan once the burial is recorded and Selesai once paid, with the Tagihan status as a separate badge, so that I can follow both.
38. As a Pemesan, I want Tagihan, Bukti Pembayaran and Bukti Pemesanan sent to my email, so that I have them outside the site. (Amended 2026-09-26, ADR 0004: email is now every family's channel, not an optional copy.)

### Pemesanan Terencana

39. As a Pemesan, I want to filter Lokasi by city, all-in price range and facilities, and see only Lokasi with Terencana switched on, so that I compare real options.
40. As a Pemesan, I want to pick one or more Tersedia Petak or a Kavling Keluarga on the Denah, with occupied, reserved and blocked plots not pickable, so that I choose the exact spot.
41. As a Pemesan, I want a tumpang-only plot to tell me to contact the Admin Lokasi, so that I know why I can't pick it.
42. As a Pemesan, I want to name a Calon Penghuni (default "untuk saya sendiri") and a Pemegang Hak, so that the plan is recorded.
43. As a Pemesan, I want the headline price to cover Harga Hak Pakai + Biaya Layanan Platform (+ Layanan), with a separate "Nanti" line for Biaya Pemakaman + Biaya Layanan Platform "sesuai tarif saat pemakaman (saat ini Rp X)", so that I know what comes later.
44. As a Pemesan, I want to see the Syarat Pemesanan Terencana (Masa Pembatalan, later refund %, the right being against the Lokasi Mitra) before Kirim, saved on my order, so that later policy changes don't affect me.
45. As a Pemesan, I want my chosen plot held from submission, so that nobody else takes it while the Lokasi reviews.
46. As a Pemesan, I want confirmation by the end of the Lokasi's next working day, then a 24 h payment hold with a reminder about 4 h before it ends, so that I have time to pay.
47. As a Pemesan, I want to withdraw free at any time before paying, so that I'm not locked in.
48. As a Pemesan, I want to add empty-plot Layanan (cleaning, grass care, photo report) for a single plot, so that the plot is kept before it's used.
49. As a Pemesan whose Terencana order was declined, I want to return to the Lokasi step, so that I can pick again.

### Burial under an existing Hak Pakai

50. As a family member, I want a "Makam keluarga" hub asking "Di mana makamnya?" (Lokasi Mitra / TPU DKI), so that every action on an existing grave starts in one place.
51. As a family member, I want to look up a grave by Lokasi + Nomor Makam / Nomor Kavling or Almarhum name + year of death without seeing the Pemegang Hak's details, so that privacy is kept.
52. As a family member, I want "Makamkan di sini" to request a tumpang, the next plot of a Kavling Keluarga or the Calon Penghuni's burial, asking only for the Almarhum and me, so that it's quick.
53. As a Pemegang Hak logged in with the email recorded on my Hak Pakai, I want my consent to be implicit, so that I don't approve my own request.
54. As a Pemegang Hak, I want an email "Setujui / Tolak" request (after a code sent to the email recorded on the Hak Pakai) when someone else asks to bury in my grave, with Tolak declining the order ("Pemegang Hak tidak menyetujui"), so that nobody uses it without me.
55. As an heir whose Pemegang Hak has died, I want to bring heirship proof on the day, so that the burial still goes ahead.
56. As a Pemesan of a further burial, I want a pay-after Tagihan (Biaya Pemakaman + Biaya Layanan Platform) due 3×24 h after the recorded burial, so that payment doesn't block it.

### Perpanjangan at a Lokasi Mitra

57. As a Pemegang Hak, I want reminders 60, 30 and 7 days before my Hak Pakai ends and weekly during the masa tenggang, so that I don't lose it.
58. As a Pemegang Hak, I want a code sent to the email recorded on the Hak Pakai (skipped if I'm logged in with that Email Terverifikasi) to take me straight to choosing 1–K terms with the price shown, so that renewal needs no review.
59. As a Pemegang Hak whose Hak Pakai has no email recorded, or whose recorded email I can no longer use, I want to upload my KTP for the Admin Lokasi to approve within 2 working days, so that I can still renew.
60. As an heir of a deceased Pemegang Hak, I want one combined Ganti Pemegang Hak + Perpanjangan request with the death certificate, heirship proof and my KTP, so that I don't file twice.
61. As a relative of an Almarhum with no Pemegang Hak on record, I want to claim the Hak Pakai with my KTP, proof of relationship and any old receipt, so that an imported grave can be renewed.
62. As a Pemegang Hak, I want the new end date to be the old end date + terms × N, never counted from payment, so that renewing early costs me nothing.
63. As a family member, I want a clear note instead of a button when Perpanjangan isn't possible ("berlaku selamanya", "bisa diperpanjang mulai <tanggal>", "hubungi Admin Lokasi"), so that I know why.
64. As anyone in the family, I want to pay a Perpanjangan Tagihan for the Pemegang Hak, so that whoever has money can help, without gaining any right.
65. As a Pemegang Hak, I want a Bukti Perpanjangan in the Lokasi Mitra's name with old and new end dates, so that I have official proof.
66. As a Pemegang Hak with an unpaid Saat Duka Tagihan past due, I want to be told "Lunasi Tagihan TGH/… terlebih dahulu" with a pay link, so that I know what unblocks Perpanjangan.
67. As a Pemegang Hak, I want a manual-path approval to stay valid for 30 days if my first Tagihan lapses, so that I don't upload again.

### TPU Pengurusan

68. As a Pemesan at a DKI TPU, I want to choose Baru (only TPUs taking new plots) or Tumpang (describe the grave + photo of the IPTM, with warnings about the 3-year rule and consent), so that I request what is possible.
69. As a Pemesan, I want the eligibility questions "KTP DKI?" and "Meninggal di Jakarta?" to block ineligible cases and point me to Lokasi Mitra, so that I don't waste time.
70. As a Pemesan whose relative died outside Jakarta, I want the extra documents added to my checklist, so that the filing isn't rejected.
71. As a Pemesan, I want to name the Pemegang Hak for the IPTM with their phone number and, if known, email (default me), so that the right person holds the permit and gets reminders.
72. As a Pemesan submitting at night, I want the computed confirmation time shown ("paling lambat pukul 08:00"), the CS WhatsApp (a `wa.me` link, "dibalas mulai pukul 06:00") and a note that I can go to the TPU directly and still have the IPTM filed later, so that I'm never stuck.
73. As a Pemesan, I want the confirmation to show the agreed burial time, TPU address, Admin Platform and TPU staff contacts, both document lists and the price lines, so that I know what happens next.
74. As a Pemesan, I want to upload the filing documents and a platform-generated Surat Kuasa within 7 days after the burial, so that the Operator can file the IPTM.
75. As a Pemesan, I want to follow Dimakamkan → Dokumen Lengkap → IPTM Diajukan → IPTM Terbit, so that I know where the permit is.
76. As a Pemesan, I want the IPTM scan sent to me and stored on my Makam TPU even if I haven't paid yet, so that the government permit is never held hostage.
77. As a Pemesan, I want to cancel before the IPTM is filed and have the Tagihan voided (or, if I already paid, a full refund, except the Biaya Pengurusan once the Operator has arranged the burial with the TPU), so that I'm not charged for work not done.
78. As a family who buried at a TPU on our own, I want to order Pengurusan IPTM only ("Sudah dimakamkan? Kami urus IPTM-nya"), paid before filing, so that I get the permit without the queue.
79. As a Makam TPU Pemegang Hak, I want reminders 3 months and 1 month before the IPTM expires, offering Perpanjangan, so that the grave isn't reassigned.
80. As a Pemegang Hak, I want to request an IPTM Perpanjangan (one 3-year term) from 3 months before expiry, giving the IPTM expiry date, get "Perlu Perbaikan" when a document needs fixing, then pay once documents are checked, so that I never pay for a filing that won't go through.
81. As a Pemegang Hak past the masa tenggang, I want the Operator to ask the TPU first without charge, and close the request as Ditolak if it won't renew, so that I don't pay for nothing.
82. As a Pemegang Hak, I want a fixable PTSP rejection refiled at no charge (back to Perlu Perbaikan), and a full refund if the PTSP finally rejects a filing, with the reason shown, so that the Operator carries its own risk.
83. As a Pemegang Hak, I want to see "IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran", so that I know how long it takes.

### Layanan and Paket Layanan

84. As a family member, I want to order Layanan for any non-Berakhir Petak Makam at a Lokasi Mitra found by lookup, without being the Pemegang Hak, so that any relative can care for the grave.
85. As a family member, I want to order Layanan at a DKI TPU by describing the grave (TPU, blok/nomor, Almarhum, optional photo and pin), so that TPU graves can be cared for too.
86. As a Pemesan, I want to choose a fixed-price variant, fill any text field (nisan inscription) and pick a target date that respects the lead time, so that the price and date are clear before paying.
87. As a Pemesan, I want to order a Paket Layanan (sekali, bulanan, 3-bulanan, tahunan) priced as the sum of its items, so that recurring care is simple.
88. As a Paket subscriber, I want each cycle's Tagihan at H-7 with a reminder at H-1, and no work done on an unpaid cycle, so that I'm never billed for work on credit.
89. As a Paket subscriber, I want the Paket paused after two skipped cycles in a row, with a way to resume, so that it stops quietly if I forget.
90. As the account that ordered a Paket, I want to Hentikan Paket from the next unissued cycle, so that I can stop at any time.
91. As a Pemesan, I want statuses Menunggu Pembayaran → Dijadwalkan → Sedang Dikerjakan → (TPU: Menunggu Verifikasi) → Selesai, plus Terlambat / Dibatalkan / Keluhan, so that I see progress.
92. As a Pemesan, I want before/after photos taken in-app with a timestamp (video for the Laporan Foto/Video), sent to me by link, so that I can trust the work was done.
93. As a Pemesan, I want to cancel a Pekerjaan Layanan until H-1 or until it starts, with the item refunded (platform fee kept), so that I can change my mind.
94. As a Pemesan, I want to file a Keluhan within 3×24 h of seeing the proof, and get a redo or refund decided by Admin Platform, so that bad work is put right.
95. As a Pemesan, I want to give an optional 1–5 star Penilaian with a comment, so that the Operator knows about quality.
96. As a Pemesan at a TPU, I want to see the Mitra Jasa's first name and photo and message them in a per-job thread, with each new message sent to me by email with a reply link, so that I can coordinate without sharing my number.
97. As a Pemesan whose Layanan is Terlambat and cancelled, I want a full refund including the platform fee, so that I don't pay for the fulfiller's failure.

### Akun Saya

98. As any user, I want Masuk to work cold with just my email (a Kode Masuk creates my Akun if that email has none), even without orders, so that a Pemegang Hak who never ordered can see the graves recorded with that email. (Amended 2026-09-26, ADR 0004: was my WhatsApp number.)
99. As a user, I want a Perlu tindakan strip (unpaid Tagihan, missing documents, Perlu Perbaikan, an alternative to accept, a consent to give), so that I see what needs me first.
100. As a user, I want a Pesanan tab with every order on my Akun, newest first, each order page holding its Tagihan, Bukti, IPTM scan and actions, so that everything about an order is in one place.
101. As a Pemegang Hak, I want a Makam tab with every Hak Pakai and Makam TPU whose recorded email is my Email Terverifikasi (even ones someone else ordered), with Pemakaman, active Paket, past photos and documents, so that I manage my family's graves.
102. As a Pemegang Hak of a Terencana Hak Pakai, I want "Ajukan Pembatalan" showing the refund under the Lokasi's policy, so that I know what I'll get back.
103. As a Pemegang Hak, I want "Kembalikan Hak Pakai" for an unused plot, warned that compensation is agreed directly with the Lokasi, so that I can give it back.
104. As a Pemegang Hak, I want "Ajukan Ganti Pemegang Hak" (new holder name + phone number and, if known, email, jual / waris, optional documents), so that I can pass the grave on. (Heirs of a deceased Pemegang Hak start from the hub lookup instead.)
105. As a Pemegang Hak, I want to change the Calon Penghuni label freely (the Lokasi is notified, with no review), so that my plan stays current.
106. As a Pemegang Hak at a Berhenti Lokasi, I want the Hak Pakai to stay visible read-only with the pengelola's contact and downloadable documents, so that my right is still provable.
107. As the Pemesan who paid a Terencana, I want the refund of a Pembatalan the Pemegang Hak requested to come to a bank account I enter, so that the money reaches whoever paid.

### Wakaf Tanah

108. As a Wakif, I want a one-page Pengajuan Wakaf (tujuan sosial / keluarga, my details and relationship to the land, location with pin, approx. m², proof of ownership type, Nazhir if I have one), so that I can start without paperwork.
109. As a Wakif, I want document uploads to be optional and addable later, so that missing papers don't stop me.
110. As a Wakif, I want the page to say plainly that land goes directly to a Nazhir and the platform takes no land or money, so that I trust it.
111. As a Wakif outside Jabodetabek, I want my application closed as Dirujuk with a pointer to the local KUA/BWI, so that I know where to go.
112. As a Wakif, I want a Wakaf tab in Akun Saya showing the status timeline, dates, Admin Platform's notes to me and my uploads, with each status change sent by email, so that I can follow it.
113. As a Wakif, I want to cancel until Menunggu Ikrar, so that I can withdraw.
114. As a Wakif, I want the final AIW / certificate scan in my account, so that I have the result.

### Admin Lokasi

115. As an Admin Lokasi, I want an Antrean Lokasi with Mendesak and Lainnya groups sorted by deadline, whose rows close themselves, so that I just work down the list.
116. As an Admin Lokasi, I want a push + email alert for every new Saat Duka order at any hour, and again after 1 h of Jam Operasional if still unconfirmed, sent to every Admin Lokasi of the Lokasi and the Kontak Siaga by name, so that no family waits.
117. As an Admin Lokasi, I want to confirm a Saat Duka order by assigning a cleared Tersedia Petak of the chosen Jenis Makam, which creates the Hak Pakai and issues the Tagihan, so that confirmation is one step.
118. As an Admin Lokasi, I want to Tawarkan alternatif or Tolak with a reason from a fixed list, so that I can answer honestly when I can't serve.
119. As an Admin Lokasi, I want to record the Pemakaman (date, Petak, layer), prompted the day after the planned date, so that records stay complete and the Tagihan clock starts.
120. As an Admin Lokasi, I want to tick off each document on the checklist, so that I know what's still missing.
121. As an Admin Lokasi, I want to confirm or decline Terencana orders by the next working day, so that held plots don't stay in limbo.
122. As an Admin Lokasi, I want consent for a further burial shown (implicit, email Setujui, or logged verbal consent / heirship proof), plus a warning banner for unpaid earlier Tagihan, so that I don't bury without permission.
123. As an Admin Lokasi, I want the tumpang rules (boleh tumpang, minimum years, maximum layers) checked for me, so that I follow the Lokasi's policy.
124. As an Admin Lokasi, I want to review manual Perpanjangan requests (KTP, heirship, claims) within 2 working days, so that renewals keep moving.
125. As an Admin Lokasi, I want to handle Pembatalan, Pengembalian Hak Pakai and Ganti Pemegang Hak requests as rows due in 2 working days, so that family requests aren't lost.
126. As an Admin Lokasi, I want to perform Ganti Pemegang Hak with documents, keeping the holder history, blocked while a Pembatalan is open or a Saat Duka Tagihan is overdue, so that the record stays trustworthy.
127. As an Admin Lokasi, I want to build the Denah as a grid per blok (Petak cells, path cells, Kavling Keluarga groups, optional site-plan photo), so that the plot map matches the ground.
128. As an Admin Lokasi, I want new Petak to start Perlu Verifikasi and to clear them blok by blok (Tersedia, Tidak Tersedia with reason, occupied with a minimal Hak Pakai / Almarhum or "data menyusul"), so that existing graves get in before any import exists.
129. As an Admin Lokasi, I want to record a Pembongkaran, mark a Petak Tidak Tersedia, or end a Hak Pakai by hand (Berakhir with reason) from the Petak / Hak Pakai page, so that I can make changes I start myself.
130. As an Admin Lokasi, I want to see Hak Pakai in masa tenggang as rows, so that I decide whether to end them.
131. As an Admin Lokasi, I want to fulfil Layanan with in-app photo proof, which marks it Selesai, see a Keluhan on the Pekerjaan Layanan page and write in that job's message thread, and redo work when Admin Platform upholds a Keluhan, so that the Lokasi's service is visible.
132. As an Admin Lokasi, I want to set Jam Operasional (weekly hours + dated closures) and pick the Kontak Siaga from my Lokasi's Admin Lokasi, so that the confirmation promise matches reality.
133. As an Admin Lokasi, I want a read-only list of my Lokasi's overdue Tagihan with the call log, where I can add notes, so that I can follow the chasing.
134. As an Admin Lokasi, I want to record "Dibayar langsung ke Lokasi Mitra" with proof when a family pays us directly, so that the order completes.
135. As an Admin Lokasi, I want to see Pencairan per order (Belum jatuh tempo / Jatuh tempo / Dicairkan) and every Bukti Pencairan with its Potongan lines, so that I can reconcile.
136. As an Admin Lokasi, I want to phone the family about my Lokasi's own messages that failed to send, as a row, so that nobody misses a confirmation.
137. As an Admin Lokasi, I want to see the audit log for my Lokasi, including Admin Platform's changes to tariffs, bank account and status, so that I can trust the platform.
138. As a person managing several Lokasi, I want a Lokasi switcher, so that one account covers all of them.
139. As an Admin Lokasi, I want the family's name, phone number, email, Almarhum and documents for my Lokasi's orders only, so that I can do my job and nothing more.

### Admin Platform

140. As an Admin Platform, I want one Antrean with four tiers and per-type deadlines, sorted by tier then deadline, so that the most urgent work is always on top.
141. As an Admin Platform, I want to Ambil a row (visible to all, takeable by anyone, logged), so that we don't double-work without blocking each other.
142. As an Admin Platform, I want to see who is Bertugas now at the top of the Antrean, to switch Bertugas on (only with at least one active Perangkat Push, ADR 0004; off automatically at 18:00 or after 12 h) to receive Tier 1 alerts, with escalation to everyone at 30 min and at 90 min for TPU confirmations, so that urgent work is covered without an external rota tool.
143. As an Admin Platform, I want Catatan Internal on every row and order, and to be asked to release or annotate my claims when going off duty, so that handover works.
144. As an Admin Platform, I want a counter strip (Pencairan due, overdue Tagihan, Terlambat jobs, open Keluhan, rows past deadline), so that I see the state at a glance.
145. As an Admin Platform, I want to confirm TPU Saat Duka orders after arranging with the TPU, offering another TPU if needed, with my name and contact shown to the family once I take it, so that the family knows who is helping.
146. As an Admin Platform, I want an Ambil surat pengantar Tugas Lapangan created automatically on TPU Saat Duka confirmation, and for a Pengurusan IPTM once its Tagihan is Lunas, so that pickup is never forgotten.
147. As an Admin Platform, I want to generate the Surat Kuasa filled with PT Jaya Korpora Prima and the filing staff member, check the documents, file on JakEVO and upload the IPTM scan and expiry, so that each filing is traceable.
148. As an Admin Platform, I want to maintain each TPU's "menerima makam baru" flag, with a reminder row after 14 days, so that the Saat Duka list stays honest.
149. As an Admin Platform, I want to phone a Lokasi whose Saat Duka confirmation is late (a Tier 1 row), logging the call, without being able to confirm for them, so that responsibility stays with the Lokasi.
150. As an Admin Platform, I want to onboard a Lokasi Mitra (agreement scan, pengelola, bank account, Jenis Makam, versioned tariffs with effective dates, Layanan offered, policies, document checklist, Admin Lokasi invites), so that it can go live.
151. As an Admin Platform, I want the Lokasi published only when the agreement, a Kunjungan Verifikasi and the checked tariffs are all in, and Terencana switched on separately after the Petak are cleared and a Cek Denah is done, so that "terverifikasi" means something.
152. As an Admin Platform, I want to set a Lokasi Ditangguhkan or Berhenti (with an effective date, default 30 days), so that I can act on repeated problems or an ended partnership.
153. As an Admin Platform, I want to create and assign Tugas Lapangan (Kunjungan Verifikasi, Survei Wakaf, Cek Denah, Berkas IPTM), so that field work is tracked.
154. As an Admin Platform, I want to keep the global Layanan catalog (variants, lead time, bisa hari-H, required proof), the Paket Layanan, DKI TPU prices and Mitra Jasa rates, so that the catalog is consistent.
155. As an Admin Platform, I want to onboard Mitra Jasa (KTP, photo, bank account in the KTP name or an override with a note, signed arrangement, TPU and Layanan coverage; emergency contact optional; no NPWP), so that TPU jobs can be assigned.
156. As an Admin Platform, I want to assign TPU jobs by hand from a picker hard-filtered by coverage and availability, with a 12 h accept deadline, so that jobs go to someone able to do them.
157. As an Admin Platform, I want to approve or reject Mitra Jasa photo proof within 24 h, so that the family sees only checked work.
158. As an Admin Platform, I want to decide Keluhan (redo by the same or another fulfiller, or refund) and optionally override the fulfiller's Pencairan amount with a note (e.g. half), so that complaints are settled fairly.
159. As an Admin Platform, I want a 90-day scorecard per Mitra Jasa (Selesai, Terlambat, Keluhan upheld, declines / Tidak direspons, average Penilaian) and to set them Ditangguhkan or Berhenti with a reason, so that quality is managed by judgement.
160. As an Admin Platform, I want to chase overdue pay-after Tagihan (automatic reminders at H+3/7/14/30, at least two logged calls) and declare Tidak Tertagih from H+30, so that unpaid burials are handled consistently.
161. As an Admin Platform, I want to approve every refund and then transfer it by hand with proof, issuing a Bukti Pengembalian Dana, so that money leaves only with a record.
162. As an Admin Platform, I want one Pencairan row per recipient listing all due items minus Potongan, holding items out with a reason, then transfer, upload proof and issue one Bukti Pencairan, so that payouts are batched and traceable.
163. As an Admin Platform, I want to mark a Tagihan paid by hand (Transfer manual / Tunai) with proof, so that payments outside SumoPod count.
164. As an Admin Platform, I want to set a Harga Khusus on an order (shown as a negative line, borne by the Operator from the platform fee first, then its own funds, unless I enter on the order the amount the Lokasi Mitra agreed to bear, with a note), so that hardship cases can be helped openly.
165. As an Admin Platform, I want a monthly Laporan (orders, Rp collected, platform fees, Pencairan, refunds, Tidak Tertagih) exportable as CSV and a weekly list of every outgoing transfer, so that the books can be reviewed without a second approver.
166. As an Admin Platform, I want to review Pengajuan Wakaf, match a Nazhir from the list, schedule the survey, move statuses and write notes to the Wakif separately from internal notes and the survey report (both hidden from the Wakif), so that wakaf applications move forward.
167. As an Admin Platform, I want to move an Akun to a new Email Terverifikasi after a KTP check (Pemulihan Akun), audited, so that someone who lost access to their email doesn't lose the history. (Amended 2026-09-26, ADR 0004: was Pindah Nomor, a move to a new number.)
168. As an Admin Platform, I want TOTP on top of the Kode Masuk and a 12 h session, so that money actions are protected.
169. As an Admin Platform, I want to renumber a Petak (audited, the old Nomor Makam kept as a hidden alias that lookups still find), so that mistakes can be fixed without breaking lookups silently.
170. As an Admin Platform, I want to invite staff (an Undangan Staf to an email, with a phone number as contact) and deactivate any staff account, keeping history, so that access stays controlled. (Amended 2026-09-25: the invite email is not verified; staff verify it themselves, story 190. Amended 2026-09-26, ADR 0004: the invite is addressed to the email, sent by email, and accepted when the Akun with that Email Terverifikasi next logs in.)
171. As an Admin Platform, I want to read every Mitra Jasa message thread and step in, so that I can protect the family.
172. As an Admin Platform, I want to phone the family after money messages fail to send, as a row, so that payment information reaches them.

### Petugas Lapangan

173. As a Petugas Lapangan, I want a mobile "Tugas saya" list with address, pin, planned date and a type-specific form, so that I know where to go and what to capture.
174. As a Petugas Lapangan, I want a task to be markable Selesai only once the required uploads are in, so that the evidence is always complete.
175. As a Petugas Lapangan, I want to see only the documents of cases assigned to me, so that family data stays limited.

### Mitra Jasa

176. As a Mitra Jasa, I want a push + email alert for each job assigned, and to accept or decline in the app, so that I control my workload.
177. As a Mitra Jasa, I want to set Tidak tersedia date ranges myself, so that I'm not assigned when I'm away.
178. As a Mitra Jasa, I want to see the grave location or description, the Layanan, the target date and reference photos, but not the family's contacts, so that I can do the job.
179. As a Mitra Jasa, I want to take before/after photos in the app with the browser camera, so that proof is quick.
180. As a Mitra Jasa, I want to message the family through the job thread, so that I can ask about the grave.
181. As a Mitra Jasa, I want to see my Pencairan and each Bukti Pencairan (job, Layanan, date, rate only), so that I know what I've been paid.
182. As a suspended or ended Mitra Jasa, I want to still log in and see my history and payments, so that nothing is hidden from me.

### Operator and engineer

183. As the Operator, I want every Tagihan and Bukti headed with PT Jaya Korpora Prima's legal name, address and contact, and the Bukti Pemesanan / Perpanjangan to prove the right in the Lokasi Mitra's name, so that the legal roles are clear.
184. As the Operator, I want every staff write action audited (who, when, before/after, reason), so that disputes can be settled.
185. As the engineer, I want the payment provider, message senders and file store behind adapter interfaces, so that a second gateway or a new channel (WhatsApp in a later version) is an addition, not a rewrite. (Amended 2026-09-26, ADR 0004: v1 has no WhatsAppSender.)
186. As the engineer, I want every deadline and reminder driven by the worker from database state, so that a restart never loses a timer.
187. As the engineer, I want daily encrypted off-host backups to object storage in Indonesia with restore tests and an external uptime alarm, so that one VPS is an acceptable risk.
188. As an Admin Platform, I want to enter every reference value (the Operator's legal name, address and contact, the CS WhatsApp number (for `wa.me` links and display) and reply hours, and the prices, TPU list and Nazhir list on their own screens) in the dashboard, so that nothing but the first Admin Platform is seeded and no value needs a deploy.

### Email login (added 2026-09-25)

189. As a Pemesan or a staff member, I want Masuk to send a 6-digit Kode Masuk to my email, creating my Akun when that email has none, so that I can log in without a password or a phone. (Amended 2026-09-26, ADR 0004: email is the only way in. ~~The "Masuk dengan email" alternative to WhatsApp and the identical reply for an unknown or unverified email~~ (removed 2026-09-26, ADR 0004), since an unknown email now gets a code that creates its Akun when entered.)
190. As a Pemesan (in the Akun Saya profile) or a staff member (in the staff area), I want a "Verifikasi email" action that sends a code to a new email and makes it my Email Terverifikasi (my login email) when I enter it, so that I can change my login email myself; an email that is already another Akun's key is refused and I am pointed to CS. (Amended 2026-09-26, ADR 0004: Verifikasi Email now changes the Akun's key.)

### Email is the Akun (added 2026-09-26, ADR 0004)

191. As a family without email, I want "Tidak punya email? Minta bantuan CS" on the Kirim screen, opening a `wa.me` link to the CS WhatsApp number and showing the CS phone, so that CS / Admin Platform can submit the order on my behalf (audited), even with no Akun, and share its document links with me by hand.
192. As a Pemesan whose order CS submitted without an Akun, I want CS to attach it to my Akun by its Nomor Pemesanan once I have an Email Terverifikasi, so that it appears in Akun Saya.
193. As any user, I want to edit my phone number in Akun Saya, so that staff can call me; it is never verified and never logs me in.
194. As a Pemesan, when I must act and email is not enough (an overdue Saat Duka Tagihan, a Hak Pakai nearing its end, a declined order), I want a staff member to phone me, so that I don't miss it.

## Implementation Decisions

### Architecture (ADR 0002, ticket 12)

- A fresh TypeScript codebase in this repo. The Laravel makam-app is frozen as reference only.
- **Next.js App Router** full-stack app, TypeScript strict. It serves three things: public pages and Akun Saya; the staff area (Admin Platform, Admin Lokasi, Petugas Lapangan, Mitra Jasa) as a separate section with a role switcher; and a PWA manifest plus web push.
- UI uses shadcn/ui and TanStack Table.
- **Postgres + Drizzle**, **pg-boss** for jobs and schedules (no Redis; jobs are enqueued in the same transaction as the data), **Better Auth** for sessions, the email Kode Masuk and TOTP.
- Agent rules live in `AGENTS.md`: App Router only; mutations only through Server Actions that call pure domain modules in `src/domain/*`; Zod validation at every boundary.
- **All mutations go through Server Actions** (or route handlers for webhooks). These are thin: authenticate, check the role, validate with Zod, then call a **domain module**. Domain modules hold every business rule and are the single test seam.
- One Docker image with two containers:
  - `web`: `next start`, standalone output.
  - `worker`: pg-boss consumers and schedules.
  - Both import the same domain modules.
- Production is the `makam-prod` compose project on the Jakarta VPS (103.92.214.243), with its own Postgres and resource limits. Migrations run as a separate step before restart. The host is shared with other projects: `web` binds to 127.0.0.1 on a port that doesn't clash with 3001, 8081, 8082 or 8083, behind the host's existing nginx with Certbot TLS.
- v1 is served directly on `makam.co.id` (and `www`), replacing the frozen Laravel app, whose nginx server block today proxies to 127.0.0.1:3001 and 127.0.0.1:8083 and whose SumoPod payments are live. The switch happens in the production deploy, behind a human confirmation gate with a rollback that restores the old server block. `dev.makam.co.id` is the staging environment (next point), not part of this switch.
- **Pre-live environment**: before the switch, v1 runs as a staging environment at `dev.makam.co.id` (public, no basic auth since 2026-09-25; unindexed), replacing the old app's dev environment there (its nginx block, today proxying to 127.0.0.1:8081, is backed up and replaced only after the user confirms). Staging uses the SumoPod **sandbox**; live SumoPod keys and the live webhook URL are installed in production on the switch day.
- CI/CD: GitHub Actions in the private repo `github.com/andrianm28/makam` (default branch `main`, GitHub Free: no branch protection or environment approvals). PRs: lint, typecheck, Vitest, gitleaks, `npm audit`, image build. `main`: the same, plus push `ghcr.io/andrianm28/makam:sha-<commit>` with an SBOM, the Playwright suite against that exact image, a Trivy scan (fail on fixable CRITICAL) and a migration upgrade test; then CI **signs** the image (cosign). Deploys stay **pull-based**: the host deploys only signed images, reports GitHub Deployment statuses, runs migrate first and `up` only if it succeeded, and rolls the image back on a failed healthcheck. A smoke test against staging gates production; production is promoted by a manual owner-only workflow that re-signs the staging digest with a separate production key (tag `vYYYY.MM.DD-N`), with a matching rollback workflow. A `pg_dump` precedes every production migrate; migrations are expand/contract (destructive DDL needs `-- contract:`). Secrets stay on the host; nothing environment-specific is baked into the image. Actions pinned by SHA, images by digest, Dependabot, least-privilege permissions and timeouts; deploy jobs are never cancelled mid-way (ADR 0002, second amendment of 2026-09-26).
- Files (KTP, heirship documents, IPTM scans, photo proof, transfer proofs, agreement scans) live in private S3-compatible storage in AWS S3 Jakarta (`ap-southeast-3`) and are served through short-lived signed URLs. Backups are encrypted client-side (pgBackRest `repo-cipher-type` or wal-g libsodium) and stored with the same provider. Biznet Gio NEO is the local storage fallback after a compatibility spike.
- Error monitoring: **GlitchTip, self-hosted on the same host**, through the Sentry SDK (a DSN swap; Sentry cloud is not used). It runs as its own compose project (Postgres, Redis, web, worker, each with a memory limit; its Redis is GlitchTip's own and does not change the app's no-Redis rule) at `errors.makam.co.id`, behind the host's nginx with a Certbot certificate; the DNS A record for `errors.makam.co.id` → 103.92.214.243 must be added. PII scrubbing: no bodies, phone numbers or files.

### Adapter ports (each with a real and an in-memory implementation)

- **Clock**: every deadline, due date, reminder window (08:00–20:00 WIB), working-hours calculation and session expiry reads the injected clock. All times are Asia/Jakarta.
- **PaymentProvider** (SumoPod in v1):
  - Creates a payment for a Tagihan when the payer clicks Bayar, and re-creates it if the SumoPod link expired. The platform's own due date is independent of the link's.
  - Verifies and parses webhooks with a Svix signature and processes them idempotently.
  - No payout or refund methods in v1.
- ~~**WhatsAppSender** (kirim.dev → Meta Cloud API): templates, Meta's authentication template, status, inbound auto-reply~~ (removed 2026-09-26, ADR 0004): v1 has no WhatsApp channel and no WhatsAppSender port, adapter or fake; a later version that wants WhatsApp builds the port again from the ports/adapters pattern.
- **EmailSender** (the **SumoPod SMTP relay**: `smtp.sumopod.com`, port 465, SMTPS, from `makam.co.id`; decision 2026-09-25, ADR 0002 amendment): sends every email: the Kode Masuk (at Kirim and on Masuk, sent directly by Identity & Access), every family notification with its Tagihan / Bukti links, the email copy of each Peringatan Staf, and Undangan Staf. Email is the only message channel to families (ADR 0004), so deliverability is critical: the live adapter (ticket 68) is a launch requirement. Amazon SES is not used in v1, and the self-hosted Stalwart mail server on this host is for human mailboxes only, never for the app. There is no SMS in v1.
- **WebPush**: Peringatan Staf to each Perangkat Push, alongside email (ADR 0004).
- **FileStore**: upload, signed URL and delete.
- **PdfRenderer**: turns a document web page into a PDF.

### Domain modules

Each is a deep module with a small public interface and owns its tables.

Core entities at a glance (details in each module):
- **Lokasi Mitra** / **TPU**: the places; a Lokasi Mitra has Admin Lokasi, Jam Operasional, a Kontak Siaga, a Denah and versioned tariffs.
- **Petak Makam**: one plot in a blok of the Denah; may belong to a **Kavling Keluarga** (a fixed group sold as one unit).
- **Hak Pakai**: the right to use 1..n Petak, with one Pemegang Hak; holds **Pemakaman** (one burial each) and optional Calon Penghuni labels.
- **Makam TPU**: the TPU counterpart of a Hak Pakai (Pemegang Hak, current IPTM and history).
- **Pemesanan Makam** (Saat Duka, Terencana, burial under an existing Hak Pakai) and **Pengurusan** orders (Saat Duka TPU, Perpanjangan TPU, Pengurusan IPTM), each with a Nomor Pemesanan; **Perpanjangan** requests on a Hak Pakai.
- **Pekerjaan Layanan**: one job for one Layanan on one grave, from an order or a **Paket Layanan** cycle; fulfilled by the Admin Lokasi or a **Mitra Jasa**; has a message thread, Keluhan and Penilaian.
- **Tagihan** (one per payment moment) → **Bukti Pembayaran**; refunds → **Bukti Pengembalian Dana**.
- **Pencairan** items and **Potongan** per Lokasi Mitra or Mitra Jasa, batched into one **Bukti Pencairan** per transfer.
- **Pengajuan Wakaf** (by a Wakif, linked to a Nazhir list entry or a typed name).
- **Tugas Lapangan** (assigned to a Petugas Lapangan), **Antrean** / **Antrean Lokasi** rows (projections, not stored work), **Catatan Internal**, the audit log and the message log.

1. **Identity & Access**
   - The Akun is keyed by one **Email Terverifikasi** (ADR 0004, superseding ADR 0003's WhatsApp number). The phone number is a required contact on the Akun, never verified and never used to log in; the user edits it in Akun Saya. Only Indonesian (+62) numbers are accepted as that contact (decision 2026-09-25, kept).
   - **Kode Masuk**, by email only, through EmailSender (SumoPod SMTP): a 6-digit code. The Kode Masuk at Kirim (in a wizard) or on Masuk logs into the Akun of that email, or creates the Akun when the email has none; the Akun is created only when the code is entered, which also proves the email and catches typos. Every role logs in this way; Admin Platform still passes TOTP. There is no WhatsApp and no SMS code. ~~WhatsApp OTP, "Masuk dengan email" as an alternative, the "Kirim lewat email" fallback~~ (removed 2026-09-26, ADR 0004).
     - Rules: expiry 10 min; the 5th wrong code burns it; resend after 60 s; at most 5 per rolling hour; lockout after 10 wrong codes in 60 min. Limits are counted per email and per IP.
     - The Kode Masuk is sent by this module directly through EmailSender, not through Notifications (decision 2026-09-25, kept): it must arrive at once, background retries would only confuse, and the code is sensitive. So it creates no message-log entry and is never retried automatically; when sending fails the person sees "gagal kirim" and may try again at once (the failed send does not count against the limits).
     - The reply after a request is the same for every email, known or not (the code is sent either way; ADR 0004 retires the "Jika email ini terdaftar dan terverifikasi" reply).
   - **Families without email** (the accepted risk, ADR 0004): the Kirim screen offers "Tidak punya email? Minta bantuan CS", which opens a `wa.me` link to the CS WhatsApp number (Pengaturan Operator; a person answering in the WhatsApp Business app, no API) and shows the CS phone. CS / Admin Platform may submit the order on the family's behalf (audited); such an order may have no Akun, only a contact number, and CS shares its document links by hand. When the family later has an Email Terverifikasi, CS attaches the order to that Akun by its Nomor Pemesanan (audited).
   - **Email Terverifikasi**: an email becomes verified only when a code sent to it is entered (a Kode Masuk, or Verifikasi email). An email that has only been typed in (on an order CS submits, on an Undangan Staf, on a Hak Pakai) is not verified. An Akun changes its own email only through "Verifikasi email" in the Akun Saya profile or the staff area: a code goes to the new address, and the old Email Terverifikasi stays in force until that code is entered; there is no "save without verifying", and no Akun may remove its email. A verified email is the key of exactly one Akun: verifying an email that is already another Akun's key is refused, and Admin Platform resolves such cases through CS. Verifying an email from the staff area is a staff write and is audited.
   - Roles: Pemesan (implicit), Admin Lokasi (many-to-many with Lokasi Mitra, all equal), Admin Platform (TOTP required), Petugas Lapangan, Mitra Jasa. One account can hold many roles.
   - Staff are invite-only. An **Undangan Staf** (Admin Platform, Admin Lokasi, Petugas Lapangan, Mitra Jasa) is addressed to an email, with a phone number as contact, sent by email, and accepted when the Akun whose Email Terverifikasi is that email next logs in with a Kode Masuk (which creates the Akun if needed) (ADR 0004). The first Admin Platform is seeded from the CLI with its email (as its Email Terverifikasi) and a contact phone number; that is the only seed, and every other reference value is entered in the dashboard (Pengaturan Operator and the owning screens).
   - Sessions: 90 days for Pemesan, 30 days for staff on a trusted device, 12 h for Admin Platform. An account holding Admin Platform uses the strictest rule (12 h session with TOTP) for the whole account, whatever other roles it holds.
   - ~~Optional email on a Pemesan account, used only for Tagihan / Bukti copies~~ (removed 2026-09-26, ADR 0004): the email on a "Data & kirim" screen is required for an order the family submits itself, is proven by the Kode Masuk at Kirim, and is where every family notification goes.
   - **Pemulihan Akun** (replaces Pindah Nomor, ADR 0004): Admin Platform moves an Akun to a new Email Terverifikasi after checking the holder's KTP, for someone who lost access to their email, audited, keeping everything recorded on the Akun.
   - No self-service recovery and no shared family access.
   - Exposes an authorisation check the Server Actions call. This check also filters what Admin Lokasi, Petugas Lapangan and Mitra Jasa may see: Admin Lokasi never see Pengajuan Wakaf; Wakaf survey reports stay internal to Admin Platform; Mitra Jasa and Petugas Lapangan see no audit log.
   - Only Admin Platform changes a Lokasi's bank account, its tariffs and which Admin Lokasi it has.
2. **Audit Log**
   - Records every staff write: actor, role, time, entity, before/after and reason.
   - Queried by Lokasi, for the Admin Lokasi view, which hides Catatan Internal and Antrean claims. Mitra Jasa and Petugas Lapangan see no log.
   - Reads are not logged.
3. **Lokasi**
   - **Lokasi Mitra** holds: pengelola name, address, pin, city (kota/kab), agreement scan and date, bank account (Admin Platform only), facilities checklist + note, visit photos, Jam Operasional (weekly + dated closures), Kontak Siaga (must be one of its Admin Lokasi), document checklist (editable per Lokasi; default: the death certificate from the RS / Puskesmas, the death report letter from the Lurah or RT/RW, and the KTP + KK of the Almarhum and the Pemesan), and status Belum Tayang / Terverifikasi (published) / Ditangguhkan / Berhenti (with effective date).
   - Lokasi Mitra flags: "Pemesanan Terencana aktif" (until it is on, the Lokasi page hides the Terencana entry and shows "Pemesanan terencana segera tersedia"), boleh tumpang (min years, max layers), tumpang on released plots allowed, sale transfers forbidden (transfers by inheritance are always allowed).
   - **Ditangguhkan** blocks only a new Hak Pakai (a Saat Duka new plot and Terencana). Burials under an existing Hak Pakai, Perpanjangan, Layanan and Paket Layanan cycles, Pembatalan, Ganti Pemegang Hak, Pengembalian Hak Pakai and orders already in progress carry on.
   - **Berhenti** (effective date, default 30 days after the decision): from the decision no further Paket cycles are issued and the families are told; until the effective date the Lokasi otherwise behaves as Ditangguhkan; open Pekerjaan Layanan not finished by that date are cancelled with a full refund including the Biaya Layanan Platform; from that date no order of any kind, and Hak Pakai stay read-only in Akun Saya.
   - Lokasi Mitra policies: Masa Tenggang (default 3 months), max Perpanjangan terms K (default 1), Terencana hold hours (default 24), Saat Duka payment window (default 3×24 h), Masa Pembatalan N days (default 7) and later refund % (default 0), transfer fee (collected offline).
   - The publish gate is computed: signed agreement + completed Kunjungan Verifikasi + tariffs checked.
   - Late confirmations and declines are counted on the Lokasi.
   - **TPU** (DKI only): name, address, pin, data source, "menerima makam baru" flag with last-updated date. Every DKI TPU is listed.
   - **Working-time calculator**: given the Lokasi's Jam Operasional (or the fixed TPU window 06:00–18:00 every day) and a start instant, computes the deadline for N service hours and the next "working day end". Used by confirmation deadlines, the pre-submission promise text and Antrean rows.
   - **Working days**: an Admin Platform "working day" is Monday–Friday minus Indonesian national holidays, from a holiday list Admin Platform maintains. An Admin Lokasi "working day" (request rows, Terencana confirmation) is an open day of that Lokasi's Jam Operasional, minus its dated closures. "Daytime hours" (the Keluhan first response) count only 06:00–18:00 WIB.
4. **Tariffs**
   - **Versioned** price books, entered only by Admin Platform, with an effective date that may be in the future. Old versions are never deleted.
   - Lokasi Mitra: per Jenis Makam the Harga Hak Pakai, tenure (Selamanya or N years) and Perpanjangan price per term (required for N years; a Jenis Makam that becomes Selamanya may keep one for the Hak Pakai already bought for N years); per Lokasi the Biaya Pemakaman (+ tumpang amount); per Layanan variant the Lokasi price.
   - Perpanjangan pricing (decision 2026-09-26): the term length and whether a Hak Pakai can be extended at all come from the Hak Pakai as bought (its snapshotted tenure), never from the Jenis Makam's current tenure; the price per term is the Jenis Makam's Perpanjangan price in force at the time of the Perpanjangan. So after a Jenis Makam changes from 5 years to 10 years or to Selamanya, an existing 5-year Hak Pakai is still extended per 5-year term at the current Perpanjangan price; only a Selamanya Hak Pakai is refused.
   - Global: Biaya Layanan Platform (flat, one rate); DKI Biaya Pengurusan (burial amount and filing-only amount); Retribusi Pemda lines (Rp 0 today; a non-zero one is collected at cost and paid on to the Pemda by Admin Platform or the Petugas Lapangan, recorded with an uploaded setoran proof from a Tier 3 "Setor Retribusi" row (Admin Platform), or, when a Petugas Lapangan pays in person, from a "Setor Retribusi" Tugas Lapangan whose proof upload closes the row; v1 builds only this structure, and a Rp 0 line creates no row); DKI Layanan variant price; Mitra Jasa rate per Layanan variant.
   - Exposes an **all-in price quote** for any line set: parts plus total including one Biaya Layanan Platform per Tagihan where it applies (Lokasi Mitra only). This is used by every listing, card, sticky bar and Tagihan, so the published price equals the Tagihan price.
5. **Inventory** (Lokasi Mitra only)
   - **Denah**: Bloks as rows × columns grids (Blok name unique per Lokasi). Each cell is a Petak Makam (Nomor Makam, Jenis Makam), a Jalan or Bukan Petak (trees, buildings, unopened land; decided 2026-09-26). A new Blok starts with every cell a Petak; Nomor Makam and Nomor Kavling are pre-filled from an editable pattern prefixed with the Blok name (e.g. `A-01`, `A-K01`) and stay unique per Lokasi. Cells are edited in bulk (drag-select on desktop, tap-select on phones with an action bar). A Kavling Keluarga is at least 2 Petak connected by edges within one Blok and carries its own Jenis Makam (sold and priced as one unit). Rows and columns may be added at any edge and removed only when none of their Petak was ever used; a used Petak can't be deleted, moved or turned into another cell type. A Kavling Keluarga (Nomor Kavling) is a fixed group of adjacent cells and can be split only while it has no Hak Pakai. Optional site-plan photo per blok.
   - A Petak with a Hak Pakai or Pemakaman can't be deleted or moved. Only Admin Platform renumbers it. The old Nomor Makam is kept as a hidden alias: lookups by it (Perpanjangan, the Makam keluarga hub, the Admin Lokasi search) still find the Petak; aliases are never displayed, only recorded in the audit log.
   - **Petak Makam status** is derived: Tersedia / Dipesan / Terisi / Masa Berlaku Habis / Tidak Tersedia (manual, with reason, only without an active Hak Pakai), plus the **Perlu Verifikasi** flag (not assignable or sellable until cleared).
   - Kavling Keluarga status is derived: Tersedia / Dipesan / Terpakai sebagian / Penuh.
   - Availability = count of cleared Tersedia units per Jenis Makam (a Kavling Keluarga counts as one).
   - **Hak Pakai**: covers 1..n Petak, has one Pemegang Hak (name + phone number + email when known + holder history; it shows in the Akun whose Email Terverifikasi equals the recorded email; defaults to the Pemesan, never the Almarhum), an optional Calon Penghuni label per Petak (the Pemegang Hak changes it freely; the Lokasi is notified, with no review), a start date and an end date (empty for a perpetual Jenis Makam; the clock starts at the first Pemakaman, tumpang doesn't reset it), the terms in force at payment (Syarat Pemesanan Terencana snapshot), and a Perlu Verifikasi flag. Status Aktif / Kedaluwarsa / Berakhir (reason) / Dibatalkan. Ending is final; a resale creates a new Hak Pakai.
   - **Pemakaman**: Almarhum, date, Petak, layer.
   - **Pembongkaran** record: a plot stays Terisi after its Hak Pakai ends until a Pembongkaran is recorded, which makes it empty again. A released but not yet cleared (still Terisi) plot is sellable only as tumpang, and only if the Lokasi allows tumpang on released plots, after the minimum years since the last burial; it is never listed as an empty plot.
   - Operations: clear Petak, record Pemakaman, record Pembongkaran, set Tidak Tersedia, end Hak Pakai, Ganti Pemegang Hak (documents, history; blocked by an open Pembatalan or an overdue pay-after Tagihan), change the Pemegang Hak's contact number or recorded email (Admin Lokasi after a KTP check), Pengembalian Hak Pakai.
   - A plot hold for Terencana is placed at submission and released on decline, withdrawal or lapse.
   - Also exposes: lookup by Lokasi + Nomor Makam / Nomor Kavling or Almarhum name + year of death, returning only Almarhum names, numbers, status and end date. For a Kavling Keluarga the whole kavling is returned, since a Perpanjangan covers all of it.
   - Excel import is a stated requirement. Imported Hak Pakai without contact or end date are flagged Perlu Verifikasi; an empty imported end date does not mean perpetual unless the Jenis Makam is perpetual. The Admin Lokasi must complete it at the latest at the first Perpanjangan or Layanan on that Hak Pakai. The template follows the first partner (not in the first build; see Further Notes).
6. **Pemesanan (Lokasi Mitra)**
   - **Saat Duka**
     - Statuses: Diajukan → Dikonfirmasi → Dimakamkan → Selesai, plus Ditolak and Dibatalkan.
     - Confirm = assign a cleared Tersedia Petak of the chosen Jenis Makam → Hak Pakai Aktif → pay-after Tagihan.
     - Tawarkan alternatif (another Jenis Makam / day, accept or decline by the Pemesan; declining becomes a Tolak) and Tolak with a fixed reason list.
     - Pemesan cancellation rules as in story 34. The Admin Lokasi can record a cancellation on the family's behalf. Cancelling means Hak Pakai Dibatalkan, Petak Tersedia, and hari-H Layanan refunded unless already Sedang Dikerjakan. No cancellation fee.
     - Selesai = Tagihan Lunas + Bukti Pemesanan issued.
   - **Terencana**
     - Statuses: Diajukan (plots held) → Dikonfirmasi (hold running, pay-first Tagihan due at hold expiry) → Aktif (paid, one Hak Pakai per Petak / Kavling Keluarga, same Pemegang Hak), plus Ditolak and Dibatalkan (reason "batas pembayaran lewat", withdrawal, or Pembatalan).
     - Confirmation is due by the end of the Lokasi's next working day, with no automatic cancel.
   - **Burial under an existing Hak Pakai**: the same track as Saat Duka without creating a Hak Pakai.
     - Consent resolution: implicit when the logged-in Akun's Email Terverifikasi is the holder's recorded email; else an email Setujui / Tolak after a code sent to the recorded email (ADR 0004); else verbal consent logged by the Admin Lokasi; else heirship proof, which raises a Ganti Pemegang Hak reminder. A Tolak by the Pemegang Hak makes the order `Ditolak` with reason "Pemegang Hak tidak menyetujui".
     - Tumpang policy checks. Pay-after Tagihan with Biaya Pemakaman at the day's rate + Biaya Layanan Platform.
     - Cancelling cancels only the order and its Tagihan. No new Bukti Pemesanan.
   - **Requests from the Pemegang Hak**: Pembatalan, Pengembalian Hak Pakai and Ganti Pemegang Hak, each due in 2 working days. Heirs of a deceased Pemegang Hak start from the hub lookup, not the Ganti Pemegang Hak request.
     - Pembatalan, Pengembalian Hak Pakai and Ganti Pemegang Hak request statuses: Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan (by the requester before a decision). The Antrean Lokasi row exists while Diajukan, due 2 working days (Lokasi calendar).
     - Pembatalan: the Admin Lokasi confirms no Pemakaman, the refund is computed from the snapshot policy (100% within the Masa Pembatalan, else the set %; Biaya Layanan Platform never refunded), then an Admin Platform refund row is created. The refund goes to the Pemesan who paid, to a bank account that Pemesan enters. Not allowed after a Ganti Pemegang Hak.
   - Every Pemesanan Makam gets a **Nomor Pemesanan**.
7. **Perpanjangan (Lokasi Mitra)**
   - Open from 3 months before the end date to the end of the Masa Tenggang.
   - Paths:
     - Code sent to the email recorded on the Hak Pakai, skipped when logged in with that Email Terverifikasi (ADR 0004; was an OTP to the Hak Pakai number). With no recorded email, the manual paths below apply.
     - Manual KTP review.
     - Heir: combined Ganti Pemegang Hak + Perpanjangan.
     - Claim, when no holder is on record.
   - Manual-path requests (KTP, heir, claim) have statuses Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan (by the requester before a decision); the Periksa dokumen Perpanjangan row exists while Diajukan, due 2 working days (Lokasi calendar).
   - A manual approval stays valid 30 days.
   - Terms 1–K. New end = old end + terms × N, where N is the Hak Pakai's own term length as bought; each term is priced at the Jenis Makam's Perpanjangan price in force when the Perpanjangan is quoted. Applied automatically on payment.
   - Blocked by an overdue pay-after Tagihan on the Hak Pakai. Not offered for perpetual, too early, Berakhir or Dibatalkan.
   - Pay-first Tagihan due 3×24 h after issue. Bukti Perpanjangan is issued on payment.
   - An optional "Tambah Layanan" step before payment adds Layanan on the same Tagihan, which keeps the Perpanjangan due date (3×24 h); each added Layanan's target date must be at least its lead time after that due date, so adding Layanan never shortens or endangers the Perpanjangan.
8. **Pengurusan (DKI TPU)**
   - **Order kinds and statuses**:
     - **Saat Duka TPU**: Diajukan → Dikonfirmasi → Dimakamkan (set by Admin Platform after checking with the TPU or the family) → Dokumen Lengkap → IPTM Diajukan → IPTM Terbit, plus Dibatalkan.
     - **Perpanjangan TPU**: Diajukan → (Perlu Perbaikan ↺) → Menunggu Pembayaran → Diproses → IPTM Diajukan → IPTM Terbit, plus Ditolak and Dibatalkan.
     - **Pengurusan IPTM**: Dimakamkan → Dokumen Lengkap → Menunggu Pembayaran → IPTM Diajukan → IPTM Terbit, plus Ditolak and Dibatalkan.
   - Burial type Baru / Tumpang. Eligibility (KTP DKI, died in Jakarta) blocks no/no. Died outside Jakarta adds the Pasal 17(2) documents.
   - Pemegang Hak name + phone number, and email when known.
   - Two document sets: for the burial (brought) and for the filing (uploaded, due in 7 days after the burial, or 7 days after the order for Pengurusan IPTM).
   - **Surat Kuasa generator**: authority to PT Jaya Korpora Prima, represented by the filing staff member, filled from their account.
   - Payment rule: burial-arranging orders are pay-after (Tagihan at confirmation, due 3×24 h after the burial, chased, Operator bears the loss). Filing-only orders are pay-first after the document check (3×24 h, lapse to Dibatalkan).
   - A Saat Duka TPU order may add hari-H Layanan, fulfilled by a Mitra Jasa, pay-after on the Saat Duka TPU Tagihan; their Pekerjaan Layanan are Dijadwalkan at confirmation. The Mitra Jasa's Pencairan follows the normal Mitra Jasa rule (Keluhan window closed) without waiting for the family's payment; if the Tagihan is Tidak Tertagih the Operator bears the loss.
   - A fixable PTSP rejection (missing or unclear document, Surat Kuasa problem) goes back to Perlu Perbaikan and is refiled at no charge, also after payment. Final PTSP rejection of filing-only work is refunded in full. Past-grace requests are checked with the TPU before billing.
   - The Perpanjangan TPU form asks for the IPTM expiry date, read off the IPTM photo and corrected by Admin Platform.
   - Cancellation of a burial order is allowed before filing. An unpaid Tagihan is voided. A paid one is refunded in full, except that once the Operator has arranged the burial with the TPU (Dimakamkan or later) the Biaya Pengurusan is kept and only the other lines (e.g. Layanan not yet done) are refunded; Admin Platform approves, as with every refund. The IPTM is handed over regardless of payment.
   - **Makam TPU** record: TPU, blok/nomor, Almarhum(s), Pemegang Hak + phone number (email when known), current IPTM scan + expiry, and IPTM history. A tumpang updates the existing record.
   - No Bukti Pemesanan / Perpanjangan at a TPU.
9. **Layanan**
   - **Catalog**: one global list with fixed-price variants, text fields, minimum lead time, "bisa hari-H" flag, "makes sense on an empty plot" flag and required proof (after photo always; before photo for Pembersihan and Perawatan Rumput & Taman; video for the Laporan).
   - Each Lokasi switches on Layanan from the list. Admin Platform marks each Batu Nisan variant "boleh di TPU DKI" by hand; only marked variants are offered at a TPU. Pemda rules are not encoded.
   - **Paket Layanan**: items + frequency (sekali / bulanan / 3-bulanan / tahunan). Price = sum of the place's item prices. Offered only where every item is offered.
   - **Order**: one order = one grave (a Lokasi Mitra Petak, or a TPU grave description / Makam TPU) with one or more Layanan. Anyone may order for a non-Berakhir grave. Saat Duka checkout (Lokasi Mitra or DKI TPU) offers only hari-H items, which are pay-after on that Tagihan: their Pekerjaan Layanan are Dijadwalkan at the order's confirmation. A Terencana plot with no burial offers only empty-plot items. A Perpanjangan checkout at a Lokasi Mitra offers an optional "Tambah Layanan" step.
   - **Pekerjaan Layanan**:
     - Target date ±2 days.
     - Statuses: Menunggu Pembayaran → Dijadwalkan → Sedang Dikerjakan → (TPU: Menunggu Verifikasi) → Selesai, plus Terlambat (target + 2 days, no proof), Dibatalkan and Keluhan.
     - Cancel until H-1 or until started.
     - Proof is in-app camera capture with a timestamp.
     - The Keluhan window is 3×24 h from when the proof is shown to the Pemesan (Admin Lokasi upload, or Admin Platform approval at a TPU).
     - Keluhan outcome: redo (same or other fulfiller) or refund. Admin Platform may override the fulfiller's Pencairan amount with a note (e.g. half).
     - The Admin Lokasi sees a Keluhan on its Lokasi's Pekerjaan Layanan page and can write in that job's message thread; a redo it must do reaches it as a Kerjakan ulang row.
     - Penilaian 1–5 + comment, visible to Admin Platform only.
   - **Recurring cycles**: Tagihan at H-7, due H-1. An unpaid cycle is skipped. Two skips in a row pause the Paket, and the Pemesan can resume. Hentikan applies from the next unissued cycle. The Paket stops when the Hak Pakai is Berakhir. At a Lokasi set Berhenti, no further cycles are issued from the Berhenti decision and the families are told; until the effective date the Lokasi otherwise behaves as Ditangguhkan. A new tariff applies from the next cycle, and the H-7 message says so.
   - **Mitra Jasa**:
     - Profile: KTP, NIK, photo, home area, bank account (name must match the KTP or carry an override note), arrangement scan, optional emergency contact (no NPWP), coverage lists (DKI TPUs, Layanan), Tidak tersedia ranges, status Aktif / Ditangguhkan / Berhenti, "Baru" badge until 5 Selesai, 90-day scorecard (Selesai, Terlambat, Keluhan upheld, declines / Tidak direspons, average Penilaian).
     - Hand assignment through a hard-filtered picker. Accept deadline: 12 h or H-1 18:00, whichever is sooner. No answer counts as a decline (Tidak direspons).
     - On suspension or ending, Dijadwalkan jobs are unassigned and in-progress jobs are listed for Admin Platform. The Pemesan is notified only if the target date moves.
     - Pay: a redo by the same Mitra Jasa after an upheld Keluhan is unpaid, and the original job's Pencairan is released when the redo proof is approved. A redo by another Mitra Jasa (the first is Ditangguhkan / Berhenti, or Admin Platform picks someone else) is paid at the normal rate and the original Pencairan is cancelled. Terlambat but done: full rate. Cancelled for lateness: no Pencairan. Reassigned: only the Mitra Jasa who does the job is paid.
     - The Pemesan sees the first name and photo.
   - **Message thread** per Pekerjaan Layanan (text + photos). Each new message notifies the Pemesan by email with a reply link. It closes when the Keluhan window ends. Admin Platform can read and post.
10. **Billing**
    - **Tagihan**
      - One per payment moment, immutable. Changes are made by cancelling and reissuing.
      - Addressed to the Pemesan, or to the Pemegang Hak for a Perpanjangan. Anyone may pay.
      - Lines carry provider attribution (the Lokasi Mitra for its tariff lines). A Harga Khusus appears as a negative "Penyesuaian Harga Khusus" line.
      - Kind: pay-first or pay-after. A Tagihan has one due date, the earliest of its lines. Hari-H Layanan lines on a Saat Duka Tagihan are pay-after and take its due date, so that Tagihan stays pay-after. Layanan added at a Perpanjangan checkout likewise take the Perpanjangan due date (their target dates are constrained instead). Layanan on a burial-under-an-existing-Hak-Pakai Tagihan likewise take its due date (the burial has already happened, as for Saat Duka; confirmed 2026-09-26). A reissued Tagihan (cancel and reissue, e.g. for a Harga Khusus) keeps the original due date, so a reissue never extends the time to pay. A Rp 0 Tagihan is Lunas at issue, with its Bukti Pembayaran. Online payment in v1 is QRIS only, and Bank Indonesia caps QRIS at Rp 10.000.000 per transaction: a Tagihan above that has no Bayar button in v1 and shows the Operator's bank account for a transfer, which Admin Platform records as a manual payment (ticket 30); Virtual Account is not in v1 (decided 2026-09-26). A late payment is judged by the provider's payment time against the due date, never by whether the lapse tick has run: a pay-first Tagihan paid after its due date becomes a Pembayaran Perlu Ditinjau (Admin Platform accepts it if the plots are still free, or refunds it); one paid on time but reported after the Tagihan was cancelled also becomes a Pembayaran Perlu Ditinjau; the same rule applies to manual payments (decided 2026-09-26).
      - Statuses: Belum Dibayar / Lunas / Lewat Jatuh Tempo / Tidak Tertagih / Dibatalkan, plus Dikembalikan sebagian / penuh.
      - Pay-first Tagihan lapse to Dibatalkan at the due date. Pay-after Tagihan become Lewat Jatuh Tempo, with the clock counted from the **recorded** burial date. The printed due date of a Saat Duka Tagihan comes from the planned burial date at confirmation; the Tagihan is not reissued if the recorded date differs.
    - **Due rules by kind**:

      | Tagihan | Kind | Due |
      |---|---|---|
      | Saat Duka checkout (Lokasi Mitra, DKI TPU), incl. its hari-H Layanan | pay-after | 3×24 h after the burial (per Lokasi) |
      | Burial under an existing Hak Pakai | pay-after | 3×24 h after the recorded burial |
      | Pemesanan Terencana | pay-first | hold expiry |
      | Perpanjangan (Lokasi Mitra), filing-only Pengurusan | pay-first | 3×24 h after issue |
      | Standalone Layanan / Layanan at a non–Saat Duka checkout | pay-first | the earlier of 24 h after issue or the last lead-time day (target date minus the Layanan's lead time, at 23:59 WIB; e.g. target the 20th, lead time 3 days → the 17th 23:59) |
      | Paket cycle | pay-first | H-1 (23:59 WIB on the day before the cycle date) |

    - **Payment**: SumoPod webhook, or manual (Transfer manual / Tunai by Admin Platform with proof; "Dibayar langsung ke Lokasi Mitra" by the Admin Lokasi with proof, reversible by Admin Platform), or Rp 0 (Harga Khusus waiver, Lunas at once).
    - Every payment issues exactly one **Bukti Pembayaran** and fires the downstream effects: Bukti Pemesanan / Perpanjangan, Pencairan due, Pekerjaan Layanan scheduled (hari-H Layanan on a Saat Duka Tagihan are already Dijadwalkan at confirmation), Hak Pakai extended or created.
    - **Chasing** (pay-after only): reminders at H+3/7/14/30, stopping as soon as the Tagihan is Lunas or Tidak Tertagih; the overdue list from H+1 with call log (outcome janji bayar / tidak diangkat / menolak / nomor salah); at least two calls, around H+1 and around H+14 (08:00–20:00); the Admin Lokasi adds its notes on the same call log; Tidak Tertagih declared by hand from H+30 after at least one call. The Tagihan stays payable afterwards.
    - **Tidak Tertagih loss**: at a Lokasi Mitra the Lokasi loses its tariff and the Operator its Biaya Layanan Platform; neither owes the other, and no Pencairan is due unless the family pays later. Hari-H Layanan on that Tagihan are lost by their fulfiller like the Petak tariff (a Mitra Jasa at a TPU is still paid by the Operator, which bears TPU losses).
    - While a Lokasi Mitra Saat Duka Tagihan is overdue: Perpanjangan and Ganti Pemegang Hak are blocked. Once it is Tidak Tertagih the Admin Lokasi may end the Hak Pakai (not for a burial under an existing Hak Pakai).
    - **Refunds**: always approved by Admin Platform, then a manual transfer with proof, issuing a Bukti Pengembalian Dana. Goodwill refunds the Operator chooses to give come from its own funds and are never netted as a Potongan, so each refund records whether it is netted from the partner or Operator-funded.
    - Whether the Biaya Layanan Platform is refunded:

      | Case | Biaya Layanan Platform |
      |---|---|
      | The Pemesan cancels | kept |
      | The fault lies with the Lokasi, the Mitra Jasa or the Operator (Terlambat cancellation, Berhenti leftovers) | refunded |

      Refunds of amounts already paid out to a Lokasi become Potongan.
    - **Documents**: Tagihan, Bukti Pembayaran, Bukti Pemesanan (right only, no amounts, in the Lokasi Mitra's name), Bukti Perpanjangan, Bukti Pengembalian Dana, Bukti Pencairan.
      - Each is a web page on an unguessable link, with "Unduh PDF" and a PT Jaya Korpora Prima header, listed in Akun Saya (or the partner back office), with its link sent by message.
      - Bukti Pembayaran repeats the Tagihan's lines plus amount, method, time, reference and Nomor Tagihan; a direct payment reads "diterima oleh Lokasi Mitra X"; a Rp 0 Tagihan uses method "Tanpa pembayaran (Harga Khusus)".
      - Bukti Perpanjangan: Petak Makam, Pemegang Hak, old and new end dates and the terms bought.
      - Bukti Pengembalian Dana: references the Tagihan, lists the refunded lines and whether the Biaya Layanan Platform was kept, and attaches the transfer proof.
      - Sequential numbers per type per year: `TGH/2026/000123`, `BYR/…`, `RFD/…`, `BKP/…`, plus `BPM/…` (Bukti Pemesanan) and `BPP/…` (Bukti Perpanjangan) chosen here.
      - Nomor Pemesanan format chosen here: `MKM-2026-000123`, one series for every order kind.
11. **Payouts**
    - **Pencairan items** become due per order / job:

      | Item | Due when |
      |---|---|
      | Saat Duka Petak and a later burial's Biaya Pemakaman | Lunas **and** Pemakaman recorded |
      | Terencana Hak Pakai | end of the Masa Pembatalan, or the first Pemakaman if sooner |
      | Perpanjangan | on payment |
      | Layanan (Lokasi Mitra or Mitra Jasa) | Lunas **and** the Keluhan window closes with no Keluhan, a Keluhan is rejected, or the redo proof is shown (hari-H Layanan on a Saat Duka Tagihan included; a Mitra Jasa's hari-H Layanan at a TPU does not wait for Lunas) |

    - Amount: the partner's tariff, or the Mitra Jasa rate, unless Admin Platform overrides it after a Keluhan (with a note). A Harga Khusus is borne by the Operator (from the Biaya Layanan Platform first, then its own funds) unless a partner share is recorded: Admin Platform may enter on the order the amount the Lokasi Mitra agreed to bear, with a required note (default 0); a non-zero partner share lowers that order's Pencairan.
    - "Dibayar langsung" means no tariff Pencairan and a platform-fee Potongan.
    - **Potongan**: every amount a Lokasi Mitra owes becomes a negative line with a reason and link. It carries forward. After 60 days or on Berhenti it becomes an offline request that Admin Platform records when paid. Never applied to Mitra Jasa.
    - **Pencairan run**: one row per recipient with due items minus Potongan. Items can be held out with a reason. Admin Platform transfers by hand, uploads the proof and enters the date, which issues one Bukti Pencairan. The Mitra Jasa version shows only job, Layanan, date and rate. Due within 2 working days.
    - On Berhenti: pending Pencairan for finished work is paid net. Held Terencana Pencairan is released except for Pemesan still inside their Masa Pembatalan who cancel, who are refunded.
12. **Wakaf**
    - Pengajuan Wakaf fields: Tujuan sosial / keluarga (+ family name), Wakif name / phone number / relationship, land kab/kota, address, pin, m², proof type, and Nazhir (a list entry or free text).
    - Optional documents.
    - An automatic Dirujuk flag outside Jabodetabek.
    - Manual statuses: Diajukan → Ditinjau → Survei Dijadwalkan (date) → Menunggu Ikrar (KUA date) → Proses Sertipikat → Selesai (AIW / certificate scan), plus Ditolak (reason), Dirujuk and Dibatalkan (by the Wakif until Menunggu Ikrar).
    - Notes to the Wakif are separate from internal notes. Internal notes and the Survei Wakaf report stay internal (hidden from the Wakif).
    - A new Pengajuan Wakaf sends no staff alert; it appears as a Tier 3 Antrean row.
    - **Nazhir list**: name, type, kab/kota, contact, BWI number. Nazhir have no login.
    - No money of any kind.
13. **Field Work (Tugas Lapangan)**
    - Types: Ambil surat pengantar (auto-created on TPU Saat Duka confirmation, and for a Pengurusan IPTM only once its Tagihan is Lunas), Berkas IPTM, Kunjungan Verifikasi, Survei Wakaf, Cek Denah.
    - Each has a subject, address + pin, planned date, one assignee and a type-specific form with required uploads. Selesai is gated on those uploads.
    - A completed Kunjungan Verifikasi updates the Lokasi's pin, photos, facilities and "dikunjungi" date. A completed Cek Denah feeds the Terencana switch.
14. **Work Queues**
    - **Antrean** (Admin Platform) and **Antrean Lokasi** (per Lokasi Mitra) are **projections of domain state**. Each row type is a query plus a deadline rule. Rows are never created by hand and close when the state moves on.
    - Antrean tiers:
      - Tier 1: Konfirmasi TPU Saat Duka (2 service hours); Konfirmasi Lokasi terlambat; Saat Duka ditolak (call within 2 h); Keluhan (first response in 4 daytime hours, i.e. 06:00–18:00 WIB, decided within the window); jobs due today without a Mitra Jasa.
      - Tier 2: foto bukti approval (24 h); Terlambat; jobs Tidak direspons / Ditolak / flagged for reassignment; failed money-message calls; "Telepon Pemesan" (a family must act and email is not enough: a Saat Duka Tagihan Lewat Jatuh Tempo, a Hak Pakai nearing its end, or any such message on an order with no email; ADR 0004; a declined order keeps its Tier 1 call); unassigned or overdue Ambil surat pengantar.
      - Tier 3: refund transfers (2 working days after approval); Pencairan (2 working days after due); IPTM filing (7 days); TPU filing-only document check (1 working day) and filing (3 working days after Lunas); past-grace TPU check; Tagihan lewat jatuh tempo; Pengajuan Wakaf (first contact in 3 working days; no alert); Konfirmasi Terencana terlambat; Pembatalan refund approval (2 working days); Setor Retribusi (2 working days after Lunas, only for a non-zero Retribusi Pemda line). Admin Platform working days per 3. Lokasi.
      - Tier 4: TPU flag stale for 14 days; Lokasi revisits and publish-gate checks (only after Admin Platform presses "Minta kunjungan ulang" on a Lokasi Mitra, which creates the Kunjungan Verifikasi Tugas Lapangan; no automatic schedule in v1); Mitra Jasa onboarding; monthly scorecard review; other Tugas Lapangan.
    - Ambil soft claims, Bertugas (who is Bertugas now is shown at the top of the Antrean; switching it on needs at least one active Perangkat Push, ADR 0004), and escalation at 30 min and 90 min; a red banner shows in the header of every staff page while any Tier 1 row is untaken (no call row: the platform cannot place calls, and whoever missed the push and email would miss the row too; decided 2026-09-26). Night TPU rows alert at 06:00. Tier 3–4 rows never alert.
    - Antrean Lokasi:
      - Mendesak: Konfirmasi Saat Duka; Layanan due today; Kerjakan ulang.
      - Lainnya: Konfirmasi Terencana; Periksa dokumen Perpanjangan; Layanan upcoming / Terlambat; Catat Pemakaman; Ganti Pemegang Hak / Pembatalan / Pengembalian requests; Hak Pakai in masa tenggang; failed Lokasi-message calls; Petak Perlu Verifikasi.
    - The Antrean Lokasi has rows only: no Ambil claims, tiers or Bertugas, and Catatan Internal stay hidden from Admin Lokasi. The Admin Platform Antrean has Catatan Internal threads, a counter strip and the Laporan.
15. **Notifications**
    - One module decides recipient, channel, template and timing for every domain event. It sends through the pg-boss worker.
    - Exception: the Kode Masuk does not go through this module. Identity & Access sends it directly through EmailSender (decisions 2026-09-25, ADR 0004), so it creates no message-log entry, is never retried automatically and raises no Antrean row; the person sees "gagal kirim" and can retry.
    - Channels (ADR 0004): **v1 sends nothing through WhatsApp** (no WhatsApp Business API, no Meta / kirim.dev, no WhatsAppSender; unofficial QR-paired gateways such as Fonnte, Wablas, WAHA stay banned). Families get email; when a family must act and email is not enough, a "Telepon Pemesan" row in the Antrean has a person call (the chain is email, then a call row). Staff get Peringatan Staf by web push to every Perangkat Push and by email. The Operator pays every message and never charges Lokasi Mitra, Mitra Jasa or families. No marketing messages. Undangan Staf go by email. Every email goes through EmailSender on the SumoPod SMTP relay (no SES in v1). There is no SMS channel.
    - Reminders to families go out 08:00–20:00 WIB. Transactional messages and new-order alerts go out at any hour.
    - Retries: 3 with backoff. After that, a phone-call row in the owning queue: money subjects go to Admin Platform, Lokasi work subjects to the Admin Lokasi. Kode Masuk failures create no row. Failed staff alerts are not escalated beyond web push, email and the Antrean.
    - Every message is logged with its status on its order (the Kode Masuk excepted, see above).
    - ~~The OTP uses Meta's authentication template and arrives only on the phone (not WhatsApp Web or Desktop).~~ (removed 2026-09-26, ADR 0004).
    - A new Saat Duka order alerts every Admin Lokasi of the Lokasi and the Kontak Siaga by web push + email at any hour, and again if still unconfirmed after 1 h of Jam Operasional.
    - Reminder schedule:

      | Reminder | When |
      |---|---|
      | Pay-first Tagihan: Perpanjangan, filing-only Pengurusan, standalone Layanan / Layanan at a non–Saat Duka checkout | on issue, H-1 and on the due day |
      | Pemesanan Terencana Tagihan | once, about 4 h before the hold expires |
      | Paket cycle Tagihan | H-7 (on issue) and H-1 |
      | Pay-after Tagihan: Saat Duka (Lokasi Mitra, DKI TPU), burial under an existing Hak Pakai | H+3, H+7, H+14, H+30 |
      | Hak Pakai end (to the Pemegang Hak and the Admin Lokasi) | 60, 30 and 7 days before, then weekly in the masa tenggang |
      | IPTM expiry | 3 months and 1 month before |
      | Admin Lokasi push on an overdue Tagihan | H+1 and on Tidak Tertagih |

      Each Tagihan follows exactly one of the four Tagihan rows, by its kind; rules never stack. All go out within 08:00–20:00 WIB.

    - ~~Inbound WhatsApp messages get an auto-reply pointing to the CS number (from Pengaturan Operator).~~ (removed 2026-09-26, ADR 0004): there is no WhatsApp number on the API; CS answers its own WhatsApp Business app. There is no inbox.
16. **Scheduler**
    - Worker jobs are thin wrappers around domain **tick functions** that take "now" from the Clock and act on the state due at that time:
      - expire holds and pay-first Tagihan
      - issue Paket cycles, then skip cycles and pause Paket
      - Terlambat flags
      - Keluhan window closes, which trigger Pencairan due and thread closing
      - reminders
      - Antrean escalations and re-alerts
      - Bertugas auto-off
      - Berhenti effective dates
      - Masa Pembatalan ends
      - Mitra Jasa accept deadlines
      - Potongan ageing (60 days)
      - "Catat Pemakaman" prompts
    - Every tick is idempotent, so running one twice is harmless.
17. **Pengaturan Operator** (Operator settings)
    - One Admin Platform–only screen, audited, for the reference values no other screen owns:
      - the Operator's legal name, registered address and contact (phone, email), used by every Tagihan / Bukti header and the Hubungi Kami page;
      - the CS WhatsApp number and its reply hours (e.g. "dibalas mulai pukul 06:00"), used only for `wa.me` links and display (ADR 0004): the CS button, the "Tidak punya email? Minta bantuan CS" pointer, Hubungi Kami and the night TPU submission text. The platform sends nothing through it.
    - An issued Tagihan or Bukti keeps the header values in force when it was issued.
    - The other reference values live on their owning screens, all entered by Admin Platform in the dashboard and never seeded: Biaya Layanan Platform (Tariffs); DKI Biaya Pengurusan and the DKI TPU list (Tariffs, Lokasi > TPU); DKI Layanan prices and Mitra Jasa rates (Layanan catalog, Tariffs); the Nazhir list (Wakaf); the holiday list (Lokasi > Working days).
    - Content page copy stays in code.

### Public site and routing decisions

- **Home**: the headline "Urus Pemakaman dengan Tenang, dalam Satu Platform." (the brand master message, amended 2026-09-26) with the primary CTA "Pesan Makam"; (decided 2026-09-26, with the brand) a Forest hero: the headline in Lora, the tagline "Menemani Keluarga, Menjaga Kenangan.", a Sand primary button "Pesan makam sekarang" (Saat Duka, captioned "untuk keluarga yang baru saja kehilangan") and a text link "Siapkan makam untuk nanti" (Terencana), beside a warm photograph; the top-bar "Pesan Makam" goes to the same Saat Duka entry; the four tiles from the spec (Perpanjang Makam, Layanan Makam, Urus di TPU DKI, Wakaf Tanah) as large rounded photo cards; the trust strip as three columns headed Dibantu · Jelas · Aman, each with one concrete line (bantuan administrasi termasuk berkas TPU; harga di halaman sama dengan Tagihan; Lokasi terverifikasi dan data keluarga dijaga) linking to Cara Kami Bekerja; the Saat Duka / Terencana hero; the tile row; the trust strip; and a CS link.
- **Booking wizards** (prototype 18 variant D): one decision per screen, a progress bar with back, a sticky total bar and no review screen.
  - Saat Duka: Pilih makam → Data & kirim.
  - Terencana: Lokasi → Petak → Data & kirim.
  - Burial under an existing Hak Pakai: from the Makam keluarga hub → Data & kirim.
  - A required email field (with the Kode Masuk at Kirim, prefilled and skipped when logged in) and a phone field sit on the "Data & kirim" screen of the Saat Duka and Terencana wizards, the TPU order, the Perpanjangan checkout and the standalone Layanan checkout, and on every other order screen (burial under an existing Hak Pakai, Pengurusan IPTM, Perpanjangan TPU, TPU Layanan order, Paket Layanan order). (Amended 2026-09-26, ADR 0004: was optional; below it, "Tidak punya email? Minta bantuan CS".)
  - Lokasi pages deep-link into the wizards with the Lokasi preselected.
- The **Makam keluarga hub** owns the Lokasi Mitra / TPU branch for tumpang, Perpanjang, Layanan and Pengurusan IPTM. The Perpanjang Makam and Layanan Makam tiles open it with that action preselected. Heirs of a deceased Pemegang Hak start from its lookup. Logged-in users see shortcuts to their Makam tab.
- **After a Tolak**, the Pilih makam list opens with a banner, the rejecting Lokasi removed and the family's data prefilled.
- **Map / pin provider** (left to the spec): Leaflet with OpenStreetMap tiles for display and a draggable pin for entry. No geocoding API in v1; the address is free text. Chosen as the boring, free, no-key option. It sits behind a small component so tiles can be swapped.
- **Content pages** written for v1:
  - **Tentang Kami**: what makam.co.id is; run by PT Jaya Korpora Prima; owns no land and works with partner cemeteries and DKI TPUs. No YIEM.
  - **Cara Kami Bekerja**: the three trust claims, each a section:
    - what a Kunjungan Verifikasi checks and the publish gate;
    - the price on the page equals the Tagihan, with the Biaya Layanan Platform always shown separately;
    - the TPU permit is free, families may file it themselves, and the Operator's fee is for convenience.
  - **Pengurusan di TPU DKI**:
    - the DIY guide (sequence: TPU on the day → surat pengantar → JakEVO / PTSP, free);
    - the two Biaya Pengurusan amounts;
    - the DKI Layanan price list;
    - entries to Saat Duka TPU, Perpanjang IPTM and "Sudah dimakamkan? Kami urus IPTM-nya".
  - **Wakaf Tanah**: the process in plain words, the "never land or money" line, and the form.
  - **FAQ**: booking vs Hak Pakai; what is paid when; Pembatalan; Perpanjangan; TPU eligibility; documents; data use.
  - **Hubungi Kami**: CS WhatsApp (`wa.me` link) and phone, and the Operator's address (values from Pengaturan Operator).

### Data and privacy decisions

- Family personal data (KTP, KK, death certificates, heirship letters) is stored only in the private bucket and shown to roles by need:
  - Admin Lokasi: their own Lokasi's orders; never Pengajuan Wakaf.
  - Petugas Lapangan: their assigned cases.
  - Mitra Jasa: never.
- Wakaf survey reports and internal notes stay with Admin Platform. Mitra Jasa and Petugas Lapangan see no audit log.
- ~~WhatsApp (Meta) is the only known flow of data out of Indonesia.~~ (removed 2026-09-26, ADR 0004): WhatsApp is not used, so Meta is no longer a flow. Error monitoring (GlitchTip) is self-hosted on the Jakarta host. The remaining open question is email (next point).
- Email (addresses, Kode Masuk, Tagihan / Bukti copies, Undangan Staf) goes through the SumoPod SMTP relay, not AWS SES and not the self-hosted Stalwart. Where SumoPod's relay processes mail is not yet confirmed (ticket 04); until it is, email is not claimed to stay in Indonesia. Files and backups stay in AWS S3 Jakarta.
- Retention and deletion rules are out of scope, but the uploads are treated as personal data.

### Staff UI and design system (decided with the user, 2026-09-26; brand reconciled the same day)

- **Brand source**: the official *MAKAM.CO.ID Brand Guideline (Visual 2026)*, stored at `docs/brand/brand-guideline-visual-2026.pdf`, is the primary source for the design system. It covers the staff area, the public site, PDF documents (Tagihan, Bukti) and email, and it overrides every earlier prototype choice (the "Kamboja" accent, Geist and the frangipani placeholder logo are dropped).
- **Framework**: stay on shadcn/ui (Radix/Base UI + Tailwind v4), completed with its official blocks: Sidebar, Dashboard, Data Table (TanStack Table), Form (react-hook-form + Zod, the same schemas the Server Actions use), Sonner toasts, cmdk command palette, charts via shadcn's Recharts wrapper, `next-themes` for light/dark. No second UI framework (Refine, Mantine, Ant Design rejected: they duplicate or fight the Server Action / domain-module pattern).
- **Design system** in the repo, the single source of truth for staff UI, public UI, documents and email:
  - **colour tokens from the brand palette**: `primary` = Forest `#29483A` (primary buttons, the active nav item, focus); `secondary` = Sage `#8FA99A` (supporting surfaces and secondary elements); Sand `#D8C6A5` in a `highlight` token, used sparingly for highlights and for the public CTA on Forest (as a button, Sand appears only on Forest; on Ivory the primary button is Forest) (shadcn's `accent`, the hover surface of every menu, is only a light Sand tint, so Sand never spreads everywhere); `background` = Ivory `#F7F4ED` with warm off-white cards and popovers, never pure white, so surfaces stay calm against the Ivory ground; `foreground` = Charcoal `#303330`. Semantic success/warning/danger/info stay separate tokens but are muted to sit with the calm palette; the brand's colour proportions are respected;
  - **dark mode** for the staff area only (field and night use), derived from the brand: a very dark Forest ground, Ivory text, Sage and Sand accents. The public site is light only;
  - **typography**: Plus Jakarta Sans for all UI (staff and public), tabular numbers in tables; Lora only for the hero headline and section titles on the homepage and content pages (Tentang Kami, Cara Kami Bekerja), never in wizards, lists, prices, forms or the staff area; Geist Mono only for codes people copy or read out (Nomor Pemesanan, rekening);
  - **logo**: a vector (SVG) master with one-colour and small-icon (favicon / PWA) versions is requested from the brand designer. Until it arrives, the UI uses the wordmark MAKAM.CO.ID in Plus Jakarta Sans bold beside a downscaled raster of the conceptual mark;
  - **icons**: lucide, which matches the brand's 2 px stroke, rounded, minimal style;
  - one status-badge vocabulary mapping every domain status (Belum Tayang, Terverifikasi, Ditangguhkan, Berhenti, Terlambat, Lunas, …) to a colour and label: red only for what needs action now (Terlambat, past a deadline); Berhenti is neutral grey (ended, not an emergency); Dikonfirmasi is green like Lunas; Belum Dibayar is amber;
  - the component inventory (shadcn primitives + makam compositions: `PageHeader`, `DataTable`, `FormSection`, `EmptyState`, `StatCard`, `StatusBadge`, `ConfirmDialog`, `RoleSwitcher`, `LokasiSwitcher`);
  - **imagery** (decided 2026-09-26, "like kamboja.co.id"): the public site is photographic, like kamboja.co.id's layout (a people photo in the hero, a photo on top of each service card, real location photos), within the brand guardrails: natural warm light, calm and respectful (families together, gentle rather than laughing), Indonesian people with modest dress, service shown (staff tending a grave, flowers, a well-kept Lokasi); never a jenazah, coffin close-ups, digging, crying or other heavy grief visuals, and never another company's photos. Lokasi pages and cards use the real Kunjungan Verifikasi photos. Until the Operator's own photos exist (ticket 06), commercially licensed stock is used, recorded with its source and licence, optimised through `next/image`, with Indonesian alt text; the staff area stays photo-free;
  - **voice**: the brand tone (warm, clear, not judgemental) and its guardrails (no hard selling, no uncertain claims, status and limits explained, privacy protected; north star "Dibantu, Jelas, Aman") are writing rules for UI copy, email templates and content drafts (the WhatsApp templates are retired, ADR 0004);
  - documented in `docs/design-system.md` and shown on a live catalogue page, a real staff page for Admin Platform (not development-only).
- **Brand words vs the glossary**: brand and marketing material may use its own words, but the product uses `CONTEXT.md` terms: documents and UI say "Tagihan", never "Invoice"; "pengelola" and "TPS" may describe the audience in marketing, while the product says Lokasi Mitra and Admin Lokasi; the brand's "Verified Partner" ID card is a physical item only, and the UI shows no such badge (Terverifikasi is a listing gate, ticket 24).
- **Shell**: collapsible sidebar with per-role menus; header with breadcrumbs, role switcher, Lokasi switcher (Admin Lokasi), ⌘K command palette, notification bell (web push, ticket 21) and account menu (Keluar). The active menu item is a light Sage-tinted background with semibold Forest text (solid Forest stays reserved for primary buttons). Admin Platform's menu groups: Kerja harian · Lokasi dan harga · Orang · Operator, with Audit Log under Operator. On phones: a sheet sidebar for admins and a bottom navigation for the field roles: Mitra Jasa — Pekerjaan, Pencairan, Peringatan, Akun; Petugas Lapangan — Tugas, Jadwal, Peringatan, Akun. PWA, mobile-first.
- **Style**: calm and modern per the brand ("generous spacing, clear CTA, calm surfaces, transparent status"): comfortable density by default, a compact option only for dense tables; no busy animation. The Antrean deadline bar runs Sage → Sand/amber → muted red, with full red only once Terlambat.
- **Standard page patterns**: list (Data Table with search, filters, pagination, row actions), detail (header, tabs, body), form (sections, inline validation, toast result), queue/dashboard (stat cards + task list); uniform empty, loading (skeleton) and error states.
- **Order**: shell, design system and patterns first; existing staff pages migrate onto them; new pages from later tickets (public pages in tickets 22, 26 and 29 included) use them from the start.
- **Process**: a throwaway clickable prototype (mattpocock-skills:prototype) for the user to react to, restyled to the brand, then tickets on the tracker, each built test-first with the two-axis review.

### Maps on public pages (decided with the user, 2026-09-26, following makam-app)

- Same approach as the frozen makam-app (`Cemetery::googleMapsUrl()` / `embedMapUrl()` in `/home/ubuntu/makam-app/app/Domain/CemeteryDirectory/Models/Cemetery.php`): **keyless Google Maps**, no API key and no billing.
- The Lokasi page embeds `https://www.google.com/maps?q=<lat>,<lng>&output=embed` in a lazily loaded iframe; a **"Petunjuk arah"** link opens `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>` in a new tab (the Google Maps app on phones). The same link sits on Daftar Lokasi cards and on the Bukti Pemesanan.
- Coordinates come from the Lokasi's pin (set by staff with the existing OpenStreetMap pin picker, updated by a Kunjungan Verifikasi). Without coordinates (e.g. a TPU with only a street address) the address text is the query; with neither, no map and no link are shown, and a pin is never invented. The textual address always shows, and a failing map never blocks the page.
- The Content-Security-Policy allows `frame-src https://www.google.com` only for this.
- Loading the embed sends the visitor's browser to Google (outside Indonesia); it is a visitor-side flow, listed with the other data flows. No consent banner (legal compliance is out of scope).
- A map of the whole Daftar Lokasi (it would need the paid Maps JavaScript API) is not in v1.

### Release plan (decided with the user, 2026-09-26)

v1 ships in three releases so the first can go live sooner. Nothing is dropped; later releases follow the same spec.

- **Rilis 1 (go-live)**: Lokasi Mitra Saat Duka and Terencana end to end, with the staff back office, billing, payments, refunds, Pencairan and Laporan, the brand redesign, email as the Akun key, CI/CD, the live adapters (S3, SumoPod payments, SMTP), backups and the `makam.co.id` switch. Tickets 13–17, 19–33, 36–38, 60, 61, 64, 65, 68, 71–83 (plus the resolved foundation).
- **Rilis 2**: the Makam keluarga hub and Perpanjangan (34, 35, 39–42), Layanan and Mitra Jasa (49–57), Lokasi Ditangguhkan / Berhenti (59), the Pintu Masuk cell on the Denah (84).
- **Rilis 3**: DKI TPU (43–48) and Wakaf Tanah (58).
- Until their release, the homepage tiles and menu items for Perpanjang Makam, Layanan Makam, Urus di TPU DKI and Wakaf Tanah show "Segera hadir" with the CS link, and the trust strip makes no claim about TPU paperwork. No Hak Pakai exists on the platform at launch (the Excel import is out of scope), so Perpanjangan is not needed in Rilis 1.
- Next milestone: a family can book Saat Duka on staging (82 → 13–17 → 19–20 → 22–25).

## Testing Decisions

- **What makes a good test**:
  - It drives the system only through a module's public interface and asserts on externally visible outcomes: returned values, state read back through that module or a neighbour's public queries, documents issued, messages recorded by the fake sender, rows in the Antrean projection.
  - It never asserts on table layouts, private helpers or call sequences.
  - Tests are named in glossary terms (e.g. "Saat Duka Tagihan becomes Lewat Jatuh Tempo 3×24 h after the recorded Pemakaman").
- **The seam (confirmed with the user)**: the public functions of the domain modules, run in **Vitest against a real Postgres** (a test container, migrated fresh, no DB mocks), with:
  - an **injected Clock**, so every deadline, hold, reminder window, working-hours calculation and Keluhan window is tested by moving time;
  - **in-memory fakes** of PaymentProvider, EmailSender, WebPush, FileStore and PdfRenderer (the fake payment provider can emit signed webhook payloads);
  - **scheduler tick functions** called directly with the fake clock, so worker behaviour is tested without pg-boss timing. One smoke test checks the pg-boss wiring.
- **Modules to cover** (all of them; the heaviest first):
  - **Billing**: due-date rules per Tagihan kind; the earliest-due rule for mixed Tagihan; lapse vs chase; Tidak Tertagih guard (H+30 + a call); manual / direct / Rp 0 payments; Harga Khusus lines; immutability; document numbering; refund Biaya Layanan Platform rules.
  - **Payouts**: each Pencairan due trigger; Potongan netting, carry-forward and 60-day ageing; batching into one Bukti Pencairan; hold-out; Berhenti release; Mitra Jasa never clawed back.
  - **Inventory**: derived Petak / kavling status; Perlu Verifikasi gating; tenure clock from the first Pemakaman; Perpanjangan end-date arithmetic; masa tenggang; tumpang policy; kavling indivisibility; no delete after use.
  - **Pemesanan (Lokasi Mitra)**: full Saat Duka, Terencana and further-burial tracks, including alternatif / Tolak, cancellation effects, consent resolution, Ditangguhkan / Berhenti blocking.
  - **Perpanjangan**: each verification path, the 30-day approval validity, and blocking by an overdue Tagihan.
  - **Pengurusan**: the three TPU order kinds; eligibility; pay-after vs pay-first; PTSP rejection refund; Makam TPU creation and tumpang update; the 06:00–18:00 paused clock.
  - **Layanan**: lead time, H-1 cancellation, Terlambat, the Keluhan window start at the Lokasi vs the TPU, redo / refund effects on Pencairan, Paket cycles / skip / pause / stop, Mitra Jasa assignment filters and the accept deadline.
  - **Tariffs**: the all-in quote and versioning by effective date.
  - **Lokasi**: publish gate, Terencana switch, working-time calculator (Jam Operasional, closures, overnight pauses).
  - **Work Queues**: the right rows appear with the right deadlines and tiers and close themselves; escalation timing.
  - **Notifications**: recipients, the 08:00–20:00 window, retry → email → call row routing by subject.
  - **Identity & Access**: the Kode Masuk by email creating an Akun for an unknown email (at Kirim and on Masuk) and logging into an existing one, with its limits per email and per IP; the same reply for every email; Verifikasi email changing the Email Terverifikasi and its uniqueness; the phone number as an unverified contact; Undangan Staf accepted by the Akun with that email; Pemulihan Akun (KTP check, audited); attaching a CS-submitted order by Nomor Pemesanan; role visibility rules; TOTP for Admin Platform; Pemegang Hak code skip when logged in with the recorded email (ADR 0004).
  - **Wakaf**: status transitions and Dirujuk.
  - **Field Work**: Selesai gated on uploads, and the auto-created pickup task.
  - **Audit Log**: every staff write logged, and the Admin Lokasi view filter.
- **End-to-end**: a thin **Playwright** layer on the critical paths (ticket 12), plus short UI smoke tests where a build ticket explicitly asks for one (amended 2026-09-25, user decision; each spec file stays fast and does not repeat unit/domain coverage):
  1. Pemesanan Saat Duka at a Lokasi Mitra from the Pilih makam list through the email Kode Masuk at Kirim, Admin Lokasi confirmation and payment to the Bukti Pemesanan.
  2. The SumoPod webhook marking a Tagihan Lunas (signed payload against the running app).
  3. A Pencairan run producing a Bukti Pencairan.
- **Prior art**: none in this repo yet (no code). The Vitest-against-real-Postgres and Playwright choices come from ticket 12. The frozen Laravel makam-app is reference for domain behaviour, not for test style.

## Out of Scope

- Open self-serve onboarding for third-party cemetery operators (later marketplace phase).
- Legal and regulatory compliance: payment licensing, Nazhir status, PP 9/1987 commercial limits, Perda permits, PSE registration with Komdigi, PPN and tax treatment, UU PDP retention / privacy notice / account deletion.
- Commission on partner tariffs and partner subscriptions. v1 earns only the Biaya Layanan Platform, the Biaya Pengurusan and the TPU Layanan margin.
- Down payments, platform-run cicilan, vouchers and keringanan flows. Hardship is handled by a manual Harga Khusus.
- A second payment gateway with payout / refund APIs, auto-debit for Paket Layanan and automatic Pencairan.
- TPUs outside DKI (Bogor, Depok, Tangerang, Bekasi) and non-partner private cemeteries.
- Pemesanan Terencana at any TPU.
- Native mobile apps, offline mode for field staff, auto-dispatch or a job board for Mitra Jasa, route planning.
- Public reviews / ratings and order counters on Lokasi pages.
- A two-person approval rule for refunds and Pencairan.
- Marketing messages, an in-platform WhatsApp inbox, charts / BI dashboards.
- WhatsApp Business API (Meta / kirim.dev) and the WhatsAppSender port — out of v1 (ADR 0004). Also out: any WhatsApp or SMS Kode Masuk and any phone-number login.
- Wakaf money of any kind (fees, wakaf uang, donations) and any link from a finished wakaf to Lokasi Mitra onboarding.
- Shared family access to orders beyond the Pemesan and the Pemegang Hak.
- Self-serve Ganti Pemegang Hak (only a request; the Admin Lokasi performs it) and self-service account recovery.
- A cancellation fee on Saat Duka orders.
- Scheduled Lokasi revisits (Admin Platform orders them ad hoc).

## Further Notes

- **Cutover** from the frozen Laravel app on `makam.co.id` is no longer deferred: it is the gated nginx switch in the production deploy (see Architecture). Before the switch, the Operator must answer whether any data from the old app (users, orders, Lokasi, payments) is carried over or archived.
- **Deferred but required later**:
  - **Excel import** of a Lokasi Mitra's existing Petak and Hak Pakai. The requirement and the Perlu Verifikasi behaviour are in this spec. The template is designed with the first partner. Until then the Denah clearing flow is how records get in.
- **Pre-launch checklist**:
  - These are requirements, not design:
    - ~~Meta Business verification for PT Jaya Korpora Prima (akta, NIB, NPWP).~~ (removed 2026-09-26, ADR 0004).
    - ~~Checking kirim.dev's support for `data_localization_region=ID` before registering the new API number.~~ (removed 2026-09-26, ADR 0004).
    - Email sending on the SumoPod SMTP relay (replaces SES, decision 2026-09-25): `makam.co.id` added under SumoPod's "Custom Domain", its DKIM, SPF and `sumo-verification` records published and verified, a DMARC record published, and SMTP credentials for v1 stored (ticket 04). It carries the Kode Masuk and every family message, so it and the live SMTP EmailSender adapter (ticket 68) are launch requirements (ADR 0004).
    - The DNS A record `errors.makam.co.id` → 103.92.214.243 and the GlitchTip set-up.
    - Every reference value entered by Admin Platform in the dashboard (Pengaturan Operator and the owning screens).
    - Every vendor account in PT JKP's name, including the domain registrant.
    - Backup restore test.
    - External uptime alarm.
  - PSE registration is mandatory but out of scope as legal compliance.
- **Defaults chosen in this spec** (the map left these to the spec writer):
  - Leaflet + OpenStreetMap for pins.
  - Nomor Pemesanan `MKM-YYYY-NNNNNN`.
  - Bukti Pemesanan `BPM/YYYY/NNNNNN`, Bukti Perpanjangan `BPP/YYYY/NNNNNN`.
  - Status names as listed per module above, including the "Belum Tayang" Lokasi Mitra status before publishing.
  - The Pembatalan refund approval row in Tier 3 (since confirmed with the user in ticket 22's spec review).
- **Operational staffing the design assumes**:
  - A daily Admin Platform rota 06:00–18:00 including weekends, kept outside the platform.
  - At least one Admin Lokasi per Lokasi Mitra who can be Kontak Siaga.
- **Suggested build order** (for breaking this spec into tickets):
  1. Identity & Access, Audit Log, adapters and Clock.
  2. Lokasi, Tariffs and Inventory (Denah).
  3. Billing with SumoPod.
  4. Saat Duka at a Lokasi Mitra end to end.
  5. Work Queues and Notifications.
  6. Payouts.
  7. Terencana and further burials.
  8. Perpanjangan.
  9. TPU Pengurusan.
  10. Layanan and Mitra Jasa.
  11. Wakaf.
  12. Content pages.
- **Brand**: "Makam.co.id" everywhere. The legal name appears in the footer, document headers, Tentang Kami, Hubungi Kami, the FAQ answer on who receives payment, and the anti-perantara note on the Pengurusan di TPU DKI page. YIEM appears nowhere.
