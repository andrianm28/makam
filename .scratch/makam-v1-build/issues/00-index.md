# makam.co.id v1 build: ticket index

Spec: [../../makam-v1/spec.md](../../makam-v1/spec.md). 62 tickets: 5 ready-for-human (02–06), 57 ready-for-agent. Numbers follow dependency and value order; human tickets are numbered early because of vendor lead times. Only the real-adapter and production tickets (07, 60, 61, 62) are blocked by them.

## Tickets

| # | Title | Status | Blocked by |
|---|---|---|---|
| [01](01-walking-skeleton.md) | Walking skeleton: app, worker, CI, test harness | ready-for-agent | — |
| [02](02-infra-accounts-vps-domain-github-sentry.md) | Infrastructure accounts: VPS, domain, GitHub, Sentry | ready-for-human | — |
| [03](03-aws-s3-and-ses-jakarta.md) | AWS Jakarta: private S3 buckets and SES domain | ready-for-human | — |
| [04](04-sumopod-merchant-account.md) | SumoPod merchant account for PT Jaya Korpora Prima | ready-for-human | — |
| [05](05-whatsapp-and-sms-vendors.md) | WhatsApp (Meta + kirim.dev) and SMS (Zenziva) vendor setup | ready-for-human | — |
| [06](06-operator-facts-and-reference-data.md) | Operator facts and launch reference data | ready-for-human | — |
| [07](07-production-environment.md) | Production environment: deploy, backups, uptime alarm | ready-for-agent | 01, 02, 03 |
| [08](08-whatsapp-otp-login.md) | WhatsApp OTP login and the Pemesan account | ready-for-agent | 01 |
| [09](09-staff-access-totp-and-audit-log.md) | Staff access: roles, invites, TOTP and the Audit Log | ready-for-agent | 08 |
| [10](10-lokasi-mitra-onboarding.md) | Lokasi Mitra onboarding record and Admin Lokasi invites | ready-for-agent | 09 |
| [11](11-jam-operasional-and-working-time.md) | Jam Operasional, Kontak Siaga and the working-time calculator | ready-for-agent | 10 |
| [12](12-tariffs-and-all-in-quote.md) | Versioned tariffs and the all-in price quote | ready-for-agent | 10 |
| [13](13-denah-builder.md) | Denah builder: bloks, Petak Makam and Kavling Keluarga | ready-for-agent | 12 |
| [14](14-petak-clearing-and-availability.md) | Petak clearing, derived status and availability | ready-for-agent | 13 |
| [15](15-tugas-lapangan-kunjungan-and-cek-denah.md) | Tugas Lapangan, Kunjungan Verifikasi and Cek Denah | ready-for-agent | 13 |
| [16](16-publish-gate-and-lokasi-pages.md) | Publish gate, Terencana switch, Lokasi Mitra page and Daftar Lokasi | ready-for-agent | 11, 12, 14, 15 |
| [17](17-admin-platform-antrean.md) | Admin Platform Antrean framework | ready-for-agent | 16 |
| [18](18-tagihan-and-documents.md) | Tagihan, document numbering and document pages | ready-for-agent | 12 |
| [19](19-payment-through-provider-port.md) | Payment through the PaymentProvider port and Bukti Pembayaran | ready-for-agent | 18 |
| [20](20-notifications-core.md) | Notifications module core | ready-for-agent | 17, 18 |
| [21](21-staff-pwa-and-web-push.md) | Staff PWA install and web push | ready-for-agent | 09 |
| [22](22-saat-duka-wizard.md) | Pemesanan Saat Duka wizard at a Lokasi Mitra | ready-for-agent | 16 |
| [23](23-antrean-lokasi-and-saat-duka-confirmation.md) | Antrean Lokasi and Saat Duka confirmation | ready-for-agent | 18, 20, 21, 22 |
| [24](24-saat-duka-alternatif-tolak-and-cancellation.md) | Saat Duka alternatif, Tolak and cancellation | ready-for-agent | 23 |
| [25](25-pemakaman-bukti-pemesanan-and-selesai.md) | Catat Pemakaman, Bukti Pemesanan and Saat Duka Selesai | ready-for-agent | 19, 23 |
| [26](26-public-site-shell-and-content-pages.md) | Public site shell, homepage and content pages | ready-for-agent | 22 |
| [27](27-akun-saya.md) | Akun Saya: Perlu tindakan, Pesanan and Makam tabs | ready-for-agent | 25 |
| [28](28-bertugas-and-tier-1-escalation.md) | Bertugas, Tier 1 alerts and escalation | ready-for-agent | 21, 24 |
| [29](29-pay-after-tagihan-chasing.md) | Chasing overdue pay-after Tagihan and Tidak Tertagih | ready-for-agent | 25 |
| [30](30-manual-payments-and-harga-khusus.md) | Manual payments, direct payment to the Lokasi and Harga Khusus | ready-for-agent | 25 |
| [31](31-refunds-and-bukti-pengembalian-dana.md) | Refunds and Bukti Pengembalian Dana | ready-for-agent | 24 |
| [32](32-pencairan-potongan-and-bukti-pencairan.md) | Pencairan, Potongan and Bukti Pencairan | ready-for-agent | 25, 31 |
| [33](33-laporan-and-transfer-list.md) | Monthly Laporan and weekly outgoing transfer list | ready-for-agent | 29, 32 |
| [34](34-makam-keluarga-hub-and-lookup.md) | Makam keluarga hub and grave lookup | ready-for-agent | 14, 26 |
| [35](35-burial-under-existing-hak-pakai.md) | Burial under an existing Hak Pakai, with consent | ready-for-agent | 25, 34 |
| [36](36-terencana-wizard.md) | Pemesanan Terencana wizard with Denah picker and plot hold | ready-for-agent | 16 |
| [37](37-terencana-confirmation-and-payment.md) | Terencana confirmation, payment hold and Aktif | ready-for-agent | 23, 32, 36 |
| [38](38-pembatalan-terencana.md) | Pembatalan of a paid Pemesanan Terencana | ready-for-agent | 31, 37 |
| [39](39-pengembalian-ganti-pemegang-hak-calon-penghuni.md) | Pengembalian Hak Pakai, Ganti Pemegang Hak and Calon Penghuni | ready-for-agent | 27, 29, 38 |
| [40](40-perpanjangan-otp-path.md) | Perpanjangan at a Lokasi Mitra: OTP path and Bukti Perpanjangan | ready-for-agent | 29, 32, 34 |
| [41](41-perpanjangan-manual-paths.md) | Perpanjangan manual paths: KTP, heir and claim | ready-for-agent | 40 |
| [42](42-hak-pakai-expiry-and-manual-ending.md) | Hak Pakai expiry reminders, masa tenggang and manual ending | ready-for-agent | 40 |
| [43](43-dki-tpu-catalog-and-pages.md) | DKI TPU catalog, prices and pages | ready-for-agent | 16, 17 |
| [44](44-saat-duka-tpu-submission.md) | Saat Duka at a DKI TPU: list section and submission | ready-for-agent | 22, 43 |
| [45](45-tpu-saat-duka-confirmation-and-surat-pengantar.md) | TPU Saat Duka confirmation and Ambil surat pengantar | ready-for-agent | 28, 44 |
| [46](46-tpu-filing-surat-kuasa-and-makam-tpu.md) | TPU filing: documents, Surat Kuasa, IPTM and Makam TPU | ready-for-agent | 45 |
| [47](47-pengurusan-iptm-filing-only.md) | Pengurusan IPTM (filing-only) and PTSP rejections | ready-for-agent | 31, 46 |
| [48](48-perpanjangan-tpu.md) | Perpanjangan TPU (IPTM renewal) | ready-for-agent | 47 |
| [49](49-layanan-catalog-and-paket-definitions.md) | Layanan catalog, prices and Paket Layanan definitions | ready-for-agent | 16 |
| [50](50-layanan-order-at-lokasi-mitra.md) | Layanan order at a Lokasi Mitra and Admin Lokasi fulfilment | ready-for-agent | 19, 23, 34, 49 |
| [51](51-keluhan-penilaian-and-layanan-pencairan.md) | Keluhan, Penilaian and Layanan Pencairan | ready-for-agent | 32, 50 |
| [52](52-pekerjaan-layanan-message-thread.md) | Pekerjaan Layanan message thread | ready-for-agent | 51 |
| [53](53-layanan-at-checkout.md) | Layanan at checkout: hari-H on Saat Duka, empty-plot on Terencana | ready-for-agent | 37, 50 |
| [54](54-paket-layanan-cycles.md) | Paket Layanan subscriptions and cycles | ready-for-agent | 50 |
| [55](55-mitra-jasa-onboarding-and-status.md) | Mitra Jasa onboarding, availability, status and scorecard | ready-for-agent | 43, 49 |
| [56](56-tpu-layanan-order-and-mitra-jasa-assignment.md) | TPU Layanan order and Mitra Jasa assignment | ready-for-agent | 50, 55 |
| [57](57-mitra-jasa-proof-approval-and-pay.md) | Mitra Jasa photo proof, approval and pay rules | ready-for-agent | 51, 56 |
| [58](58-wakaf-tanah.md) | Wakaf Tanah: Pengajuan Wakaf, review and tracking | ready-for-agent | 17, 27 |
| [59](59-lokasi-ditangguhkan-and-berhenti.md) | Lokasi Mitra Ditangguhkan and Berhenti | ready-for-agent | 32, 38, 54 |
| [60](60-real-aws-adapters.md) | Real FileStore (S3 Jakarta) and EmailSender (SES Jakarta) adapters | ready-for-agent | 03 |
| [61](61-real-sumopod-adapter.md) | Real SumoPod PaymentProvider adapter | ready-for-agent | 04, 19 |
| [62](62-real-whatsapp-and-sms-adapters.md) | Real WhatsAppSender (kirim.dev) and SmsSender (Zenziva) adapters | ready-for-agent | 05, 20 |

