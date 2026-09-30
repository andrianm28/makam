#!/usr/bin/env python3
"""Where an orchestration session's tokens went, and why, from the session transcripts.

    python3 scripts/agents/usage-report.py [SESSION_DIR] [--profile NAME] [--read X] [--write X]
        [--write-long X] [--out X] [--ttl MINUTES]

SESSION_DIR defaults to the newest ~/.claude/projects/*/<session-id>/ (the folder next to
<session-id>.jsonl, holding subagents/). Prints:

  1. cost in "units" for the orchestrator and the subagents, split by agent kind and by kind of
     token. units = cache-read * 0.1 + cache-write * (1.25 for a 5-minute cache entry, 2 for a
     1-hour one, read from each call's own `cache_creation` tags) + output * 5 (published price
     ratios; a subscription quota may weigh differently);
  2. the median first-call prompt per agent type and model (the fixed prompt);
  3. the cache-miss evidence: the miss rate of an ordinary tool-loop call and of a resume turn
     by the silent gap since the agent's previous call (a miss = a call with more than 100k
     tokens of context of which over 30% was re-written instead of read);
  4. the simulated saving if every agent's context were reset once it passes a cap.

Subagent `output_tokens` are under-recorded by the harness (a few tokens per call): the output
is estimated here from the text the agent wrote (bytes / 3.5) when the record is implausible.
See docs/agents/orchestration.md, "Token discipline".
"""
import collections, datetime, glob, json, os, statistics, sys

# Price ratios against one fresh input token = 1. The default is Anthropic's published ratios; other
# providers differ (a cache read is 0.1 to 0.5 of an input token, a write 1.0 to 1.25, a cache may
# live 5 minutes to an hour), so pick a profile or pass the numbers: every conclusion in
# docs/agents/token-principles.md must be re-read with the provider's own ratios.
PROFILES = {
    "anthropic": dict(read=0.1, write=1.25, write_long=2.0, out=5.0, ttl=5),
    "half-price-cache": dict(read=0.5, write=1.0, write_long=1.0, out=4.0, ttl=10),
    "no-cache": dict(read=1.0, write=1.0, write_long=1.0, out=4.0, ttl=0),
}
W_READ, W_5M, W_1H, W_OUT = 0.1, 1.25, 2.0, 5.0
TTL = 5


def configure(argv):
    """Set the price weights and the cache lifetime from the command line; returns the session dir."""
    global W_READ, W_5M, W_1H, W_OUT, TTL
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("session_dir", nargs="?")
    ap.add_argument("--profile", choices=sorted(PROFILES), default="anthropic")
    ap.add_argument("--read", type=float)
    ap.add_argument("--write", type=float)
    ap.add_argument("--write-long", type=float)
    ap.add_argument("--out", type=float)
    ap.add_argument("--ttl", type=float, help="cache lifetime in minutes (0 = no cache)")
    a = ap.parse_args(argv)
    p = PROFILES[a.profile]
    W_READ = a.read if a.read is not None else p["read"]
    W_5M = a.write if a.write is not None else p["write"]
    W_1H = a.write_long if a.write_long is not None else p["write_long"]
    W_OUT = a.out if a.out is not None else p["out"]
    TTL = a.ttl if a.ttl is not None else p["ttl"]
    return a.session_dir


def ts(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))


def load(path):
    """One record per distinct assistant message: timestamp, usage, output bytes, resume flag."""
    msgs, order, resume, seen_any = {}, [], False, False
    for line in open(path):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        t = d.get("type")
        if t == "user":
            c = d.get("message", {}).get("content")
            is_text = isinstance(c, str) or (
                isinstance(c, list)
                and any(b.get("type") == "text" for b in c)
                and not any(b.get("type") == "tool_result" for b in c)
            )
            if is_text and seen_any:
                resume = True
        elif t == "assistant":
            m = d.get("message", {})
            mid = m.get("id")
            if not mid:
                continue
            size = 0
            for b in m.get("content", []) or []:
                ty = b.get("type")
                if ty == "text":
                    size += len(b.get("text", ""))
                elif ty == "tool_use":
                    size += len(json.dumps(b.get("input", {})))
            if mid not in msgs:
                msgs[mid] = {"ts": d["timestamp"], "u": m.get("usage"), "bytes": 0, "resume": resume}
                order.append(mid)
                resume = False
                seen_any = True
            msgs[mid]["bytes"] += size
            if m.get("usage"):
                msgs[mid]["u"] = m["usage"]
    return [msgs[i] for i in order if msgs[i]["u"]]


def ctx(u):
    return u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)


def write_weight(u):
    cc = u.get("cache_creation") or {}
    if cc.get("ephemeral_5m_input_tokens", 0) and not cc.get("ephemeral_1h_input_tokens", 0):
        return W_5M
    return W_1H


def write_units(u):
    cc = u.get("cache_creation") or {}
    if cc:
        return cc.get("ephemeral_1h_input_tokens", 0) * W_1H + cc.get("ephemeral_5m_input_tokens", 0) * W_5M
    return u.get("cache_creation_input_tokens", 0) * W_1H


def parts(calls, estimate_output):
    # fresh uncached input counts at 1 (negligible with Claude's cache, all of it without a cache)
    read = sum(c["u"].get("cache_read_input_tokens", 0) * W_READ + c["u"].get("input_tokens", 0) for c in calls)
    write = sum(write_units(c["u"]) for c in calls)
    recorded = sum(c["u"].get("output_tokens", 0) for c in calls)
    estimated = sum(c["bytes"] for c in calls) / 3.5
    out = (estimated if estimate_output and recorded < 50 * len(calls) else recorded) * W_OUT
    return read, write, out


