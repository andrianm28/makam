Spec: [../../makam-v1/spec.md](../../makam-v1/spec.md). 99 tickets (as of 2026-10-02): 79 resolved, 10 ready-for-agent, 5 ready-for-human (02, 03, 04, 06, 65), 2 wontfix (05, 62), 3 in-progress (72, 87, 98).

## Tickets

| # | Title | Status | Blocked by |
|---|---|---|---|
| [01](01-walking-skeleton.md) | Walking skeleton: app, worker, CI, test harness | resolved | — |
| [02](02-infra-accounts-vps-domain-github-sentry.md) | Infrastructure accounts: VPS, domain, GitHub, GlitchTip | ready-for-human | — |
| [03](03-aws-s3-jakarta.md) | AWS Jakarta: private S3 buckets (S3 only; SES dropped 2026-09-25) | ready-for-human | — |
| [04](04-sumopod-merchant-account.md) | SumoPod merchant account and email (SMTP relay, `makam.co.id` domain authentication) for PT Jaya Korpora Prima | ready-for-human | — |
| [05](05-whatsapp-and-sms-vendors.md) | WhatsApp (Meta + kirim.dev) vendor setup — out of v1 (ADR 0004) | wontfix | — |
| [06](06-operator-facts-and-reference-data.md) | Operator facts and launch reference data | ready-for-human | — |
| [07](07-production-environment.md) | Staging, GlitchTip, deploy pipeline and uptime alarm | resolved | 01 |
| [08](08-whatsapp-otp-login.md) | WhatsApp OTP login and the Pemesan account | resolved | 01 |
| [09](09-staff-access-totp-and-audit-log.md) | Staff access: roles, invites, TOTP and the Audit Log | resolved | 08 |
| [10](10-lokasi-mitra-onboarding.md) | Lokasi Mitra onboarding record and Admin Lokasi invites | resolved | 09 |
| [11](11-jam-operasional-and-working-time.md) | Jam Operasional, Kontak Siaga and the working-time calculator | resolved | 10 |
| [12](12-tariffs-and-all-in-quote.md) | Versioned tariffs and the all-in price quote | resolved | 10 |
| [13](13-denah-builder.md) | Denah builder: bloks, Petak Makam and Kavling Keluarga | resolved | 12, 74 |
| [14](14-petak-clearing-and-availability.md) | Petak clearing, derived status and availability | resolved | 13 |
| [15](15-tugas-lapangan-kunjungan-and-cek-denah.md) | Tugas Lapangan, Kunjungan Verifikasi and Cek Denah | resolved | 13 |
| [16](16-publish-gate-and-lokasi-pages.md) | Publish gate, Terencana switch, Lokasi Mitra page and Daftar Lokasi | resolved | 11, 12, 14, 15 |
| [17](17-admin-platform-antrean.md) | Admin Platform Antrean framework | resolved | 16, 74 |
| [18](18-tagihan-and-documents.md) | Tagihan, document numbering and document pages | resolved | 12, 63 |
| [19](19-payment-through-provider-port.md) | Payment through the PaymentProvider port and Bukti Pembayaran | resolved | 18 |
| [20](20-notifications-core.md) | Notifications module core | resolved | 17, 18, 82 |
| [21](21-staff-pwa-and-web-push.md) | Staff PWA install and web push | resolved | 09 |
| [22](22-saat-duka-wizard.md) | Pemesanan Saat Duka wizard at a Lokasi Mitra | resolved | 16, 82 |
| [23](23-antrean-lokasi-and-saat-duka-confirmation.md) | Antrean Lokasi and Saat Duka confirmation | resolved | 18, 20, 21, 22 |
| [24](24-saat-duka-alternatif-tolak-and-cancellation.md) | Saat Duka alternatif, Tolak and cancellation | resolved | 23 |
| [25](25-pemakaman-bukti-pemesanan-and-selesai.md) | Catat Pemakaman, Bukti Pemesanan and Saat Duka Selesai | resolved | 19, 23 |
| [26](26-public-site-shell-and-content-pages.md) | Public site shell, homepage and content pages | resolved | 22, 63 |
| [27](27-akun-saya.md) | Akun Saya: Perlu tindakan, Pesanan and Makam tabs | resolved | 25, 82 |
| [28](28-bertugas-and-tier-1-escalation.md) | Bertugas, Tier 1 alerts and escalation | resolved | 21, 24 |
| [29](29-pay-after-tagihan-chasing.md) | Chasing overdue pay-after Tagihan and Tidak Tertagih | resolved | 25 |
| [30](30-manual-payments-and-harga-khusus.md) | Manual payments, direct payment to the Lokasi and Harga Khusus | resolved | 25 |
| [31](31-refunds-and-bukti-pengembalian-dana.md) | Refunds and Bukti Pengembalian Dana | resolved | 24 |
| [32](32-pencairan-potongan-and-bukti-pencairan.md) | Pencairan, Potongan and Bukti Pencairan | resolved | 25, 31 |
| [33](33-laporan-and-transfer-list.md) | Monthly Laporan and weekly outgoing transfer list | resolved | 29, 32 |
| [34](34-makam-keluarga-hub-and-lookup.md) | Makam keluarga hub and grave lookup | resolved | 14, 26 |
| [35](35-burial-under-existing-hak-pakai.md) | Burial under an existing Hak Pakai, with consent | ready-for-agent | 25, 34 |
| [36](36-terencana-wizard.md) | Pemesanan Terencana wizard with Denah picker and plot hold | resolved | 16, 82 |
| [37](37-terencana-confirmation-and-payment.md) | Terencana confirmation, payment hold and Aktif | resolved | 23, 32, 36 |
| [38](38-pembatalan-terencana.md) | Pembatalan of a paid Pemesanan Terencana | resolved | 31, 37 |
| [39](39-pengembalian-ganti-pemegang-hak-calon-penghuni.md) | Pengembalian Hak Pakai, Ganti Pemegang Hak and Calon Penghuni | ready-for-agent | 27, 29, 38 |
| [40](40-perpanjangan-otp-path.md) | Perpanjangan at a Lokasi Mitra: OTP path and Bukti Perpanjangan | resolved | 29, 32, 34, 82 |
| [41](41-perpanjangan-manual-paths.md) | Perpanjangan manual paths: KTP, heir and claim | resolved | 40 |
| [42](42-hak-pakai-expiry-and-manual-ending.md) | Hak Pakai expiry reminders, masa tenggang and manual ending | ready-for-agent | 40 |
| [43](43-dki-tpu-catalog-and-pages.md) | DKI TPU catalog, prices and pages | resolved | 16, 17 |
| [44](44-saat-duka-tpu-submission.md) | Saat Duka at a DKI TPU: list section and submission | resolved | 22, 43, 63, 82 |
| [45](45-tpu-saat-duka-confirmation-and-surat-pengantar.md) | TPU Saat Duka confirmation and Ambil surat pengantar | resolved | 28, 44 |
| [46](46-tpu-filing-surat-kuasa-and-makam-tpu.md) | TPU filing: documents, Surat Kuasa, IPTM and Makam TPU | ready-for-agent | 45 |
| [47](47-pengurusan-iptm-filing-only.md) | Pengurusan IPTM (filing-only) and PTSP rejections | ready-for-agent | 31, 46 |
| [48](48-perpanjangan-tpu.md) | Perpanjangan TPU (IPTM renewal) | ready-for-agent | 47 |
| [49](49-layanan-catalog-and-paket-definitions.md) | Layanan catalog, prices and Paket Layanan definitions | resolved | 16 |
| [50](50-layanan-order-at-lokasi-mitra.md) | Layanan order at a Lokasi Mitra and Admin Lokasi fulfilment | resolved | 19, 23, 34, 49 |
| [51](51-keluhan-penilaian-and-layanan-pencairan.md) | Keluhan, Penilaian and Layanan Pencairan | resolved | 32, 50 |
| [52](52-pekerjaan-layanan-message-thread.md) | Pekerjaan Layanan message thread | ready-for-agent | 51 |
| [53](53-layanan-at-checkout.md) | Layanan at checkout: hari-H on Saat Duka, empty-plot on Terencana, Tambah Layanan on Perpanjangan | ready-for-agent | 37, 40, 50 |
| [54](54-paket-layanan-cycles.md) | Paket Layanan subscriptions and cycles | resolved | 50 |
| [55](55-mitra-jasa-onboarding-and-status.md) | Mitra Jasa onboarding, availability, status and scorecard | resolved | 43, 49 |
| [56](56-tpu-layanan-order-and-mitra-jasa-assignment.md) | TPU Layanan order and Mitra Jasa assignment | resolved | 45, 50, 55 |
| [57](57-mitra-jasa-proof-approval-and-pay.md) | Mitra Jasa photo proof, approval and pay rules | ready-for-agent | 51, 56 |
| [58](58-wakaf-tanah.md) | Wakaf Tanah: Pengajuan Wakaf, review and tracking | resolved | 17, 27 |
| [59](59-lokasi-ditangguhkan-and-berhenti.md) | Lokasi Mitra Ditangguhkan and Berhenti | ready-for-agent | 32, 38, 54 |
| [60](60-real-s3-filestore-adapter.md) | FileStore on the host disk for v1 (S3 adapter in v2) | resolved | — |
| [61](61-real-sumopod-adapter.md) | Real SumoPod PaymentProvider adapter | resolved | 04, 19 |
| [62](62-real-whatsapp-and-sms-adapters.md) | Real WhatsAppSender (kirim.dev) adapter — out of v1 (ADR 0004) | wontfix | 05, 20 |
| [63](63-operator-settings.md) | Pengaturan Operator (Operator settings) | resolved | 09 |
| [67](67-email-login.md) | Email login, Verifikasi email and the "Kirim lewat email" fallback | resolved | 09 |
| [68](68-real-smtp-emailsender-adapter.md) | Real EmailSender adapter (SumoPod SMTP) | resolved | 04 |

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
| 41 | 36 | 104 | 39 | 167 | 09, 82 |
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
| 59 | 41 | 122 | 35 | 185 | 01, 60, 61, 68 (62 wontfix) |
| 60 | 41 | 123 | 35 | 186 | 01 (+ every tick ticket) |
| 61 | 41 | 124 | 41 | 187 | 07 |
| 62 | 40 | 125 | 38, 39 | 188 | 63, 06 |
| 63 | 40 | 126 | 39 | 189 | 67 |
| | | | | 190 | 67, 82 |
| | | | | 191 | 82, 22 |
| | | | | 192 | 22 |
| | | | | 193 | 82, 27 |
| | | | | 194 | 20, 29, 42 |

