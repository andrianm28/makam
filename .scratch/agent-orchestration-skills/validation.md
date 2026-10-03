# Validation: agent orchestration skills vs Matt Pocock's workflow and Claude Code Projects

Date 2026-10-03. Research thread (read-only on the design). Method: `research` skill; three analysts (Opus) per part, then three skeptics (Opus) who re-read every cited line and re-fetched the docs; refuted or uncertain claims are dropped or flagged below. Sources: the spec and its 13 tickets; makam's practice files at `origin/main` 6053926; upstream `mattpocock/skills` at d81f3a1 (2026-09-29, `package.json` 1.2.3 with pending v1.3 changesets); Claude Code docs fetched 2026-10-03 as raw Markdown (`code.claude.com/docs/en/<page>.md`, all HTTP 200).

Citation keys: `P:` claude-projects, `R:` routines, `S:` skills, `SA:` sub-agents, `W:` claude-code-on-the-web, `CE:` cloud-environments, `X:` cross-session-messaging (line numbers in the fetched `.md`); `U/` upstream repo; `tNN:` ticket NN; `orch:` `docs/agents/orchestration.md`; `opt:` `orchestration-optimization.md`; `pi:` `project-instructions.md`.

## Verdict

1. The design **orchestrates rather than replaces** Matt's skills, and its rule set (tdd, code-review on two axes, owner-only skills left to the owner) is close to upstream; but it is **not yet fully conformant**: 2 blocking, 12 should-fix, 10 nits.
2. **Blocking 1 — upstream moved:** at d81f3a1 upstream retires `resolving-merge-conflicts` and renames `CONTEXT.md` to `GLOSSARY.md` (pending v1.3); ticket 02 names no pin, and `.claude/settings.json` already enables the *unpinned* upstream plugin for local sessions.
3. **Blocking 2 — report-back:** the primary path (a Routine bound into an existing session) is undocumented and contradicted by the docs ("Each run creates a new session", R:121), and the "fallback" hourly poll uses the same binding, so it is not independent.
4. Against Projects, the spec is **equal or better** on thread roles, models, one writer to `main` and gates; it is **weaker** on owner visibility (no Overview), memory (read on instruction, not auto-loaded) and coordinator context (manual rotation).
5. Owner-only skills are respected in the letter; three practices sit close to them (coordinator rotation, "grilling + domain-modeling" as a standing rule, past "Added" sections) and need re-wording, not removal. Nine decisions are the owner's (section 5).

## 1. Part 1 — Matt Pocock's workflow

### 1.1 Inventory

Upstream's documented flow (`U/skills/engineering/ask-matt/SKILL.md:13-32`): `/grill-with-docs` → (prototype, bridged by `/handoff`) → `/to-spec` → `/to-tickets` → per ticket `/implement` (or `/implement-spec` across the frontier), each driving `/tdd` and closing with `/code-review` → `/retro`. On-ramps: `/triage`, `/diagnosing-bugs`, `/wayfinder`. Precondition: "`/setup-matt-pocock-skills`: run before your first engineering flow" (`:93-95`). Taxonomy: "User-invoked skills … their job is to orchestrate … A user-invoked skill may invoke model-invoked skills, but never another user-invoked one" (`U/README.md:186`).

