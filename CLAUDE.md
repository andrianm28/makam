@AGENTS.md

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Orchestrator

The top-level session that dispatches agents reads `docs/agents/orchestration.md` once at the start (merge procedure, review procedure, token discipline). Builders and reviewers do not need it: `AGENTS.md` carries their rules.
