# makam.co.id v1 build: ticket index

Spec: [../../makam-v1/spec.md](../../makam-v1/spec.md). 68 tickets (as of 2026-09-25): 5 resolved (01, 07, 08, 09, 66), 6 ready-for-human (02–06, 65), 57 ready-for-agent. Numbers follow dependency and value order; human tickets are numbered early because of vendor lead times. Only the real-adapter and production tickets (07, 60, 61, 62, 64, 65, 68) are blocked by them.

## Tickets

| # | Title | Status | Blocked by |
|---|---|---|---|
| [01](01-walking-skeleton.md) | Walking skeleton: app, worker, CI, test harness | resolved | — |
| [02](02-infra-accounts-vps-domain-github-sentry.md) | Infrastructure accounts: VPS, domain, GitHub, GlitchTip | ready-for-human | — |
| [03](03-aws-s3-jakarta.md) | AWS Jakarta: private S3 buckets (S3 only; SES dropped 2026-09-25) | ready-for-human | — |
| [04](04-sumopod-merchant-account.md) | SumoPod merchant account and email (SMTP relay, `makam.co.id` domain authentication) for PT Jaya Korpora Prima | ready-for-human | — |
| [05](05-whatsapp-and-sms-vendors.md) | WhatsApp (Meta + kirim.dev) vendor setup | ready-for-human | — |
| [06](06-operator-facts-and-reference-data.md) | Operator facts and launch reference data | ready-for-human | — |
| [07](07-production-environment.md) | Staging, GlitchTip, deploy pipeline and uptime alarm | resolved | 01 |
| [08](08-whatsapp-otp-login.md) | WhatsApp OTP login and the Pemesan account | resolved | 01 |
| [09](09-staff-access-totp-and-audit-log.md) | Staff access: roles, invites, TOTP and the Audit Log | resolved | 08 |
| [10](10-lokasi-mitra-onboarding.md) | Lokasi Mitra onboarding record and Admin Lokasi invites | resolved | 09 |
| [11](11-jam-operasional-and-working-time.md) | Jam Operasional, Kontak Siaga and the working-time calculator | ready-for-agent | 10 |
| [12](12-tariffs-and-all-in-quote.md) | Versioned tariffs and the all-in price quote | ready-for-agent | 10 |
| [13](13-denah-builder.md) | Denah builder: bloks, Petak Makam and Kavling Keluarga | ready-for-agent | 12 |
| [14](14-petak-clearing-and-availability.md) | Petak clearing, derived status and availability | ready-for-agent | 13 |
| [15](15-tugas-lapangan-kunjungan-and-cek-denah.md) | Tugas Lapangan, Kunjungan Verifikasi and Cek Denah | ready-for-agent | 13 |
| [16](16-publish-gate-and-lokasi-pages.md) | Publish gate, Terencana switch, Lokasi Mitra page and Daftar Lokasi | ready-for-agent | 11, 12, 14, 15 |
| [17](17-admin-platform-antrean.md) | Admin Platform Antrean framework | ready-for-agent | 16 |
| [18](18-tagihan-and-documents.md) | Tagihan, document numbering and document pages | ready-for-agent | 12, 63 |
| [19](19-payment-through-provider-port.md) | Payment through the PaymentProvider port and Bukti Pembayaran | ready-for-agent | 18 |
| [20](20-notifications-core.md) | Notifications module core | ready-for-agent | 17, 18 |
| [21](21-staff-pwa-and-web-push.md) | Staff PWA install and web push | resolved | 09 |
| [22](22-saat-duka-wizard.md) | Pemesanan Saat Duka wizard at a Lokasi Mitra | ready-for-agent | 16 |
| [23](23-antrean-lokasi-and-saat-duka-confirmation.md) | Antrean Lokasi and Saat Duka confirmation | ready-for-agent | 18, 20, 21, 22 |
| [24](24-saat-duka-alternatif-tolak-and-cancellation.md) | Saat Duka alternatif, Tolak and cancellation | ready-for-agent | 23 |
| [25](25-pemakaman-bukti-pemesanan-and-selesai.md) | Catat Pemakaman, Bukti Pemesanan and Saat Duka Selesai | ready-for-agent | 19, 23 |
| [26](26-public-site-shell-and-content-pages.md) | Public site shell, homepage and content pages | ready-for-agent | 22, 63 |
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
| [44](44-saat-duka-tpu-submission.md) | Saat Duka at a DKI TPU: list section and submission | ready-for-agent | 22, 43, 63 |
| [45](45-tpu-saat-duka-confirmation-and-surat-pengantar.md) | TPU Saat Duka confirmation and Ambil surat pengantar | ready-for-agent | 28, 44 |
| [46](46-tpu-filing-surat-kuasa-and-makam-tpu.md) | TPU filing: documents, Surat Kuasa, IPTM and Makam TPU | ready-for-agent | 45 |
| [47](47-pengurusan-iptm-filing-only.md) | Pengurusan IPTM (filing-only) and PTSP rejections | ready-for-agent | 31, 46 |
| [48](48-perpanjangan-tpu.md) | Perpanjangan TPU (IPTM renewal) | ready-for-agent | 47 |
| [49](49-layanan-catalog-and-paket-definitions.md) | Layanan catalog, prices and Paket Layanan definitions | ready-for-agent | 16 |
| [50](50-layanan-order-at-lokasi-mitra.md) | Layanan order at a Lokasi Mitra and Admin Lokasi fulfilment | ready-for-agent | 19, 23, 34, 49 |
| [51](51-keluhan-penilaian-and-layanan-pencairan.md) | Keluhan, Penilaian and Layanan Pencairan | ready-for-agent | 32, 50 |
| [52](52-pekerjaan-layanan-message-thread.md) | Pekerjaan Layanan message thread | ready-for-agent | 51 |
| [53](53-layanan-at-checkout.md) | Layanan at checkout: hari-H on Saat Duka, empty-plot on Terencana, Tambah Layanan on Perpanjangan | ready-for-agent | 37, 40, 50 |
| [54](54-paket-layanan-cycles.md) | Paket Layanan subscriptions and cycles | ready-for-agent | 50 |
| [55](55-mitra-jasa-onboarding-and-status.md) | Mitra Jasa onboarding, availability, status and scorecard | ready-for-agent | 43, 49 |
| [56](56-tpu-layanan-order-and-mitra-jasa-assignment.md) | TPU Layanan order and Mitra Jasa assignment | ready-for-agent | 45, 50, 55 |
| [57](57-mitra-jasa-proof-approval-and-pay.md) | Mitra Jasa photo proof, approval and pay rules | ready-for-agent | 51, 56 |
| [58](58-wakaf-tanah.md) | Wakaf Tanah: Pengajuan Wakaf, review and tracking | ready-for-agent | 17, 27 |
| [59](59-lokasi-ditangguhkan-and-berhenti.md) | Lokasi Mitra Ditangguhkan and Berhenti | ready-for-agent | 32, 38, 54 |
| [60](60-real-s3-filestore-adapter.md) | Real FileStore adapter (S3 Jakarta) | ready-for-agent | 03 |
| [61](61-real-sumopod-adapter.md) | Real SumoPod PaymentProvider adapter | ready-for-agent | 04, 19 |
| [62](62-real-whatsapp-and-sms-adapters.md) | Real WhatsAppSender (kirim.dev) adapter | ready-for-agent | 05, 20 |
| [63](63-operator-settings.md) | Pengaturan Operator (Operator settings) | resolved | 09 |
| [67](67-email-login.md) | Email login, Verifikasi email and the "Kirim lewat email" fallback | resolved | 09 |
| [68](68-real-smtp-emailsender-adapter.md) | Real EmailSender adapter (SumoPod SMTP) | ready-for-agent | 04 |

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
| 23 | 53, 56 | 86 | 50 | 149 | 23 |
| 24 | 22 | 87 | 54 | 150 | 10, 12 |
| 25 | 22 | 88 | 54 | 151 | 16, 15 |
| 26 | 22, 08 | 89 | 54 | 152 | 59 |
| 27 | 67, 22 | 90 | 54 | 153 | 15 |
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
| 44 | 36 | 107 | 38 | 170 | 09, 67 |
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
| 59 | 41 | 122 | 35 | 185 | 01, 60, 61, 62, 68 |
| 60 | 41 | 123 | 35 | 186 | 01 (+ every tick ticket) |
| 61 | 41 | 124 | 41 | 187 | 07 |
| 62 | 40 | 125 | 38, 39 | 188 | 63, 06 |
| 63 | 40 | 126 | 39 | 189 | 67 |
| | | | | 190 | 67 |

