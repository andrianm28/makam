#!/usr/bin/env python3
"""Where an orchestration session's tokens went, from the session transcripts.

    python3 scripts/agents/usage-report.py [SESSION_DIR]

SESSION_DIR defaults to the newest ~/.claude/projects/*/<session-id>/ (the folder next to
<session-id>.jsonl, holding subagents/). Prints, for the orchestrator and the subagents:
calls, cache-read/write/output tokens, cost in units (read*0.1 + write*2 + output*5), the split
by agent kind, the median first-call prompt, and the simulated saving if every agent's context
were reset at 250k tokens. Subagent `output_tokens` are under-recorded by the harness; treat the
output share as a lower bound. See docs/agents/orchestration.md, "Token discipline".
"""
import glob, json, os, statistics, sys, collections

def load(path):
    msgs = {}
    for line in open(path):
        try: d = json.loads(line)
        except ValueError: continue
        if d.get("type") != "assistant": continue
        m = d.get("message", {}); u = m.get("usage")
        if u and m.get("id"): msgs[m["id"]] = (d["timestamp"], u)
    return [u for _, u in sorted(msgs.values(), key=lambda x: x[0])]

def units(us): return sum(u.get("cache_read_input_tokens", 0) * .1 + u.get("cache_creation_input_tokens", 0) * 2 + u.get("output_tokens", 0) * 5 for u in us)
def ctx(u): return u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)

def capped(us, cap, handoff=25000):
    cs = [ctx(u) for u in us]; base = cs[0]; cur = base; prev = base; eq = 2.1 * base
    for c in cs[1:]:
        inc = max(0, c - prev); prev = c; cur += inc; eq += 2 * inc
        if cur > cap: cur = base + handoff; eq += 2 * handoff
        eq += .1 * cur
    return eq

def kind(desc):
    d = (desc or "").lower()
    if "review" in d: return "reviewer"
    if any(w in d for w in ("build", "fix", "port", "finish", "prototype", "uat", "seed", "merge", "record")): return "builder"
    return "other"

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else max(glob.glob(os.path.expanduser("~/.claude/projects/*/*/")), key=os.path.getmtime)
    root = root.rstrip("/")
    main_us = load(root + ".jsonl") if os.path.exists(root + ".jsonl") else []
    subs = []
    for f in glob.glob(root + "/subagents/agent-*.jsonl"):
        us = load(f)
        if not us: continue
        try: desc = json.load(open(f[:-6] + ".meta.json")).get("description")
        except (OSError, ValueError): desc = ""
        subs.append((kind(desc), us))
    tot_main = units(main_us); tot_sub = sum(units(u) for _, u in subs); tot = tot_main + tot_sub or 1
    print(f"orchestrator: {len(main_us)} calls, {tot_main/1e6:.1f}M units ({tot_main/tot*100:.0f}%)")
    print(f"subagents: {len(subs)} agents, {sum(len(u) for _, u in subs)} calls, {tot_sub/1e6:.1f}M units ({tot_sub/tot*100:.0f}%)")
    by = collections.defaultdict(list)
    for k, u in subs: by[k].append(u)
    for k, v in sorted(by.items(), key=lambda kv: -sum(units(u) for u in kv[1])):
        print(f"  {k:9s} n={len(v):3d} avg calls={statistics.mean(len(u) for u in v):5.1f} avg final ctx={int(statistics.mean(ctx(u[-1]) for u in v)):7d} units={sum(units(u) for u in v)/1e6:6.1f}M")
    if subs:
        print("median first-call prompt:", int(statistics.median(ctx(u[0]) for _, u in subs)))
        base = sum(capped(u, 10**9) for _, u in subs); c250 = sum(capped(u, 250000) for _, u in subs)
        print(f"simulated saving if every agent reset at 250k tokens: {(1 - c250 / base) * 100:.0f}% of subagent cost (optimistic)")

if __name__ == "__main__":
    main()
