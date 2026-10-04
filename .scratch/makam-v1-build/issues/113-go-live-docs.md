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
