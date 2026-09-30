# Token principles (any model, any provider)

The rules in `orchestration.md` ("Token discipline") are measured on Claude in Claude Code. This page is the part that does not depend on that: the cost model, the rules that follow from its *shape*, and the procedure to re-derive every number for another model or provider. Read the ratios as inputs, never as facts.

## 1. The cost model

A session pays for four things. Price each against one fresh input token = 1:

| Term | Symbol | Anthropic (published) | Other providers |
|---|---|---|---|
| Cached input read back | `r` | 0.1 | 0.1 to 0.5, or 1.0 when there is no cache |
| Input written to the cache | `w` | 1.25 (5-minute entry), 2.0 (1-hour) | 1.0 when caching is automatic and free to write |
| Output token | `o` | 5 | 3 to 8 |
| Cache lifetime | `TTL` | 5 min (1 h opt-in) | 5 min to 1 h, some providers undocumented |

For an agent making `n` calls on a context that grows from `c0` to `cn`:

`cost ≈ c0·(w + r·n)  +  Σ new tokens·(w + r·remaining calls)  +  o·output  +  misses`

where a **miss** is a call whose silent gap since the previous call reached `TTL`: the whole context is paid at `w` again instead of `r`. Three things follow, and they hold for any `r < w`:

1. **The prompt every call re-reads is the largest lever** (here about 20% of the total): it is paid `n` times.
2. **Cost per call grows with context, so total cost grows roughly with `n²`**: halving the length of an agent run saves more than half.
3. **A gap of `TTL` or more turns a cheap call into an expensive one.** Whether a longer cache lifetime is worth its higher write price is arithmetic on `r`, `w`, and the measured miss count, not a default.

## 2. Rules that hold whatever the model

Each rule is structural; its size depends on the ratios above and is measured in section 3.

1. **A small fixed prompt per agent role.** Give each role only the tools it needs, and load project instructions only into the roles that act on them (a reviewer that is handed the diff needs neither). Put role-specific text in the role, not in the shared instructions every agent reads.
2. **Short agents, handed work in slices.** Cap a run by a call budget and a context budget; at the budget the agent commits, writes a handoff of at most ~150 words, and stops. The next agent starts from the handoff, not from the transcript.
3. **Never leave an agent idle longer than the cache lifetime** with a big context. Wait inside a command (a background task the harness tracks) rather than between turns, and do not resume an old agent after a long pause: start a fresh one from its handoff.
4. **Read by range, write long output to a file.** `grep` and line ranges, not whole files; a test or build log goes to a file and only its counts and failing lines are read. Never re-read a file already in context.
5. **Put the cheapest model that passes on each role.** Tier by the cost of being wrong (mechanical edits and re-reviews low; money, security and concurrency code high), and verify a tier with a test, not a belief.
6. **One owner per resource** (a worktree, a database): two agents writing the same place cost a full re-run each.
7. **Brief by pointer.** A brief names the paths and the acceptance criteria; it does not paste files the agent can read. Reports come back short, with numbers read off a kept log.

## 3. Re-derive the numbers for a new model or provider

Do this on the first real session with the new model, before trusting any percentage in `orchestration.md`:

1. Run `python3 scripts/agents/usage-report.py [SESSION_DIR] --profile <name>` (or pass `--read`, `--write`, `--write-long`, `--out`, `--ttl`). Built-in profiles: `anthropic` (default), `half-price-cache`, `no-cache`. The profile only reweights the units; the token counts, the first-call prompt sizes and which calls missed the cache are read from the transcript, so they are facts about that session.
2. Read four things off it: the fixed-prompt share, the share of the cost in the longest agents, the miss count by silent gap, and the simulated saving of a context reset. If the fixed-prompt share is below ~5%, rule 1 is not worth more work; if misses are near zero, rule 3 is already satisfied.
3. A provider whose transcripts lack cache-write tags (or have no cache) shows `writes` as all one weight and misses as zero: then the model is `r = w = 1` and only rules 1, 2, 4 and 7 (fewer and shorter calls) matter. The report says so; do not apply a cache-gap rule there.
4. Before adopting any frontmatter or harness option (a turn limit, a cache lifetime, an omitted instruction file), probe it once in a fresh session against a control, like probe 2 did: a documented key is not evidence. Probe 2 found that a turn limit was not enforced.
5. Record the ratios and the date with the result. A saving computed on one session is an estimate for similar sessions, not a guarantee.

## 4. What stays harness-specific

The key names (`omitClaudeMd`, `maxTurns`, `experimental.cacheTtl`), the agent file format in `.claude/agents/`, and the `PreToolUse` hook that requires a `model`. A different agent runner needs the same *rules* (section 2) expressed in its own configuration; `orchestration.md` records what was done here.