## Implementation Decisions coverage (by spec module)

- Architecture, AGENTS.md, containers, CI, Sentry SDK: 01; GlitchTip set-up and DNS: 02; production, migrations step, backups, uptime alarm, GlitchTip test errors, cutover on `makam.co.id`: 07.
- Adapter ports: interfaces + fakes 01; Clock 01; PdfRenderer real 18; WebPush real 21; FileStore real 60 (S3); EmailSender real 68 (SumoPod SMTP); PaymentProvider real 61; ~~WhatsAppSender real 62~~ (removed 2026-09-26, ADR 0004: port and fake removed in 82). No SmsSender.
- 1 Identity & Access: 08, 09, 82 (Akun keyed by Email Terverifikasi, Pemulihan Akun, ADR 0004; email login, Email Terverifikasi and the email fallback 67; staff email at invite 09, 10, 55; first Admin Platform seed 09; account move 09; holder number change 39; role visibility 09, 10, 15, 23, 55, 58).
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
- 15 Notifications: core 20; staff push 21; each event in its owning ticket; real sender 68 (62 wontfix); Telepon Pemesan row 20; the email Kode Masuk is sent outside Notifications (67).
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

| [64](64-backups-s3-jakarta.md) | Encrypted Postgres backups to S3 Jakarta and restore test (rescoped for beta: nightly encrypted local dump) | resolved | 03, 07 |
| [65](65-production-switch-makam-co-id.md) | Production switch: makam.co.id from the old app to v1 | ready-for-human | 04, 07, 64, 68 |
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
| [70](70-ops-verify-seeded-email.md) | Ops: mark an Admin Platform's email as Email Terverifikasi from the CLI | resolved | 67 |