def kind(desc):
    d = (desc or "").lower()
    if "review" in d:
        return "reviewer"
    if any(w in d for w in ("build", "fix", "port", "finish", "prototype", "uat", "seed", "merge", "record")):
        return "builder"
    return "other"


def capped(calls, cap, handoff=25000):
    """Cost of an agent whose context is reset (to its first prompt plus a handoff) once it passes `cap`."""
    cs = [ctx(c["u"]) for c in calls]
    w = write_weight(calls[0]["u"])
    base = cur = prev = cs[0]
    eq = base * (W_READ + w)
    for c in cs[1:]:
        inc = max(0, c - prev)
        prev = c
        cur += inc
        eq += w * inc
        if cur > cap:
            cur = base + handoff
            eq += w * handoff
        eq += W_READ * cur
    return eq


def miss_tables(agents):
    t = TTL or 5
    edges = [(f"<{t:g} min", 0, t), (f"{t:g}-{2 * t:g} min", t, 2 * t), (f">={2 * t:g} min", 2 * t, 1e9)]
    tables = {False: collections.defaultdict(lambda: [0, 0]), True: collections.defaultdict(lambda: [0, 0])}
    for calls in agents:
        prev = None
        for c in calls:
            gap = (ts(c["ts"]) - ts(prev)).total_seconds() / 60 if prev else None
            prev = c["ts"]
            x = ctx(c["u"])
            if gap is None or x <= 100000:
                continue
            miss = c["u"].get("cache_creation_input_tokens", 0) > 0.3 * x
            for name, lo, hi in edges:
                if lo <= gap < hi:
                    tables[c["resume"]][name][0] += 1
                    tables[c["resume"]][name][1] += miss
    return tables[False], tables[True], [e[0] for e in edges]


def main():
    arg = configure(sys.argv[1:])
    root = arg if arg else max(glob.glob(os.path.expanduser("~/.claude/projects/*/*/")), key=os.path.getmtime)
    root = root.rstrip("/")
    main_calls = load(root + ".jsonl") if os.path.exists(root + ".jsonl") else []
    subs = []
    for f in glob.glob(root + "/subagents/agent-*.jsonl"):
        calls = load(f)
        if not calls:
            continue
        try:
            meta = json.load(open(f[:-6] + ".meta.json"))
        except (OSError, ValueError):
            meta = {}
        subs.append((kind(meta.get("description")), meta.get("agentType"), meta.get("model"), calls))

    mr, mw, mo = parts(main_calls, False)
    sr = sw = so = 0.0
    for _, _, _, calls in subs:
        r, w, o = parts(calls, True)
        sr, sw, so = sr + r, sw + w, so + o
    tot = (mr + mw + mo + sr + sw + so) or 1
    print(f"orchestrator: {len(main_calls)} calls, {(mr + mw + mo) / 1e6:.1f}M units ({(mr + mw + mo) / tot * 100:.0f}%)")
    print(f"subagents:    {len(subs)} agents, {sum(len(c) for *_, c in subs)} calls, {(sr + sw + so) / 1e6:.1f}M units ({(sr + sw + so) / tot * 100:.0f}%)")
    print(f"by kind of token (all): cache reads {(mr + sr) / tot * 100:.0f}%, cache writes {(mw + sw) / tot * 100:.0f}%, output {(mo + so) / tot * 100:.0f}% (subagent output estimated)")
    sub_tot = (sr + sw + so) or 1
    by = collections.defaultdict(list)
    for k, _, _, calls in subs:
        by[k].append(calls)
    for k, v in sorted(by.items(), key=lambda kv: -sum(sum(parts(c, True)) for c in kv[1])):
        u = sum(sum(parts(c, True)) for c in v)
        print(
            f"  {k:9s} n={len(v):3d} avg calls={statistics.mean(len(c) for c in v):5.1f} "
            f"avg final ctx={int(statistics.mean(ctx(c[-1]['u']) for c in v)):7d} units={u / 1e6:6.1f}M ({u / sub_tot * 100:.0f}% of subagents)"
        )
    pre = sum(ctx(c[0]["u"]) * (len(c) * W_READ + write_weight(c[0]["u"])) for *_, c in subs)
    if main_calls:
        pre += ctx(main_calls[0]["u"]) * (len(main_calls) * W_READ + write_weight(main_calls[0]["u"]))
    print(f"fixed prompt (first-call prompt, re-read on every call, plus its first write): {pre / tot * 100:.0f}% of the total")

    print("\nfirst-call prompt by agent type and model (tokens, median):")
    g = collections.defaultdict(list)
    for _, at, m, calls in subs:
        g[(at, m)].append(ctx(calls[0]["u"]))
    for k, v in sorted(g.items(), key=lambda kv: str(kv[0])):
        print(f"  {str(k[0]):16s} {str(k[1]):7s} n={len(v):3d} median={int(statistics.median(v))}")

    ordinary, resumed, names = miss_tables([c for *_, c in subs])
    print("\ncache misses (calls with >100k context, >30% of it re-written), by silent gap since the agent's previous call:")
    for label, table in (("ordinary tool-loop calls", ordinary), ("resume turns (a new text message)", resumed)):
        print(f"  {label}: " + ", ".join(f"{n}: {table[n][1]}/{table[n][0]}" for n in names))
    print(f"  (an agent's cache entry lives {TTL:g} minutes here: a silent gap of that long or more, a long build or test or an idle wait before a resume, re-writes the whole context)")

    if subs:
        base = sum(capped(c, 10**9) for *_, c in subs)
        for cap in (180000, 250000, 350000):
            print(f"simulated saving if every agent reset at {cap // 1000}k tokens: {(1 - sum(capped(c, cap) for *_, c in subs) / base) * 100:.0f}% of subagent cost (optimistic)")


if __name__ == "__main__":
    main()
