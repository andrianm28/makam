# Kirim in the booking wizards may show the framework error page when the Kode Masuk cannot be sent

Status: needs-triage
Blocked by: —
Spec: spec.md, Identity & Access

## What to build

Found in the sandbox-payment UAT on `dev.makam.co.id` (2026-09-30). In the Terencana wizard at Pemakaman Wakaf Al-Ikhlas (Petak A-01, Rp 3.250.000), a visitor with no session filled Data & kirim with an email at `contoh.makam.invalid` and pressed "Kirim pesanan". Eight seconds later the page was the framework's generic "This page couldn't load / Reload / Back" screen, not the "gagal kirim" message the spec promises ("on failure the person logging in sees 'gagal kirim' and can retry"). Staging was healthy (`/api/health` ok, worker fresh).

Suspected cause, **not yet proven**: the SMTP relay rejects the recipient and the adapter throws; `kirimKodeMasuk` (`src/app/(site)/masuk/actions.ts`) has no `try/catch` and the identity module may not turn a thrown send error into a refusal. Not yet excluded: another failure on the Kirim path that only looks the same.

To do: reproduce with a fake `EmailSender` that throws on `send`, through the identity module's public interface and through the wizards' Kirim step; then make a send failure return the "gagal kirim" state, with no Kode Masuk message-log entry and no automatic retry (AGENTS.md exception for the Kode Masuk). Check the Saat Duka wizard and `/masuk` too. If the cause turns out to be different, say so here.

## Acceptance criteria

- [ ] A test with an `EmailSender` that throws shows the person gets "gagal kirim" and can retry, from `/masuk` and from Kirim in both wizards.
- [ ] The cause of the staging error page is named in `## Comments` (a reproduced throw, or the actual failure).
- [ ] No message-log entry and no automatic retry for the Kode Masuk.

## Comments

- 2026-09-30 — Filed from the UAT; owner asked for it ("ya"). Reproduction with a deliverable address not yet done.
- 2026-09-30 — UAT correction, **the suspected cause above is not the whole story.** With a deliverable address (`andrianm28bot@gmail.com`) the Kode Masuk step works: the wizard shows "Masukkan Kode Masuk", the email is sent ("Kode Masuk 6 angka sudah kami kirim ke …", cooldown counter), and the code the owner read back was entered within its 10 minutes. **Pressing "Kirim pesanan" with that valid code then showed the same framework error page** ("This page couldn't load"), the URL stayed at `?langkah=data&…&petak=A-01` (no redirect to `langkah=terkirim`), and Petak A-01 at Pemakaman Wakaf Al-Ikhlas still reads "Tersedia" on the public Denah afterwards, so **no order and no hold were created**. So the throw is in `verifikasiKodeMasukDanKirimTerencana` (`src/app/pesan-makam/terencana/actions.ts`) before `placeTerencana` commits: `identity.verifyKodeMasuk`, `setSessionCookies`, or the transaction inside `placeTerencana`. Ruled out by reading: the Peringatan Staf push body (order numbers are `MKM-YYYY-NNNNNN`, which `scrubText` leaves alone) and a failing email send (caught in `sendStaffAlert`). The earlier crash with the `.invalid` address happened at the click that *requests* the code; whether it shares a cause is unknown. Needs the server error: the `web` container log on the staging host or the GlitchTip entry at errors.makam.co.id around 18:06 UTC on 2026-09-30.

