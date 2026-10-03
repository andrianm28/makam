#!/usr/bin/env python3
"""Thread-mode cost report: what a coordinator and its child threads cost.

    python3 scripts/agents/thread-cost-report.py SESSIONS.json [--json]

SESSIONS.json is a plain file the coordinator saves from the platform's `get_session` /
`list_sessions` results (a script cannot call those tools itself):

    {"coordinator": "<session_id>",
     "sessions": [{"session_id", "title", "role", "ticket", "parent_session_id",
                   "status_bucket", "cost_usd", "created_at"}, ...]}
"""
import argparse, json, sys


def build(data):
    coord = data["coordinator"]
    threads, tickets, coordinator_cost = [], {}, 0.0
    for s in data["sessions"]:
        cost = s.get("cost_usd") or 0
        if s["session_id"] == coord:
            coordinator_cost = cost
            continue
        if s.get("parent_session_id") != coord:
            continue
        t = {"session_id": s["session_id"], "role": s.get("role"), "ticket": s.get("ticket"), "cost_usd": cost}
        threads.append(t)
        tickets[t["ticket"]] = tickets.get(t["ticket"], 0) + cost
    total = coordinator_cost + sum(t["cost_usd"] for t in threads)
    return {"coordinator_cost": coordinator_cost, "threads": threads, "tickets": tickets, "total": total}


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("sessions")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    r = build(json.load(open(a.sessions)))
    print(json.dumps(r, indent=2))


if __name__ == "__main__":
    main(sys.argv[1:])