## Decisions 2026-09-26 (CI/CD to production)

Decided by the user and written into ADR 0002 (amendment of 2026-09-26) and the spec (Architecture, CI/CD). Revised the same day (ADR 0002, second amendment): GitHub Free has no branch protection or environment approvals for a private repo, so deploys stay pull-based and the host deploys only cosign-signed images, reporting GitHub Deployment statuses; production is an owner-only manual promotion re-signing the staging digest with a production key; secrets stay on the host; production still waits for ticket 64 and the makam.co.id switch stays in ticket 65.

| # | Title | Status | Blocked by |
|---|---|---|---|
| [71](71-ci-e2e-and-image-scan.md) | CI: e2e, image scan and supply-chain hardening on every build | resolved | 12 |
| [72](72-deploys-through-github-actions.md) | Signed pull-based deploys: GitHub Deployment statuses, staging smoke test, production promotion and rollback | in-progress | 71 |
| [73](73-image-retention-and-host-disk.md) | Image retention and disk hygiene on the shared host | resolved | 72 |

## Decisions 2026-09-26 (staff redesign on the brand)

Decided by the user with the brand guideline (`docs/brand/`) and the prototype (branch `worktree-agent-aebfc82ebc2eab39d`, 282bcc0), written into the spec ("Staff UI and design system") and CONTEXT.md (TPS). 74 is the foundation; 75–81 only wait for it. Every UI ticket not yet built (13, 17, 18's document pages if not merged first, 22 onwards) builds on 74's tokens, shell and compositions; 13 and 17 are formally blocked by it.

| # | Title | Status | Blocked by |
|---|---|---|---|
| [74](74-brand-foundation-and-staff-shell.md) | Brand foundation and the staff shell, with the Admin Platform home | resolved | — |
| [75](75-command-palette-and-alert-bell.md) | Command palette (⌘K) and the Peringatan Staf bell | resolved | 74 |
| [76](76-lokasi-mitra-list-and-detail-redesign.md) | Lokasi Mitra list and detail on the list and detail patterns | resolved | 74 |
| [77](77-admin-platform-forms-redesign.md) | Admin Platform forms on the form pattern | resolved | 74, 82 |
| [78](78-admin-lokasi-area-redesign.md) | Admin Lokasi area on the design system, with the Lokasi switcher | resolved | 74 |
| [79](79-field-roles-on-phones.md) | Field roles on phones: bottom navigation for Mitra Jasa and Petugas Lapangan | resolved | 74 |
| [80](80-masuk-totp-and-akun-on-brand.md) | Masuk, TOTP and Akun Saya on the brand | resolved | 74, 82 |
| [81](81-design-system-catalogue-page.md) | Design system catalogue as an Admin Platform page | resolved | 74 |

## Decisions 2026-09-26 (WhatsApp out of v1)

Decided by the user and written into ADR 0004 (which supersedes ADR 0003), `CONTEXT.md` (Akun, Kode Masuk, Email Terverifikasi, Undangan Staf, Pemulihan Akun, Peringatan Staf, Bertugas, Makam TPU), the spec and the tickets named. v1 has no WhatsApp channel: no WhatsApp Business API (Meta / kirim.dev), no `WhatsAppSender` port and no WhatsApp Kode Masuk. An Akun is keyed by its Email Terverifikasi and created by an email Kode Masuk at Kirim or on Masuk. The phone number is kept as an unverified contact. The CS WhatsApp number stays only as a `wa.me` link and for display. A family without email sees "Tidak punya email? Minta bantuan CS", and CS / Admin Platform may submit the order for them (audited, possibly with no Akun, attached later by Nomor Pemesanan). Hak Pakai record a phone and, when known, an email, and are matched to an Akun by that email. The Perpanjangan and consent codes go to that email; without one, the manual KTP / heir / claim paths apply. Family messages go by email, then a "Telepon Pemesan" row. Peringatan Staf go by web push + email, and Bertugas needs at least one active Perangkat Push. Undangan Staf are addressed to an email. Pindah Nomor becomes Pemulihan Akun. Ticket 68 (live SMTP) is a launch requirement, so 65 is now blocked by it.

- **Wontfix**: 05 and 62. No other ticket listed 05 or 62 as a blocker (only 62 listed 05).
- **Now also blocked by 82**: 20, 22, 27, 36, 40, 44, 77 and 80. 65 is now also blocked by 68.
- **Updated to the decision** (What to build / criteria, with a dated Comments entry): 06, 14, 15, 20, 22, 23, 24, 25, 26, 27, 28, 35, 36, 38, 39, 40, 41, 42, 44, 46, 50, 52, 55, 56, 58, 68, 77 and 80. **Comment only**: 17, 29, 60 and 65.
- **Resolved tickets with a Comments note on what is superseded**: 01, 08, 09, 10, 21, 63, 67, 69 and 70.
- **Superseded here**: resolved infrastructure decision 1 (the "CS WhatsApp pointer" for a Pemesan without email), the "WhatsApp outage" bullet of Decisions 2026-09-25 (later), and decisions 1, 5, 6 and 8 of Decisions 2026-09-25 (email login): email login is now the only login and creates the Akun, and there is no fallback and no "Jika email ini terdaftar" reply. `../whatsapp-templates.md` is retired for v1.

| # | Title | Status | Blocked by |
|---|---|---|---|
| [82](82-email-is-the-akun-key.md) | Email becomes the Akun key; the WhatsApp channel is removed | resolved | — |

## Release plan (2026-09-26, speeding up v1)

- 2026-09-28 — **Staging deployed for the first time, and every link in the chain worked at least once.** `MAKAM_TAG=sha-0f59e9ee`, `DEPLOYED_AT=2026-09-28T06:35:34Z`, verified live: `/api/health` 200 with `database.ok` true and the worker `fresh`; the SumoPod webhook answering **401** for a forged signature; the public pages 200; and `PortNotConfiguredError` gone from the log.

  **Six separate faults were stacked behind one 992-line log**, and this is the part worth keeping: the log said `SUMOPOD_API_KEY is required in staging` over and over, which reads as one problem and was six. `cosign` was never installed on the host, so `makam-verify-image` exited **78** before it could check anything and said nothing while doing it — sixteen hours of silence. The staging environment file was missing both SumoPod values. The registry credentials were `0600` and the cosign container runs as uid 65532, so mounting them read-only put the file in the right place for a reader that could not read it. The private key was passed as `COSIGN_PRIVATE_KEY`, **which cosign does not read** — v2.6.1 has no `--key-env` — so the key was never used at all and cosign silently fell back to keyless signing and waited for a browser. And `install-host.sh` run as root left `/opt/makam-v1` root-owned while its units run as `User=ubuntu`, plus a root-owned `.git/index` because `git status` writes it.

  **None of the six was visible in the log, and every one of them was found by running `makam-deploy` and reading what it printed.** The two that were invisible in the strongest sense were the unreadable credentials and the unused key: each had produced a plausible-looking failure earlier in the day, and each had been reported as fixed — the key fix in particular claimed in this file's own comment that "cosign reads COSIGN_PRIVATE_KEY from the environment", which was simply false, and that false sentence is why the job looked repaired.

  **A note on what the first success proves and what it does not.** It proves the pipeline works end to end: build, sign, move `latest`, pull, verify, migrate, run, health. It does **not** prove the application is correct, and the known gaps are unaffected by a successful deploy: a dismissed Tier 1 alert is still invisible to an Admin Platform, the Sentry DSN is still empty so a failed payment or a lost family message is still silent, the Biaya Layanan Platform is still a placeholder chosen after UAT, and the staff page for a Terencana order is still missing, which the builders of both 25 and 37 reported against their own tickets rather than claiming their ACs were met.

- 2026-09-28 — **Two owner decisions on money, both settled, and neither needs a line of code changed.** Ticket 31's builder reported an apparent conflict between two refund rules and escalated it rather than picking one. Read carefully, **they do not conflict**: ticket 24 records the *request* as `total − Biaya Layanan Platform` and only ever handles one case — a Pemesan cancelling their own order — and for that case ticket 31's fault rule also keeps the fee. The two rules intersect exactly where they meet.

  **Settled: `tagihan.pengembalian_jumlah` means the amount *requested*, not the amount *paid*.** The `RFD/…` document carries the amount that actually leaves, following the fault rule — fee refunded when the fault is the Lokasi Mitra's, the Mitra Jasa's or the Operator's. The code is already correct for every case, and ticket 24, already merged, stays untouched. What this decision buys is a **name**: the column reads as a refund amount to anyone who meets it, and the two are equal only for a Pemesan's own cancellation. That is a glossary entry, and a glossary entry is `domain-modeling`'s output, not a hand edit.

  **Settled: the Biaya Layanan Platform is chosen after UAT, not before it.** The number became a real question rather than a formality when SumoPod's terms surfaced: **QRIS is 0,7% + Rp 300 per payment, settling T+2**. A fee below that means the Operator pays to serve each family, so the number is not a pricing preference — it is the floor below which the product loses money on every transaction. A placeholder marked for UAT only, adjustable by Admin Platform in Pengaturan Operator, and the owner's decision on the real figure. The cost of this deferral is named rather than assumed: **during the UAT the tariff is a placeholder, and any reading of Operator income during it is provisional.**

  Also recorded, because it is the same lesson twice: ticket 31's builder **damaged four files itself** trying to normalise the repo's existing `Terbitan`/`terbitan` typo with a regex, which lowercased a `B` and over-matched. It recovered by resetting to `origin/main` and re-applying every change as exact-string edits. Its own conclusion is the durable one — **in a repository that already contains a typo, a "harmless" identifier rename is not harmless, and regex is the wrong tool for it.** That applies to the orchestrator as much as to builders, and it is written down here because this is the second time today a mechanical pass damaged code that looked untouched.

- 2026-09-28 — **A duplicate route exists in exactly one unmerged branch, and the guard everyone assumes catches this cannot.** `tests/support/page-exists.ts:48` is `return containers.some((dir) => existsSync(join(dir, "page.tsx")))` — a **boolean**. Two `page.tsx` claiming one URL still answers `true`, and there is no way to distinguish that from one page. The function answers "is there a page", and has never answered "is there exactly one". Tickets 26 and 43 each hit the resulting gap, and both times only `npm run build` caught it.

  **The news is better than the framing.** Next 16.3.6 **throws** on this — `Error: You cannot have two parallel pages that resolve to the same path` at `next-app-loader/index.js:520` — and `next.config.ts` configures nothing about it. So a duplicate is a **hard build failure**, and the wrong page cannot quietly win. What is missing is only the early warning.

  **One duplicate exists, and it is about to be merged.** Branch `origin/ticket-55-mitra-jasa` has both `src/app/pengurusan-tpu/page.tsx` (full) and `src/app/(site)/pengurusan-tpu/page.tsx` (a `noindex` placeholder). Its merge-base is `0ad08c2`, so it **re-introduces the placeholder ticket 26 removed** — the stale-branch failure mode named in `AGENTS.md`, caught here by an audit **before** the merge rather than by a failed build during it. `origin/main` and the other five unmerged branches have none.

  **Everything else is clean, and that was measured rather than assumed.** All fifty static `href` and `redirect` targets in `src/` were checked with `pageExists`'s own rule and **none lacks a `page.tsx` at the last segment**; the template-literal ones in `src/lib/staff-navigation.ts:76-148` are already covered by `staff-navigation.test.ts:101`. The three branches that add pages are enumerated in the audit so each merge can check them.

  **The cheap guard, described and not written.** `tests/tooling/duplicate-routes.test.ts`: walk `src/app/` for every `page.tsx`, strip `(group)` segments from the path, and require each resulting URL to be claimed by **exactly one** file. The one false positive to design around is a legal **parallel route** (`@slot`), which the Next loader skips at `index.js:517` — so the test must skip them the same way, or it will fail on correct code.

- 2026-09-28 — **Five parallel taxonomies of the same money, and the one that is legitimately three.** A read-only audit was dispatched after three briefs each found a piece of this. It **corrected the framing that sent it**: these are not three copies of "what may be charged", they are **three per-flow policy lists**, each filtering which quoted line kinds may be attached to a Tagihan **in that flow only**. `konfirmasi-saat-duka.ts:209` guards the Saat Duka flow, `layanan/pesanan.ts:69` the Layanan flow, `pengurusan/konfirmasi-saat-duka-tpu.ts:109` the TPU flow, and each refuses with the same shape. **Merging them would delete a difference that is real**, so the recommendation is explicitly *not* to merge them.

  **The real fragility is elsewhere, and it is a hole plus a trap.** A hole: a `layanan_dki` line on a TPU order is **refused** by the Saat Duka list and **accepted** by the TPU list, so nothing stops it reaching a TPU Tagihan. It is not reachable today — no code in the tree maps `layanan_dki` to a `layanan` line — but the window is open. A trap: **none of the three is exported.** They are local `const`s, so a new module that issues a charge **must copy a list**, which is exactly what tickets 45 and 50 did, each duplicating a list it never read. There is no import to copy and no type error to catch a typo in.

  **Five taxonomies in all:** the three per-flow whitelists, `TagihanLine`'s eight kinds in `billing/tagihan.ts`, and `PaymentMoment`'s seven in `due-rules.ts` — which are **the same seven** as `MACAM_MOMEN_TAGIHAN` in `notifications/acara.ts:120`, declared twice. `LAYANAN_TAKE_MOMENT_DUE` holds four of the seven, and **`terencana` and `pengurusan_berkas` are absent with no written reason**; for `layanan` the absence is explained at `due-rules.ts:79`, and for the other two it is simply drift. Only `TARIFF_LINE_KINDS` is exported from a barrel, and it holds **six of the eight** line kinds, with nothing deriving the whitelists from it.

  **The smallest change that makes "added in one place, forgotten in another" impossible**, as a recommendation and not a decision: Billing owns one `CHARGEABLE_LINE_KINDS` of the eight, `newLineSchema` reads it, and each per-flow whitelist becomes `{ wajib: [...], boleh: CHARGEABLE_LINE_KINDS }` so `tsc` fails when Billing has a kind no flow permits. For moments, derive `MacamMomenTagihan` from `PaymentMoment["kind"]` so `LAYANAN_TAKE_MOMENT_DUE`, `MOMEN_PAY_FIRST` and `ATURAN_PENGINGAT` cannot drift a third time. **This is an owner decision taken through `grilling`, not an orchestrator's** — and it is worth taking, because the drift is silent: nothing fails today, a `terencana` Layanan simply would not get its due date from the moment list, and the only symptom would be a family charged late or not at all.

  **One thing the audit found that is already safe, and it matters for the owner's decision of the same day:** `quote()` adds a `biaya_layanan_platform` line only when `lokasiIds.size === 1` and refuses a mixed location set when a TPU line is present (`tariffs/quote.ts:168-178`). So the "no platform fee on a TPU order" rule is **structurally enforced one layer below** the TPU whitelist, not merely permitted by it. The TPU list is a second belt, not the only one.

- 2026-09-28 — **What the observability deferral actually costs at go-live, measured rather than assumed.** The owner moved GlitchTip, observability and the rest of the monitoring to Rilis 2. The source-map job was already outside the `deploy gate`, so nothing about the deploy changes. Three things were checked and are worth writing down, because two of them are consequences and one is a real risk.

  **The risk: a failure in payments or messaging is currently silent.** `reportError` is wired into the server runtime (`src/server/runtime.ts:81`) and the worker (`src/worker/main.ts:25-27`), and it is the error path for message delivery (`src/domain/notifications/index.ts:378,404`) and for payment settlement (`src/domain/billing/settlement.ts:200,238`). Sentry is initialised in four places — `src/instrumentation.ts:3-7`, `src/instrumentation-client.ts:35`, `src/worker/sentry.ts:7` and `onRequestError` — but it is **inert while the DSN is empty** (`src/lib/observability/scrub.ts:136`, `src/lib/env.ts:36`), and the DSN is empty for want of the instance that is now Rilis 2. So during a UAT a failed payment or a lost family message is recorded nowhere a human looks and delivered nowhere. **For a product whose money moves through a Tagihan, that is not an acceptable cost, and it is a cost of the deferral rather than a defect waiting to be fixed.**

  **What must keep working in Rilis 1, and does:** the signature check on the deployed digest (`deploy/bin/makam-verify-image:56-59`, exit 77) stops a deploy outright; `/api/health` plus `makam-healthcheck` and its timer are the only thing that would surface a dead database or a dead worker; and the message log itself is the last trace of a failure. All three are independent of GlitchTip and all three stay. `makam-deploy-status` and `makam-glitchtip-release` are best-effort and exit 0, so they may wait. Structured logging is **not found** anywhere in the tree, so there is nothing to defer there.

  **The consequence worth naming when Rilis 2 comes:** a dismissed Tier 1 alert is one row per account (`notifications/schema.ts:44`), filtered by `accountId` (`:450`) and marked read per reader (`:475-486`), so **an Admin Platform never sees it**. That is not a tooling question — it is whether a cemetery notices a problem — and it is the thing to raise when monitoring is picked up again, because a dashboard would not fix it.

  **The scrubbing is alive, which is the part that matters for privacy.** `beforeSend` is wired in five places, not merely defined: `src/sentry.server.config.ts:3,6`, `src/instrumentation-client.ts:3,35`, `src/worker/sentry.ts:2,7`, `src/cli/sentry-check.ts:16,32`, and `scrubText` is called from the domain at `src/domain/notifications/index.ts:40`. Of the three rules `AGENTS.md` states — no request bodies, no phone numbers, no files — **two have tests** (`scrub.test.ts:78` for bodies, `:5-97` for phone numbers) and **the file rule has none**. So "Sentry never receives an uploaded document" is currently a **promise rather than a control**, and uploaded documents are the most sensitive thing this system holds. The fix is one test in Rilis 1, not Rilis 2, and it is recorded here rather than left for whoever picks up monitoring.

- 2026-09-28 — **Owner decision, settled: GlitchTip, observability and the rest of the monitoring move to Rilis 2.** They are out of the go-live scope, and the practical effect is that **`GLITCHTIP_AUTH_TOKEN` is not needed now** — the orchestrator spent the afternoon telling the owner it was, and on 2026-09-28 that turned out to be doubly wrong: the job had never been able to load its own local action, and the token would not have turned it green even if it had been set. What is actually being deferred is the monitoring surface itself, not a broken build step: the `Source maps to GlitchTip` job is **already outside the `deploy gate`**, so staging deploys do not depend on it and never did. There is no `environment:` on any monitoring job either, and the scrubbing in `src/lib/observability/scrub.ts` — which is the part that matters most here, since a Sentry event must never carry a request body, a phone number or a document — is merged, tested and independent of the token.

  **What this leaves, so it is not re-opened by accident:** a UAT on staging will run without source maps, so a stack trace from staging arrives minified and unreadable, and every finding has to be reproduced by hand rather than read off a release. That is a real cost of the decision and it is a cost of the decision, not a defect to be fixed later under the same name. The second monitoring question the audit raised — whether a dismissed Tier 1 alert is visible to the staff it was sent to — is also now Rilis 2 scope, and is the one worth naming when the time comes, because it is not about tooling at all.

  **Recorded here rather than only acted on** because the scope of a release is exactly the kind of thing that a later ticket re-opens by assuming it was always in. Rilis 2 is monitoring; Rilis 1 is a cemetery that a family and its staff can actually run.

- 2026-09-28 — **Factual correction to the entry above, and it is the orchestrator's own false claim.** That entry says "**Perpanjangan is fully built and usable but has almost no data until real bookings land**." **It is not built.** `src/domain/perpanjangan/` contains exactly one file, `index.ts`, and its whole body is `export {}` — the placeholder from the walking skeleton (ticket 01). There is no `schema.ts` and no table in the module. Tickets **40, 41 and 42** are all `ready-for-agent`, which is the correct state and the one the earlier entry should have said.

  The claim was written on 2026-09-27 while correcting a different thing (the deliberate deferral of the Excel import, which stands and is not reopened by this), and it was **inferred rather than read**: the argument went "the import is deferred, so the only thing missing is data", and the missing-code part of that was never checked against the tree. It survived three days because a sentence in a release plan is not a test, and nothing in CI can tell a true sentence from a plausible one. A read-only brief for ticket 41 found it by listing the module's directory, which is the cheapest possible check and the one that should have been done the day the sentence was written.

  **The launch consequence is therefore stated once, correctly, and it is different from what was written before.** At launch there will be **no renewal at all** — not "renewal with little data". A family cannot renew a Hak Pakai that does not exist, a Hak Pakai comes only from a real booking through the clearing flow, and the code that would renew it arrives with 40, 41 and 42. The Excel deferral is still deliberate and this does not reopen it; what changes is that Perpanjangan is **unbuilt scope inside Rilis 1** (13–17, 19–33, 34–42, 49–57, 59), not a finished feature awaiting data. Which is also why 40 is not simply blocked on 29 and 32: with the module itself a placeholder, 40/41/42 are three tickets that have to create the module, its tables and its public interface, and 41's brief found that its manual path cannot lean on any existing proof of authority at all — the only one today is "the email recorded on the Hak Pakai", and a manual applicant by definition has none.

- 2026-09-27 — **Factual correction to the release-plan line above: "43 and 48 already merged" was wrong; only 43 is.** Ticket 48 is `ready-for-agent` and `Blocked by: 47`, and 46, 47 and 58 are `ready-for-agent` too. The orchestrator wrote that parenthetical while widening the plan and did not check it. **45 is nonetheless required** — not as a journey step, but because 56 (Layanan at a TPU, and the only source of Mitra Jasa work) is `Blocked by: 45`, so 45 must be built as 56's dependency. The consequence for 46, 47 and 48 being `ready-for-agent` is that the six order statuses they alone reach — `dokumen_lengkap`, `menunggu_pembayaran`, `diproses`, `perlu_perbaikan`, `iptm_diajukan`, `iptm_terbit` — are **not** in the order vocabulary today, by decision rather than by oversight (ticket 44's review fix): each of those tickets adds its own `CONTEXT.md` entry and label when it lands, because `domain-modeling` output belongs to the ticket that introduces the term, and a label for a status no one can reach is a claim about a future that has not been built. The status-badge test that caught this is the guard doing its job: it fails whenever a status appears in the vocabulary without a `CONTEXT.md` entry to back it.