## Story coverage

| Story | Ticket(s) | Story | Ticket(s) | Story | Ticket(s) |
|---|---|---|---|---|---|
| 1 | 26 | 64 | 40 | 127 | 13 |
| 2 | 26 | 65 | 40 | 128 | 14 |
| 3 | 26 (hub 34) | 66 | 40 | 129 | 42 |
| 4 | 26 | 67 | 41 | 130 | 42 |
| 5 | 26 | 68 | 44 | 131 | 50, 51, 52 |
| 6 | 26 | 69 | 44 | 132 | 11 |
| 7 | 16, 43 | 70 | 44 | 133 | 29 |
| 8 | 16, 15 | 71 | 44 | 134 | 30 |
| 9 | 16, 49 | 72 | 44 | 135 | 32 |
| 10 | 16, 12 | 73 | 45 | 136 | 23 |
| 11 | 16 | 74 | 46 | 137 | 10 |
| 12 | 15, 16 | 75 | 46 | 138 | 10 |
| 13 | 43 | 76 | 46 | 139 | 23, 09 |
| 14 | 43 | 77 | 46 | 140 | 17 |
| 15 | 59 | 78 | 47 | 141 | 17 |
| 16 | 26 | 79 | 48 | 142 | 28 |
| 17 | 22 | 80 | 48 | 143 | 17, 28 |
| 18 | 22 | 81 | 48 | 144 | 17 |
| 19 | 44 | 82 | 47, 48 | 145 | 45 |
| 20 | 22, 11 | 83 | 48 | 146 | 45, 47 |
| 21 | 22 | 84 | 50 | 147 | 46 |
| 22 | 22 | 85 | 56 | 148 | 43 |
| 23 | 53 | 86 | 50 | 149 | 23 |
| 24 | 22 | 87 | 54 | 150 | 10, 12 |
| 25 | 22 | 88 | 54 | 151 | 16, 15 |
| 26 | 22, 08 | 89 | 54 | 152 | 59 |
| 27 | 08, 22 | 90 | 54 | 153 | 15 |
| 28 | 22 | 91 | 50, 57 | 154 | 49 |
| 29 | 23 | 92 | 50, 57 | 155 | 55 |
| 30 | 23 | 93 | 50 | 156 | 56 |
| 31 | 24 | 94 | 51 | 157 | 57 |
| 32 | 24 | 95 | 51 | 158 | 51 |
| 33 | 24 | 96 | 52, 56 | 159 | 55 |
| 34 | 24, 31 | 97 | 51, 50 | 160 | 29 |
| 35 | 19 | 98 | 08, 27 | 161 | 31 |
| 36 | 19, 25 | 99 | 27 | 162 | 32 |
| 37 | 25 | 100 | 27 | 163 | 30 |
| 38 | 20, 25 | 101 | 27 | 164 | 30 |
| 39 | 36 | 102 | 38 | 165 | 33 |
| 40 | 36 | 103 | 39 | 166 | 58 |
| 41 | 36 | 104 | 39 | 167 | 09 |
| 42 | 36 | 105 | 39 | 168 | 09 |
| 43 | 36 | 106 | 59 | 169 | 14 |
| 44 | 36 | 107 | 38 | 170 | 09 |
| 45 | 36 | 108 | 58 | 171 | 52 |
| 46 | 37 | 109 | 58 | 172 | 20 |
| 47 | 37 | 110 | 58 | 173 | 15 |
| 48 | 53 | 111 | 58 | 174 | 15 |
| 49 | 37 | 112 | 58 | 175 | 15 |
| 50 | 34 | 113 | 58 | 176 | 56 |
| 51 | 34 | 114 | 58 | 177 | 55 |
| 52 | 35 | 115 | 23 | 178 | 56 |
| 53 | 35 | 116 | 23 | 179 | 57 |
| 54 | 35 | 117 | 23 | 180 | 52 |
| 55 | 35 | 118 | 24 | 181 | 57, 32 |
| 56 | 35 | 119 | 25 | 182 | 55 |
| 57 | 42 | 120 | 23 | 183 | 18, 25, 40 |
| 58 | 40 | 121 | 37 | 184 | 09 |
| 59 | 41 | 122 | 35 | 185 | 01, 60, 61, 62 |
| 60 | 41 | 123 | 35 | 186 | 01 (+ every tick ticket) |
| 61 | 41 | 124 | 41 | 187 | 07 |
| 62 | 40 | 125 | 38, 39 | | |
| 63 | 40 | 126 | 39 | | |