| Upstream skill | Upstream invocation | Makam | Note |
|---|---|---|---|
| code-review, prototype, research, grilling | model | vendored | identical |
| tdd, diagnosing-bugs, domain-modeling | model | vendored | differ only by `CONTEXT`→`GLOSSARY` rename (version drift, not local edits) |
| to-tickets, grill-with-docs, handoff | **user** | vendored, flag kept | identical |
| resolving-merge-conflicts | (was model) | vendored | **removed upstream**: "nothing replaces it" (`U/.changeset/remove-resolving-merge-conflicts.md:5`) |
| codebase-design | model | **missing** | vendored `tdd/SKILL.md:26` calls it (conditionally) |
| setup-matt-pocock-skills, to-spec, implement, implement-spec, triage, wayfinder, retro, ask-matt, improve-codebase-architecture | user | missing | makam was set up by `setup-matt-pocock-skills` before the rename (`docs/agents/issue-tracker.md` is byte-identical to its seed) |
| pr, wizard, writing-for-agents, misc/*, in-progress/* (incl. `claude-handoff`) | mixed | missing | in-progress skills are not shipped (`U/AGENTS.md:9`) |

Both upstream changes are unreleased changesets (`package.json` still 1.2.3); a pin at the 1.2.3 release avoids them for now, a pin at or after d81f3a1 breaks makam (the skills "only look for `GLOSSARY.md`", `rename-context-to-glossary.md:7`; no migration, and re-running the setup skill would write `GLOSSARY.md`).

### 1.2 Conformance matrix (rule by rule)

| Skill: rule (upstream) | Spec / tickets / practice | Verdict | Evidence |
|---|---|---|---|
| code-review: fixed point resolves, diff non-empty, fail early (`code-review/SKILL.md:23`) | practice has it; t06 silent | FOLLOW | orch:12, pi:9 |
| code-review: both axes as **parallel sub-agents** (`:11,58`) | ticket thread runs it itself (main loop can spawn) | FOLLOW (design) | spec:15,17; t06:13; orch:151 "Proven" |
| same, via `reviewer.md` | one agent covers both axes, no Agent tool | BREAK when used alone | `reviewer.md:3-4,12` |
| code-review: re-review | t06 "a fresh `code-review`"; practice "one agent, item by item, OK/BELUM" | practice contradicts design | t06:14; orch:22 |
| code-review: aggregate, don't rerank (`:76-78`) | blocking/should-fix/nit scale added; used as loop exit | PARTIAL (makam extension) | pi:9; t06:14 |
| code-review: missing tracker → tell user to run `/setup-matt-pocock-skills` (`:13`) | generic design silent | SILENT | spec:40; t02:12 |
| tdd: red before green, one slice at a time (`tdd/SKILL.md:36-37`) | one behaviour per red/green pair + D8 order check | FOLLOW (stricter) | t06:12; t08 |
| tdd: test only at seams **confirmed with the user** (`:22`) | makam fixes one seam in AGENTS.md; generic profile has no seams field | PARTIAL / SILENT | AGENTS.md Tests; spec:40 |
| tdd: Skill tool → `codebase-design` (`:26`) | not vendored; builder has no Skill tool | should-fix | `builder.md:4` |
| tdd: how the builder gets it | "reads or preloads `tdd`, since local agents have no Skill tool" | premise wrong (see C7) | spec:17; SA:310,603 |
| to-tickets: owner-only, template, tracer bullets, blocking edges | 13 tickets follow the template; edges acyclic | FOLLOW (attribution from commit message only) | commit 6053926 |
| to-tickets: no file paths in tickets (`:105`) | paths and script names in ACs | nit | t02:11; t04:5 |
| to-tickets vs agent "## Added" sections | 11 sections in 9 tickets reproduced its output; forbidden from 2026-10-03, existing kept | past BREAK, design FOLLOW | 87:234; opt:255 still proposes them |
| grilling: "Ask the whole frontier in one round … number each question and give your recommended answer" (`grilling/SKILL.md:8`) | option tool, ≤4 per call, decisions taken "one by one" | PARTIAL | orch:17; 87:232; t09:14 |
| grilling: act only after shared understanding (`:28`) | silent | SILENT | t09:14 |
| domain-modeling: glossary only; ADR when hard to reverse, surprising, real trade-off (`:64,68-74`) | "when it is hard to reverse, an ADR" (one criterion of three) | PARTIAL | pi:5 |
| research: background agent, primary sources, one Markdown file (`research/SKILL.md`) | t07:14 | FOLLOW | — |
| prototype: throwaway branch + pointer on the implementation issue (`prototype/SKILL.md:26`) | "never merge prototype code"; pointer missing | PARTIAL | t07:14 |
| diagnosing-bugs: hard bugs, red-capable loop first | spec names it; **no ticket carries it**; builder names only `tdd` | spec FOLLOW, tickets SILENT | spec:15,39; t06:12; `builder.md:11` |
| resolving-merge-conflicts: "Always resolve; never `--abort`" | practice stops and reports on code conflicts; skill retired upstream | BREAK in practice; moot if dropped | pi:11; t07:11 |
| to-spec: Problem/User Stories template, seams with the user, no file paths | `spec.md` agent-written, not in that template | PARTIAL (nit) | `U/…/to-spec/SKILL.md:15-17,55` |
| implement / implement-spec (user-invoked orchestrators) | ticket thread ≈ `implement`; coordinator + merge thread ≈ `implement-spec`, made model-invocable | INTENTIONALLY DIFFERENT (state it) | spec:52; `implement-spec/SKILL.md:13-36` |

### 1.3 Owner-only skills

What the platform forbids (S:545, verified by the skeptic): "If Claude tries anyway, Claude Code blocks the call and instructs it not to reproduce the deploy steps another way, so expect Claude to suggest running `/deploy` yourself." The flag also removes the skill from context (S:552, S:840) and blocks preloading into sub-agents (SA:605). Reading the `SKILL.md` with Read is not addressed (uncertain); upstream itself only forbids skills calling user-invoked skills (`U/.agents/invocation.md:5-8`), not doing similar work by hand. Judgement on each practice:

| Practice | Owner-only skill | Judgement | Conformant alternative |
|---|---|---|---|
| ≤150-word "HANDOFF" in a ticket's `## Comments` (AGENTS.md:69) | `handoff` (summary file in OS temp dir, suggested skills, redaction, `handoff/SKILL.md:8-16`) | **Does not reproduce it**: a scoped progress note in the tracker, none of handoff's steps | rename it "progress note" to remove the name clash (nit) |
| D3 coordinator rotation: the agent writes a HANDOFF and starts the fresh coordinator (t10:14) | `handoff` / `claude-handoff` (in-progress, unshipped) | **Uncertain, close**: structured state rather than a conversation summary, chosen by the owner; but it contradicts orch:137 ("the owner continues in a fresh coordinator session") | rotation = **restart from durable state** (registry, memory, ticket Comments, `list_triggers`), no conversation summary; if a summary is wanted, notify the owner to type `/handoff` |
| Coordinator rule "decisions through `grilling` and `domain-modeling`" (spec:15; t09:14) | `grill-with-docs`, whose whole body is "Call the Skill tool twice, for grilling and domain-modeling" (`grill-with-docs/SKILL.md:7`) | **Close**: each skill alone, when it fits, is model-invocable; a standing rule to run both together is the wrapper minus owner intent | coordinator uses `grilling` for an open decision and `domain-modeling` only when a term or ADR is at stake; for a full design interview it asks the owner to run `/grill-with-docs` |
| Agents writing "## Added" ACs | `to-tickets` | **Reproduced its output** without slicing, edges or quiz; revoked going forward (87:234) | decisions go to `## Comments`; the coordinator prepares a plan or spec and asks the owner to run `/to-tickets` for the delta; mark opt:255 (B.9) superseded |

No hook enforces any of this: the only PreToolUse hook matches `Agent|Task` (`.claude/settings.json:17-24`); protection is the frontmatter flag, which upstream keeps, so a plain sync keeps it (nit).

### 1.4 The setup skill vs profile and sync

`setup-matt-pocock-skills` configures the issue tracker, triage labels and domain docs, and writes an `## Agent skills` block into `CLAUDE.md`/`AGENTS.md` (`SKILL.md:9-13,63-100`); it is "prompt-driven … confirm with the user" (`:15`) and user-invoked, so no script can run it. The design's profile field "the tracker's paths and conventions" (t02:12) **duplicates** `docs/agents/issue-tracker.md`, which Matt's skills read and the profile they never read; nothing covers labels, domain docs or the Agent skills block; `sync.sh` does not list which Matt skills it vendors; acceptance ("one `sync.sh` command and a filled profile", spec:58) omits the owner's one-time `/setup-matt-pocock-skills`. **Verdict: PARTIAL** — distribution is covered, configuration is not.

## 2. Part 2 — the Claude Code Projects method

### 2.1 What Projects does (docs)

Public beta on Pro and Max (P:10); web, desktop and mobile, not the CLI (P:439). One coordinator conversation that "decides what becomes a thread, and keeps track of every thread" (P:51) and works "from recent messages, recent threads, and project memory rather than its full history" (P:225). Threads are separate sessions that load project instructions and memory, repo `CLAUDE.md` and skills, hooks and permissions with one repository, account connectors and skills (P:54-57, P:340-359); plugins only from Project settings, not `.claude/settings.json` (P:360). Threads "report back to the conversation when it finishes" (P:52), with no documented mechanism. The owner can type in a thread directly (P:214). Overview groups threads as Ready for review, Waiting on you, Working, Landing, Idle and Resolved, with a dot and desktop notifications (P:192-207). Instructions: "up to 16,000 characters", sent to each new thread and the coordinator, "not enforced settings" (P:240, P:286). Memory: "Every cloud thread reads the index file `MEMORY.md` when it starts"; writable from the conversation or any thread; no size limit stated (P:285). Settings: thread and coordinator model and effort (P:220-223). Routines run as threads and appear on the Routines tab (P:427). Pull requests: threads branch from default, may open PRs on their own and watch them with auto-fix (P:178-186). Pause stops everything; Archive archives every thread; Resolved happens automatically after a week (P:205, P:391-392). Limit: 200 new threads per day (P:407); one user per project (P:443).

### 2.2 Matrix

| Capability | Spec's equivalent | Verdict | Evidence | Consequence |
|---|---|---|---|---|
| Coordinator conversation | cloud session running `agent-coordinator` | EQUAL in role | spec:24; t09 | — |
| Coordinator context | manual rotation at ~200k (D3) | PARTIAL | P:225; t10:14; orch:137 | failure-prone; report-back Routines carry the old session id |
| Thread start: what loads | `create_session` + brief + `append_system_prompt`; repo CLAUDE.md, skills, agents and hooks load as in Projects | PARTIAL | P:54-57; CE:271-280 | instructions arrive only through the brief or CLAUDE.md; memory not injected |
| Plugins | vendored by `sync.sh` | INTENTIONALLY DIFFERENT | P:360; CE:276 | pinned upgrades; correct, because repo-declared plugins don't load in cloud |
| Native report-back | one-shot Routine bound to the coordinator; fallback watcher + hourly poll | PARTIAL, undocumented | R:121, R:234, R:10; orch:137,139,143 | binding is contradicted by docs; the poll uses the same binding; the watcher dies when the container idles; only failures are pushed (`<child-session-event>`) |
| Coordinator → thread reply | one-shot Routine bound to the thread | PARTIAL, undocumented | spec:27 | a documented `claude -p … --cloud <id>` exists (W:162-170); usable from inside a cloud session is uncertain (needs sign-in, W:370) |
| Owner messages a thread | owner opens the session at claude.ai/code and types | EQUAL for steering | W:96; P:214 | coordinator's registry goes stale; it must re-read heads |
| Overview | "thread registry (and optionally a status page)" in the coordinator's scratchpad | effectively MISSING for the owner | spec:28; orch:142 | owner sees no state, no "Waiting on you"; a thread blocked on a prompt is invisible until the poll |
| Project instructions | profile + per-role `append_system_prompt` | PARTIAL | P:286; spec:29 | for makam `CLAUDE.md` → `AGENTS.md` already loads in every thread, which is the real equivalent; the profile is read only via the skill |
| Project memory | repo file read "at start" by instruction; coordinator-only writer | PARTIAL + INTENTIONALLY DIFFERENT | P:285; spec:30; t09:13 | not auto-loaded; `@`-import from CLAUDE.md would make it so; coordinator writes stay within orch:138 (docs only while no merge thread runs) |
| Models | profile tiers, enforced by hooks | EQUAL+ (intended) | P:222; spec:31 | but the hook lets builder/reviewer through with no model (`require-subagent-model.sh:15`), so "Opus for money" is instruction-only |
| Effort | none | MISSING | P:220 | cost lever unused (nit) |
| Skills / hooks in threads | same loading as Projects | EQUAL | CE:272-279 | hooks need one repository per thread in both |
| Connectors | coordinator has them | spec better | P:361 | — |
| Routines | hourly backstop + one-shots | PARTIAL | P:427; R:23,47 | owner sees them at claude.ai/code/routines (skeptic correction), but not grouped with the work |
| Pull requests | never; merge thread pushes `main` | INTENTIONALLY DIFFERENT | P:178-186; AGENTS.md | loses auto-fix; gains the D1 gate and one writer |
| One writer to `main` | merge thread only, D7 batches | spec adds | spec:16 | Projects can only ask by instruction (P:240) |
| Archiving | `archive_session` per thread | EQUAL (manual) | P:392 | no auto-resolve after a week |
| Pause all | none | MISSING | P:391 | nit |
| Caps | five at once | spec stricter | P:407; spec:18 | conflicts with pi:5 ("3") |

### 2.3 Thread model

Ticket threads match Projects threads: one cloud session per piece of work with its own VM, branch and context, using sub-agents internally ("a thread can still use subagents for its own side tasks", P:432; nesting allowed, SA:1014). A ticket thread can therefore run `code-review`'s two parallel sub-agents itself. The merge thread has no Projects equivalent: Projects threads start "on a new branch, started from the repository's default branch" (P:178) and merge through PRs. **Only the spec** has one writer to `main`, a CI gate on `merge/**`, enforced tiers and TDD order, a coordinator with connectors, and availability today on any plan. **Only Projects** has documented report-back and routing, the Overview with notifications, instructions and memory in every thread without a brief, coordinator context management, Pause-all, PR auto-fix and auto-resolve.

## 3. Claims and verdicts

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| C1 | Upstream retired `resolving-merge-conflicts`; t07 requires it; a sync at d81f3a1 cannot supply it | CONFIRMED | changeset `:5`; t07:11 |
| C2 | Upstream renames CONTEXT→GLOSSARY with no fallback; makam uses CONTEXT | CONFIRMED (pending v1.3, not released) | changeset `:5,7`; CLAUDE.md:15 |
| C3 | Vendored differences are version drift, not local edits | CONFIRMED (shallow clone; 1.2.3 hash not found) | diffs |
| C4 | `.claude/settings.json` enables the unpinned upstream plugin | CONFIRMED; affects local sessions only (cloud ignores it, CE:276) | settings.json:2-9 |
| C5 | Each Routine run creates a new session; binding to an existing session is undocumented | CONFIRMED | R:121, R:234 |
| C6 | The hourly backstop shares the binding, so the fallback is not independent | CONFIRMED | orch:137,143 |
| C7 | One-off runs are documented; "at most hourly" holds only for recurring | CONFIRMED (spec:54, orch:139 overstate) | R:145-163, R:384 |
| C8 | "Local agents have no Skill tool" is self-imposed by `builder.md:4`; `skills:` preload exists | CONFIRMED | SA:310,603,605 |
| C9 | `codebase-design` is called by vendored tdd and not vendored | CONFIRMED (call is conditional) | tdd:26 |
| C10 | A fix-pass builder following `builder.md:9` resets the branch to `origin/main` | CONFIRMED; local damage only, push would be rejected | builder.md:3,9; t06:14 |
| C11 | Practice re-review (one agent, OK/BELUM) contradicts t06 and the D2 revocation | CONFIRMED that it contradicts t06; whether D2's revocation covers re-reviews is UNCERTAIN | orch:22; 87:234 |
| C12 | D3 rotation as t10 writes it reproduces `handoff` | UNCERTAIN (closer to unshipped `claude-handoff`; conflicts with orch:137) | t10:14 |
| C13 | "grilling + domain-modeling" equals the body of `grill-with-docs` | CONFIRMED literally; "BREAK" UNCERTAIN | grill-with-docs:7 |
| C14 | Option tool one-by-one departs from grilling's frontier rounds | CONFIRMED | grilling:8; orch:17 |
| C15 | No ticket carries `diagnosing-bugs`, reviewer/merge worktree, branch-deletion ask, models-by-hooks, a no-`disable-model-invocation` check | CONFIRMED (all 13 grepped) | — |
| C16 | Ticket 98 bug ran without `diagnosing-bugs` | UNCERTAIN (brief not in repo; "green on first run" fits diagnosing-bugs' refuted-hypothesis path) | 98:27 |
| C17 | Thread cap 5 (spec, t12) vs 3 (pi:5) | CONFIRMED | spec:18; pi:5 |
| C18 | Context limits disagree: 100 calls/250k, 200k, ~300k, 150k | CONFIRMED | AGENTS.md:69; spec:16-17; orch:86; opt:120 |
| C19 | Profile duplicates the tracker and omits labels, domain docs and the setup step | CONFIRMED | t02:12; setup:9-13 |
| C20 | Projects memory is auto-read; the spec's is read on instruction | CONFIRMED | P:285; t09:13 |
| C21 | Overview is invisible to the owner in the spec | CONFIRMED | orch:142 |
| C22 | Routines don't appear on any owner view | REFUTED (claude.ai/code/routines lists them) | R:23,47 |
| C23 | Coordinator-only memory writes break one writer to `main` | REFUTED (orch:138 already allows docs while no merge thread runs) | orch:138 |
| C24 | Vendored `resolving-merge-conflicts` lacks `agents/openai.yaml` | REFUTED (it exists) | — |
| C25 | Reading an owner-only `SKILL.md` to follow it is forbidden | UNCERTAIN (docs silent; S:545 applies on a blocked call) | S:545 |
| C26 | `claude -p … --cloud` works from inside a cloud session | UNCERTAIN | W:162-170,370 |
| C27 | "Opus for analysts and skeptics" is a standing rule in the repo | UNCERTAIN (owner decision in this brief; not in AGENTS.md:71) | 87:221 |

## 4. Part 3 — proposals (apply none)

Severity after skeptics. "Rec." is the recommended option.

**Blocking**

1. **Pin policy for Matt's skills** — spec "Matt's skills travel", t02, t07, t12. Rec.: t02 AC names an explicit pin at the **1.2.3 release** (before the v1.3 changesets) and an explicit list of vendored skills (adding `codebase-design`, `setup-matt-pocock-skills`); `resolving-merge-conflicts` kept as a project-local copy with credit; `.claude/settings.json` drops the unpinned `mattpocock-skills` plugin (or pins it to the same version). AC wording: "`sync.sh` vendors the listed Matt skills at the profile's pinned version; a sync never changes `CONTEXT.md` handling". Alternatives: (a) adopt v1.3 — `git mv CONTEXT.md GLOSSARY.md` in makam and update AGENTS.md, CLAUDE.md and `domain.md`, and drop `resolving-merge-conflicts` from t07 (upstream's position); (b) patch names in `sync.sh` (a local edit; loses "never replaces").
2. **Report-back that does not depend on one undocumented mechanism** — spec mapping and Constraints, t10, t11. Rec.: rewrite the Constraint ("one-off schedules are documented, R:147; binding into an existing session is not, and the docs say each run creates a new session, R:121"); add a reconciliation path independent of binding: on every wake (owner message, any Routine, `<child-session-event>`), the coordinator checks every registered thread with `get_session` (`status_bucket`) and branch heads. t11 AC: "the end-to-end run passes with Routine binding disabled, using reconciliation alone". Alternatives: probe `claude -p … --cloud <coordinator-id>` in t01; accept the risk and document it only.

**Should-fix**

3. **Fix-pass setup** — t06. Rec.: AC "a fix-pass sub-agent checks out `origin/<branch>`, never `origin/main`, and starts from a red test reproducing the finding"; makam's `builder.md` gets a fix-pass section. Alt.: a separate `fix-pass` agent definition.
4. **Skills in sub-agents** — spec:17, t01:13, t06:12. Rec.: drop "since local agents have no Skill tool"; builder definition gets `skills: [tdd, diagnosing-bugs]` and `Skill` in `tools`; t01 confirms in cloud. Alt.: read SKILL.md **and its references** by path.
5. **`diagnosing-bugs` in tickets** — t06, AGENTS.md:65. Rec.: t06 AC "a bug ticket or an unexplained red starts with `diagnosing-bugs`; D8 accepts its Phase 1 loop via `TDD-exempt:`"; add `research` and `diagnosing-bugs` to AGENTS.md's workflow line (t12/t13).
6. **Re-review** — t06:14, orch:22, `reviewer.md`. Owner decides whether the D2 revocation covers re-reviews. Rec.: yes — every re-review is a fresh two-axis `code-review`; `reviewer.md` becomes single-axis (the brief names Standards or Spec). Alt.: keep item-by-item checking inside the Spec axis of a fresh code-review.
7. **Coordinator rotation** — t10:14, orch:137. Rec.: AC "rotation restarts from durable state (registry, memory, Comments, `list_triggers`); no conversation summary; the new coordinator re-briefs open threads with its session id or the old one forwards until each reports"; when a summary is wanted, notify the owner to type `/handoff`. Alt.: owner starts the fresh session by hand (today's orch:137).
8. **Decision protocol** — t09:14, orch:17, pi:5. Rec.: one numbered round with the whole frontier and a recommended answer each, in text; the option tool only collects answers (≤4 per call, same round); `domain-modeling` only for terms and ADRs (all three criteria); full design interviews by the owner's `/grill-with-docs`. Alt.: keep, and state why it is not grill-with-docs.
9. **Overview** — spec:28, t09, t11. Rec.: an owner-visible, durable registry with a "Waiting on you" column from `status_bucket` = blocked/failed — either a committed `.scratch/<feature>/threads.md` (docs-to-main rule) or an Artifact status page backed by its database. Alt.: post a status table on change only.
10. **Memory** — spec:30, t09:13. Rec.: `@`-import the memory file from `CLAUDE.md` so every thread auto-loads it; coordinator alone writes it under orch:138; threads propose entries in report-backs. Alt.: keep "read at start" in briefs.
11. **Setup coverage** — t02 profile, t11 README, spec acceptance. Rec.: acceptance adds "the owner runs `/setup-matt-pocock-skills` once"; the profile points to `docs/agents/*.md` instead of duplicating the tracker and holds only orchestration fields plus a `seams` field (tdd:22). Alt.: `npx skills add` for Matt's part (pinning uncertain).
12. **One number per limit, and enforcement gaps** — t02, t06, t09, t12, pi:5, hook. Rec.: profile fields for context limit per role, same-session fix-pass limit, thread cap; the owner picks the cap (5 per spec vs 3 in pi:5) and t12 updates pi:5; the model hook requires an explicit model for money paths; t07 AC "reviewer and merge threads work in a `git worktree`"; t09 AC "ask the owner to delete merged branches"; t12 closes or redirects 87:88-92.
13. **Merge conflicts** — pi:11, t07. Follows decision 1: if the skill is kept, the merge thread resolves code conflicts per it and stops only on failed proofs; if dropped, keep "stop and report".
14. **D8 timing and trial timing** — t08:12, t12:7. Rec.: owner confirms whether D8 blocks per commit (87:232) or before "ready"; whether "trial on the next ready ticket" may wait for t06–t09.

**Nits**

15. spec:54 and orch:139: correct "document neither" and "at most hourly" (C7).
16. Profile: thread effort tier; coordinator "pause all" section (P:220, P:391).
17. Mark opt:229 (D2 eval) and opt:255 (B.9 Added ACs) superseded.
18. Rename the AGENTS.md "HANDOFF" block to "progress note".
19. t07: prototype pointer on the implementation ticket (`prototype:26`).
20. t11 blocked by t08; t11 creates CI for the skills repo.
21. t06:16 "never opens a pull request" belongs in the profile's PR policy for the generic skill.
22. Conformance evals (spec:42): add "never reads an owner-only `SKILL.md` to carry out its steps; suggests the slash command instead".
23. Next spec through the owner's `/to-spec` (template, seams with the user).
24. README: state that `agent-coordinator` is a consciously model-invocable `implement-spec`-style orchestrator, unlike upstream's taxonomy (`README.md:186`), and list Projects' documented limits.

## 5. Decisions for the owner (9)

1. Pin: 1.2.3 with a local `resolving-merge-conflicts`, or adopt v1.3 (GLOSSARY rename, skill dropped) — and remove or pin the plugin in `settings.json` (proposal 1).
2. Report-back: require a reconciliation path that works without Routine binding, or accept the risk (2).
3. Re-reviews: fresh two-axis `code-review` or item-by-item (6).
4. Rotation: restart from durable state by the agent, or by the owner (7).
5. Decision format: whole-frontier rounds; owner's `/grill-with-docs` for design interviews (8).
6. Overview: committed file or Artifact status page (9).
7. Memory auto-loaded through `CLAUDE.md` (10).
8. Thread cap 3 or 5, and the context limits per role (12).
9. D8 timing and when the trial ticket runs (14).

## 6. What stays untested

- Whether a leading `/skill` in a `create_session` or Routine prompt expands (t01's probe); R:77 says fired prompts are not user input.
- Reliability of `persistent_session_id` binding beyond the pilot's 22 report-backs (orch:139); its behaviour after a coordinator rotation.
- `skills:` preload and the Skill tool in a sub-agent **inside a cloud session**.
- `claude -p … --cloud` from inside a cloud session (sign-in).
- Which copy wins when the upstream plugin and the vendored skills are both present locally.
- The upstream 1.2.3 release commit hash (shallow clone, no tags); whether `skills.sh` can pin.
- Whether the owner typed `/to-tickets` (commit message only); the ticket 98 brief text.
- Whether `andrianm28/agent-orchestration-skills` exists yet.
- Projects itself was not used: every Projects statement comes from the docs, not a trial.