- 2026-09-27 — **Correction to the entry above, from a journey audit the orchestrator ran against the spec. Two of the four journey lines were wrong, and both were the orchestrator's own writing, not the owner's.** The entry says **Admin Lokasi** "mengelola petak, harga, konfirmasi, memenuhi order Layanan, dan **tangguhkan/akhirkan**". The spec does not support either half: story 12 and Identity §1 put `perlu_totp` and price-setting with **Admin Platform** only, ticket 49's `tawarkanLayanan` is an Admin Platform action, and the Admin Lokasi menu has no Tarif at all; and ticket 59 (Ditanggushan/Berhenti) is **Admin Platform's** authority per story 152, not a Lokasi Mitra's. So the corrected journeys read: **Admin Lokasi** manages plots, working hours, confirmation, recording the burial, fulfilling a Layanan order with photo proof, complaints, document review, a Pemegang Hak change request and ending a Hak Pakai; **Admin Platform** sets prices, suspends or ends a Lokasi Mitra, and does the Audit Log. The owner has not been asked about either, because the spec already answers both and the orchestrator should not have invented a step and then presented it as a decision. **Do not build Admin Lokasi price-setting or suspension** without a new ticket and an owner decision.
- 2026-09-27 — **Correction, and this one is the reverse: a "gap" the audit reported that is already settled and must not be re-raised.** The audit reported that Excel import of existing Petak and Hak Pakai has no ticket, leaving Perpanjangan (40–42) nothing to operate on. The deferral is already deliberate and recorded — `00-index.md` "Could not place" item 1 ("a stated requirement" but "not in the first build"; the template waits for the first partner), and ticket 14 ("Excel import is deferred; this clearing flow is how records get in"). **The real consequence, which is worth stating once and is not a reason to reopen the deferral: at launch a family can only renew a Hak Pakai that exists, and Hak Pakai come from actual bookings through the clearing flow.** So Perpanjangan is fully built and usable but has almost no data until real bookings land. That is a property of going live with a clean slate, not a missing ticket.
- 2026-09-27 — **Rilis 3, answered: it stays out.** No step in any of the four journeys can only be done by tickets 45, 46, 47 or 58. One sequencing fact, which is not a journey reason: **56** (Layanan at a TPU, and the only source of Mitra Jasa work) is `Blocked by: 45`, so **45 must be built as a dependency of 56** even though 45 is not itself a journey step. 46, 47 and 58 remain optional.
- 2026-09-27 — **Two further gaps the audit found, both needing a ticket and neither needing a decision:** the Admin Platform **"Audit Log"** menu entry has no `href` and no page — the module (ticket 09) and the per-Lokasi log (ticket 10) are merged, so the global log a staff member expects from a staff area is simply absent; and the Petugas Lapangan **"Jadwal"** entry shows "Segera hadir" (tickets 15, 79) with nothing behind it. The first is the worse of the two: an Audit Log is a trust feature for a cemetery business, and its absence is visible to any staff member who looks for it.