## Implementation Decisions coverage (by spec module)

- Architecture, AGENTS.md, containers, CI, Sentry SDK: 01; GlitchTip set-up and DNS: 02; production, migrations step, backups, uptime alarm, GlitchTip test errors, cutover on `makam.co.id`: 07.
- Adapter ports: interfaces + fakes 01; Clock 01; PdfRenderer real 18; WebPush real 21; FileStore real 60 (S3); EmailSender real 68 (SumoPod SMTP); PaymentProvider real 61; WhatsAppSender real 62. No SmsSender.
- 1 Identity & Access: 08, 09 (email login, Email Terverifikasi and the email fallback 67; staff email at invite 09, 10, 55; first Admin Platform seed 09; account move 09; holder number change 39; role visibility 09, 10, 15, 23, 55, 58).
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
- 15 Notifications: core 20; staff push 21; each event in its owning ticket; real senders 62, 68; the email Kode Masuk is sent outside Notifications (67).
- 16 Scheduler: tick pattern 01; ticks in 18 (pay-first lapse), 25 (Catat Pemakaman), 28 (escalation, Bertugas auto-off), 29 (overdue reminders), 32 (Potongan ageing), 37 (holds, Masa Pembatalan), 42 (Hak Pakai reminders), 48 (IPTM reminders), 50 (Terlambat), 51 (Keluhan window), 54 (Paket), 55 (scorecard review), 56 (accept deadlines), 59 (Berhenti).
- 17 Pengaturan Operator: 63; values entered before launch 06.
- Public site and routing: 26 (home, nav, content), 22 / 36 / 35 (wizards), 34 (hub), 24 (after a Tolak), 10 (Leaflet pin), 43 (Pengurusan di TPU DKI page), 58 (Wakaf page).
- Data and privacy: 09, 10, 15, 23, 55, 58, 60; email through SumoPod 04, 68.
- Testing: harness 01; Playwright E2E 1 in 25, 2 in 19, 3 in 32.

