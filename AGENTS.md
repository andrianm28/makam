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
  No business rule lives in a Server Action, route handler, page or component. In a signed-in Server Action, steps 1–3 are `guarded()` (`src/server/guard.ts`), which resolves the actor from the session cookie itself; never pass it an actor.
  _Exception_: the Masuk actions (`src/app/masuk/actions.ts`, and Kirim's Kode Masuk step in the wizards) skip steps 1 and 2, because they are the login itself. They still validate with Zod and call the identity module.
  _Exception_: the Bayar action (`src/app/dokumen/[link]/actions.ts`) skips steps 1 and 2, because a Tagihan's unguessable link is the permission and anyone may pay a Tagihan. It still validates the link with Zod and calls Billing, which decides whether the Tagihan can be paid.
  _Exception_: the booking wizards' `ingatKota` (`src/app/pesan-makam/*/actions.ts`) writes the visitor's own city-preference cookie and redirects. It has no domain data to change, no actor and no role, because a first-time visitor must be able to filter the list by city *before* there is any session, and a preference that is nobody else's business belongs to no Akun. It still validates with Zod and can only return to the wizard's own first screen.
- **Zod validation at every boundary**: Server Action and route handler input, webhook payloads, environment variables (`src/lib/env.ts`), job payloads, and anything read from an outside service.
- **Domain modules** (`src/domain/<module>/`) hold every business rule. Each is a deep module with a small public interface (`index.ts`) and **owns its tables** (`schema.ts`). Only the owning module reads or writes its tables; everyone else calls its public functions. The modules are: identity, audit, lokasi, tariffs, inventory, pemesanan, perpanjangan, pengurusan, layanan, billing, payouts, wakaf, fieldwork, queues, notifications, scheduler, operator-settings (Pengaturan Operator).
- **Messages go through the Notifications module**, which picks recipient, channel, template and timing, logs each message and retries it from the worker.
  _Exception_: the Kode Masuk (the login code, by email) is sent by the identity module directly through EmailSender, because it must arrive at once, background retries would only confuse, and the code is sensitive. It creates no message-log entry and is never retried automatically; on failure the person logging in sees "gagal kirim" and can retry (spec, Identity & Access and Notifications).
- **Outside services sit behind ports** (`src/ports/*`): Clock, PaymentProvider, EmailSender, WebPush, FileStore, PdfRenderer (no WhatsApp in v1, ADR 0004). Each has a live adapter (`src/adapters/live`) and an in-memory fake that records what it received (`src/adapters/memory`). Domain code depends on the port interfaces only. `src/composition/adapters.ts` is the one place that picks live or fake; only development and test use fakes, staging and production never do.
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
- Playwright (`e2e/`) covers the critical paths listed in the spec, plus a short smoke test when a ticket explicitly asks for one for its UI. Keep each spec file fast (target under 10 s once the stack is warm) and never re-test in Playwright what a unit or domain test already covers.
- **E2e runs in CI** on every `main` build (`.github/workflows/ci.yml`, job `e2e`): the pushed `sha-<commit>` image on a GitHub-hosted runner with its own Postgres, never on the shared host; a failure uploads traces, screenshots and stack logs as the `e2e-results` artifact. PRs and branches skip it. Agents may still run e2e locally against their own stack, but need not; a new spec must work on a fresh stack (the CI stack is empty, `APP_ENV=development`, `deploy/ci/e2e.env`).
- The same `main` build scans the image with Trivy and fails on any CRITICAL vulnerability with a fix. Accept an exception only in `.trivyignore`, with its reason and an `exp:` date at most 90 days out (`tests/trivyignore.test.ts` checks both). A deploy depends on the `deploy-gate` job, which needs every CI job.
- **Migrations are expand/contract.** On every push and PR, CI migrates a database from the running release's schema, with representative rows, to yours and runs the domain tests on it: a new migration must work on non-empty tables while the previous release still runs. Destructive DDL (DROP, RENAME, SET NOT NULL, a type change, a NOT NULL column without a default) fails CI unless the statement has a comment line `-- contract: <reason>` directly above it, in a later release than the expand step.
- CI also runs gitleaks (accepted findings, each with its reason, in `.gitleaks.toml`) and `npm audit --omit=dev` (fails on a fixable critical). Pin a new action by commit SHA with the version in a comment, and a new image by digest.
- `seed-tagihan` (`node dist/seed-tagihan.mjs`, `src/cli/seed-tagihan.ts`) is a development-only tool for e2e and local stacks: it issues an example Tagihan and, when Pengaturan Operator is empty, enters example values by building its own Admin Platform actor for the stack's first Admin Platform (no login, no TOTP). It refuses to run unless the in-memory fakes are in use (`APP_ENV` development or test), so it never runs on staging or production. Never copy that actor-building pattern into app code.
- A worktree needs no local stack; see the next section for when one is still worth it.

## Worktrees on the shared host

Up to four builder agents share one host's disk with other projects, so each worktree stays lean (about 25 MB of its own beyond the source):

1. **Dependencies**: `npm run deps`, never `npm ci`. It links `node_modules` from the shared store (`~/.cache/makam/deps`, one `npm ci` per lockfile) as hard links to read-only files, so treat everything under `node_modules` as read-only: a tool that edits a package file in place fails with EACCES. Never `chmod u+w` inside `node_modules`: it unseals the shared store for every worktree. To change dependencies, `npm install <pkg>` as usual (it updates `package-lock.json`), then `npm run deps` again. A package that must be rebuilt in place (`npm rebuild`, node-gyp) needs a private copy: `npm ci` in that worktree, at the full ~1 GB cost.
2. **Tests**: `npm run test:shared` (same arguments as `npm test`). It uses this worktree's own database on the shared `makam-testpg` Postgres (started on first use, data in tmpfs), recreated fresh each run and dropped after. Run one test run per worktree at a time. Plain `npm test` still starts its own container.
3. **Local stack**, only when a ticket needs to see the running app beyond what CI's e2e covers (e.g. a UI you must look at, a worker job end to end): `npm run stack -- up --build -d` runs `docker-compose.yml` as this worktree's own compose project (`npm run stack` prints its name; pick a free port with `MAKAM_WEB_PORT`; for local e2e set `E2E_SEED_ADMIN="npm run -s stack -- exec -T web node dist/seed-admin.mjs"`). Stop it with `npm run clean` as soon as you are done. Use `npm run stack` rather than a plain `docker compose up`, which joins the shared `makam-v1-dev` project that `npm run clean` never touches.
4. **When the ticket is done**: `npm run stack -- down -v` (with `-v`, so its volumes and networks go too), then `npm run clean`. It removes `.next`, `dist`, `test-results`, the worktree's test database and whatever is left of its local stack (containers, volumes, networks, `makam-v1:<project>` image), only what is proven to come from this worktree.

Touch only makam's own Docker objects (`makam-testpg`, your worktree's stack): other projects' containers, images, volumes and worktrees on this host are off limits, so no `docker system prune`, `docker image prune`, `docker volume prune` or `docker builder prune`.

