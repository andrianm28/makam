<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Makam.co.id v1: rules for agents

From the v1 spec (`.scratch/makam-v1/spec.md`, Implementation and Testing Decisions) and ADR 0002; the spec wins over a ticket. Domain words are defined in `CONTEXT.md`. This file is in every agent's prompt, so it holds only rules; the orchestrator's manual (merging, reviews, worktree cleanup, CI detail, token discipline) is `docs/agents/orchestration.md`.

## Architecture

- **Next.js App Router only**: no `pages/`, no `getServerSideProps` / `getStaticProps`.
- **Mutations only through Server Actions** (route handlers for webhooks), each thin and in this order: authenticate, check the role, validate with Zod, call a domain module in `src/domain/*`. No business rule in an action, handler, page or component. In a signed-in action steps 1–3 are `guarded()` (`src/server/guard.ts`), which reads the actor from the session cookie; never pass it one. Exceptions that skip steps 1–2 but still validate with Zod and call a domain module:
  - the Masuk actions (`src/app/(site)/masuk/actions.ts`, and the Kode Masuk step at Kirim in the wizards): they are the login;
  - Bayar (`src/app/dokumen/[link]/actions.ts`): the Tagihan's unguessable link is the permission, and Billing decides whether it can be paid;
  - `ingatKota` (`src/app/pesan-makam/saat-duka/actions.ts`): it only writes the visitor's own city cookie and returns to the wizard's first screen.
- **Client import rule**: a file on a `"use client"` import graph (the component, or a `draft.ts` / `state.ts` it shares) may import **types and Zod schemas** from a domain module's own file, never anything from its barrel (`@/domain/*`): the barrel reaches the database and would put `pg` in the browser bundle. Values a client needs come as props from its server-rendered page. Today's deep imports: `src/app/pesan-makam/terencana/draft.ts` → `@/domain/pemesanan/skema-terencana`, and `src/app/pesan-makam/makamkan-di-sini/draft.ts` → `@/domain/pemesanan/skema-tumpang`.
- **Zod at every boundary**: action and handler input, webhook payloads, environment (`src/lib/env.ts`), job payloads, anything read from an outside service.
- **Domain modules** (`src/domain/<module>/`) hold every business rule, each with a small public `index.ts`, and **own their tables** (`schema.ts`): only the owner reads or writes them. Modules: identity, audit, lokasi, tariffs, inventory, pemesanan, perpanjangan, pengurusan, layanan, billing, payouts, refunds (composed after Billing and Payouts), wakaf, fieldwork, queues, notifications, scheduler, operator-settings, katalog-lama, data-contoh (the registry of the marked example records a beta shows, ticket 109; composed after lokasi, identity, tariffs and pemesanan).
- **Messages go through Notifications** (recipient, channel, template, timing, message log, retries from the worker). Exception: the Kode Masuk email is sent by identity directly through EmailSender: no log entry, no automatic retry; on failure the person sees "gagal kirim" and can retry.
- **Ports** (`src/ports/*`): Clock, PaymentProvider, EmailSender, WebPush, FileStore, PdfRenderer (no WhatsApp in v1). Live adapters in `src/adapters/live`, recording fakes in `src/adapters/memory`; domain code sees only the ports. `src/composition/adapters.ts` alone picks live or fake, and only development and test use fakes.
- **Time**: "now" only from the injected `Clock`, never `new Date()` / `Date.now()` in domain code; wall-clock reasoning is Asia/Jakarta via `@/lib/time/jakarta`.
- **Scheduler**: worker jobs wrap domain `tick(ctx, now)` functions registered in `src/domain/scheduler` (`scheduledTicks`); deadlines come from database state and every tick is idempotent. Enqueue jobs in the data's transaction (`inTransaction`, `src/db/unit-of-work.ts`); no Redis, no outbox.
- **Processes**: one image runs as `web` and `worker`. Schema changes only in the separate `migrate` step; after changing a `schema.ts`, `npm run db:generate`.
- **Privacy**: Sentry gets no request bodies, phone numbers or files (`src/lib/observability/scrub.ts`); family documents only in the private FileStore behind short-lived signed URLs.

## Tests