## Could not place, contradictory or unclear

Listed, not resolved. Item 1 is deliberately deferred; item 2 has an open question; item 3 is for awareness only.

1. **Excel import** of existing Petak and Hak Pakai is "a stated requirement" but "not in the first build"; the template waits for the first partner. No ticket. The Perlu Verifikasi behaviour it depends on is in 14, 41 and 50.
2. **Cutover** from the frozen Laravel app on `makam.co.id` is now in ticket 07 (human gate, rollback). Still open, and must be answered before the switch: must any data from the old app (users, orders, Lokasi, payments) be carried over or archived?
3. **Decision ticket 19 vs the spec** (the spec wins, recorded for awareness): ticket 19 said a new TPU order alerts every Admin Platform 06:00–18:00 and that every Pencairan sends a notice. The spec routes TPU alerts through Bertugas / Tier 1 escalation, and sends Bukti Pencairan links "by message" like any document.
4. **GitHub owner vs "every vendor account in PT JKP's name"** (new, 2026-09-25): the repo and ghcr images live under the personal account `andrianm28`, while ticket 02 and the spec's pre-launch checklist require every vendor account in PT JKP's name. Not resolved; ticket 02 keeps the rule.
5. **Ticket 07 timing vs the cutover** (new, 2026-09-25): 07 is an early ticket (blocked only by 01–03) meant to give later tickets a live environment, but its switch replaces the live Laravel app on `makam.co.id`. Ticket 07 lets the pipeline, backups and GlitchTip land first with no public hostname and holds the switch behind the human gate; until then there is no public v1 environment (and `dev.makam.co.id` is not used).

## Resolved clarifications (2026-09-25)

Decided by the user and written into the spec and the tickets named.