## Commands

| What | Command |
|---|---|
| Dependencies in a worktree (shared store, hard links) | `npm run deps` |
| Lint / typecheck | `npm run lint` / `npm run typecheck` |
| Unit and domain tests (starts a Postgres container) | `npm test` |
| The same on the shared `makam-testpg` (worktrees) | `npm run test:shared` |
| Free a worktree's build output, test database and stack | `npm run clean` |
| Next.js build | `npm run build` |
| Worker and migrate bundles | `npm run build:worker` |
| Migrate a database | `DATABASE_URL=... npm run migrate` |
| Local stack of this worktree (Postgres, migrate, web, worker) | `npm run stack -- up --build -d` |
| End-to-end against the local stack (optional; CI runs it on `main`) | `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3310 npm run e2e` |

## Working agreements for agents (also in cloud sessions)

These rules used to live only in the owner's machine-level memory; they are here so Claude Code cloud sessions (claude.ai/code) follow them too.

- **Workflow**: Matt Pocock's skills are vendored in `.claude/skills/` (MIT, `LICENSE-mattpocock-skills`); `.claude/settings.json` also enables the `mattpocock-skills` plugin (marketplace `mattpocock/skills`), and once a cloud session shows its `mattpocock-skills:<skill>` skills, the vendored copies go (ticket 87): decisions through `grilling` + `domain-modeling` (or `grill-with-docs`), UI uncertainty through `prototype`, builds through `tdd`, and every branch through `code-review` (two axes, Standards and Spec, reported separately) before it merges. `to-tickets`, `handoff` and `grill-with-docs` are user-invoked. Talk to the owner in Bahasa Indonesia.
  - **Following `code-review` exactly**: pin the fixed point and confirm it resolves with a non-empty diff *before* spawning either reviewer; spawn the two axes as parallel sub-agents with the smell baseline pasted into the Standards brief; then present both reports under `## Standards` and `## Spec` **verbatim or lightly cleaned, never merged, never re-ranked**, followed by a one-line summary of the finding count and the worst issue *within each axis* (not one winner across axes).
  - Re-reviews check a list of fixes item by item (OK / BELUM with a short quote) and never re-open unrelated ground.
  - **Both axes are in hand before a fix pass starts.** The review reports land in the ticket's `## Comments` *before* the fix builder is dispatched, and the builder is pointed at those comments. Writing findings into the ticket while its fix pass is already running is how a hard violation survives into the next commit.
  - Resume a builder through its existing session when one exists; only relaunch fresh when the session is gone. A builder that returns with no report is a failure: inspect its worktree, then relaunch the same ticket.
