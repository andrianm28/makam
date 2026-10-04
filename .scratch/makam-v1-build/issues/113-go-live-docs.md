# Go-live documents: Hari switch, open release, sandbox rules, ADRs and spec

Status: ready-for-agent
Blocked by: none
Spec: ADR 0006; ticket 65; `docs/ops/runbook.md` (Hari switch ~1940–2013, the open release ~840–877, sandbox ~1818–1873); `.scratch/makam-v1-build/go-live-rilis-1.md`; Plan: /home/ubuntu/.claude/plans/plan-percepatan-full-rilis-vectorized-gizmo.md (owner-approved 2026-10-04; full-release acceleration, beta at RILIS_TERBUKA=1 then 3)

## What to build

The runbook's "Hari switch" never sets `RILIS_TERBUKA`, never moves the SumoPod webhook (one sandbox project: it moves to makam.co.id at the switch), and never runs `seed:admin` or the data imports. The go-live checklist and the owner's 2026-10-04 decisions disagree.

Record the decisions in the domain docs and make the runbook the exact procedure for the gates G0–G5 in the plan:

- **Decisions:** beta on the sandbox; switch at `RILIS_TERBUKA=1`, then 3 after a signed UAT at 3 (reversing the 2026-10-03 amendment); no real orders during the beta; production backups and monitoring as switch gates; Data Contoh.
- **Decision records:** follow `.claude/skills/domain-modeling/SKILL.md` with its `ADR-FORMAT.md` and `CONTEXT-FORMAT.md`.

## Acceptance criteria

- [ ] **ADR 0006:** a new "Amendment (2026-10-04)". Production switches at 1, set explicitly in `prod.env`, and opens 3 once the UAT at 3 is signed. Ticket 84 stays ungated.
- [ ] **ADR 0007 "The production beta shows marked example data"** (new):
  - beta on the sandbox, no real orders, no real Pencairan or refund transfers;
  - visible "(Contoh)" data for all releases, prices included;
  - `cabut` before real operation, and the preflight guard;
  - production seeding is allowed only for the Data Contoh command.
  - Also add the term "Data Contoh" to `CONTEXT.md`.
- [ ] **Spec:** the Release plan (`.scratch/makam-v1/spec.md` ~649–660) says the same, and lists the backup and monitoring gates and tickets 106–113. `00-index.md` line ~291 and ticket 65's notes point to the new amendment.
- [ ] **Runbook:**
  - **"Hari switch"** is rewritten in the G3 order: promote and pre-pull; deploy; `data-contoh tanam --set rilis1 --izinkan-production`; preflight `--rilis 1`; archive the old app; `makam-switch --cek` then `--ke v1`; **move the SumoPod webhook to makam.co.id and Save & Test**; checks; monitoring; fallback; delete the old app.
  - **"Which release is open":** 1, then 3 after G4, with the exact host command for this host's `/opt/makam-v1/prod/compose.yml` + `prod.env` + `deployed.env` (not `docker-compose.prod.yml`).
  - **Sandbox rules:** no real orders, no Pencairan or refund transfers, and a CS script for turning real orders away.
  - **"Going live"** (leaving the beta): `cabut`, clean the beta orders, live keys.
  - **Rehearsal procedures:** the forced rollback (`MAKAM_HEALTH_WAIT=0 … --force`) and an unsigned image refused (exit 77).
  - **Monitoring:** the prod uptime monitor and GlitchTip `EMAIL_URL`.
- [ ] **`go-live-rilis-1.md`** becomes a G0–G5 checklist with evidence slots.
- [ ] Doc guard tests stay green (`tests/tooling/katalog-lama-runbook.test.ts`, `tests/tooling/import-data-peluncuran-bundle.test.ts`, `ticket-workflow.test.ts`).

## Comments

- 2026-10-04: Filed by the orchestrator from the approved plan (tracks E1–E3 and A-113, MB2). Docs only.

### Build (2026-10-04)

Branch `ticket-113-go-live-docs`, built on origin/main 7415fdf7 (tickets 106 to 108 merged). Docs and one guard-test file only; `Status:` untouched. No `npm run build`: nothing here needs one.

**What changed**

