# Handoff 2026-10-02: Rilis 1 UAT (lanjutan) on `dev.makam.co.id`

Continues `.scratch/makam-v1-build/handoff-2026-10-01-uat-rilis-1.md`. Goal: finish Rilis 1 and its UAT fully. Owner talks Bahasa Indonesia.

## Where things stand

- **`main` at `ed9d9f34`** (pushed); **staging `dev.makam.co.id` runs image `sha-ed9d9f34`**; `main` CI green; `deploy-gate` passes.
- Merged Rilis 1 batch: **92, 95, 96, 54, 99** (+ hotfixes: seed clock, seed reconcile idempotency, Bayar provider-error). Migrations: 92=`0047`, 96→`0048`, 54→`0049`.
- **Docs written but UNCOMMITTED in the main worktree `/home/ubuntu/makam`** (which is still at `365b9007`): `docs/adr/0005-perpanjangan-in-rilis-1.md`, the spec "Release plan" amendment, `.scratch/makam-v1-build/uat-rilis-1-checklist.md`, `.scratch/makam-v1-build/go-live-rilis-1.md`. Uncommitted ticket-98 triage edits + index tweaks also sit there.
- **Cleanup done**: 16 session worktrees removed, ~32 merged branches pruned, 4 dependabot PRs closed. Remaining worktrees `makam-deploystatus` and `makam-tfixhost` belong to another session — **do not touch**.

## UAT proven

- **Terencana e2e**: order `MKM-2026-000001` (A-01, Pemakaman Wakaf Al-Ikhlas) → Admin Lokasi confirm → `TGH/2026/000001` → **Bayar** at `pay-sandbox` (checkout amount exactly Rp 3.250.000) → **Simulate Payment** → webhook `payment.completed` → Tagihan **Lunas** → **Bukti Pembayaran** → **Bukti Pemesanan + Hak Pakai**.
- **Ticket 99** (Admin Platform Tagihan detail 404) fixed and live.
- **SumoPod fee mode**: project "Charge fee to customer" turned **OFF** (merchant bears; net = request − fee); response now `amount = request`. The code fee-inversion branch was **not** used.
- Staging DB test rows (`provider_payment` + `pembayaran_perlu_ditinjau` from the earlier mismatch) were deleted before the successful Bayar.

## UAT remaining

- **Saat Duka e2e**, **Perpanjangan e2e**, **4 notification channels** (Antrean row / bell / email / push), **all Admin Lokasi job desks**, then **cancel the test order** so A-01 is Tersedia again. Step list: `.scratch/makam-v1-build/uat-rilis-1-checklist.md`.
- **Perpanjangan needs a fixed-term Hak Pakai**: A-01 is **selamanya** (not extendable). No Terencana order can yield a fixed-term right — Al-Ikhlas is all selamanya; Hijau Asri is fixed-term but **over the Rp 10 juta QRIS cap**. Path: a **Saat Duka** order at a fixed-term, under-cap Lokasi — **Makam Masjid Nurul Huda** "Makam Umum" 10 th ≈ Rp 4 jt, or **Pemakaman Bukit Sejuk** "Makam Standar" 15 th ≈ Rp 8,25 jt.

## Wizard automation notes

- Dedicated Chrome on CDP **:9333** (`/opt/google/chrome/chrome --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/user/1000/opencode/uat/chrome-profile`). The browser on **:9222 is the opencode web UI** — never attach to it.
- **Terencana**: click the Lokasi card, wait ~2 s for the Denah, click `button[aria-label^="A-01"]`, confirm `aria-pressed=true`, then "Lanjut". A Kavling membership makes "Lanjut" stay disabled when the all-in total passes the QRIS cap.
- **Saat Duka**: first step shows Lokasi×Jenis cards; click the card matching `/10 tahun/` (Nurul Huda), then "Lanjut". Flow was mid-way when this handoff was written.
- Helper scripts live in `/tmp/user/1000/opencode/uat/*.cjs` (Playwright from `/home/ubuntu/makam/node_modules`).

## Owner-gated / open

- **35** (channel for the tumpang consent one-time code: Notifications vs an AGENTS/ADR exception) and **39** (Calon Penghuni label per Petak vs per Hak Pakai) — Rilis 2 decisions that block those merges (branches `ticket-35`, `ticket-39` exist).
- **Go-live 65 prerequisites**: cosign key pairs (job `sign` fails while unset), GlitchTip token (ticket 72), SumoPod domain auth (04), old-app data answer, human gate.
- **Ticket 98**: `needs-triage` on `main`; needs the staging server log / GlitchTip entry for 2026-09-30 ~18:06 UTC.
- **Security**: the SumoPod sandbox API key and webhook signing secret were pasted in chat — **rotate them** after UAT. Do not commit them (redacted here).

## Rules to keep

- Never push to `main` from a builder; the orchestrator merges via a worktree from a freshly fetched `origin/main`. One full suite at a time. Every wait gets a polling script (owner's standing instruction). The tracker allows **01–99 only** (a 3-digit ticket file breaks `tests/tooling/ticket-workflow.test.ts`). No PRs.

## Suggested skills

- `handoff` (this document).
- `tdd` + `code-review` for any further fix (two axes, verbatim, per `AGENTS.md`).
- `triage` for ticket 98.
- `grilling` + `domain-modeling` for the 35 / 39 / go-live decisions.
- `diagnosing-bugs` if a UAT step throws (build a tight loop first).
