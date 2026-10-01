# Handoff 2026-10-01: demo UAT of Rilis 1 on `dev.makam.co.id`

Owner talks Bahasa Indonesia. Code of Rilis 1 is merged (see `.scratch/makam-v1-build/issues/00-index.md`); what is left is **proving the sandbox payment and the staff journey on staging** and the owner-gated go-live (ticket 65). Read `AGENTS.md`, `docs/agents/orchestration.md`, and the demo script kept in the session scratchpad (re-derive from this file if gone).

## Where things stand (main at `3c9ff40` when written)

- CI: run 310 green; run 312 (latest) was still running. Staging `/api/health` ok, worker fresh.
- Open tickets that matter: **98** (needs-triage, see below), 65 (human), 72 (GlitchTip token, promotion rehearsal), 87, and Rilis 2 ones (92, 95 phase A branch `ticket-95-refund-harga-khusus` unreviewed, 96).
- Token work is done and merged: `docs/agents/orchestration.md` ("Token discipline"), `docs/agents/token-principles.md` (model-agnostic), `.claude/agents/builder.md` + `reviewer.md`, `scripts/agents/usage-report.py` (`--profile`). Project agents `builder`/`reviewer` only load in a **new** session; use them there. 1-hour cache is not worth enabling (about 3.2M units saving, under 1%).

## Staging UAT: what was proved on 2026-09-30

- Public Terencana wizard works: location cards, Denah (Blok tabs, Petak buttons), Data & kirim, Kode Masuk.
- **Email works**: SumoPod SMTP delivered a Kode Masuk to the owner's real test mailbox (the owner reads each 6-digit code aloud; never read their Gmail, never use or mention the owner's team email in the project).
- A Terencana order was placed: **MKM-2026-000001**, Petak **A-01** at Pemakaman Wakaf Al-Ikhlas (Rp 3.250.000), held, awaiting Lokasi confirmation. **Cancel it at the end of the UAT** so A-01 is Tersedia again (family cancellation is free before payment).
- Order of events for Terencana: submit (nothing paid) → Admin Lokasi confirms (next working day) → Tagihan issued, 24 h to pay → pay (SumoPod QRIS sandbox) → Lunas → Aktif + Bukti Pemesanan. So payment cannot be simulated before confirmation.

## What is NOT proved (ticket 61 AC still open)

Admin Lokasi confirmation, Peringatan Staf on all channels (push, email, bell, Antrean row; ticket 97), Tagihan email, **QRIS sandbox payment to Lunas/Aktif/Bukti**, SumoPod webhook 2xx, Hak Pakai in `/makam-keluarga`, Saat Duka path end to end.

## Blockers (owner)