- **ADR 0006**: "Amendment (2026-10-04, owner decision)". Production switches at `RILIS_TERBUKA=1`, written in `prod.env`, and opens 3 once the UAT at 3 is signed; this reverses the 2026-10-03 amendment (kept as history). Opening 3 is a host change, never a promotion, and waits for the G4 and G5 prerequisites. Ticket 84 stays ungated.
- **ADR 0007** "The production beta shows marked example data" (new): the beta on the sandbox with no real orders, no real Pencairan and no refund transfer; visible "(Contoh)" Data Contoh for every release, prices included; `cabut` before real operation and the preflight "data contoh" line; production seeding only through the Data Contoh command. Considered options and consequences are in it. **`CONTEXT.md`** gains the term **Data Contoh** (glossary only, no command in it).
- **Spec**: the Release plan has a "Production beta" bullet (Rilis 1 then 3, sandbox, Data Contoh, the backup and monitoring gates, tickets 106 to 113) and its release-gate bullet says production opens 3 after a signed UAT. **`00-index.md`**: a 2026-10-04 entry above the 2026-10-03 one, which now points to the amendment. **Ticket 65**: a Comments entry that points to it (its criteria are unchanged).
- **Runbook**: "Hari switch" rewritten in the order of gate G3 (13 steps: promote and pre-pull, deploy with the forced-rollback rehearsal of the new digest, Data Contoh, preflight `--rilis 1`, archive from `makam-nonprod-postgres-1`, `--cek` then `--ke v1`, the webhook move and Save & Test, checks, monitoring, fallback, delete the old app, HSTS, archive the repository). New "Rehearsal of the first production deploy" (G1: promote, deploy, `seed:admin`, `import-data-peluncuran --izinkan-production`, `install-host.sh` again, preflight `--rilis 1`; exit 77 for an image signed only with the staging key; the forced rollback; the backups). New "Data Contoh on the host" (by ticket 109's interface). "Which release is open" says 1 then 3 and gives this host's command (`/opt/makam-v1/prod`, `compose.yml`, `prod.env`, `deployed.env`). "Production on SumoPod's sandbox" gains the rules, a CS script and "Going live (leaving the beta)". Uptime alarm gains the production monitor, and the errors section the GlitchTip `EMAIL_URL` (`smtp+ssl`) and the rule "Error baru (email)". Promotion's refusals are listed in the order `promote.yml` makes them, the after-automatic-rollback note and the `release` reading are added, `prod.env`'s `RILIS_TERBUKA=1` and a "data contoh" preflight row are added.
- **`go-live-rilis-1.md`** is a G0 to G5 checklist: each item has a check and an `Evidence:` slot, plus the owner's items before the gates, the rollback, the triggers of what waits until after the beta, and what is deferred for the beta.
- **Tests**: `tests/tooling/go-live-docs.test.ts` (new, 65 tests; red first: 18, then 36, then 9). `tests/tooling/nginx-blocks.test.ts`: the "Hari switch" order guard now pins the G3 order, and the archive-step test finds its step by its marker instead of by index. The refusal-order test reads `promote.yml` to hold the runbook's list to the workflow's real order.

**Decisions**

1. Where ticket 65's criterion lists the order "preflight, archive, promotion, `makam-switch --ke v1`, the checks, the fallback", the runbook follows this ticket's order (the plan's G3). The nginx guard pinned the old order, so it was updated, not worked around. The criteria's text is unchanged.
2. The rehearsal's order (deploy, `seed:admin`, import, `install-host.sh` again, then the preflight) resolves the "rehearsal order" gap tickets 107 and 108 reported. Ticket 72's Rehearsal item still says the preflight is the first step, and a guard test (`makam-preflight.test.ts`) holds that wording, so I did not reword it.
3. I fixed the runbook drift ticket 106's review listed: the refusal order, the after-rollback note and the claim that `release` equals the Deployment's ref. The last is read from `makam-deploy`'s code (a rollback exports the tag as `MAKAM_RELEASE`), not observed.
4. The Hari switch's step 2 rehearses the rollback of the new digest first (the plan's "B back to A, then B for real"), and treats `seed:admin`, the launch-data import and the second `install-host.sh` as done at G1, with how to check them.
5. The CS script is a draft in Bahasa Indonesia, marked as awaiting the owner's approval (plan C11).
6. `data-contoh` is documented by ticket 109's interface, with the allowance flag on every subcommand as the imports require it; the preflight "data contoh" row is documented as ticket 109's.

**Spec gaps and decisions for the owner**

- **Cleaning the beta orders.** The AC says "clean the beta orders". The platform has no function that deletes an order, so the runbook says "close the open ones", and orders "paid" through the sandbox stay in Laporan and Pencairan. The owner decides before the live keys go in: leave them, or start production's database fresh.
- **Production seeding only through Data Contoh** is held by the runbook and the preflight, not by the code: `import:katalog-lama --izinkan-produksi` still writes to production. Decide whether ticket 109 should make it refuse production (ADR 0007 states the gap).
- **Ticket 65, decision 4** (the 10 old catalog rows imported into production as data contoh) is replaced by Data Contoh, as the owner accepted in the plan (C12). Ticket 65's text is not reworded.
- **The hour of P2 and P3.** The plan puts G3 on the afternoon of D4, and its risk list says production deploys only after 21:00 WIB, because every deploy makes open forms stale. The runbook says "a quiet hour, staff told first" and fixes no hour.
- **CS script and banner text** await the owner's approval (C11).

**Unverified** (nothing ran on the host, GitHub, SumoPod, UptimeRobot or GlitchTip): the `data-contoh` interface (subcommands and flags) and the preflight "data contoh" line come from ticket 109's AC, so check them against its merged code; the UptimeRobot and GlitchTip screen names; `$P logs worker | grep -c ' skipped'` counting zero at level 3; the wording of the `deploy.log` lines the runbook quotes (read from `makam-deploy`).

**Tests** (counts read off whole logs): `npx vitest run tests/tooling/go-live-docs.test.ts tests/tooling/nginx-blocks.test.ts tests/tooling/ticket-workflow.test.ts` was green at each step; `npx vitest run tests/tooling` on the final tree: 33 files, 560 tests passed, exit 0. `npm run lint` exit 0 (0 errors, 6 warnings, none in these files), `npm run typecheck` exit 0.