## Implementation Decisions coverage (by spec module)

- Architecture, AGENTS.md, containers, CI, Sentry: 01; production, migrations step, backups, uptime alarm: 07.
- Adapter ports: interfaces + fakes 01; Clock 01; PdfRenderer real 18; WebPush real 21; FileStore + EmailSender real 60; PaymentProvider real 61; WhatsAppSender + SmsSender real 62.
- 1 Identity & Access: 08, 09 (account move 09; holder number change 39; role visibility 09, 10, 15, 23, 55, 58).
- 2 Audit Log: 09; Lokasi view 10.
- 3 Lokasi: 10 (record, policies, flags), 11 (Jam Operasional, Kontak Siaga, working-time calculator), 16 (publish gate, Terencana switch), 43 (TPU), 59 (Ditangguhkan, Berhenti); late confirmations / declines counted 23, 24.
- 4 Tariffs: 12; DKI and Retribusi 43; Layanan and Mitra Jasa rates 49.
- 5 Inventory: 13 (Denah), 14 (status, availability, Hak Pakai, Pemakaman, renumber), 34 (lookup), 35 (released plots, tumpang), 36 (hold), 39 (Ganti Pemegang Hak, number change, Pengembalian, Calon Penghuni), 42 (Pembongkaran, Tidak Tersedia, end), Perlu Verifikasi completion 41, 50.
- 6 Pemesanan: Saat Duka 22–25; Terencana 36, 37; further burial 35; requests 38, 39.
- 7 Perpanjangan: 40, 41; reminders 42.
- 8 Pengurusan: 44–48.
- 9 Layanan: 49–57.
- 10 Billing: 18 (Tagihan, due rules, numbering, documents), 19 (payment), 29 (chasing, Tidak Tertagih, blocks), 30 (manual, direct, Rp 0, Harga Khusus), 31 (refunds); Bukti Pemesanan 25, Bukti Perpanjangan 40.
- 11 Payouts: 32 (+ triggers 35, 37, 40, 51, 57; Berhenti 59).
- 12 Wakaf: 58.
- 13 Field Work: 15; Ambil surat pengantar 45, 47; Berkas IPTM 46; Survei Wakaf 58.
- 14 Work Queues: Antrean 17, Bertugas 28, Antrean Lokasi 23; each row type in the ticket that owns its state.
- 15 Notifications: core 20; staff push 21; each event in its owning ticket; real senders 62.
- 16 Scheduler: tick pattern 01; ticks in 18 (pay-first lapse), 25 (Catat Pemakaman), 28 (escalation, Bertugas auto-off), 29 (overdue reminders), 32 (Potongan ageing), 37 (holds, Masa Pembatalan), 42 (Hak Pakai reminders), 48 (IPTM reminders), 50 (Terlambat), 51 (Keluhan window), 54 (Paket), 55 (scorecard review), 56 (accept deadlines), 59 (Berhenti).
- Public site and routing: 26 (home, nav, content), 22 / 36 / 35 (wizards), 34 (hub), 24 (after a Tolak), 10 (Leaflet pin), 43 (Pengurusan di TPU DKI page), 58 (Wakaf page).
- Data and privacy: 09, 10, 15, 23, 55, 58, 60.
- Testing: harness 01; Playwright E2E 1 in 25, 2 in 19, 3 in 32.

