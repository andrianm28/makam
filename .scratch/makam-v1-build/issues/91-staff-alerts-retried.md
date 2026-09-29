# Staff alerts are sent once and never retried

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Notifications ("logs each message and retries it from the worker") and Work Queues (Tier 1 alerts)

## What to build

A Peringatan Staf (push + email to staff: Tier 1 alerts and their escalation from ticket 28, the Mitra Jasa assignment alert from ticket 56) is queued inside the transaction that raises it and sent by the worker tick, but a failed send is not retried: the alert is marked sent once and a push or email that failed is simply lost. The family's messages are retried; staff alerts should be too, so that a Tier 1 row or a Mitra Jasa's new job is never missed because one send failed.

## Acceptance criteria

- [ ] A staff alert whose push and email both fail is tried again by the worker, with a bounded number of attempts, and its log shows each attempt.
- [ ] A staff alert that succeeds on one channel is not sent again on that channel.
- [ ] Retrying is idempotent: running the tick twice sends nothing twice.
- [ ] Tests through Notifications' public functions with the fake EmailSender and WebPush failing then succeeding.

## Comments

- 2026-09-29 — Filed at ticket 56's merge (owner decision 2026-09-29: accepted for 56, follow-up for the whole staff-alert system).
