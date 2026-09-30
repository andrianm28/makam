# Probe results 2

All four probes ran as foreground Agent calls with `model: "haiku"`. All started; none was refused.

| # | Probe | Started | Returned (verbatim) | tool_uses |
|---|---|---|---|---|
| 1 | `probe-maxturns` | yes | "All 10 echo commands executed successfully:<br>- echo 1 through echo 10 each completed as separate Bash calls<br>- Results: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10<br>Task complete." | 11 |
| 2 | `probe-ttl` | yes | "Executed three echo commands as requested:<br>- echo a: printed "a"<br>- echo b: printed "b"<br>- echo c: printed "c"<br>All commands completed successfully." | 4 |
| 3 | `probe-ttl2` | yes | "Done. Ran three separate bash calls executing echo a, echo b, and echo c as requested." | 4 |
| 4 | control `general-purpose` | yes | "Completed all three Bash commands as requested:<br>- echo a → output: a<br>- echo b → output: b<br>- echo c → output: c<br>All commands executed successfully." | 4 |

Probe 1: the harness reported 11 tool uses (10 Bash calls plus the SubagentHandback). The agent did not stop early and finished all 10 echoes, so `maxTurns: 3` was not enforced. The measurement script shows only 2 distinct assistant message ids for it, so its "calls" column undercounts. It dedupes by message id.

## Measurement (`/tmp/m.py` output, verbatim)

```
probe-ttl2 calls 2 first_prompt 9633 cache write tags (5m,1h) per call [(9623, 0), (2176, 0)]
probe-maxturns calls 2 first_prompt 9643 cache write tags (5m,1h) per call [(9633, 0), (2793, 0)]
probe-ttl calls 4 first_prompt 9633 cache write tags (5m,1h) per call [(0, 9623), (0, 11654), (0, 145), (0, 143)]
general-purpose calls 5 first_prompt 43136 cache write tags (5m,1h) per call [(43126, 0), (2179, 0), (142, 0), (136, 0), (93, 0)]
```

## Tag table

| Agent | Call | 5m written | 1h written |
|---|---|---|---|
| probe-ttl (nested `experimental.cacheTtl`) | 1 | 0 | 9623 |
| | 2 | 0 | 11654 |
| | 3 | 0 | 145 |
| | 4 | 0 | 143 |
| probe-ttl2 (top-level `cacheTtl`) | 1 | 9623 | 0 |
| | 2 | 2176 | 0 |
| probe-maxturns | 1 | 9633 | 0 |
| | 2 | 2793 | 0 |
| general-purpose (control) | 1 | 43126 | 0 |
| | 2 | 2179 | 0 |
| | 3 | 142 | 0 |
| | 4 | 136 | 0 |
| | 5 | 93 | 0 |

## Answer

- `probe-ttl` (nested `experimental: cacheTtl: 1h`): every call writes only a 1h-tagged entry, and no 5m entry.
- `probe-ttl2` (top-level `cacheTtl`): every call writes 5m only, so the top-level key has no effect.
- The control writes 5m only.
- So only the nested `experimental.cacheTtl: 1h` key changes the cache tag.
