# Tech stack for a solo engineer with AI agents

Type: grilling
Status: resolved
Blocked by: 02
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

Which stack and hosting (e.g. Next.js + Postgres on a managed platform, Laravel, or a BaaS such as Supabase) best fits one engineer working with AI agents, Indonesian hosting and data-residency needs, and the chosen payment gateway's SDK?

## Answer

Resolved 2026-09-25 (grilling). Research: [research/12-tech-stack.md](../research/12-tech-stack.md) (data residency, Jakarta hosting, Xendit SDKs); [research/12-object-storage.md](../research/12-object-storage.md) (Indonesian S3-compatible storage). Rationale for the two hard-to-reverse choices: [ADR-0002](../../../docs/adr/0002-rebuild-on-nextjs-self-hosted-in-jakarta.md).

**Starting point**
- **Rebuild from scratch in TypeScript.** The existing Laravel app (`/home/ubuntu/makam-app`: Laravel 13 / Livewire / Filament, dev + beta running on this VPS) is frozen as reference only; its nonprod stays up until v1 replaces it on `makam.co.id`.
- New code lives in this repo, next to the map, `CONTEXT.md` and `docs/adr/`.

**Stack**
- **Next.js full-stack (App Router)**, TypeScript `strict`. One app serves the Pemesan pages, the Mitra Jasa mobile screens (responsive web / PWA, photo proof via the browser camera) and the back office (Admin YIEM, Admin Lokasi, Petugas YIEM), built with shadcn/ui + TanStack Table (no Filament equivalent exists; accepted cost).
- Agent rules in `AGENTS.md`: App Router only; mutations only through Server Actions that call pure domain modules in `src/domain/*`; Zod validation at every boundary.
- **Postgres** + **Drizzle** ORM; **pg-boss** for jobs and schedules (no Redis: one database to back up, jobs enqueued in the same transaction as the data); **Better Auth** (sessions, OTP, admin 2FA; login choices stay with "Roles, accounts and access").
- No native app in v1; kept in reserve if field staff need offline use.

**Payments**
- **SumoPod** is the only gateway in v1 (reverses the Xendit choice in "Payment gateways and split payments in Indonesia"). A second gateway (with a payout API) is added only after v1 launch.
- SumoPod can only withdraw to YIEM's own bank account: **no payout API, no refund API** (confirmed by the owner 14 Sep 2026, per makam-app `docs/research/booking-payment-model-2026-09.md`). So:
  - **Pencairan is a manual bank transfer**, still one per order / per job with the same due rules as "Money flow and revenue model": the app lists Pencairan due, Admin YIEM transfers, uploads the transfer proof and marks it paid.
  - **Refunds** are manual transfers the same way, after Admin YIEM's approval.
  - **No auto-debit** for recurring Paket Layanan; every cycle is a fresh invoice.
- A SumoPod payment link expires within 24 h, so the platform's invoice is its own record with its own due date (3×24 h for Saat Duka, H-1 for a Paket cycle) and a SumoPod payment is created **when the payer clicks Bayar**, re-created if it expires. Webhook handled idempotently (Svix signature).
- Payment provider sits behind one adapter interface so the post-launch gateway is an addition, not a rewrite.

**Hosting and operations**
- **Production on this VPS** (Jakarta, Lintasarta; so primary data stays in Indonesia and the UU PDP cross-border rules don't bite on it). Conditions accepted:
  1. Separate compose project `makam-prod` with its **own Postgres** (never shared with makam-app nonprod or other projects) and memory/CPU limits.
  2. **Daily off-host backups to object storage in Indonesia**, with regular restore tests.
  3. An **external uptime alarm**.
- One Docker image, two containers: **`web`** (`next start`, standalone output) and **`worker`** (Node process running pg-boss and the schedules: 24 h Terencana hold, H-7 invoices, 3×24 h deadlines, Perpanjangan reminders), both importing `src/domain`.
- **Files** (KTP, heirship docs, IPTM scans, Layanan photo proof, transfer proofs) in **S3-compatible object storage in Indonesia**, private, served via short-lived signed URLs; the same provider holds the backups. Per the object-storage research: **AWS S3 Jakarta (`ap-southeast-3`)** (about US$2–4/month in year one, Object Lock / versioning / lifecycle all supported, and a different provider from the Lintasarta VPS); backups encrypted client-side (pgBackRest `repo-cipher-type` or wal-g libsodium). Biznet Gio NEO is the local fallback after a compatibility spike.
- **Build/deploy**: GitHub Actions (lint, tests, image build) → ghcr.io → `docker compose pull && up -d` on the VPS; Drizzle migrations run as a separate step before `web`/`worker` restart. No builds on the VPS.
- **Error monitoring**: Sentry cloud with PII scrubbing (no request bodies, phone numbers or files); GlitchTip self-host is the fallback if needed (DSN swap).
- **Tests**: Vitest on domain modules against a real Postgres container (no mocks); a few Playwright end-to-end tests on critical paths (Pemesanan Saat Duka, SumoPod webhook, Pencairan).

**Noted, not decided here**
- PSE registration via OSS is mandatory before launch (legal compliance, out of scope for this map; see the research).
- Data leaving Indonesia is limited to scrubbed Sentry events; PP 33/2026 (effective 16 Jan 2027) adds a transfer assessment if that ever grows.
