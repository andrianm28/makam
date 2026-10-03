#!/usr/bin/env python3
"""Thread-mode cost report: what a coordinator and its child threads cost.

    python3 scripts/agents/thread-cost-report.py SESSIONS.json [--json]

SESSIONS.json is a plain file the coordinator saves from the platform's `get_session` /
`list_sessions` results (a script cannot call those tools itself):

    {"coordinator": "<session_id>",
     "sessions": [{"session_id", "title", "role", "ticket", "parent_session_id",
                   "status_bucket", "cost_usd", "created_at"}, ...]}
"""
import argparse, json, re, sys

# Price ratios against one fresh input token = 1, the same as usage-report.py (Anthropic's published ratios).
W_READ, W_5M, W_1H, W_OUT = 0.1, 1.25, 2.0, 5.0

# Wake-cause markers: one table, checked top to bottom against the text of a user turn; the first
# cause with a matching pattern wins (case-insensitive regexes). `--markers file.json` replaces
# the patterns of any key it names ({"watcher": ["..."]}). A turn that matches none is `other` when
# it starts with a WRAPPER pattern (system-reminder, wake, notification), else `owner`.
MARKERS = {
    "report-back": [r"done:\s*[0-9a-f]{7,40}\b", r"report-back"],
    "watcher": [r"watcher", r"poll\.sh"],
    "hourly-poll": [r"hourly"],
    "wrapper": [r"^\s*<(system-reminder|wake|task-notification|notification)"],
}

ROLES = ("builder", "reviewer", "re-review", "merge", "prototype", "research")


def derive(s):
    """(role, ticket) from the record's own fields, else from its title and tags, else "unknown"."""
    text = " ".join([s.get("title") or ""] + [str(x) for x in s.get("tags") or []]).lower()
    role = s.get("role") or next((r for r in ROLES if r in text), "unknown")
    m = re.search(r"\b(aos-\d+|\d+)\b", text)
    return role, s.get("ticket") or (m.group(1) if m else "unknown")


def classify(text, markers):
    for cause in ("report-back", "watcher", "hourly-poll"):
        if any(re.search(p, text, re.I) for p in markers[cause]):
            return cause
    if any(re.search(p, text, re.I) for p in markers["wrapper"]):
        return "other"
    return "owner"


def units(u):
    cc = u.get("cache_creation") or {}
    if cc:
        w = cc.get("ephemeral_1h_input_tokens", 0) * W_1H + cc.get("ephemeral_5m_input_tokens", 0) * W_5M
    else:
        w = u.get("cache_creation_input_tokens", 0) * W_1H
    return u.get("cache_read_input_tokens", 0) * W_READ + u.get("input_tokens", 0) + w + u.get("output_tokens", 0) * W_OUT


def turn_text(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list) and not any(b.get("type") == "tool_result" for b in c):
        return " ".join(b.get("text", "") for b in c if b.get("type") == "text")
    return None


def wakes(path, markers):
    """[{ts, cause, units}] one per user text turn; units = its assistant calls until the next wake."""
    out, calls = [], {}
    for line in open(path):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get("type") == "user":
            t = turn_text(d.get("message", {}).get("content"))
            if t is not None and t.strip():
                out.append({"ts": d.get("timestamp"), "cause": classify(t, markers), "units": 0.0, "ids": {}})
        elif d.get("type") == "assistant" and out:
            m = d.get("message", {})
            if m.get("id") and m.get("usage"):
                out[-1]["ids"][m["id"]] = units(m["usage"])
    for w in out:
        w["units"] = sum(w.pop("ids").values())
    return out


def by_cause(ws, coordinator_cost):
    total = sum(w["units"] for w in ws)
    res = {}
    for w in ws:
        c = res.setdefault(w["cause"], {"units": 0.0, "wakes": 0})
        c["units"] += w["units"]
        c["wakes"] += 1
    for c in res.values():
        c["share"] = 100 * c["units"] / total if total else 0.0
        c["usd"] = coordinator_cost * c["units"] / total if total and coordinator_cost else None
    return res


def in_window(stamp, since, until):
    """since/until are ISO dates (whole days, both inclusive); a record with no stamp is kept."""
    if not stamp or not (since or until):
        return True
    day = stamp[:10]
    return (not since or day >= since) and (not until or day <= until)


def build(data, since=None, until=None):
    coord = data["coordinator"]
    threads, tickets, coordinator_cost, other = [], {}, 0.0, []
    for s in data["sessions"]:
        cost = s.get("cost_usd") or 0
        if s["session_id"] == coord:
            coordinator_cost = cost
            continue
        if s.get("parent_session_id") != coord:
            other.append({"session_id": s["session_id"], "title": s.get("title"), "cost_usd": cost})
            continue
        if not in_window(s.get("created_at"), since, until):
            continue
        role, ticket = derive(s)
        t = {"session_id": s["session_id"], "role": role, "ticket": ticket, "cost_usd": cost, "no_cost": s.get("cost_usd") is None}
        threads.append(t)
        tickets[t["ticket"]] = tickets.get(t["ticket"], 0) + cost
    total = coordinator_cost + sum(t["cost_usd"] for t in threads)
    return {"coordinator_cost": coordinator_cost, "threads": threads, "tickets": tickets, "total": total, "other_sessions": other}


def text(r):
    out = ["Threads (role, ticket, cost USD)"]
    for t in r["threads"]:
        out.append(f"  {t['session_id']}  {t['role']:<10} {t['ticket']:<8} {t['cost_usd']:8.2f}" + ("  no cost" if t["no_cost"] else ""))
    out.append("Per ticket")
    for k, v in sorted(r["tickets"].items()):
        out.append(f"  {k:<8} {v:8.2f}")
    out.append(f"Coordinator {r['coordinator_cost']:.2f}")
    out.append(f"Total {r['total']:.2f}")
    if r["other_sessions"]:
        out.append("other sessions (not counted)")
        for o in r["other_sessions"]:
            out.append(f"  {o['session_id']}  {o['title']}  {o['cost_usd']:.2f}")
    if "causes" in r:
        out.append("Coordinator cost by wake cause (units, share, wakes, USD)")
        for k, c in sorted(r["causes"].items(), key=lambda kv: -kv[1]["units"]):
            usd = "" if c["usd"] is None else f"  {c['usd']:.2f}"
            out.append(f"  {k:<12} {c['units']:12.0f} {c['share']:5.1f}%  {c['wakes']:4d}{usd}")
    return "\n".join(out)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("sessions")
    ap.add_argument("--since", help="ISO date, inclusive")
    ap.add_argument("--until", help="ISO date, inclusive")
    ap.add_argument("--transcript")
    ap.add_argument("--markers")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    r = build(json.load(open(a.sessions)), a.since, a.until)
    if a.transcript:
        markers = dict(MARKERS)
        if a.markers:
            markers.update(json.load(open(a.markers)))
        r["causes"] = by_cause([w for w in wakes(a.transcript, markers) if in_window(w["ts"], a.since, a.until)], r["coordinator_cost"])
    print(json.dumps(r, indent=2) if a.json else text(r))


if __name__ == "__main__":
    main(sys.argv[1:])
