<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Makam.co.id v1: rules for agents

These rules come from the v1 spec (`.scratch/makam-v1/spec.md`, Implementation Decisions and Testing Decisions) and ADR 0002. When a ticket and the spec disagree, the spec wins. Domain words come from `CONTEXT.md`; use them as defined there.

## Architecture

- **Next.js App Router only.** No Pages Router (`pages/`), no `getServerSideProps` / `getStaticProps`.
- **Mutations go only through Server Actions**, or route handlers for webhooks. Each one is thin and does exactly this, in order:
  1. authenticate the caller;
  2. check the caller's role;
  3. validate the input with Zod;
  4. call a pure domain module in `src/domain/*`.
  No business rule lives in a Server Action, route handler, page or component.
- **Zod validation at every boundary**: Server Action and route handler input, webhook payloads, environment variables (`src/lib/env.ts`), job payloads, and anything read from an outside service.
- **Domain modules** (`src/domain/<module>/`) hold every business rule. Each is a deep module with a small public interface (`index.ts`) and **owns its tables** (`schema.ts`). Only the owning module reads or writes its tables; everyone else calls its public functions. The modules are: identity, audit, lokasi, tariffs, inventory, pemesanan, perpanjangan, pengurusan, layanan, billing, payouts, wakaf, fieldwork, queues, notifications, scheduler.
- **Outside services sit behind ports** (`src/ports/*`): Clock, PaymentProvider, WhatsAppSender, EmailSender, WebPush, FileStore, PdfRenderer. Each has a live adapter (`src/adapters/live`) and an in-memory fake that records what it received (`src/adapters/memory`). Domain code depends on the port interfaces only. `src/composition/adapters.ts` is the one place that picks live or fake; only development and test use fakes, staging and production never do.
- **Time**: read "now" only from the injected `Clock`, never `new Date()` / `Date.now()` in domain code. All wall-clock reasoning is Asia/Jakarta (WIB, UTC+7); use `@/lib/time/jakarta`.
- **Scheduler**: worker jobs are thin wrappers around domain tick functions `tick(ctx, now)`, registered in `src/domain/scheduler` (`scheduledTicks`). Every deadline and reminder is driven from database state, and every tick is idempotent (running it twice is harmless). Enqueue jobs inside the same transaction as the data (`inTransaction` in `src/db/unit-of-work.ts`); there is no Redis and no outbox.
- **Processes**: one Docker image runs as `web` (Next.js standalone server) and `worker` (pg-boss consumers and schedules); both import the same domain modules. Schema changes happen only in the separate `migrate` step (`npm run migrate`), never on app start. Generate migrations with `npm run db:generate` after changing a `schema.ts`.
- **Privacy**: Sentry gets no request bodies, phone numbers or files (`src/lib/observability/scrub.ts`). Family documents live only in the private FileStore, served by short-lived signed URLs.

## Tests

- The test seam is the **public functions of the domain modules**, run in Vitest against a **real Postgres** (a test container migrated fresh per run, or `TEST_DATABASE_URL`), with the fake Clock and the in-memory fakes. No database mocks.
- A good test drives a module only through its public interface and asserts on outcomes visible from outside: returned values, state read back through that module's (or a neighbour's) public queries, documents issued, messages recorded by a fake sender, rows in the Antrean projection.
- Tests **never assert on table layouts, private helpers or call sequences**.
- Name tests in glossary terms from `CONTEXT.md` (e.g. "Saat Duka Tagihan becomes Lewat Jatuh Tempo 3×24 h after the recorded Pemakaman").
- Scheduler behaviour is tested by calling tick functions directly with the fake Clock; only the pg-boss smoke test exercises pg-boss timing.
- Playwright (`e2e/`) covers only the critical paths listed in the spec.

## Commands

| What | Command |
|---|---|
| Lint / typecheck | `npm run lint` / `npm run typecheck` |
| Unit and domain tests (starts a Postgres container) | `npm test` |
| Next.js build | `npm run build` |
| Worker and migrate bundles | `npm run build:worker` |
| Migrate a database | `DATABASE_URL=... npm run migrate` |
| Local stack (Postgres, migrate, web, worker) | `docker compose -p makam-v1-dev up --build -d` |
| End-to-end against the local stack | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3310 npm run e2e` |
