# Walking skeleton: app, worker, CI, test harness

Status: ready-for-agent
Spec: Implementation Decisions > Architecture; Adapter ports; Scheduler; Testing Decisions; stories 185, 186

## What to build

Scaffold the fresh TypeScript codebase: a Next.js App Router app (TypeScript strict, standalone output, shadcn/ui and TanStack Table installed), Postgres with Drizzle migrations, a pg-boss `worker` process, and one Docker image that runs as two containers (`web` = `next start`, `worker` = pg-boss consumers and schedules), both importing `src/domain/*`. Add a `/health` page that reports DB connectivity and the worker's last heartbeat, written by a scheduled tick. Define every adapter port (Clock, PaymentProvider, WhatsAppSender, EmailSender, SmsSender, WebPush, FileStore, PdfRenderer) with an in-memory implementation, and wire a composition root that picks real or fake per environment. Set up the test harness (Vitest against a real Postgres test container, migrated fresh, with the injected fake Clock and the fakes) and a Playwright project. Add GitHub Actions (lint, Vitest, image build, push to ghcr) and Sentry with PII scrubbing.

## Acceptance criteria

- [ ] `AGENTS.md` at the repo root states the spec's agent rules: App Router only; mutations only through Server Actions (or route handlers for webhooks) that authenticate, check the role, validate with Zod, then call a pure domain module in `src/domain/*`; Zod validation at every boundary; domain modules own their tables and are the single test seam; tests use glossary terms and never assert on table layouts, private helpers or call sequences.
- [ ] `docker compose up` locally starts `web`, `worker` and Postgres from one image; `/health` shows DB OK and a worker heartbeat younger than 2 minutes.
- [ ] Drizzle migrations run as a separate command (`migrate`), not on app start.
- [ ] A Clock port supplies "now"; all times are Asia/Jakarta; the fake Clock can be set and advanced in tests.
- [ ] A scheduler pattern exists: worker jobs are thin wrappers around domain tick functions `tick(now)`; ticks are idempotent (running the heartbeat tick twice is harmless); jobs can be enqueued inside the same DB transaction as the data.
- [ ] Every port has an in-memory fake that records what it received (messages sent, files stored, PDFs rendered); the fake PaymentProvider can emit Svix-signed webhook payloads.
- [ ] CI on every push: lint, typecheck, Vitest (with a Postgres service), image build; on `main` the image is pushed to ghcr.
- [ ] Sentry initialised in `web` and `worker` with scrubbing: no request bodies, no phone numbers (Indonesian formats `08…`, `+62…`, `62…`), no files; DSN from env, disabled when unset.
- [ ] `docker-compose.prod.yml` for the `makam-prod` project exists (own Postgres, memory/CPU limits for each service), even though deployment is ticket 07.
- [ ] Tests: one domain test against real Postgres using the fake Clock; a smoke test proving pg-boss runs a scheduled tick end to end; one Playwright test loading `/health`.

## Notes

The frozen Laravel app at `/home/ubuntu/makam-app` is reference for domain behaviour only. Keep the domain folder layout aligned with the spec's module list (identity, audit, lokasi, tariffs, inventory, pemesanan, perpanjangan, pengurusan, layanan, billing, payouts, wakaf, fieldwork, queues, notifications, scheduler).
