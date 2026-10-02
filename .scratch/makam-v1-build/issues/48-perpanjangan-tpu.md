# Perpanjangan TPU (IPTM renewal)

Status: ready-for-agent
Blocked by: 47
Spec: Domain modules > 8. Pengurusan (Perpanjangan TPU statuses, expiry date, past-grace check, PTSP rejection); 15. Notifications (IPTM expiry reminders); 14. Work Queues (Tier 3 past-grace TPU check, filing-only check and filing); stories 79, 80, 81, 82, 83

## What to build

IPTM renewal for a Makam TPU. Reminders go to the Pemegang Hak 3 months and 1 month before the IPTM expires, offering Perpanjangan. From 3 months before expiry the Pemegang Hak requests one 3-year term, giving the IPTM expiry date (read off the IPTM photo and corrected by Admin Platform). The order runs Diajukan → (Perlu Perbaikan ↺) → Menunggu Pembayaran → Diproses → IPTM Diajukan → IPTM Terbit, plus Ditolak and Dibatalkan, pay-first after the document check. Past the masa tenggang (DKI 3 months), the Operator checks with the TPU first without charge (Tier 3 past-grace row) and closes the request as Ditolak if it won't renew. Show "IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran".

## Acceptance criteria

- [ ] Reminders at 3 months and 1 month before the Makam TPU's IPTM expiry, 08:00–20:00, stopping once a Perpanjangan TPU is ordered.
- [ ] Request allowed from 3 months before expiry; the form captures the expiry date; Admin Platform can correct it (audited).
- [ ] Perlu Perbaikan loop before payment; pay-first Tagihan (filing-only Biaya Pengurusan) issued only after the check, due 3×24 h, lapsing to Dibatalkan.
- [ ] Past-grace request: no Tagihan until the TPU check row is resolved; "won't renew" → Ditolak with no charge.
- [ ] PTSP rejections follow ticket 47's rules (fixable → Perlu Perbaikan, no charge; final → full refund).
- [ ] IPTM Terbit updates the Makam TPU's current IPTM and history.
- [ ] Tests: reminder timing; the request window; past-grace path; pay-after-check; history update.

## Added (2026-09-25)

- [ ] Optional email field on the order screen (copies of Tagihan / Bukti by email through SumoPod SMTP; SES dropped 2026-09-25), as in spec "Booking wizards".

### 2026-10-02 builder (ticket 48, sonnet, claude.ai/code thread)

- **Pilot thread facts** (2026-10-02): `nproc` = 4; `free -g` = 15 GB total, 11 GB free, no swap; the Skill tool loaded `tdd` (yes); Docker was up after the SessionStart hook (`docker info` OK).