- 2026-09-27 — **Owner decision, settled: Rilis 1 absorbs Rilis 2, and Rilis 1 is complete end-to-end journeys for every role.** The release plan below (2026-09-26) split the work so that go-live meant *a family can book*; the owner has replaced that framing. A go-live beta in which the Pemesan can book but cannot order Layanan, cannot renew a Hak Pakai, cannot complain, and in which a Mitra Jasa cannot be onboarded, cannot receive a photo-proof task or cannot be paid, is not a beta a family or an operator can actually run — so those journeys are now in scope for Rilis 1, not deferred to a release that may never come before the Operator signs off. Concretely, the journeys Rilis 1 must complete: **Pemesan** books (Saat Duka and Terencana), pays, gets documents and a Bukti Pemesanan, then orders Layanan, renews a Hak Pakai, files a complaint and withdraws; **Admin Platform** works the Antrean, confirms, issues documents, reviews a scorecard and processes a payout; **Admin Lokasi** manages plots, prices, confirms, fulfills a Layanan order and suspends or ends; **Mitra Jasa** is onboarded, takes a task, submits proof and is paid. **Do not re-split these into a later release to make Rilis 1 look finished.** Whether Rilis 3 (43–48, 58) also folds in is the open half of this decision and is recorded below.
- 2026-09-27 — **Owner decision, settled: the practical consequence is that the queue is already correct and must not be reordered.** With Rilis 2 inside Rilis 1, the remaining scope is tickets 24, 25, 27–33, 34, 35, 37–42, 44, 50–57, 59, 65 and 72 — and 24 and 25 are its keystone, opening 27, 28, 29, 30, 31 and 32 at once. Adding builders for anything further up the chain would only queue work behind the one shared test database. The four in flight (24, 25, 34, 55) are the four that unblock the most, which is why they are the four.