1. **Tagihan reminders**: one rule per Tagihan kind, never stacked, all 08:00–20:00: pay-first (Perpanjangan, filing-only Pengurusan, standalone / non–Saat Duka Layanan) at issue, H-1 and the due day; Terencana once about 4 h before the hold expires; Paket cycle H-7 and H-1; pay-after H+3/7/14/30. The "general" and "24 h before" rules are gone. Tickets 20 (29, 37, 54 already matched).
2. **Last lead-time day** = target date minus the Layanan's lead time, due 23:59 WIB that day; the due date is the earlier of that and 24 h after issue. Tickets 18, 50.
3. **Working days**: Admin Platform = Monday–Friday minus national holidays from a list Admin Platform maintains; Admin Lokasi = the Lokasi's Jam Operasional open days minus dated closures; "4 daytime hours" = 4 hours within 06:00–18:00 WIB. Tickets 11, 31, 32, 38, 39, 41, 47, 51.
4. **Hari-H Layanan at a DKI TPU Saat Duka**: allowed, done by a Mitra Jasa, pay-after on the TPU Saat Duka Tagihan, Dijadwalkan at confirmation; Mitra Jasa Pencairan doesn't wait for the family's payment; the Operator bears a Tidak Tertagih loss. Tickets 56 (now also blocked by 45), 57; notes in 44, 53.
5. **Layanan at a Perpanjangan checkout**: optional "Tambah Layanan" step before payment, same Tagihan, earliest-due rule. Ticket 53 (now also blocked by 40); note in 40.
6. **Multi-role sessions**: an account holding Admin Platform gets 12 h with TOTP for the whole account. Ticket 09.
7. **Non-zero Retribusi Pemda**: Tier 3 "Setor Retribusi" row due 2 working days after Lunas, closed by recording the payment with a setoran proof; no row for Rp 0; structure only in v1. Ticket 45; note in 43.
8. **TPU nisan variants**: Admin Platform marks Batu Nisan variants "boleh di TPU DKI" by hand; only those are offered at a TPU. Ticket 49.
9. **"mulai Rp X" on a DKI TPU card** = burial Biaya Pengurusan + Retribusi Pemda. Ticket 43.
10. **Paid TPU Saat Duka order cancelled before filing**: full refund, except the Biaya Pengurusan is kept at or past Dimakamkan; Admin Platform approves. Ticket 46.
11. **Optional Pemesan email** on every "Data & kirim" / checkout screen and in the Akun Saya profile, used only for Tagihan / Bukti copies via SES. Tickets 20, 22, 27, 36, 40, 44, 50. _Amended 2026-09-25: SES dropped; copies go through SumoPod SMTP (see Decisions 2026-09-25 (email login))._
12. **Harga Khusus partner share**: entered on the order by Admin Platform with a required note, default 0; a non-zero share lowers that order's Pencairan. Tickets 30, 32.
13. **Petak renumbering**: old Nomor Makam kept as a hidden alias that lookups still find; never displayed, only in the audit log. Tickets 14, 34.
14. **Tier 4 "Lokasi revisit" and "publish-gate check" rows**: only after Admin Platform presses "Minta kunjungan ulang" (creating the Kunjungan Verifikasi); no automatic schedule. Tickets 15, 17.
15. **Request statuses** (Perpanjangan manual path, Pengembalian Hak Pakai, Ganti Pemegang Hak): Diajukan → (Perlu Perbaikan ↺ Diajukan) → Disetujui | Ditolak | Dibatalkan; Antrean Lokasi row while Diajukan, due 2 working days. Tickets 39, 41.

## Resolved decisions (2026-09-25, infrastructure and settings)

Decided by the user and written into the spec, ADRs 0002 / 0003 (amendments) and the tickets named.

