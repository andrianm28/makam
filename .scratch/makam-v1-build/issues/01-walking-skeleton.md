# Walking skeleton: app, worker, CI, test harness

Status: resolved
Spec: Implementation Decisions > Architecture; Adapter ports; Scheduler; Testing Decisions; stories 185, 186

## What to build

Scaffold the fresh TypeScript codebase: a Next.js App Router app (TypeScript strict, standalone output, shadcn/ui and TanStack Table installed), Postgres with Drizzle migrations, a pg-boss `worker` process, and one Docker image that runs as two containers (`web` = `next start`, `worker` = pg-boss consumers and schedules), both importing `src/domain/*`. Add a `/health` page that reports DB connectivity and the worker's last heartbeat, written by a scheduled tick. Define every adapter port (Clock, PaymentProvider, WhatsAppSender, EmailSender, WebPush, FileStore, PdfRenderer; there is no SmsSender) with an in-memory implementation, and wire a composition root that picks real or fake per environment. Set up the test harness (Vitest against a real Postgres test container, migrated fresh, with the injected fake Clock and the fakes) and a Playwright project. Add GitHub Actions (lint, Vitest, image build, push to ghcr) and Sentry with PII scrubbing.

## Acceptance criteria

- [ ] `AGENTS.md` at the repo root states the spec's agent rules: App Router only; mutations only through Server Actions (or route handlers for webhooks) that authenticate, check the role, validate with Zod, then call a pure domain module in `src/domain/*`; Zod validation at every boundary; domain modules own their tables and are the single test seam; tests use glossary terms and never assert on table layouts, private helpers or call sequences.
- [ ] `docker compose up` locally starts `web`, `worker` and Postgres from one image; `/health` shows DB OK and a worker heartbeat younger than 2 minutes.
- [ ] Drizzle migrations run as a separate command (`migrate`), not on app start.
- [ ] A Clock port supplies "now"; all times are Asia/Jakarta; the fake Clock can be set and advanced in tests.
- [ ] A scheduler pattern exists: worker jobs are thin wrappers around domain tick functions `tick(ctx, now)`; ticks are idempotent (running the heartbeat tick twice is harmless); jobs can be enqueued inside the same DB transaction as the data.
- [ ] Every port has an in-memory fake that records what it received (messages sent, files stored, PDFs rendered); the fake PaymentProvider can emit Svix-signed webhook payloads.
- [ ] CI on every push: lint, typecheck, Vitest (with a Postgres service), image build; on `main` the image is pushed to ghcr.
- [ ] Sentry initialised in `web` and `worker` with scrubbing: no request bodies, no phone numbers (Indonesian formats `08…`, `+62…`, `62…`), no files; DSN from env, disabled when unset.
- [ ] `docker-compose.prod.yml` for the `makam-prod` project exists (own Postgres, memory/CPU limits for each service), even though deployment is ticket 07.
- [ ] Tests: one domain test against real Postgres using the fake Clock; a smoke test proving pg-boss runs a scheduled tick end to end; one Playwright test loading `/health`.

## Notes

The frozen Laravel app at `/home/ubuntu/makam-app` is reference for domain behaviour only. Keep the domain folder layout aligned with the spec's module list (identity, audit, lokasi, tariffs, inventory, pemesanan, perpanjangan, pengurusan, layanan, billing, payouts, wakaf, fieldwork, queues, notifications, scheduler).

## Comments

- 2026-09-25 — Done on branch `worktree-agent-a310e9482bdda9637`, merged to `main`. Two-axis review (mattpocock-skills:code-review, Standards + Spec) found: raw env reads bypassing Zod, a system clock in a test, stale Zenziva / "Sentry leaves Indonesia" comments, staging wired to fakes (now wired like production), no ghcr default in the prod compose, landlines slipping past the phone scrubber, a clock and duplication smell in health, and a repeated PgBoss setup. All fixed test-first. `SmsSender` port removed (SMS out of v1). Playwright `/health` gets a 120 s test timeout for the first heartbeat on a fresh stack.
- Verified in the main session: `npm run lint` exit 0, `tsc --noEmit` exit 0, Vitest 83/83 (real Postgres), Playwright 1/1 on a freshly started `makam-v1-dev` stack (33.9 s), stack torn down. Subagent also ran `next build`, `build:worker`, the image build and `/health` via compose.
- For 07: deploy = pull → `docker compose -f docker-compose.prod.yml run --rm migrate` → `up -d`; web binds 127.0.0.1:${MAKAM_WEB_PORT:-3100}; wait ~90 s for the first heartbeat; use `/api/health` for the uptime alarm. For 08: Better Auth not installed yet; use `adapters.whatsapp.sendTemplate({ copyCode })`, `adapters.clock`, tables in `src/domain/identity/schema.ts`.