Decided by the user; spec "Release plan". Rilis 1 (go-live), **widened by the user 2026-09-27 to Rilis 1 + Rilis 2 and to complete end-to-end journeys for every role**: 13–17, 19–33, 34, 35, 36–38, 39–42, 49–57, 59, 60, 61, 64, 65, 68, 71–84. Rilis 3: 43–48, 58 (only 43 merged; 45 required as 56 dependency). The previous split, kept for the record: ~~Rilis 1 (go-live): 13–17, 19–33, 36–38, 60, 61, 64, 65, 68, 71–83. Rilis 2: 34, 35, 39–42, 49–57, 59, 84.~~ Critical path to the next milestone (a family books Saat Duka on staging): 83 → 82 → 13 (after its prototype) → 14, 15 → 16 → 17 → 20 → 22 → 23 → 24 → 25; 19 and 71 in flight; the public prototype (26, 16, 22) runs alongside. Prototypes only for the public site and the Denah editor. The orchestrator merges clean two-axis reviews without asking (user's standing authorization).

| # | Title | Status | Blocked by |
|---|---|---|---|
| [83](83-lean-worktrees-for-four-agents.md) | Lean worktrees: four builder agents on the shared host | resolved | — |
| [85](85-worktree-tooling-hardening.md) | Worktree tooling hardening (follow-ups from ticket 83) | resolved | — |

Also settled 2026-09-26 (user): the Masuk reply is the same for every email (an unknown email creates an Akun once its code is entered); "Telepon Pemesan" is a Tier 2 Admin Platform Antrean row; consent for a burial under an existing Hak Pakai uses a code sent to the recorded email (Rilis 2); an unanswered Tier 1 alert gets a header banner, not a call row (ticket 28).

## Decisions 2026-09-26 (public prototype v2, late payments)

- 2026-09-28 — **Owner decision, settled: the Admin Platform adjusts every cost, and the asymmetry at a TPU is deliberate.** Asked through `grilling` because the code had reached a money rule with no decision behind it. **The Biaya Layanan Platform exists because the Operator is the seller of record and disburses a partner itself** — so a TPU order, which has no partner tariff to sit on and no partner to disburse, carries **no platform fee at all**, and the Operator's income there is the Biaya Pengurusan plus the **Margin Layanan TPU**, which lives inside the price the family pays and is **never shown as a line of its own**. The two are different things and the glossary now says so: `Margin Layanan TPU` is in `CONTEXT.md` with "platform fee" and "komisi" under `_Avoid_`, and ADR 0001 is **amended** rather than a new ADR written, because central collection and the fee are one decision and splitting them would leave a reader with two documents that each half-answer the question.

  **What this is not:** it is not a decision that the rate is known. Nothing states **how** the Margin Layanan TPU is set — the `layanan_dki` tariff is versioned and Admin-Platform-settable, but whether that price is *the* price including margin or a base to which margin is added is **not found in the spec**, and that is a gap, not a settled detail. Nor does it settle that a Mitra Jasa can be paid: `payouts` is a placeholder, `partner_share` is nowhere in the tree, and the audit of ticket 30 found `pencairanTerbit` unwired in production so **every partner share is refused**. So the margin is currently income on paper that cannot reach the person doing the work. That is the program, not a decision, and it is recorded as a gap with its tickets rather than as something waiting on an answer.

  **And the same decision answers "who may set prices":** the Admin Platform adjusts every cost, which is what `spec.md:366` and story 152 already say and what `identity/authorize.ts` already enforces — Tarif is `admin_platform` only, and the Admin Lokasi menu has no Tarif at all. Writing it here as settled means a later ticket cannot quietly hand price-setting to a Lokasi Mitra, which a journey audit has already caught being invented once.

  **The second decision from the same session, for ticket 55:** one Akun may hold many roles (`spec.md:342`), so an `admin_platform` who also holds `mitra_jasa` **does** get a Mitra Jasa profile, and an Operator's own email may be onboarded as a Mitra Jasa — `spec.md:344` makes the strict 12-hour TOTP session apply *"whatever other roles it holds"*, so the security rule does not loosen. The code had already taken this position as a comment in `mitra-jasa.ts:516-524`; it is now a decision rather than a comment. **Because an Operator who approves on the Operator's behalf can then accept work the Operator pays for, the audit log must distinguish an Operator self-onboarding from an ordinary Mitra Jasa onboarding** — without that, a conflict of interest leaves no trace.

The user accepted the eight recommendations from the public prototype v2 (Terencana wizard with the Denah picker, keyless Google Maps; recorded on tickets 36, 16, 15) and the late-payment rule (spec, Billing; ticket 19). New Rilis 2 ticket:

| # | Title | Status | Blocked by |
|---|---|---|---|
| [84](84-denah-entrance-cell.md) | Pintu Masuk on the Denah | resolved | 13, 36 |

## Decisions 2026-09-26 (beta UAT push)

The user wants v1 live ASAP as a beta for UAT **on makam.co.id**, with everything in Rilis 1 kept. ADR 0002 (beta UAT amendment). S3 (03) moves to v2; files use a host-disk FileStore (60, rewritten); backups are nightly local encrypted dumps (64, rescoped); payments use the SumoPod sandbox (04/61); content is dummy stock (06); catalog data comes from the old app (86, non-personal only); the switch (65) now waits on 60, 64, 68 and 86.

| # | Title | Status | Blocked by |
|---|---|---|---|
| [86](86-import-old-app-catalog-for-beta.md) | Import the old app's cemetery catalog as beta data | resolved | 12 |

| [88](88-pilih-makam-setelah-tolak.md) | Pilih makam after a Tolak: banner, the refusing Lokasi, and rebooking (deferred from the 24 merge) | resolved | 24 |
| [87](87-cloud-session-readiness.md) | Cloud session readiness (Claude Code on the web) | in-progress | — |
| [89](89-tagihan-terbit-never-announced.md) | A Tagihan was never announced: `tagihanTerbit` had no caller | resolved | — |
| [90](90-pencairan-never-told-of-pemakaman.md) | Payouts is told when a Pemakaman is recorded (Saat Duka Pencairan never became due) | resolved | 25, 32 |
| [91](91-staff-alerts-retried.md) | Staff alerts are sent once and never retried | resolved | — |
| [92](92-pembatalan-kedua-menunggu-transfer.md) | A second Pembatalan on one Tagihan waits for the earlier refund's transfer | resolved | — |
| [93](93-stored-tagihan-id-after-harga-khusus.md) | Readers of an order's stored Tagihan id after a Harga Khusus reissue | resolved | — |
| [95](95-refund-after-harga-khusus.md) | Refunds of a Keluhan and a Layanan cancellation after a Harga Khusus are refused | resolved | — |
| [96](96-staff-alerts-direct-retried.md) | Staff alerts sent directly through `sendStaffAlert` are still one-shot | resolved | — |
| [97](97-terencana-peringatan-staf.md) | A new Pemesanan Terencana raises a Peringatan Staf to the Admin Lokasi | resolved | — |
| [98](98-kirim-kode-masuk-galat-tak-tertangani.md) | Kirim may show the framework error page when the Kode Masuk cannot be sent | in-progress | — |
| [94](94-payouts-items-due-tiebreaker.md) | Payouts `itemsDue` orders only by due time, so "oldest item first" can flake | resolved | — |
| [99](99-tagihan-detail-404.md) | Admin Platform Tagihan detail always 404s | resolved | — |