1. **No SMS in v1** (Zenziva dropped). The OTP fallback after ~60 s is "Kirim lewat email" through SES, only for an account with an email on record; every staff invite requires an email; a Pemesan without one is pointed to the CS WhatsApp number; Admin Platform TOTP unchanged. The fallback lands with the SES adapter (60, needs human ticket 03); login (08) is not blocked by it. This amends clarification 11: the optional email also carries the OTP fallback. Tickets 01, 03, 05, 08, 09, 10, 20, 22, 27, 40, 44, 50, 55, 60, 62. _Superseded in part by Decisions 2026-09-25 (email login): SES dropped, the fallback is ticket 67 and needs an Email Terverifikasi._
2. **Error monitoring is GlitchTip**, self-hosted on this host as its own compose project at `errors.makam.co.id` (DNS A record to 103.92.214.243 still to add); Sentry SDK kept, Sentry cloud dropped. Tickets 02, 07 (and 60, 61, 62 wording).
3. **v1 deploys directly on `makam.co.id`**, replacing the frozen Laravel app in ticket 07 behind a human confirmation gate, with a rollback and the data carry-over question answered first. `dev.makam.co.id` untouched. Tickets 02, 04, 07.
4. **GitHub**: `github.com/andrianm28/makam`, private, `main`; images `ghcr.io/andrianm28/makam`. Ticket 02 (repo items done), 07.
5. **VPS facts**: this host (Jakarta), nginx + Certbot already running; DNS for `makam.co.id` / `www` already correct; `makam-prod` must avoid ports 3001, 8081, 8082, 8083. Ticket 02.
6. **SumoPod**: the merchant account already exists and is live for the old app; API key and webhook secret must be fetched from the dashboard; v1 registers `https://makam.co.id/api/webhooks/sumopod` and ignores events for payments it didn't create. Tickets 04, 61.
7. **Reference values are entered by Admin Platform in the dashboard**, never seeded (only the first Admin Platform's phone and email are seeded). New Pengaturan Operator screen for the Operator's legal name, address, contact and the CS WhatsApp number and reply hours. Tickets 06 (now a human checklist), 09, 18, 20, 26, 43, 44, 58, 63.

## Decisions 2026-09-25 (later)

- v1 staging at `dev.makam.co.id` behind basic auth with SumoPod sandbox; live SumoPod on switch day (07, 04, 61).
- WhatsApp outage for a new family: CS contact + Admin Platform submits the Saat Duka order on their behalf (22).
- Legal name allowed in footer, documents, Tentang Kami, Hubungi Kami, FAQ payment answer, TPU anti-perantara note (spec Further Notes).
- GitHub owner stays `andrianm28` for now (02).
- Drafts: [`../content-drafts.md`](../content-drafts.md), [`../whatsapp-templates.md`](../whatsapp-templates.md); kirim.dev research: [`../research/kirimdev-data-localization.md`](../research/kirimdev-data-localization.md).

## Split of ticket 07 (2026-09-25)

| [64](64-backups-s3-jakarta.md) | Encrypted Postgres backups to S3 Jakarta and restore test | ready-for-agent | 03, 07 |
| [65](65-production-switch-makam-co-id.md) | Production switch: makam.co.id from the old app to v1 | ready-for-human | 04, 07, 64 |
| [66](66-staging-banner.md) | Staging banner on dev.makam.co.id | resolved | — |

## Decisions 2026-09-25 (email login)

Decided by the user and written into CONTEXT.md (Kode Masuk, Email Terverifikasi), ADR 0003 and ADR 0002 (amendments), the spec and the tickets named.

1. **Email login** for any Akun with an **Email Terverifikasi** (Pemesan and every staff role), as an equal alternative to the WhatsApp OTP, chosen at any time from "Masuk dengan email". New Akun are still created only through the WhatsApp OTP, and the WhatsApp number (+62) is still the key. Ticket 67 (notes in 08, 22, 27).
2. **Code**: 6 digits by email, same rules as the WhatsApp OTP (10 min, 5th wrong burns, resend 60 s, 5 per rolling hour, lockout after 10 wrong in 60 min), counted per email and per IP; sent directly, not through Notifications. Ticket 67 (note in 20).
3. **Staff** may log in by email; Admin Platform still passes TOTP; sessions unchanged (12 h / 30 days / 90 days). Ticket 67 (note in 09).
4. **Email goes through the SumoPod SMTP relay** (`smtp.sumopod.com`, 465, SMTPS) from the `EmailSender` adapter. SES is dropped from v1, and the self-hosted Stalwart is for human mailboxes only. AWS is S3 only. Tickets:
   - 03 is S3 only;
   - 04 has the human email checklist (Custom Domain, DKIM / SPF / sumo-verification, DMARC, SMTP credentials);
   - 60 is split: 60 is the S3 FileStore, 68 is the SMTP EmailSender;
   - notes in 05, 20, 35, 47, 48, 54, 56.
5. **Verified** only by entering a code sent to the email: "Verifikasi email" in Akun Saya or the staff area (audited for staff), or the first successful email login. A typed email (on an order, or on an Undangan Staf) is not verified. Ticket 67 (notes in 09, 22, 27, 40, 44, 50).
6. **Privacy**: an unknown or unverified email gets the success reply "Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim." Ticket 67.
7. **Uniqueness**: a verified email belongs to at most one Akun; a clash is refused and resolved by Admin Platform through CS. Ticket 67.
8. **The fallback** ("Kirim lewat email" after about 60 s) moves from ticket 60 into 67, with the same code and the same verified-email rule. The login OTP-direct exception covers the email code. Ticket 67 (notes in 08, 22, 63).

Not changed here (outside the files this change may touch):
- the code comments that still name ticket 60 for the email fallback or say SES (`src/ports/email-sender.ts`, `src/composition/adapters.ts`, `src/domain/identity/{schema,invites,otp}.ts`);
- `docs/ops/runbook.md`, which still says GlitchTip alerts use SES from ticket 03.
| [69](69-no-ticket-numbers-in-ui-copy.md) | No internal ticket numbers in user-facing copy | resolved | — |