1. **Admin Lokasi accounts**: seeded ones are `@contoh.makam.invalid` and cannot log in. Needs an invite via Admin Platform (`/staf/admin-platform/lokasi/[lokasiId]/admin-lokasi`), then set as Kontak Siaga. Admin Platform has TOTP; **do not build or request a TOTP bypass** (owner asked twice; declined, reasons given: weakens a spec'd control and ships to production; and no host access). The accepted route: the owner reads the TOTP code like a Kode Masuk. Still needed from the owner: Admin Platform account email, an email for the Admin Lokasi, and its codes.
2. **`pay.sumopod.com`** must be allowed in the environment's network access (CONNECT returned 502 from this sandbox; `api-pay-sandbox.sumopod.com` is reachable). Do not disable TLS verification or unset `HTTPS_PROXY`.
3. **Hijau Asri tariff**: its Petak cost Rp 11.250.000, above the Rp 10 million QRIS limit, so Terencana there cannot be ordered (the wizard's Lanjut stays disabled). Owner decides: lower the tariff (Admin Platform) or demo Terencana at Al-Ikhlas. The owner's grilling chose Hijau Asri as the demo Lokasi; this is a conflict to put to them.

## Ticket 98 (needs-triage): what is known

`.scratch/makam-v1-build/issues/98-kirim-kode-masuk-galat-tak-tertangani.md` (read its Comments; the first correction was itself corrected). Kirim with a valid code works. Unexplained: the framework error page ("This page couldn't load") appeared (a) when requesting the code for an `…@contoh.makam.invalid` address, (b) once on the "Kirim ulang kode" click 79 s after the first send, run without network logging. Also one unstyled screenshot of the `terkirim` page (maybe mid-load). Next: re-run (b) with POST and console logging and (a) again; then reproduce with a throwing fake `EmailSender` through the identity module (`src/app/(site)/masuk/actions.ts` has no try/catch). Only fix with a failing test first.

## How the Chrome UAT was driven (the script lived in `/home/user/ui-parity/pay/`, which is lost with the container; recreate)

- Playwright from the repo's `node_modules`, `executablePath` = the `chrome-headless-shell` under `/opt/pw-browsers/chromium_headless_shell-*/`, args `--no-sandbox`, `--proxy-server=$HTTPS_PROXY`, and `--ignore-certificate-errors-spki-list=<SPKI pin of the proxy CA>` (pin only that CA; never turn verification off).
- Selectors that worked: card `getByText("Pemakaman Wakaf Al-Ikhlas")`; Petak buttons have `aria-label` like `A-01, Makam Umum, Tersedia` (select with `button[aria-label$="Tersedia"]`); Lanjut; fields labelled Nama lengkap / Email / Nomor telepon; the code panel appears after "Kirim pesanan" with a **separate "Kirim Kode Masuk" button**, then the 6-digit field, then **"Kirim pesanan" matched exactly** (the last button matching `/kirim|pesan/` is "Kirim ulang kode": that mistake cost several rounds). The Petak URL is `?langkah=petak&lokasiId=…&petak=A-01`.
- A Kode Masuk lives 10 minutes and resend has a 59 s cooldown. Run the script as a harness-tracked `run_in_background` command (a `nohup`/`setsid` process was killed when the turn ended), have it write a flag and wait for a `kode.txt`, and ask the owner for the code only after it reports "KODE DIKIRIM". Never leave it waiting longer than the code's life.
- Log `page.on("response")` for POSTs and `console`/`pageerror`; a Next.js server-action error shows only as the generic error page.

## Next steps (in order)

1. Get the owner's three inputs above (and the Hijau Asri decision), then: Admin Platform login (Kode Masuk + TOTP read by the owner) → invite Admin Lokasi for the Lokasi → login as Admin Lokasi → confirm MKM-2026-000001 → Pemesan opens Tagihan → Bayar → `pay.sumopod.com` → QRIS, wait a few seconds, simulate → verify Lunas / Aktif / Bukti with screenshots → cancel the test order. Owner checks the SumoPod dashboard webhook is 2xx. Record the date in `docs/ops/runbook.md` ("Test payment (SumoPod sandbox)") and tick ticket 61's AC.
2. Walk the visual UAT of journey 2 (Kontak Siaga, Jam Operasional/Tanggal Tutup, Denah Blok/Petak/Kavling/clearing, Antrean, Audit Log) with screenshots; then Saat Duka.
3. Triage ticket 98 as above.
4. Go-live (ticket 65) is human-gated: list in the session's `go-live-rilis-1.md` (rebuild from ticket 65, spec "Release plan", runbook "Promoting to production").

## Rules to keep

Never push to `main` from a builder; the orchestrator merges via a worktree from a freshly fetched `origin/main` (docs-only merges run only `tests/tooling` and `tests/support/global-prune.test.ts`). One full suite at a time. Every command that could take more than a few seconds runs in the background. No `docker ... prune`. Disk is tight (about 2 GB free at the time): remove merged worktrees and `.next`/`dist`.

## Suggested skills

- `diagnosing-bugs` (ticket 98), then `tdd` for any fix.
- `run` for driving the app/Chrome checks.
- `code-review` before merging any code change (two axes, verbatim, per `AGENTS.md`).
- `grilling` + `domain-modeling` only if the owner changes a decision (e.g. Hijau Asri tariff vs the Rp 10 million limit).