## Could not place, contradictory or unclear

Listed, not resolved.

1. **Excel import** of existing Petak and Hak Pakai is "a stated requirement" but "not in the first build"; the template waits for the first partner. No ticket. The Perlu Verifikasi behaviour it depends on is in 14, 41 and 50.
2. **Cutover** from the frozen Laravel beta on `makam.co.id`, and whether any beta data moves, is "decided near launch". No ticket. Ticket 02 asks the human to pick a v1 hostname meanwhile.
3. **Tagihan reminder rules overlap.** The Notifications table has "Tagihan (general): on issue, 24 h before due, on the due day", "Pay-first Tagihan: H-1 and on the due day", "Terencana hold: about 4 h before expiry" and "Paket cycle: H-7 and H-1". It doesn't say whether "general" means pay-after only, or whether a Terencana Tagihan (pay-first, due in 24 h) also gets the H-1 / due-day reminders. Ticket 20 assumes general = pay-after and pay-first = H-1 + due day, with the Terencana and Paket rules replacing them.
4. **"The last lead-time day"** in the standalone Layanan due rule ("the earlier of 24 h after issue or the last lead-time day") is not defined; presumably target date minus lead time.
5. **"Working days" for Admin Platform deadlines** (refund transfer and Pencairan in 2, filing-only document check in 1, filing in 3, Wakaf first contact in 3) have no defined calendar: weekends? public holidays? The Admin Platform rota runs 06:00–18:00 every day. Also undefined: which calendar the Admin Lokasi's "2 working days" request rows use (presumably the Lokasi's Jam Operasional), and what "4 daytime hours" means for the Keluhan first response.
6. **Hari-H Layanan at a DKI TPU Saat Duka.** The due table says "Saat Duka checkout (Lokasi Mitra, DKI TPU), incl. its hari-H Layanan", and the Tidak Tertagih rule mentions a Mitra Jasa at a TPU being paid for hari-H Layanan. But the stories and the TPU wizard only describe hari-H Layanan at a Lokasi Mitra. Mitra Jasa assignment for a burial-day job isn't described either.
7. **Layanan at a Perpanjangan checkout.** The due table's "Layanan at a non–Saat Duka checkout" and decision ticket 09 ("a Layanan added to a Pemesanan Makam or Perpanjangan checkout shares that order's fee") suggest Perpanjangan checkout offers Layanan, but the spec's Perpanjangan flow never offers it. Ticket 53 covers only the Saat Duka and Terencana checkouts.
8. **Session length for mixed-role accounts.** Pemesan get 90 days, staff 30 days on a trusted device, Admin Platform 12 h. The spec doesn't say which applies to one account holding Admin Platform plus other roles.
9. **Non-zero Retribusi Pemda** is "collected at cost and paid on to the Pemda by Admin Platform or the Petugas Lapangan". There is no record, row or document for that pay-on step.
10. **"TPU nisan variants follow the Pemda rules"**: the rules are not given, so there is nothing concrete to implement (ticket 49).
11. **"mulai Rp X" on DKI TPU cards** in Daftar Lokasi: the spec doesn't say what X is at a TPU (the Biaya Pengurusan burial amount?).
12. **Paid TPU Saat Duka order cancelled before filing.** Story 77 says the Tagihan is voided, but not what happens to a payment already made: whether it's refunded and whether the Biaya Pengurusan is kept.
13. **Pemesan email.** Story 38 relies on "if I gave an email", but the Saat Duka form (story 21) lists only name and WhatsApp, and no screen collects an optional email.
14. **Harga Khusus partner share**: the spec doesn't say how a partner share is agreed or entered (ticket 30).
15. **Petak renumbering** is "without breaking lookups silently", but the spec doesn't say whether old numbers stay searchable (alias) or lookups show a notice (ticket 14).
16. **Tier 4 "Lokasi revisits" and "publish-gate checks" rows** have no defined trigger, while scheduled revisits are out of scope (Admin Platform orders them ad hoc). Ticket 17 reads them as "a revisit Tugas Lapangan open" and "a Belum Tayang Lokasi with the gate incomplete".
17. **No status lists** are defined for a Lokasi Mitra Perpanjangan request (manual paths), a Pengembalian Hak Pakai request or a Ganti Pemegang Hak request. Tickets 39 and 41 will need to choose them.
18. **Decision ticket 19 vs the spec** (the spec wins, recorded for awareness): ticket 19 said a new TPU order alerts every Admin Platform 06:00–18:00 and that every Pencairan sends a notice. The spec routes TPU alerts through Bertugas / Tier 1 escalation, and sends Bukti Pencairan links "by message" like any document.
