# Agent probe results

Prompt (probes 1-4): "Measurement probe. ... 3 short lines: (1) YES/NO CLAUDE.md/AGENTS.md in context? (2) tool names (3) ok"

## Probes 1-4

| Probe | Started | Model param | Line 1 | Line 2 (tools) | Line 3 | first_prompt | first write 5m/1h |
|---|---|---|---|---|---|---|---|
| 1 reviewer | yes | none (accepted) | NO | Read, Grep, Glob, Bash, SubagentHandback | ok | 5874 | 5872 / 0 |
| 2 builder | yes | none (accepted) | YES | Read, Edit, Write, Grep, Glob, Bash, SubagentHandback | ok | 12823 | 12821 / 0 |
| 3 general-purpose (sonnet) | yes | sonnet | YES | Artifact, Bash, Edit, Glob, Grep, ListAgents, Read, ReportFindings, SendUserFile, ShowOnboardingRolePicker, Skill, SuggestSkills, ToolSearch, Write, 3x mcp docs (batch, guide, update), ~20 mcp session/trigger tools, SubagentHandback (+ deferred via ToolSearch) | ok | 54920 | 54918 / 0 |
| 4 Explore (sonnet) | yes | sonnet | NO | Bash, Glob, Grep, ListAgents, Read, ReportFindings, SendUserFile, ShowOnboardingRolePicker, Skill, SuggestSkills, ToolSearch, mcp docs + session tools, SubagentHandback, plus a long deferred list | ok | 37295 | 37293 / 0 |

Verbatim replies for 1 and 2 (the 3 lines):
- reviewer: `1) NO` / `2) Read, Grep, Glob, Bash, SubagentHandback` / `3) ok`
- builder: `(1) YES` / `(2) Read, Edit, Write, Grep, Glob, Bash, SubagentHandback` / `(3) ok`

## Comparison of first prompts

| Agent | first_prompt (tokens) | CLAUDE.md/AGENTS.md seen |
|---|---|---|
| reviewer | 5874 | NO |
| builder | 12823 | YES |
| general-purpose sonnet | 54920 | YES |
| Explore sonnet | 37295 | NO |

Note: the `model` field in the meta file is `None` for reviewer and builder, so the frontmatter model is not recorded in meta.

## Probe 5: maxTurns

Not run. Spawn failed twice (before and after a 5 s wait, with the file present in `.claude/agents/`), verbatim:
`Agent type 'probe-maxturns' not found. Available agents: builder, claude, claude-code-guide, Explore, general-purpose, Plan, reviewer, statusline-setup`
So agent files created mid-session are NOT detected without a restart. Bash calls made: 0. maxTurns effect: unmeasured.

## Probe 6: cacheTtl

Not run, same reason. Verbatim:
`Agent type 'probe-ttl' not found. Available agents: builder, claude, claude-code-guide, Explore, general-purpose, Plan, reviewer, statusline-setup`
Whether the frontmatter parses and whether the first write carries a 1h tag: unmeasured. For the four agents that did run, the first write carried no 1h tag (5m only; 1h = 0).

## /tmp/m.py output

```
reviewer None calls 1 first_prompt 5874 first_write_tags 5m/1h 5872 0
builder None calls 1 first_prompt 12823 first_write_tags 5m/1h 12821 0
general-purpose sonnet calls 1 first_prompt 54920 first_write_tags 5m/1h 54918 0
Explore sonnet calls 1 first_prompt 37295 first_write_tags 5m/1h 37293 0
```

## usage-report.py (first 8 lines)

```
orchestrator: 8 calls, 0.2M units (51%)
subagents:    4 agents, 4 calls, 0.1M units (49%)
by kind of token (all): cache reads 17%, cache writes 77%, output 7% (subagent output estimated)
  other     n=  2 avg calls=  1.0 avg final ctx=  46107 units=   0.1M (84% of subagents)
  builder   n=  1 avg calls=  1.0 avg final ctx=  12823 units=   0.0M (11% of subagents)
  reviewer  n=  1 avg calls=  1.0 avg final ctx=   5874 units=   0.0M (5% of subagents)
fixed prompt (first-call prompt, re-read on every call, plus its first write): 102% of the total
```
