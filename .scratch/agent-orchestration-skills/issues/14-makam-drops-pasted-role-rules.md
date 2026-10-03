# 14: Makam drops the pasted role rules after the trial

Spec: `.scratch/agent-orchestration-skills/spec.md`.

**What to build:** Once the trial has passed, makam's briefs rely on the skills alone: the pasted role paragraphs leave the appended prompts, the project instructions and the manual, while the hard rules stay in `AGENTS.md`.

**Blocked by:** 11, 13.

**Status:** ready-for-agent

- [ ] The role paragraphs are removed where the analysis's "what moves out" lists them; `AGENTS.md` keeps never pushing to `main`, never opening a pull request and the model tiers.
- [ ] `AGENTS.md` names `research` and `diagnosing-bugs` in its workflow line and calls its HANDOFF block a progress note, so it does not read as the owner's `handoff`.
- [ ] A ticket run after the change behaves as the trial did (report-backs, reviews, merge).

## Comments