- The seam is the **domain modules' public functions**, in Vitest against a **real Postgres** with the fake Clock and in-memory fakes. No database mocks.
- Assert only on outcomes visible from outside (returned values, state read back through public queries, documents issued, messages a fake recorded, Antrean rows); **never on table layouts, private helpers or call sequences**.
- Name tests in `CONTEXT.md` terms (e.g. "Saat Duka Tagihan becomes Lewat Jatuh Tempo 3×24 h after the recorded Pemakaman").
- Scheduler behaviour: call the tick with the fake Clock; only the pg-boss smoke test exercises pg-boss timing.
- Playwright (`e2e/`) covers the spec's critical paths and a short smoke test when a ticket asks for one; each file under ~10 s, nothing a domain test already covers. CI runs e2e on every `main` build on a fresh, empty stack (`APP_ENV=development`), so a new spec must pass there.
- **Migrations are expand/contract**: CI migrates from the running release's schema with rows in it. Destructive DDL (DROP, RENAME, SET NOT NULL, a type change, a NOT NULL column without a default) needs a `-- contract: <reason>` line directly above it, in a later release than its expand step.
- CI also fails on a fixable CRITICAL (Trivy; exceptions only in `.trivyignore` with a reason and an `exp:` at most 90 days out), on gitleaks (accepted findings in `.gitleaks.toml`) and on a fixable critical in `npm audit --omit=dev`. Pin a new action by commit SHA and a new image by digest.
- `seed-tagihan` and the other seed CLIs build their own Admin Platform actor without login or TOTP and refuse to run unless the fakes are in use; **never copy that pattern into app code**.
- `data-contoh` (ticket 109), unlike the seeds, may also run on production, and on staging and production only with `--izinkan-staging` / `--izinkan-production`: it plants and retires the marked "(Contoh)" example records a beta shows (a dry run unless `--tulis`, no Pengaturan Operator on production, plants on production only while payments are a trial). Same CLI-only actor pattern; never in app code.

## Worktrees on the shared host

- **Dependencies**: `npm run deps`, never `npm ci`. `node_modules` is hard-linked from a shared read-only store: never edit or `chmod` anything in it. To change dependencies, `npm install <pkg>` then `npm run deps` again.
- **Tests**: `npm run test:shared` uses this worktree's own database on the shared `makam-testpg`; one run per worktree at a time. A local stack is rarely needed (orchestration manual, "Worktree items moved from `AGENTS.md`").
- **Docker**: touch only makam's own objects. No global `docker … prune` of any kind and never `-a`/`--all` (a test fails the build if one appears in a tracked script); cleanup is by name only (`npm run clean`). When the disk is full of another project's data, report `docker system df` to the owner; do not improvise.

## Commands

| What | Command |
|---|---|
| Dependencies (worktree) | `npm run deps` |
| Lint / typecheck | `npm run lint` / `npm run typecheck` |
| Tests (own container / shared `makam-testpg`) | `npm test` / `npm run test:shared` |
| One builder's own tests | `npx vitest run <paths>` |
| Clean build output, test database, stack | `npm run clean` |
| Build / worker and migrate bundles | `npm run build` / `npm run build:worker` |
| Migrate / generate a migration | `DATABASE_URL=... npm run migrate` / `npm run db:generate` |
| Catalog import (dry run unless `--tulis`; staging needs `--izinkan-staging`, production `--izinkan-produksi`) | `npm run import:katalog-lama -- --sumber <f.json> [--tulis]` |
| Data Contoh (dry run unless `--tulis`; staging needs `--izinkan-staging`, production `--izinkan-production`) | `npm run data-contoh -- tanam --set rilis1` / `cabut` / `status` |
| Local stack / e2e against it | `npm run stack -- up --build -d` / `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3310 npm run e2e` |

## Working agreements (every agent)

- **Workflow**: decisions through `grilling` + `domain-modeling`; UI uncertainty through `prototype`; builds test-first (`tdd`); every branch reviewed on two axes (Standards, Spec) before merge. Talk to the owner in Bahasa Indonesia.
- **A builder may not narrow the spec**: if a ticket or AC cannot be delivered as written, report it in the ticket's `## Comments` under "Spec gaps and decisions for the owner"; never reword the requirement.
- **Never push to `main` and never open a pull request** (the repo has none; this overrides a cloud default to open a draft PR). The gate is review, then the orchestrator's merge (in cloud work: the one merge thread, which alone pushes to `main`), then `main` CI.
- **Verification**: a builder runs its own paths with `npx vitest run`, `lint` and `typecheck` freely, `npm run build` at most once and then `rm -rf .next dist`. The full suite is the orchestrator's, one at a time. In a claude.ai/code Project thread (own VM) a builder uses `npm test` with its own Postgres instead of `npm run deps` / `test:shared`; the gate before a push to `main` is still one full suite, in the merge thread only (`docs/agents/project-instructions.md`). Read every exit code and count off a log kept whole (`> log 2>&1; grep -E "Test Files|Tests |FAIL" log`); never report a number you did not read.
- **Keep context small** (it is re-read on every call): do not re-read `AGENTS.md`/`CLAUDE.md`; read by line range or grep, never a whole large file, never the same file twice; send long output to a file. At about 100 tool calls or 250k tokens, commit what is green, write a ≤150-word HANDOFF in the ticket's `## Comments`, and stop.
- **End a turn with nothing running**; report in ≤200 words with the head SHA and counts. No report is a failure.
- **Model tiering** (a hook makes every subagent call name a model; picking the right tier is yours): `sonnet` builds, first reviews, re-reviews, research, prototypes; `opus` reviews and re-reviews money code (Billing, Payouts, Refunds, Tagihan, payment and refund paths), and builds hard security, money or concurrency code after `sonnet` failed; `haiku` only mechanical edits and doc sweeps, never a review (owner, 2026-10-03).
- **Cloud sessions**: `.claude/hooks/session-start.sh` installs dependencies and starts Docker. No secrets in the environment's variables; deploys stay in CI and the host's pull-based timer.