- **Model tiering** when dispatching subagents: always pass `model` — `sonnet` for building, first reviews, research and prototypes; `haiku` for re-reviews that check a list of fixes, doc sweeps and mechanical edits; `opus` only for hard security, money or concurrency code when `sonnet` failed. Small diffs (under ~300 lines or follow-ups): one reviewer with separate `## Standards` and `## Spec` sections. Briefs point to paths; reports at most ~200 words. At most 4 builder agents at once. A `PreToolUse` hook (`.claude/hooks/require-subagent-model.sh`) blocks any subagent call without `model`.
- **Orchestration session**: the top-level session is orchestration only. Every subagent runs in the background, and every long verification (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run deps`, `npm ci`) runs as a background shell command; the orchestrator never blocks the conversation on one. Keep about 4 subagents in flight: a finished slot is refilled immediately from the ready queue, not after a reply. A subagent that returns without a report is a failure, not a result — check its worktree, then relaunch the same ticket. On this host the paid tiers (`sonnet`, `opus`, `haiku`) may be unavailable; fall back to the free model and keep the two-axis review, since review is what protects the merge, not the model.
  - **One writer per worktree.** A worktree belongs to the session that owns it until that session reports. Before spawning a writer into a worktree, check whether the ticket's own session is still live; if it is, the new subagent does a read-only audit and says so, rather than editing files another session is writing and running a second `npm run test:shared` against a database that is being recreated.
  - **A WIP branch may be red.** A builder's branch can be mid-edit and failing typecheck; that is not an incident. Judge a branch only at its own commit boundary, and expect a half-wired integration (a new dependency passed in one file but not its caller) to be fixed by the builder that owns it.
  - **One full suite at a time.** The host is shared with other projects' agents (four in parallel on 8 cores was load average 12), so at most one `npm run test:shared` runs at a time across all of makam's worktrees. `npm run lint`, `npm run typecheck` and `npm run build` may overlap, since they are seconds not minutes. Builders that each run the full suite are told to use a targeted `npx vitest run <path>` instead. When two merge verifications are both due, sequence them rather than firing both.
- **Merging**: the orchestrator merges a ticket branch into `main` without asking when both review axes find no hard violation and no new decision (the owner's standing authorization); it still asks for design or domain decisions, spec/ADR changes, destructive actions and anything touching production. Agents never push to `main` themselves.
  - **There is no branch CI any more.** Since ticket 72, `.github/workflows/ci.yml` is `on: push: branches: [main]` plus `pull_request`, and no PR is ever opened, so a push to a ticket branch runs nothing. "Green CI on the branch head" is therefore unattainable: the gate is **both review axes clean → merge → `main` CI green**, and a red `main` means revert the merge commit, not debug on the branch. Expect one permanently red job in the meantime: `sign` fails hard while `COSIGN_STAGING_PRIVATE_KEY` is empty (that is the intended fail-closed direction, and `deploy-gate` does not depend on `sign`, so the deploy gate itself stays green).
  - **Merge from the newest base, every time.** The merge worktree is created from a freshly fetched `origin/main`, never from a ref cached earlier in the session: the orchestrator itself pushes Status/index commits to `main` while a review runs, so a base taken before the review is stale and the push is rejected as non-fast-forward. When a push is rejected, merge `origin/main` into the merge worktree and push that — never force-push `main`, and never rebase a merge commit.
  - After the merge lands, flip `Status:` in the ticket file **and** in `00-index.md` in one commit, and add a dated `## Comments` entry naming the review findings that were fixed, what was deliberately left as a follow-up, and what the merge unblocks.
  - **A merged ticket's worktree is removed in the same turn.** Once the merge is pushed and the status flipped: `npm run stack -- down -v` (if that worktree has a stack), `npm run clean`, then `git worktree remove --force <path>`, then `git worktree prune`. Each builder worktree costs about 1.1 GB of `node_modules` on a disk that is shared with other projects and already above 80 % full, so a worktree that outlives its ticket is the most expensive idle thing on the host. Keep only the worktrees of tickets that still have a live session.
- **Priorities**: follow `.scratch/makam-v1/spec.md` "Release plan" and the ticket index (`.scratch/makam-v1-build/issues/00-index.md`): Rilis 1 is the beta for UAT on `makam.co.id`.
- **Cloud sessions**: `.claude/hooks/session-start.sh` runs `npm ci` and starts Docker (tests use a Postgres 18 container); it does nothing on the shared VPS. Never put secrets in the cloud environment's variables. Deploys stay in CI and the host's pull-based timer.

