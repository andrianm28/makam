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

ROLES = ("builder", "reviewer", "re-review", "merge", "prototype", "research")


def derive(s):
    """(role, ticket) from the record's own fields, else from its title and tags, else "unknown"."""
    text = " ".join([s.get("title") or ""] + [str(x) for x in s.get("tags") or []]).lower()
    role = s.get("role") or next((r for r in ROLES if r in text), "unknown")
    m = re.search(r"\b(aos-\d+|\d+)\b", text)
    return role, s.get("ticket") or (m.group(1) if m else "unknown")


def build(data):
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
    return "\n".join(out)


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("sessions")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    r = build(json.load(open(a.sessions)))
    print(json.dumps(r, indent=2) if a.json else text(r))


if __name__ == "__main__":
    main(sys.argv[1:])
